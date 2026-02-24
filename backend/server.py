from fastapi import FastAPI, APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import secrets
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
import io
import csv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging early (so startup/config warnings are visible)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection (initialized on startup to avoid crashing on import)
mongo_url = os.getenv("MONGO_URL")
db_name = os.getenv("DB_NAME")
client: Optional[AsyncIOMotorClient] = None
db = None

def require_db():
    """Return the configured Mongo DB handle or raise a clear error."""
    if db is None:
        raise HTTPException(
            status_code=503,
            detail="Database is not configured (missing MONGO_URL/DB_NAME).",
        )
    return db

def require_admin(request: Request) -> None:
    """
    Minimal admin protection for MVP.

    If ADMIN_KEY is set, callers must supply it via:
    - Header: X-Admin-Key
    - OR query param: admin_key
    """
    admin_key = os.getenv("ADMIN_KEY")
    if not admin_key:
        return

    provided = request.headers.get("X-Admin-Key") or request.query_params.get("admin_key")
    if not provided or not secrets.compare_digest(provided, admin_key):
        raise HTTPException(status_code=401, detail="Unauthorized")

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ----- MODELS -----

class Question(BaseModel):
    id: str
    text: str
    options: List[Dict[str, Any]]  # {value: str, label: str, points: int, trigger_flag: bool}
    area: str
    why_it_matters: str = ""

class AssessmentAnswer(BaseModel):
    question_id: str
    answer_value: str
    points: int
    trigger_flag: bool = False

class AssessmentCreate(BaseModel):
    modules: List[str]  # Will just be ["clbh"] for the unified quiz

class AssessmentSubmit(BaseModel):
    assessment_id: str
    answers: List[AssessmentAnswer]

class AreaScore(BaseModel):
    area_id: str
    area_name: str
    score: int
    max_score: int = 12
    risk_level: str  # green, yellow, red
    red_flags: List[str] = []  # Question IDs with RED answers

class AssessmentResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    modules: List[str]
    answers: List[Dict[str, Any]] = []
    total_score: int = 0
    max_possible_score: int = 72
    score_percentage: float = 0.0
    risk_level: str = "green"  # green, yellow, red
    area_scores: List[Dict[str, Any]] = []  # Per-area breakdown
    trigger_flags: List[str] = []  # All RED answer question IDs
    red_flag_details: List[Dict[str, Any]] = []  # Detailed RED flag info
    top_risks: List[Dict[str, str]] = []
    action_plan: List[Dict[str, Any]] = []
    confidence_level: int = 50
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed: bool = False

class LeadCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str
    business_name: str
    state: str
    modules: List[str]
    situation: str
    assessment_id: Optional[str] = None

