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
    module: str

class AssessmentAnswer(BaseModel):
    question_id: str
    answer_value: str
    points: int
    trigger_flag: bool = False

class AssessmentCreate(BaseModel):
    modules: List[str]

class AssessmentSubmit(BaseModel):
    assessment_id: str
    answers: List[AssessmentAnswer]

class AssessmentResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    modules: List[str]
    answers: List[Dict[str, Any]] = []
    total_score: int = 0
    max_possible_score: int = 0
    score_percentage: float = 0.0
    risk_level: str = "green"  # green, yellow, red
    trigger_flags: List[str] = []
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

# ----- QUESTIONS DATA -----

QUESTIONS = {
    "lease": [
        {
            "id": "lease_1",
            "text": "Do you have a written commercial lease agreement for your business space?",
            "options": [
                {"value": "yes_reviewed", "label": "Yes, and it was reviewed by an attorney", "points": 0, "trigger_flag": False},
                {"value": "yes_not_reviewed", "label": "Yes, but it wasn't reviewed by an attorney", "points": 5, "trigger_flag": False},
                {"value": "no", "label": "No written agreement", "points": 15, "trigger_flag": True}
            ],
            "module": "lease"
        },
        {
            "id": "lease_2",
            "text": "Does your lease include a personal guarantee?",
            "options": [
                {"value": "no", "label": "No personal guarantee", "points": 0, "trigger_flag": False},
                {"value": "limited", "label": "Yes, but it's limited in amount or time", "points": 5, "trigger_flag": False},
                {"value": "unlimited", "label": "Yes, unlimited personal guarantee", "points": 15, "trigger_flag": True},
                {"value": "unsure", "label": "I'm not sure", "points": 10, "trigger_flag": True}
            ],
            "module": "lease"
        },
        {
            "id": "lease_3",
            "text": "What happens if you need to close or relocate your business?",
            "options": [
                {"value": "can_assign", "label": "Lease allows assignment or subletting", "points": 0, "trigger_flag": False},
                {"value": "requires_approval", "label": "Requires landlord approval", "points": 5, "trigger_flag": False},
                {"value": "no_assignment", "label": "No assignment or subletting allowed", "points": 12, "trigger_flag": True},
                {"value": "unsure", "label": "I don't know", "points": 8, "trigger_flag": False}
            ],
            "module": "lease"
        },
        {
            "id": "lease_4",
            "text": "Are you responsible for property maintenance and repairs?",
            "options": [
                {"value": "landlord", "label": "Landlord handles most repairs", "points": 0, "trigger_flag": False},
                {"value": "shared", "label": "Shared responsibility, clearly defined", "points": 3, "trigger_flag": False},
                {"value": "tenant_all", "label": "I'm responsible for everything (Triple Net)", "points": 8, "trigger_flag": False},
                {"value": "unclear", "label": "Responsibilities are unclear", "points": 10, "trigger_flag": True}
            ],
            "module": "lease"
        },
        {
            "id": "lease_5",
            "text": "Does your lease clearly define rent increases?",
            "options": [
                {"value": "fixed", "label": "Fixed rent for entire term", "points": 0, "trigger_flag": False},
                {"value": "defined_increases", "label": "Yes, increases are clearly defined", "points": 2, "trigger_flag": False},
                {"value": "market_rate", "label": "Can increase to 'market rate'", "points": 10, "trigger_flag": True},
                {"value": "unsure", "label": "I'm not sure how it works", "points": 8, "trigger_flag": False}
            ],
            "module": "lease"
        },
        {
            "id": "lease_6",
            "text": "What are the default provisions in your lease?",
            "options": [
                {"value": "clear_cure", "label": "Clear notice and cure period defined", "points": 0, "trigger_flag": False},
                {"value": "short_cure", "label": "Very short cure period (less than 10 days)", "points": 8, "trigger_flag": False},
                {"value": "immediate", "label": "Landlord can act immediately on default", "points": 15, "trigger_flag": True},
                {"value": "unsure", "label": "I haven't reviewed default terms", "points": 10, "trigger_flag": True}
            ],
            "module": "lease"
        },
        {
            "id": "lease_7",
            "text": "Is there an indemnification clause? Who does it protect?",
            "options": [
                {"value": "mutual", "label": "Mutual indemnification (protects both parties)", "points": 0, "trigger_flag": False},
                {"value": "landlord_only", "label": "Only protects the landlord", "points": 8, "trigger_flag": False},
                {"value": "broad_tenant", "label": "Requires tenant to indemnify for landlord's negligence", "points": 15, "trigger_flag": True},
                {"value": "unsure", "label": "I'm not familiar with this", "points": 10, "trigger_flag": False}
            ],
            "module": "lease"
        },
        {
            "id": "lease_8",
            "text": "How much time is left on your current lease?",
            "options": [
                {"value": "long_term", "label": "More than 3 years", "points": 0, "trigger_flag": False},
                {"value": "medium", "label": "1-3 years", "points": 2, "trigger_flag": False},
                {"value": "short", "label": "Less than 1 year", "points": 5, "trigger_flag": False},
                {"value": "month_to_month", "label": "Month-to-month", "points": 8, "trigger_flag": False}
            ],
            "module": "lease"
        },
        {
            "id": "lease_9",
            "text": "Does your lease have renewal options?",
            "options": [
                {"value": "automatic", "label": "Yes, with automatic renewal at same terms", "points": 0, "trigger_flag": False},
                {"value": "option_defined", "label": "Yes, renewal option with defined terms", "points": 2, "trigger_flag": False},
                {"value": "option_market", "label": "Renewal at 'market rate'", "points": 8, "trigger_flag": False},
                {"value": "no_option", "label": "No renewal option", "points": 10, "trigger_flag": False}
            ],
            "module": "lease"
        },
        {
            "id": "lease_10",
            "text": "Have you made significant improvements to the leased space?",
            "options": [
                {"value": "none", "label": "No significant improvements", "points": 0, "trigger_flag": False},
                {"value": "yes_removable", "label": "Yes, and lease allows removal", "points": 2, "trigger_flag": False},
                {"value": "yes_unclear", "label": "Yes, but ownership is unclear", "points": 10, "trigger_flag": True},
                {"value": "yes_landlord", "label": "Yes, but they become landlord's property", "points": 8, "trigger_flag": False}
            ],
            "module": "lease"
        }
    ],
    "acquisition": [
        {
            "id": "acq_1",
            "text": "Have you conducted formal due diligence on the target business?",
            "options": [
                {"value": "comprehensive", "label": "Yes, comprehensive due diligence with professionals", "points": 0, "trigger_flag": False},
                {"value": "limited", "label": "Some review, but not comprehensive", "points": 8, "trigger_flag": False},
                {"value": "minimal", "label": "Minimal review - mostly relied on seller", "points": 15, "trigger_flag": True},
                {"value": "none", "label": "No formal due diligence", "points": 20, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_2",
            "text": "Is this an asset purchase or stock/membership interest purchase?",
            "options": [
                {"value": "asset", "label": "Asset purchase", "points": 0, "trigger_flag": False},
                {"value": "stock", "label": "Stock/membership interest purchase", "points": 5, "trigger_flag": False},
                {"value": "unsure", "label": "I'm not sure of the structure", "points": 12, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_3",
            "text": "Have you reviewed the target's existing contracts and agreements?",
            "options": [
                {"value": "all_reviewed", "label": "Yes, all material contracts reviewed by attorney", "points": 0, "trigger_flag": False},
                {"value": "some_reviewed", "label": "Reviewed some, but not all", "points": 8, "trigger_flag": False},
                {"value": "not_reviewed", "label": "Haven't reviewed contracts", "points": 15, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_4",
            "text": "Are there clear representations and warranties from the seller?",
            "options": [
                {"value": "comprehensive", "label": "Yes, comprehensive reps and warranties", "points": 0, "trigger_flag": False},
                {"value": "basic", "label": "Basic representations only", "points": 5, "trigger_flag": False},
                {"value": "none", "label": "No formal representations", "points": 15, "trigger_flag": True},
                {"value": "unsure", "label": "I don't know what this means", "points": 10, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_5",
            "text": "Is there an indemnification provision protecting you as the buyer?",
            "options": [
                {"value": "strong", "label": "Yes, strong buyer protection with escrow/holdback", "points": 0, "trigger_flag": False},
                {"value": "basic", "label": "Basic indemnification, no escrow", "points": 8, "trigger_flag": False},
                {"value": "weak", "label": "Minimal or seller-friendly indemnification", "points": 12, "trigger_flag": True},
                {"value": "none", "label": "No indemnification provision", "points": 18, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_6",
            "text": "Have you verified the business has no outstanding legal issues or litigation?",
            "options": [
                {"value": "verified", "label": "Yes, verified through searches and disclosure", "points": 0, "trigger_flag": False},
                {"value": "relied_seller", "label": "Relied on seller's statements only", "points": 10, "trigger_flag": True},
                {"value": "not_checked", "label": "Haven't checked", "points": 15, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_7",
            "text": "Are employees being retained? How is that being handled?",
            "options": [
                {"value": "new_agreements", "label": "New employment agreements with key employees", "points": 0, "trigger_flag": False},
                {"value": "at_will", "label": "Employees will continue at-will", "points": 5, "trigger_flag": False},
                {"value": "assuming_contracts", "label": "Assuming existing employment contracts", "points": 8, "trigger_flag": False},
                {"value": "unclear", "label": "Employee situation is unclear", "points": 12, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_8",
            "text": "Is there a non-compete agreement with the seller?",
            "options": [
                {"value": "strong", "label": "Yes, reasonable non-compete in place", "points": 0, "trigger_flag": False},
                {"value": "weak", "label": "Non-compete is limited or weak", "points": 8, "trigger_flag": False},
                {"value": "none", "label": "No non-compete agreement", "points": 15, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_9",
            "text": "How is the purchase being financed?",
            "options": [
                {"value": "cash", "label": "All cash at closing", "points": 0, "trigger_flag": False},
                {"value": "bank_loan", "label": "Bank financing in place", "points": 2, "trigger_flag": False},
                {"value": "seller_finance", "label": "Seller financing involved", "points": 5, "trigger_flag": False},
                {"value": "not_secured", "label": "Financing not yet secured", "points": 12, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_10",
            "text": "Have you reviewed tax implications with a CPA or tax attorney?",
            "options": [
                {"value": "yes", "label": "Yes, tax planning completed", "points": 0, "trigger_flag": False},
                {"value": "in_progress", "label": "Currently reviewing", "points": 5, "trigger_flag": False},
                {"value": "no", "label": "Haven't consulted tax professionals", "points": 12, "trigger_flag": True}
            ],
            "module": "acquisition"
        }
    ],
    "ownership": [
        {
            "id": "own_1",
            "text": "Does your business have a formal operating agreement, partnership agreement, or shareholders agreement?",
            "options": [
                {"value": "yes_current", "label": "Yes, comprehensive and recently reviewed", "points": 0, "trigger_flag": False},
                {"value": "yes_old", "label": "Yes, but it's outdated", "points": 8, "trigger_flag": False},
                {"value": "basic", "label": "Basic template agreement only", "points": 10, "trigger_flag": False},
                {"value": "none", "label": "No formal agreement", "points": 20, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_2",
            "text": "Is there a buy-sell agreement in place?",
            "options": [
                {"value": "yes_funded", "label": "Yes, funded with life insurance", "points": 0, "trigger_flag": False},
                {"value": "yes_unfunded", "label": "Yes, but not funded", "points": 5, "trigger_flag": False},
                {"value": "partial", "label": "Some provisions, but not comprehensive", "points": 10, "trigger_flag": False},
                {"value": "none", "label": "No buy-sell provisions", "points": 18, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_3",
            "text": "How are major business decisions made?",
            "options": [
                {"value": "clear_process", "label": "Clear voting/approval process documented", "points": 0, "trigger_flag": False},
                {"value": "informal", "label": "Informal consensus, not documented", "points": 8, "trigger_flag": False},
                {"value": "one_person", "label": "One person makes all decisions", "points": 5, "trigger_flag": False},
                {"value": "unclear", "label": "No clear decision-making process", "points": 15, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_4",
            "text": "What happens if an owner wants to leave or sell their interest?",
            "options": [
                {"value": "clear_process", "label": "Clear exit process with valuation method", "points": 0, "trigger_flag": False},
                {"value": "some_provisions", "label": "Some provisions, but not comprehensive", "points": 8, "trigger_flag": False},
                {"value": "nothing", "label": "No exit provisions in place", "points": 18, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_5",
            "text": "Is there a defined method for valuing the business or ownership interests?",
            "options": [
                {"value": "formula", "label": "Yes, clear formula or process defined", "points": 0, "trigger_flag": False},
                {"value": "appraiser", "label": "Agreement requires third-party appraisal", "points": 3, "trigger_flag": False},
                {"value": "negotiate", "label": "Owners would negotiate at the time", "points": 10, "trigger_flag": False},
                {"value": "none", "label": "No valuation method defined", "points": 15, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_6",
            "text": "What happens if an owner dies or becomes disabled?",
            "options": [
                {"value": "clear_succession", "label": "Clear succession plan with funding", "points": 0, "trigger_flag": False},
                {"value": "some_plan", "label": "Some provisions, but not fully planned", "points": 8, "trigger_flag": False},
                {"value": "family_inherits", "label": "Family would inherit, no specific plan", "points": 12, "trigger_flag": True},
                {"value": "nothing", "label": "No plan in place", "points": 18, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_7",
            "text": "Are owner responsibilities and compensation clearly defined?",
            "options": [
                {"value": "clear", "label": "Yes, roles and compensation documented", "points": 0, "trigger_flag": False},
                {"value": "informal", "label": "Informal understanding, not documented", "points": 8, "trigger_flag": False},
                {"value": "disputes", "label": "Has caused disputes in the past", "points": 15, "trigger_flag": True},
                {"value": "unclear", "label": "Not clearly defined", "points": 12, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_8",
            "text": "Can an owner bring in a new partner or transfer interest to family?",
            "options": [
                {"value": "restricted", "label": "Requires approval, right of first refusal", "points": 0, "trigger_flag": False},
                {"value": "some_restrictions", "label": "Some restrictions, not comprehensive", "points": 5, "trigger_flag": False},
                {"value": "no_restrictions", "label": "No restrictions on transfers", "points": 15, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_9",
            "text": "Is there a dispute resolution process defined?",
            "options": [
                {"value": "mediation_arb", "label": "Yes, mediation then arbitration process", "points": 0, "trigger_flag": False},
                {"value": "some_process", "label": "Some process defined", "points": 5, "trigger_flag": False},
                {"value": "litigation", "label": "Would go straight to litigation", "points": 10, "trigger_flag": False},
                {"value": "none", "label": "No dispute process defined", "points": 12, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_10",
            "text": "How many owners/partners does your business have?",
            "options": [
                {"value": "sole", "label": "Just me (sole owner)", "points": 0, "trigger_flag": False},
                {"value": "two", "label": "Two owners (50/50 or similar)", "points": 5, "trigger_flag": False},
                {"value": "three_plus", "label": "Three or more owners", "points": 3, "trigger_flag": False},
                {"value": "complex", "label": "Complex ownership structure", "points": 8, "trigger_flag": False}
            ],
            "module": "ownership"
        }
    ]
}

# Risk descriptions for each module
RISK_DESCRIPTIONS = {
    "lease": {
        "no_agreement": {"title": "No Written Lease Agreement", "description": "Operating without a written lease creates significant legal uncertainty and leaves you vulnerable to sudden changes."},
        "personal_guarantee": {"title": "Personal Guarantee Exposure", "description": "An unlimited personal guarantee means your personal assets are at risk if the business can't pay rent."},
        "no_assignment": {"title": "Transfer Restrictions", "description": "Without assignment rights, you may be stuck with the lease even if you need to sell or close the business."},
        "unclear_maintenance": {"title": "Unclear Maintenance Responsibilities", "description": "Ambiguous repair obligations can lead to disputes and unexpected costs."},
        "market_rate_increases": {"title": "Undefined Rent Increases", "description": "'Market rate' clauses can lead to unpredictable and significant rent jumps."},
        "weak_default_terms": {"title": "Weak Default Protections", "description": "Without adequate notice and cure periods, minor issues could trigger major consequences."},
        "unfair_indemnification": {"title": "One-Sided Indemnification", "description": "Being required to cover the landlord's negligence exposes you to unfair liability."},
        "improvement_ownership": {"title": "Tenant Improvement Issues", "description": "Unclear ownership of improvements means you could lose significant investments."}
    },
    "acquisition": {
        "no_diligence": {"title": "Inadequate Due Diligence", "description": "Without proper investigation, you may inherit unknown problems, debts, or liabilities."},
        "structure_unclear": {"title": "Unclear Deal Structure", "description": "Not understanding asset vs. stock purchase affects liability exposure and tax treatment."},
        "unreviewed_contracts": {"title": "Unreviewed Contracts", "description": "Existing contracts may contain unfavorable terms or obligations you'll inherit."},
        "no_reps_warranties": {"title": "Missing Representations & Warranties", "description": "Without seller guarantees, you have no recourse if problems are discovered later."},
        "weak_indemnification": {"title": "Insufficient Buyer Protection", "description": "Weak indemnification leaves you paying for seller's past problems."},
        "litigation_risk": {"title": "Unknown Litigation Risk", "description": "Undiscovered legal issues could become your responsibility post-closing."},
        "employee_issues": {"title": "Employee Transition Uncertainty", "description": "Unclear employee arrangements can lead to HR problems and key talent loss."},
        "no_noncompete": {"title": "No Seller Non-Compete", "description": "The seller could start a competing business and take customers."},
        "financing_risk": {"title": "Financing Not Secured", "description": "Deal could fall through or require unfavorable last-minute terms."},
        "tax_exposure": {"title": "Unplanned Tax Consequences", "description": "Poor structuring could result in significant unexpected tax bills."}
    },
    "ownership": {
        "no_operating_agreement": {"title": "No Operating/Partnership Agreement", "description": "Without a formal agreement, state default rules apply - which may not match your intentions."},
        "no_buysell": {"title": "No Buy-Sell Agreement", "description": "Without exit provisions, partner departures can become contentious and costly disputes."},
        "unclear_decisions": {"title": "Unclear Decision Authority", "description": "Ambiguous decision-making can lead to deadlock and operational paralysis."},
        "no_exit_plan": {"title": "No Exit Provisions", "description": "Without defined exit terms, separating from the business becomes a negotiation nightmare."},
        "no_valuation": {"title": "No Valuation Method", "description": "Disputes over business value can derail buyouts and create expensive litigation."},
        "no_succession": {"title": "No Succession Plan", "description": "Death or disability without a plan can force liquidation or family disputes."},
        "compensation_disputes": {"title": "Compensation Ambiguity", "description": "Unclear roles and pay lead to resentment and partnership breakdowns."},
        "unrestricted_transfers": {"title": "No Transfer Restrictions", "description": "Partners could bring in unwanted new owners or transfer to family without consent."},
        "no_dispute_process": {"title": "No Dispute Resolution", "description": "Going straight to litigation is expensive and damages business relationships."}
    }
}

# ----- HELPER FUNCTIONS -----

def calculate_score_and_risks(answers: List[AssessmentAnswer], modules: List[str]) -> Dict[str, Any]:
    total_score = sum(a.points for a in answers)
    
    # Calculate max possible score based on questions answered
    max_score = 0
    for module in modules:
        for q in QUESTIONS.get(module, []):
            max_points = max(opt.get("points", 0) for opt in q["options"])
            max_score += max_points
    
    # Collect trigger flags
    trigger_flags = []
    for answer in answers:
        if answer.trigger_flag:
            trigger_flags.append(answer.question_id)
    
    # Calculate percentage
    score_percentage = (total_score / max_score * 100) if max_score > 0 else 0
    
    # Determine risk level
    if score_percentage >= 60 or len(trigger_flags) >= 3:
        risk_level = "red"
    elif score_percentage >= 30 or len(trigger_flags) >= 1:
        risk_level = "yellow"
    else:
        risk_level = "green"
    
    # Identify top risks based on high-point answers
    top_risks = []
    sorted_answers = sorted(answers, key=lambda x: x.points, reverse=True)
    
    for answer in sorted_answers[:7]:  # Top 7 risks
        if answer.points >= 5:  # Only include significant risks
            question_id = answer.question_id
            module = question_id.split("_")[0]
            if module == "acq":
                module = "acquisition"
            
            # Map question to risk description
            risk_key = get_risk_key(question_id, answer.answer_value)
            if risk_key and risk_key in RISK_DESCRIPTIONS.get(module, {}):
                risk_info = RISK_DESCRIPTIONS[module][risk_key]
                top_risks.append({
                    "title": risk_info["title"],
                    "description": risk_info["description"],
                    "severity": "high" if answer.trigger_flag else "medium",
                    "module": module
                })
    
    # Generate action plan
    action_plan = generate_action_plan(top_risks, risk_level, modules)
    
    # Calculate confidence level (inverse of risk)
    confidence = max(20, 100 - int(score_percentage) - (len(trigger_flags) * 10))
    
    return {
        "total_score": total_score,
        "max_possible_score": max_score,
        "score_percentage": round(score_percentage, 1),
        "risk_level": risk_level,
        "trigger_flags": trigger_flags,
        "top_risks": top_risks,
        "action_plan": action_plan,
        "confidence_level": min(100, max(10, confidence))
    }

def get_risk_key(question_id: str, answer_value: str) -> Optional[str]:
    """Map question answers to risk descriptions"""
    mappings = {
        "lease_1": {"no": "no_agreement"},
        "lease_2": {"unlimited": "personal_guarantee", "unsure": "personal_guarantee"},
        "lease_3": {"no_assignment": "no_assignment"},
        "lease_4": {"unclear": "unclear_maintenance"},
        "lease_5": {"market_rate": "market_rate_increases"},
        "lease_6": {"immediate": "weak_default_terms", "unsure": "weak_default_terms"},
        "lease_7": {"broad_tenant": "unfair_indemnification"},
        "lease_10": {"yes_unclear": "improvement_ownership"},
        "acq_1": {"minimal": "no_diligence", "none": "no_diligence"},
        "acq_2": {"unsure": "structure_unclear"},
        "acq_3": {"not_reviewed": "unreviewed_contracts"},
        "acq_4": {"none": "no_reps_warranties", "unsure": "no_reps_warranties"},
        "acq_5": {"weak": "weak_indemnification", "none": "weak_indemnification"},
        "acq_6": {"relied_seller": "litigation_risk", "not_checked": "litigation_risk"},
        "acq_7": {"unclear": "employee_issues"},
        "acq_8": {"none": "no_noncompete"},
        "acq_9": {"not_secured": "financing_risk"},
        "acq_10": {"no": "tax_exposure"},
        "own_1": {"none": "no_operating_agreement"},
        "own_2": {"none": "no_buysell"},
        "own_3": {"unclear": "unclear_decisions"},
        "own_4": {"nothing": "no_exit_plan"},
        "own_5": {"none": "no_valuation"},
        "own_6": {"nothing": "no_succession", "family_inherits": "no_succession"},
        "own_7": {"disputes": "compensation_disputes", "unclear": "compensation_disputes"},
        "own_8": {"no_restrictions": "unrestricted_transfers"},
        "own_9": {"none": "no_dispute_process"}
    }
    
    if question_id in mappings and answer_value in mappings[question_id]:
        return mappings[question_id][answer_value]
    return None

def generate_action_plan(top_risks: List[Dict], risk_level: str, modules: List[str]) -> List[Dict[str, Any]]:
    """Generate prioritized action plan based on risks"""
    action_plan = []
    priority = 1
    
    # High priority items based on trigger flags
    for risk in top_risks:
        if risk.get("severity") == "high":
            action_plan.append({
                "priority": priority,
                "action": f"Address: {risk['title']}",
                "description": risk['description'],
                "urgency": "high"
            })
            priority += 1
    
    # Medium priority items
    for risk in top_risks:
        if risk.get("severity") == "medium" and priority <= 5:
            action_plan.append({
                "priority": priority,
                "action": f"Review: {risk['title']}",
                "description": risk['description'],
                "urgency": "medium"
            })
            priority += 1
    
    # Always recommend a review call for yellow/red
    if risk_level in ["yellow", "red"]:
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
    return {"module": module, "questions": QUESTIONS[module]}

@api_router.get("/questions")
async def get_all_questions():
    """Get all questions for all modules"""
    return {"questions": QUESTIONS}

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
        "trigger_flags": results["trigger_flags"],
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
        return {"message": "No leads to export"}
    
    # Create CSV
    output = io.StringIO()
    fieldnames = ['name', 'email', 'phone', 'business_name', 'state', 'modules', 'situation', 'risk_level', 'score', 'top_risks', 'timestamp']
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    
    for lead in leads:
        row = {
            'name': lead.get('name', ''),
            'email': lead.get('email', ''),
            'phone': lead.get('phone', ''),
            'business_name': lead.get('business_name', ''),
            'state': lead.get('state', ''),
            'modules': ', '.join(lead.get('modules', [])),
            'situation': lead.get('situation', ''),
            'risk_level': lead.get('risk_level', ''),
            'score': lead.get('score', ''),
            'top_risks': ', '.join(lead.get('top_risks', [])),
            'timestamp': lead.get('timestamp', '')
        }
        writer.writerow(row)
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=clbh_leads.csv"}
    )

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[o for o in os.getenv('CORS_ORIGINS', '*').split(',') if o] or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_db_client():
    global client, db
    if not mongo_url or not db_name:
        logger.warning("MONGO_URL/DB_NAME not set; DB-backed endpoints will return 503.")
        client = None
        db = None
        return

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

@app.on_event("shutdown")
async def shutdown_db_client():
    if client is not None:
        client.close()