class Lead(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: str
    phone: str
    business_name: str
    state: str
    modules: List[str]
    situation: str
    assessment_id: Optional[str] = None
    score: Optional[str] = None
    risk_level: Optional[str] = None
    top_risks: List[str] = []
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ----- QUIZ AREAS -----
# 6 areas with 4 questions each = 24 total questions

AREAS = {
    "contracts": {
        "id": "contracts",
        "name": "Customer Contracts & Project Risks",
        "description": "4 questions that reveal whether your client agreements protect you",
        "questions": [1, 2, 3, 4]
    },
    "ownership": {
        "id": "ownership",
        "name": "Ownership & Governance",
        "description": "4 questions that determine if your business can survive a partner dispute, exit, or crisis",
        "questions": [5, 6, 7, 8]
    },
    "subcontractor": {
        "id": "subcontractor",
        "name": "Vendors",
        "description": "4 questions that expose whether your supply chain and contractor relationships are a liability",
        "questions": [9, 10, 11, 12]
    },
    "employment": {
        "id": "employment",
        "name": "Employment & Safety Compliance",
        "description": "4 questions that reveal whether your employment practices are a lawsuit waiting to happen",
        "questions": [13, 14, 15, 16]
    },
    "insurance": {
        "id": "insurance",
        "name": "Insurance and Risk Management",
        "description": "4 questions that determine whether your insurance will protect you when it matters",
        "questions": [17, 18, 19, 20]
    },
    "systems": {
        "id": "systems",
        "name": "Systems, Records & Digital Risk",
        "description": "4 questions that reveal whether your business can survive a data breach, audit, or sale",
        "questions": [21, 22, 23, 24]
    }
}

# ----- QUESTIONS DATA -----
# Scoring: GREEN = 3 points, YELLOW = 2 points, RED = 1 point
# Per area (4 questions, max 12): 10-12 = GREEN, 7-9 = YELLOW, 4-6 = RED
# Overall (24 questions, max 72): 58-72 = GREEN, 40-57 = YELLOW, 24-39 = RED

QUESTIONS = {
    "clbh": [
        # AREA 1: Customer Contracts & Project Risks (Q1-Q4)
        {
            "id": "q1",
            "text": "Do your customer contracts clearly define the scope of work, pricing structure, and payment terms, including when payment is due and what happens if a client pays late?",
            "why_it_matters": "Vague scope leads to scope creep. Unclear payment terms mean you have no legal leverage when a client delays payment for 60, 90, or 120 days. This is the number one source of cash flow problems and client disputes for growing businesses.",
            "options": [
                {"value": "green", "label": "Yes. Every contract specifies exact scope, pricing, payment deadlines, and late payment consequences.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "Most of my contracts cover this, but some clients are on informal or verbal agreements.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No. My contracts are vague on scope or payment terms, or I frequently work without a signed contract.", "points": 1, "trigger_flag": True}
            ],
            "area": "contracts"
        },
        {
            "id": "q2",
            "text": "When a client requests changes to a project after work has started, do you have a documented change order process that requires written approval before the additional work is performed?",
            "why_it_matters": "Change orders are where businesses lose money. Without a signed approval process, you end up doing extra work for free and have no documentation to support a billing dispute. This is especially damaging in construction, professional services, and any project-based industry.",
            "options": [
                {"value": "green", "label": "Yes. All changes go through a formal change order process with written client approval and updated pricing before work begins.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "Sometimes. We document major changes, but smaller requests often get handled informally.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No. We usually just handle changes as they come and figure out billing later.", "points": 1, "trigger_flag": True}
            ],
            "area": "contracts"
        },
        {
            "id": "q3",
            "text": "Do your contracts include a limitation of liability clause that caps your maximum financial exposure if something goes wrong on a project?",
            "why_it_matters": "Without a liability cap, a single bad project could result in a judgment that exceeds your total revenue. A limitation of liability clause is the difference between a manageable business setback and a company-ending lawsuit. Courts generally enforce these when they are properly drafted.",
            "options": [
                {"value": "green", "label": "Yes. My contracts cap liability, typically to the amount paid under the contract or a defined dollar amount.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I think there is something about liability in my contract, but I have not reviewed it closely.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No. My contracts have no liability cap, or I am not sure.", "points": 1, "trigger_flag": True}
            ],
            "area": "contracts"
        },
        {
            "id": "q4",
            "text": "Are you currently relying on any handshake deals, verbal agreements, or contract templates you found online that have not been reviewed by an attorney?",
            "why_it_matters": "Handshake deals offer zero legal protection in a dispute. Online templates are written for generic situations and almost never address your specific industry risks, state laws, or business model. They create a false sense of security that disappears the moment you need to enforce them.",
            "options": [
                {"value": "green", "label": "No. All my client relationships are governed by written contracts that have been reviewed by an attorney.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "Most clients are under contract, but I have a few relationships based on verbal agreements or generic templates.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "Yes. I regularly work on handshake deals or use templates I have not had reviewed.", "points": 1, "trigger_flag": True}
            ],
            "area": "contracts"
        },

        # AREA 2: Ownership & Governance (Q5-Q8)
        {
            "id": "q5",
            "text": "Does your business have a current, signed operating agreement (LLC) or shareholder agreement (corporation) that all owners have reviewed and agreed to?",
            "why_it_matters": "Without a written agreement, your state's default rules govern your business. Those defaults were not written with your specific situation in mind. They can give a 1% owner blocking power, create ambiguity about profit splits, and leave you with no process for resolving disputes. This is the single most important legal document for any business with more than one owner.",
            "options": [
                {"value": "green", "label": "Yes. We have a signed, current agreement that all owners understand and have reviewed.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We have an agreement, but it is outdated, or some owners have not reviewed it.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No. We have no written ownership agreement, or we are using a generic template we never customized.", "points": 1, "trigger_flag": True}
            ],
            "area": "ownership"
        },
        {
            "id": "q6",
            "text": "Does your agreement include buy-sell provisions that define exactly what happens when an owner wants to leave, becomes disabled, goes through a divorce, or passes away?",
            "why_it_matters": "Without buy-sell provisions, an owner leaving the business can trigger a forced dissolution. An owner's death could mean you are suddenly in business with their spouse or heirs. An owner's divorce could give their ex-spouse a claim to part of the company. These are not hypothetical risks. They happen constantly, and businesses without buyout provisions rarely survive them.",
            "options": [
                {"value": "green", "label": "Yes. Our agreement addresses voluntary departure, death, disability, divorce, and termination for cause with a clear valuation and transfer process.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We have some buyout language, but it does not cover all scenarios, or the valuation method is unclear.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No. We have no buy-sell provisions, or I do not know if we do.", "points": 1, "trigger_flag": True}
            ],
            "area": "ownership"
        },
        {
            "id": "q7",
            "text": "Is decision-making authority clearly defined in your agreement, including who can make day-to-day decisions, what requires a vote, and what happens if owners reach a deadlock?",
            "why_it_matters": "When two 50/50 partners disagree and there is no deadlock resolution mechanism, the business can become paralyzed. No one can sign contracts, hire, fire, or make financial decisions. Without clear authority structure, a single disagreement can shut down operations and ultimately force a judicial dissolution of the entire company.",
            "options": [
                {"value": "green", "label": "Yes. Our agreement defines day-to-day authority, major decision thresholds, and has a deadlock resolution process.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We have general roles, but major decision authority and deadlock resolution are not clearly documented.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No. Decision-making is informal, or we have no process for resolving disagreements between owners.", "points": 1, "trigger_flag": True}
            ],
            "area": "ownership"
        },
        {
            "id": "q8",
            "text": "Does your current entity structure (LLC, S-Corp, C-Corp, partnership) still match the way your business operates today, including how income is distributed, and taxes are filed?",
            "why_it_matters": "Businesses evolve. An entity structure that made sense at launch may be costing you tens of thousands in unnecessary taxes, creating personal liability exposure, or limiting your ability to bring on investors or sell the business. Mismatched entity structures are one of the most expensive and overlooked problems because the cost is invisible until you try to raise capital, sell, or get audited.",
            "options": [
                {"value": "green", "label": "Yes. We have reviewed our entity structure with a tax and legal professional within the past two years and it still fits.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I think it still works, but we have not reviewed it since we set it up.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "I am not sure if our entity structure is optimal, or our business has changed significantly since we formed.", "points": 1, "trigger_flag": True}
            ],
            "area": "ownership"
        },

        # AREA 3: Vendors (Q9-Q12)
        {
            "id": "q9",
            "text": "Are signed subcontractor agreements in place with every subcontractor before they begin any work on your projects?",
            "why_it_matters": "A subcontractor working without a signed agreement exposes you to disputes over scope, payment, quality, and timeline with zero documentation to protect your position. If that subcontractor injures someone, damages property, or fails to perform, you may be liable for everything. In construction and professional services, this is one of the fastest ways to face a six-figure claim.",
            "options": [
                {"value": "green", "label": "Yes. Every subcontractor signs a written agreement before any work starts, no exceptions.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "Most do, but we occasionally start work based on a verbal agreement or email and formalize it later.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No. We regularly use subcontractors without signed agreements.", "points": 1, "trigger_flag": True}
            ],
            "area": "subcontractor"
        },
        {
            "id": "q10",
            "text": "Have you verified that your independent contractors are properly classified and would survive an IRS or state audit of their classification?",
            "why_it_matters": "Misclassifying an employee as an independent contractor is one of the most aggressively enforced compliance areas by the IRS and state agencies. If you are found to have misclassified workers, you face back taxes, penalties, unpaid benefits, and potential class action exposure. A single misclassification audit can result in six-figure liability across all similarly classified workers.",
            "options": [
                {"value": "green", "label": "Yes. We have reviewed our classifications with a legal or tax professional and they meet IRS and state tests.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I believe they are classified correctly, but we have not had it formally reviewed.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "I am not sure if our independent contractors would pass a classification audit.", "points": 1, "trigger_flag": True}
            ],
            "area": "subcontractor"
        },
        {
            "id": "q11",
            "text": "Do your subcontractor and vendor agreements include indemnification provisions that protect your business if their work causes injury, property damage, or a third-party claim?",
            "why_it_matters": "Without indemnification, you absorb the financial consequences of someone else's mistakes. If a subcontractor's work causes a client injury or property damage, the client sues you. Without indemnification, you pay the judgment and have no contractual right to recover from the subcontractor who actually caused the problem.",
            "options": [
                {"value": "green", "label": "Yes. All subcontractor and key vendor agreements include indemnification provisions requiring them to defend and hold us harmless.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "Some agreements have indemnification language, but it is not consistent across all subcontractors and vendors.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No. Our agreements do not include indemnification, or I do not know if they do.", "points": 1, "trigger_flag": True}
            ],
            "area": "subcontractor"
        },
        {
            "id": "q12",
            "text": "Do you collect and verify current certificates of insurance from every subcontractor before they begin work, and do you monitor expiration dates?",
            "why_it_matters": "A certificate of insurance that expired three months ago is worthless. If an uninsured subcontractor causes damage or injury on your project, their lack of coverage becomes your financial responsibility. Many businesses collect certificates once and never check again, only to discover at the worst possible moment that coverage lapsed.",
            "options": [
                {"value": "green", "label": "Yes. We collect current COIs before work begins, verify coverage meets our requirements, and track expiration dates.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We collect COIs at the start but do not consistently track renewals or verify coverage amounts.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No. We do not regularly collect or verify subcontractor insurance certificates.", "points": 1, "trigger_flag": True}
            ],
            "area": "subcontractor"
        },

        # AREA 4: Employment & Safety Compliance (Q13-Q16)
        {
            "id": "q13",
            "text": "Does your business have a current employee handbook that reflects your state's employment laws as they exist today, not when the handbook was first written?",
            "why_it_matters": "Employment law changes constantly. Paid leave requirements, anti-harassment rules, accommodation obligations, and termination procedures vary by state and update frequently. An outdated handbook can actually work against you in court because it shows you had policies but failed to keep them current. Plaintiff attorneys look for handbook gaps first.",
            "options": [
                {"value": "green", "label": "Yes. Our handbook has been reviewed and updated within the past 12 months to reflect current state and federal law.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We have a handbook, but it has not been updated in over a year.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "We do not have an employee handbook, or ours is significantly outdated.", "points": 1, "trigger_flag": True}
            ],
            "area": "employment"
        },
        {
            "id": "q14",
            "text": "Are your wage, hour, and overtime practices fully compliant, including proper classification of exempt versus non-exempt employees, accurate time tracking, and correct overtime calculations?",
            "why_it_matters": "Wage and hour claims are the most common type of employment lawsuit in the United States. Misclassifying a salaried employee as exempt when they do not meet the legal test, failing to pay overtime correctly, or rounding time entries the wrong way can result in class action exposure that covers every similarly situated employee. These claims often include double damages and attorney fees.",
            "options": [
                {"value": "green", "label": "Yes. We have had our classifications and pay practices reviewed by an employment attorney or HR professional and they are compliant.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I believe we are compliant, but we have not had a formal review.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "I am not confident our classifications or overtime practices would survive an audit.", "points": 1, "trigger_flag": True}
            ],
            "area": "employment"
        },
        {
            "id": "q15",
            "text": "Does your business have a documented termination process that includes written performance records, consistent application, and a final review step before any employee is let go?",
            "why_it_matters": "Wrongful termination claims often succeed not because the termination was actually illegal, but because the employer cannot prove it was justified. Without a documented process, consistent application, and a paper trail, a terminated employee's attorney only needs to show inconsistency or missing records to build a case. The cost of defending even a weak wrongful termination claim averages $75,000 to $250,000.",
            "options": [
                {"value": "green", "label": "Yes. We have a documented process with written warnings, performance records, and a final review before termination.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We try to document things, but the process is not consistent or some terminations happen without full records.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No. We do not have a formal termination process, or decisions are made without documentation.", "points": 1, "trigger_flag": True}
            ],
            "area": "employment"
        },
        {
            "id": "q16",
            "text": "Do your key employees have signed confidentiality and non-solicitation agreements that protect your client relationships, proprietary information, and trade secrets?",
            "why_it_matters": "When a key employee leaves and takes your client list, your pricing data, or your best employees with them, the damage is immediate and often irreversible. Without a signed confidentiality and non-solicitation agreement, you have very limited legal ability to stop them. These agreements need to be in place before the information is shared, not after someone gives notice.",
            "options": [
                {"value": "green", "label": "Yes. All key employees have signed enforceable confidentiality and non-solicitation agreements.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "Some employees have signed agreements, but coverage is not consistent across all key roles.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No. We do not have confidentiality or non-solicitation agreements in place.", "points": 1, "trigger_flag": True}
            ],
            "area": "employment"
        },

        # AREA 5: Insurance and Risk Management (Q17-Q20)
        {
            "id": "q17",
            "text": "Has your business insurance coverage been reviewed in the past 12 months to verify it matches your current operations, revenue level, and actual risk exposure?",
            "why_it_matters": "Most businesses buy insurance when they launch and never update it. If your revenue has doubled, you have added services, hired employees, or expanded locations, your original policy may not cover your current exposure. Discovering a coverage gap after a claim is filed is the most expensive way to find out your policy is outdated.",
            "options": [
                {"value": "green", "label": "Yes. Our coverage has been reviewed within the past 12 months and adjusted to match current operations.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We have insurance, but it has not been reviewed against our current operations recently.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No. Our coverage has not been reviewed since we purchased it, or our business has changed significantly since then.", "points": 1, "trigger_flag": True}
            ],
            "area": "insurance"
        },
        {
            "id": "q18",
            "text": "Do your customer and vendor contracts align with what your insurance covers? For example, if your contract promises to indemnify a client, does your insurance cover that obligation?",
            "why_it_matters": "It is common for businesses to sign contracts with indemnification or insurance requirements that exceed what their policy covers. You are contractually promising protection that does not exist. When a claim arises and the insurance company denies it because the obligation was outside your coverage terms, you pay the full amount out of pocket.",
            "options": [
                {"value": "green", "label": "Yes. Our attorney and insurance broker have reviewed our contracts together to ensure alignment.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I think they align, but no one has formally compared our contract obligations to our policy.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No. I have never compared my contract obligations to my actual insurance coverage.", "points": 1, "trigger_flag": True}
            ],
            "area": "insurance"
        },
        {
            "id": "q19",
            "text": "Does your business have a documented incident response procedure so that your team knows exactly what to do in the first 24 hours after an accident, injury, property damage, or client complaint?",
            "why_it_matters": "The first 24 hours after an incident determine whether your insurance claim succeeds or fails and whether your legal exposure grows or shrinks. Delayed reporting, destroyed evidence, inconsistent statements, and social media posts by employees can all undermine your defense. A documented procedure ensures the right steps happen immediately, not after the damage is done.",
            "options": [
                {"value": "green", "label": "Yes. We have a written incident response procedure that employees have been trained on.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We have an informal understanding of what to do, but nothing documented or trained.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No. We have no incident response procedure.", "points": 1, "trigger_flag": True}
            ],
            "area": "insurance"
        },
        {
            "id": "q20",
            "text": "Have you identified any gaps in your insurance coverage before an emergency, such as exclusions for specific types of work, geographic limitations, or coverage caps that are too low for your actual exposure?",
            "why_it_matters": "Every insurance policy has exclusions, caps, and limitations. The businesses that get hurt are the ones who discover those gaps when filing a claim. A proactive coverage gap analysis costs very little compared to discovering after a $500,000 claim that your policy caps out at $250,000 or excludes the specific type of work that caused the loss.",
            "options": [
                {"value": "green", "label": "Yes. We have done a coverage gap analysis and addressed identified limitations.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I am aware of some limitations but have not done a comprehensive review.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No. I do not know what my policy excludes or where my coverage gaps are.", "points": 1, "trigger_flag": True}
            ],
            "area": "insurance"
        },

        # AREA 6: Systems, Records & Digital Risk (Q21-Q24)
        {
            "id": "q21",
            "text": "Are your critical business records (contracts, financial documents, employee files, corporate filings) organized, centrally stored, and accessible if you needed to produce them within 48 hours for an audit, lawsuit, or due diligence request?",
            "why_it_matters": "When a lawsuit, audit, or buyer due diligence request arrives, you do not get weeks to organize your records. Businesses that cannot produce clean documentation quickly lose leverage in negotiations, face sanctions in litigation, and kill potential deals. Record disorganization is also a red flag in any legal proceeding that suggests broader operational problems.",
            "options": [
                {"value": "green", "label": "Yes. Our records are organized, digitized, and accessible. We could produce key documents within 48 hours.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "Most records exist, but they are scattered across locations, people, or systems and would take time to compile.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No. Our records are disorganized, incomplete, or I am not confident we could locate key documents quickly.", "points": 1, "trigger_flag": True}
            ],
            "area": "systems"
        },
        {
            "id": "q22",
            "text": "Does your business have data security and privacy practices in place that meet the standards for your industry, including how you collect, store, and protect customer and employee personal information?",
            "why_it_matters": "Data breach notification laws now exist in all 50 states, and many industries have specific compliance requirements (HIPAA, PCI, state consumer privacy acts). A single data breach can trigger mandatory notifications, regulatory investigations, class action lawsuits, and reputational damage. The average cost of a data breach for a small business is enough to close the doors permanently.",
            "options": [
                {"value": "green", "label": "Yes. We have documented data security practices, and they have been reviewed for compliance with applicable laws and industry standards.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We have some security measures in place, but they have not been formally reviewed for compliance.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No. We do not have documented data security practices, or I am not sure what our obligations are.", "points": 1, "trigger_flag": True}
            ],
            "area": "systems"
        },
        {
            "id": "q23",
            "text": "Does your business have access controls that restrict who can view, edit, or download sensitive information like financial records, client data, employee files, and proprietary business information?",
            "why_it_matters": "Most internal data breaches and information theft happen because everyone has access to everything. When a disgruntled employee, departing partner, or compromised account can access all of your sensitive information without restriction, the damage potential is unlimited. Access controls are the difference between a contained problem and a catastrophic one.",
            "options": [
                {"value": "green", "label": "Yes. We have role-based access controls that limit who can view and download sensitive data.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We have some access restrictions, but most people can access most systems.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No. Everyone in the company has access to essentially everything.", "points": 1, "trigger_flag": True}
            ],
            "area": "systems"
        },
        {
            "id": "q24",
            "text": "If your business were to be sold, acquired, or face a legal dispute tomorrow, could you produce a complete set of corporate records, executed contracts, financial statements, and compliance documentation within two weeks?",
            "why_it_matters": "Whether you are selling the business, defending a lawsuit, or responding to a regulatory inquiry, your ability to produce organized documentation determines your outcome. Buyers walk away from deals when records are incomplete. Judges penalize parties that cannot produce evidence. Regulators assume the worst when documentation is missing. This question tests the overall health of your entire records system.",
            "options": [
                {"value": "green", "label": "Yes. Our records are complete and organized enough that we could be due diligence ready within two weeks.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We could pull most of it together, but it would be a scramble, and some items might be missing.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No. We are not close to being prepared for due diligence or a major document production request.", "points": 1, "trigger_flag": True}
            ],
            "area": "systems"
        }
    ]
}

# Risk descriptions for RED answers - organized by area
RISK_DESCRIPTIONS = {
    "contracts": {
        "q1": {"title": "Vague Contract Terms", "description": "Your contracts lack clear scope, pricing, or payment terms, exposing you to disputes and cash flow problems."},
        "q2": {"title": "No Change Order Process", "description": "Without documented change orders, you risk doing extra work for free with no billing recourse."},
        "q3": {"title": "No Liability Cap", "description": "Without a liability cap, a single project could result in a company-ending judgment."},
        "q4": {"title": "Relying on Handshake Deals", "description": "Verbal agreements and unreviewed templates offer zero legal protection in disputes."}
    },
    "ownership": {
        "q5": {"title": "No Ownership Agreement", "description": "Without a written agreement, state default rules govern your business—often unfavorably."},
        "q6": {"title": "No Buy-Sell Provisions", "description": "Missing buyout provisions for death, disability, or departure can force dissolution."},
        "q7": {"title": "No Deadlock Resolution", "description": "Without clear decision-making rules, partner disagreements can paralyze the business."},
        "q8": {"title": "Mismatched Entity Structure", "description": "Your entity structure may be costing you money or creating liability exposure."}
    },
    "subcontractor": {
        "q9": {"title": "No Subcontractor Agreements", "description": "Working without signed agreements exposes you to disputes and liability for their actions."},
        "q10": {"title": "Contractor Misclassification Risk", "description": "Misclassifying workers can result in six-figure liability in an IRS or state audit."},
        "q11": {"title": "No Indemnification Protection", "description": "Without indemnification, you pay for others' mistakes with no recovery rights."},
        "q12": {"title": "Unverified Insurance Coverage", "description": "Uninsured subcontractors make you financially responsible for their damages."}
    },
    "employment": {
        "q13": {"title": "Outdated Employee Handbook", "description": "An outdated or missing handbook can work against you in employment lawsuits."},
        "q14": {"title": "Wage & Hour Compliance Risk", "description": "Wage misclassification is the most common employment lawsuit—with double damages."},
        "q15": {"title": "No Termination Documentation", "description": "Missing documentation makes wrongful termination claims easier to pursue."},
        "q16": {"title": "No Employee Protections", "description": "Missing confidentiality agreements leave you vulnerable when key employees leave."}
    },
    "insurance": {
        "q17": {"title": "Outdated Insurance Coverage", "description": "Your policy may not cover your current operations, revenue, or risk exposure."},
        "q18": {"title": "Contract-Insurance Mismatch", "description": "You may be contractually promising coverage that your insurance doesn't provide."},
        "q19": {"title": "No Incident Response Plan", "description": "Poor incident handling in the first 24 hours can undermine your insurance claim."},
        "q20": {"title": "Unknown Coverage Gaps", "description": "Policy exclusions and limits you don't know about will hurt you when you file a claim."}
    },
    "systems": {
        "q21": {"title": "Disorganized Records", "description": "You cannot produce key documents quickly for audits, lawsuits, or due diligence."},
        "q22": {"title": "Inadequate Data Security", "description": "A data breach without proper security can close your business permanently."},
        "q23": {"title": "No Access Controls", "description": "Everyone having access to everything maximizes damage potential from any breach."},
        "q24": {"title": "Not Due Diligence Ready", "description": "Incomplete records can kill deals, lose lawsuits, and invite regulatory problems."}
    }
}

AREA_NAMES = {
    "contracts": "Customer Contracts & Project Risks",
    "ownership": "Ownership & Governance",
    "subcontractor": "Vendors",
    "employment": "Employment & Safety Compliance",
    "insurance": "Insurance and Risk Management",
    "systems": "Systems, Records & Digital Risk"
}

# ----- HELPER FUNCTIONS -----

def get_area_for_question(question_id: str) -> str:
    """Get the area for a given question ID"""
    q_num = int(question_id.replace("q", ""))
    if q_num <= 4:
        return "contracts"
    elif q_num <= 8:
        return "ownership"
    elif q_num <= 12:
        return "subcontractor"
    elif q_num <= 16:
        return "employment"
    elif q_num <= 20:
        return "insurance"
    else:
        return "systems"

def calculate_area_risk_level(score: int) -> str:
    """Calculate risk level for an area (4 questions, max 12 points)"""
    if score >= 10:
        return "green"
    elif score >= 7:
        return "yellow"
    else:
        return "red"

def calculate_overall_risk_level(total_score: int) -> str:
    """Calculate overall risk level (24 questions, max 72 points)"""
    if total_score >= 58:
        return "green"
    elif total_score >= 40:
        return "yellow"
    else:
        return "red"

def calculate_score_and_risks(answers: List[AssessmentAnswer], modules: List[str]) -> Dict[str, Any]:
    """Calculate scores by area and overall, flag RED answers"""

    # Initialize area tracking
    area_points = {area: 0 for area in AREA_NAMES.keys()}
    area_red_flags = {area: [] for area in AREA_NAMES.keys()}

    # Process each answer
    trigger_flags = []
    red_flag_details = []

    for answer in answers:
        area = get_area_for_question(answer.question_id)
        area_points[area] += answer.points

        # Track RED answers (trigger flags)
        if answer.trigger_flag or answer.points == 1:
            trigger_flags.append(answer.question_id)
            area_red_flags[area].append(answer.question_id)

            # Add detailed RED flag info
            if answer.question_id in RISK_DESCRIPTIONS.get(area, {}):
                risk_info = RISK_DESCRIPTIONS[area][answer.question_id]
                red_flag_details.append({
                    "question_id": answer.question_id,
                    "area": area,
                    "area_name": AREA_NAMES[area],
                    "title": risk_info["title"],
                    "description": risk_info["description"],
                    "severity": "high"
                })

    # Calculate area scores
    area_scores = []
    for area_id, area_name in AREA_NAMES.items():
        score = area_points[area_id]
        risk_level = calculate_area_risk_level(score)
        area_scores.append({
            "area_id": area_id,
            "area_name": area_name,
            "score": score,
            "max_score": 12,
            "risk_level": risk_level,
            "red_flags": area_red_flags[area_id]
        })

    # Calculate totals
    total_score = sum(a.points for a in answers)
    max_score = 72  # 24 questions x 3 points
    score_percentage = (total_score / max_score * 100) if max_score > 0 else 0

    # Determine overall risk level
    risk_level = calculate_overall_risk_level(total_score)

    # Build top risks from RED flags
    top_risks = []
    for detail in red_flag_details:
        top_risks.append({
            "title": detail["title"],
            "description": detail["description"],
            "severity": "high",
            "area": detail["area"],
            "area_name": detail["area_name"]
        })

    # Add YELLOW answer risks if not too many RED
    if len(top_risks) < 5:
        for answer in answers:
            if answer.points == 2 and len(top_risks) < 7:
                area = get_area_for_question(answer.question_id)
                if answer.question_id in RISK_DESCRIPTIONS.get(area, {}):
                    risk_info = RISK_DESCRIPTIONS[area][answer.question_id]
                    top_risks.append({
                        "title": risk_info["title"],
                        "description": risk_info["description"],
                        "severity": "medium",
                        "area": area,
                        "area_name": AREA_NAMES[area]
                    })

    # Generate action plan
    action_plan = generate_action_plan(top_risks, risk_level, area_scores)

    # Calculate confidence level
    confidence = int(score_percentage) - (len(trigger_flags) * 3)

    return {
        "total_score": total_score,
        "max_possible_score": max_score,
        "score_percentage": round(score_percentage, 1),
        "risk_level": risk_level,
        "area_scores": area_scores,
        "trigger_flags": trigger_flags,
        "red_flag_details": red_flag_details,
        "top_risks": top_risks,
        "action_plan": action_plan,
        "confidence_level": min(100, max(10, confidence))
    }

def generate_action_plan(top_risks: List[Dict], risk_level: str, area_scores: List[Dict]) -> List[Dict[str, Any]]:
    """Generate prioritized action plan based on risks"""
    action_plan = []
    priority = 1

    # First priority: RED areas need immediate attention
    red_areas = [a for a in area_scores if a["risk_level"] == "red"]
    for area in red_areas:
        action_plan.append({
            "priority": priority,
            "action": f"Address {area['area_name']} Immediately",
            "description": f"This area scored {area['score']}/12, indicating significant exposure that needs professional review.",
            "urgency": "high"
        })
        priority += 1

    # Second priority: Individual RED flags
    for risk in top_risks[:3]:
        if risk.get("severity") == "high" and priority <= 5:
            action_plan.append({
                "priority": priority,
                "action": f"Fix: {risk['title']}",
                "description": risk['description'],
                "urgency": "high"
            })
            priority += 1

    # Third priority: YELLOW areas
    yellow_areas = [a for a in area_scores if a["risk_level"] == "yellow"]
    for area in yellow_areas[:2]:
        if priority <= 6:
            action_plan.append({
                "priority": priority,
                "action": f"Review {area['area_name']}",
                "description": f"This area scored {area['score']}/12. Address gaps within 30-90 days.",
                "urgency": "medium"
            })
            priority += 1

    # Always recommend consultation for yellow/red
    if risk_level in ["yellow", "red"] or len([a for a in area_scores if a["risk_level"] == "red"]) > 0:
        action_plan.append({
            "priority": priority,
            "action": "Schedule a CLBH Review Call",
            "description": "A 30-minute call to discuss your specific situation and create a protection plan.",
            "urgency": "high" if risk_level == "red" else "medium"
        })

    return action_plan

# ----- API ENDPOINTS -----

@api_router.get("/")
async def root():
    return {"message": "CLBH Quick Checkup API"}

@api_router.get("/questions/{module}")
async def get_questions(module: str):
    """Get questions for a specific module"""
    if module not in QUESTIONS:
        raise HTTPException(status_code=404, detail=f"Module '{module}' not found")
    return {"module": module, "questions": QUESTIONS[module], "areas": AREAS}

@api_router.get("/questions")
async def get_all_questions():
    """Get all questions for all modules"""
    return {"questions": QUESTIONS, "areas": AREAS}

@api_router.post("/assessments")
async def create_assessment(data: AssessmentCreate):
    """Create a new assessment session"""
    db = require_db()
    assessment = AssessmentResult(modules=data.modules)
    doc = assessment.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.assessments.insert_one(doc)
    return {"id": assessment.id, "modules": assessment.modules}

@api_router.post("/assessments/submit")
async def submit_assessment(data: AssessmentSubmit):
    """Submit answers and get results"""
    db = require_db()
    # Find the assessment
    assessment = await db.assessments.find_one({"id": data.assessment_id}, {"_id": 0})
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Calculate results
    results = calculate_score_and_risks(data.answers, assessment["modules"])

    # Update assessment with results
    update_data = {
        "answers": [a.model_dump() for a in data.answers],
        "total_score": results["total_score"],
        "max_possible_score": results["max_possible_score"],
        "score_percentage": results["score_percentage"],
        "risk_level": results["risk_level"],
        "area_scores": results["area_scores"],
        "trigger_flags": results["trigger_flags"],
        "red_flag_details": results["red_flag_details"],
        "top_risks": results["top_risks"],
        "action_plan": results["action_plan"],
        "confidence_level": results["confidence_level"],
        "completed": True
    }

    await db.assessments.update_one(
        {"id": data.assessment_id},
        {"$set": update_data}
    )

    return {
        "assessment_id": data.assessment_id,
        "risk_level": results["risk_level"],
        "score_percentage": results["score_percentage"],
        "confidence_level": results["confidence_level"],
        "area_scores": results["area_scores"],
        "red_flag_details": results["red_flag_details"],
        "top_risks": results["top_risks"],
        "action_plan": results["action_plan"],
        "trigger_flags": results["trigger_flags"]
    }

@api_router.get("/assessments/{assessment_id}")
async def get_assessment(assessment_id: str):
    """Get assessment results"""
    db = require_db()
    assessment = await db.assessments.find_one({"id": assessment_id}, {"_id": 0})
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return assessment

@api_router.post("/leads")
async def create_lead(data: LeadCreate):
    """Submit lead capture form"""
    db = require_db()
    lead = Lead(**data.model_dump())

    # If assessment_id provided, get score info
    if data.assessment_id:
        assessment = await db.assessments.find_one({"id": data.assessment_id}, {"_id": 0})
        if assessment:
            lead.score = f"{assessment.get('score_percentage', 0)}%"
            lead.risk_level = assessment.get('risk_level', 'unknown')
            lead.top_risks = [r.get('title', '') for r in assessment.get('top_risks', [])]

    doc = lead.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.leads.insert_one(doc)

    return {"success": True, "lead_id": lead.id}

@api_router.get("/admin/leads")
async def get_leads(request: Request):
    """Get all leads for admin dashboard"""
    require_admin(request)
    db = require_db()
    leads = await db.leads.find({}, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    return {"leads": leads}

@api_router.get("/admin/leads/export")
async def export_leads(request: Request):
    """Export leads as CSV"""
    require_admin(request)
    db = require_db()
    leads = await db.leads.find({}, {"_id": 0}).sort("timestamp", -1).to_list(1000)

    if not leads:
        return StreamingResponse(
            io.StringIO("No leads found"),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=clbh_leads.csv"}
        )

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "name", "email", "phone", "business_name", "state",
        "modules", "situation", "score", "risk_level", "top_risks", "timestamp"
    ])
    writer.writeheader()

    for lead in leads:
        row = {
            "name": lead.get("name", ""),
            "email": lead.get("email", ""),
            "phone": lead.get("phone", ""),
            "business_name": lead.get("business_name", ""),
            "state": lead.get("state", ""),
            "modules": ", ".join(lead.get("modules", [])),
            "situation": lead.get("situation", ""),
            "score": lead.get("score", ""),
            "risk_level": lead.get("risk_level", ""),
            "top_risks": ", ".join(lead.get("top_risks", [])),
            "timestamp": lead.get("timestamp", "")
        }
        writer.writerow(row)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=clbh_leads.csv"}
    )

# Include the router in the app
app.include_router(api_router)

# Configure CORS
origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_db_client():
    global client, db
    if mongo_url and db_name:
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        logger.info(f"Connected to MongoDB: {db_name}")
    else:
        logger.warning("MONGO_URL/DB_NAME not set; DB-backed endpoints will return 503.")

@app.on_event("shutdown")
async def shutdown_db_client():
    global client
    if client:
        client.close()
