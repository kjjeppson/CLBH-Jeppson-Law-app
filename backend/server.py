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
# Scoring: GREEN = 3 points, YELLOW = 2 points, RED = 1 point
# Per category (20 questions): 50-60 = GREEN, 35-49 = YELLOW, 20-34 = RED

QUESTIONS = {
    "lease": [
        {
            "id": "lease_1",
            "text": "Is your commercial lease signed under your business entity name (LLC, Corp, etc.) rather than your personal name?",
            "options": [
                {"value": "green", "label": "Yes, the lease is under my business entity name.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure which name is on the lease.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, it's under my personal name.", "points": 1, "trigger_flag": True}
            ],
            "module": "lease"
        },
        {
            "id": "lease_2",
            "text": "Does your lease include a specific legal description of the premises, including square footage and common area details?",
            "options": [
                {"value": "green", "label": "Yes, the space is clearly described with square footage and boundaries.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "It mentions the address but I'm not sure about the specifics.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "I haven't reviewed this or don't know.", "points": 1, "trigger_flag": True}
            ],
            "module": "lease"
        },
        {
            "id": "lease_3",
            "text": "Did you sign a personal guarantee as part of your lease?",
            "options": [
                {"value": "green", "label": "No personal guarantee, or the guarantee has a cap (time or dollar limit).", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I signed one but I'm not sure of the terms.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "Yes, I signed an unlimited personal guarantee.", "points": 1, "trigger_flag": True}
            ],
            "module": "lease"
        },
        {
            "id": "lease_4",
            "text": "Do you know your lease type and exactly what expenses you are responsible for beyond base rent?",
            "options": [
                {"value": "green", "label": "Yes, I understand whether it's gross, modified gross, or NNN and what I pay.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I know my monthly rent but not exactly what additional costs I'm covering.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "I have no idea what lease type I have or what my total cost exposure is.", "points": 1, "trigger_flag": True}
            ],
            "module": "lease"
        },
        {
            "id": "lease_5",
            "text": "Does your lease include a cap on annual Common Area Maintenance (CAM) charge increases?",
            "options": [
                {"value": "green", "label": "Yes, CAM increases are capped at a fixed percentage.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure if there is a cap.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, there is no cap on CAM increases.", "points": 1, "trigger_flag": True}
            ],
            "module": "lease"
        },
        {
            "id": "lease_6",
            "text": "Does your lease clearly state the term length, renewal options, and notice deadlines?",
            "options": [
                {"value": "green", "label": "Yes, I know exactly when the lease ends and how to renew.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I know when it ends but I'm not clear on renewal procedures.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "I'm not sure of my lease term or renewal requirements.", "points": 1, "trigger_flag": True}
            ],
            "module": "lease"
        },
        {
            "id": "lease_7",
            "text": "Can you assign your lease or sublease your space if you need to?",
            "options": [
                {"value": "green", "label": "Yes, the lease allows assignment or subleasing with reasonable terms.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I think so, but I haven't reviewed those provisions.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, or I have no idea if it's allowed.", "points": 1, "trigger_flag": True}
            ],
            "module": "lease"
        },
        {
            "id": "lease_8",
            "text": "Does your lease include an early termination clause?",
            "options": [
                {"value": "green", "label": "Yes, and I understand the costs and conditions for early exit.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure if one exists in my lease.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, there is no early termination option.", "points": 1, "trigger_flag": True}
            ],
            "module": "lease"
        },
        {
            "id": "lease_9",
            "text": "Is it clear in your lease who is responsible for maintenance, repairs, and major systems like HVAC and roofing?",
            "options": [
                {"value": "green", "label": "Yes, responsibilities are clearly divided between me and the landlord.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I think the landlord handles major items but I'm not certain.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "I don't know who is responsible for what.", "points": 1, "trigger_flag": True}
            ],
            "module": "lease"
        },
        {
            "id": "lease_10",
            "text": "Does your lease address what happens if the property is damaged (fire, flood, etc.), including whether your rent is paused during repairs?",
            "options": [
                {"value": "green", "label": "Yes, the lease includes rent abatement during damage repairs.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure what the lease says about property damage.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, there is no rent abatement clause.", "points": 1, "trigger_flag": True}
            ],
            "module": "lease"
        },
        {
            "id": "lease_11",
            "text": "Are all verbal promises made by your landlord or broker documented in the written lease?",
            "options": [
                {"value": "green", "label": "Yes, everything discussed is in the written agreement.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "Most things are, but some promises were verbal only.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "Several important terms were only discussed verbally.", "points": 1, "trigger_flag": True}
            ],
            "module": "lease"
        },
        {
            "id": "lease_12",
            "text": "Does your lease include an exclusivity clause preventing the landlord from renting to a direct competitor in the same property?",
            "options": [
                {"value": "green", "label": "Yes, I have an exclusivity clause.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure if one exists.", "points": 2, "trigger_flag": False},
                {"value": "yellow2", "label": "No, there is no exclusivity protection.", "points": 2, "trigger_flag": False}
            ],
            "module": "lease"
        },
        {
            "id": "lease_13",
            "text": "Does your current insurance coverage meet all the requirements specified in your lease?",
            "options": [
                {"value": "green", "label": "Yes, I have verified my coverage meets all lease requirements.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I have insurance but haven't compared it to the lease requirements.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "I don't know what insurance the lease requires.", "points": 1, "trigger_flag": True}
            ],
            "module": "lease"
        },
        {
            "id": "lease_14",
            "text": "Does your lease address who pays for tenant improvements or buildout of the space?",
            "options": [
                {"value": "green", "label": "Yes, tenant improvement terms are clearly documented.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure what the lease says about improvements.", "points": 2, "trigger_flag": False},
                {"value": "yellow2", "label": "No, this was never discussed or documented.", "points": 2, "trigger_flag": False}
            ],
            "module": "lease"
        },
        {
            "id": "lease_15",
            "text": "Does your lease specify how disputes with the landlord will be resolved?",
            "options": [
                {"value": "green", "label": "Yes, there is a clear dispute resolution process (mediation, arbitration, etc.).", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure if this is addressed.", "points": 2, "trigger_flag": False},
                {"value": "yellow2", "label": "No, there is no dispute resolution clause.", "points": 2, "trigger_flag": False}
            ],
            "module": "lease"
        },
        {
            "id": "lease_16",
            "text": "Does your lease address ADA compliance, and is it clear who is responsible for the cost of any required modifications?",
            "options": [
                {"value": "green", "label": "Yes, ADA responsibilities and costs are clearly assigned.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure if the lease addresses ADA compliance.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, ADA compliance is not addressed in the lease.", "points": 1, "trigger_flag": True}
            ],
            "module": "lease"
        },
        {
            "id": "lease_17",
            "text": "Are there any restrictions in your lease on how you can use the space that could limit your current operations or future business changes?",
            "options": [
                {"value": "green", "label": "No, my permitted use is broad enough for my business needs.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure what use restrictions exist.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "Yes, my use is restricted in ways that could limit me.", "points": 1, "trigger_flag": True}
            ],
            "module": "lease"
        },
        {
            "id": "lease_18",
            "text": "Does your lease clearly outline your signage rights, including size, placement, and approval requirements?",
            "options": [
                {"value": "green", "label": "Yes, signage terms are clearly documented.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure what signage rights I have.", "points": 2, "trigger_flag": False},
                {"value": "yellow2", "label": "No, signage was never addressed.", "points": 2, "trigger_flag": False}
            ],
            "module": "lease"
        },
        {
            "id": "lease_19",
            "text": "If you are in a multi-tenant property or shopping center, does your lease include a co-tenancy clause?",
            "options": [
                {"value": "green", "label": "Yes, I have co-tenancy protections.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure, or this doesn't apply to my location.", "points": 2, "trigger_flag": False},
                {"value": "yellow2", "label": "No, there is no co-tenancy clause.", "points": 2, "trigger_flag": False}
            ],
            "module": "lease"
        },
        {
            "id": "lease_20",
            "text": "Overall, when was the last time you or an attorney thoroughly reviewed your entire commercial lease?",
            "options": [
                {"value": "green", "label": "Within the past year.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "More than a year ago, or only parts of it.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "I have never had it professionally reviewed.", "points": 1, "trigger_flag": True}
            ],
            "module": "lease"
        }
    ],
    "ownership": [
        {
            "id": "own_1",
            "text": "Does your business have a written ownership agreement (operating agreement, partnership agreement, or shareholders agreement) signed by all owners?",
            "options": [
                {"value": "green", "label": "Yes, we have a signed written agreement.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We have a draft or template but it was never finalized or signed.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, we have no written agreement.", "points": 1, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_2",
            "text": "Does your agreement clearly document each owner's percentage of ownership, capital contributions, and how profits and losses are divided?",
            "options": [
                {"value": "green", "label": "Yes, all ownership percentages and financial terms are clearly documented.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "Ownership percentages are documented, but the financial details are vague.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, or we only have a verbal understanding.", "points": 1, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_3",
            "text": "Are each owner's roles, responsibilities, and decision-making authority clearly defined in writing?",
            "options": [
                {"value": "green", "label": "Yes, roles and authority are clearly documented.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We have general roles but nothing formal in writing.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, we just figure it out as we go.", "points": 1, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_4",
            "text": "Does your agreement specify voting rights and what percentage of owner approval is needed for major decisions (selling the business, taking on debt, adding a partner)?",
            "options": [
                {"value": "green", "label": "Yes, voting thresholds for major decisions are clearly defined.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We have some decision-making rules, but major decisions aren't clearly addressed.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, we have no formal voting or decision-making process.", "points": 1, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_5",
            "text": "Does your agreement include a buy-sell (buyout) provision that explains how an owner's interest is valued and transferred if they want to leave?",
            "options": [
                {"value": "green", "label": "Yes, we have a clear buyout process with a valuation method.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We have a general buyout provision, but the details are vague.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, we have no buyout provision.", "points": 1, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_6",
            "text": "Does your buy-sell provision address specific triggering events such as death, disability, divorce, voluntary departure, and termination for cause?",
            "options": [
                {"value": "green", "label": "Yes, all major triggering events are addressed.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "Some events are addressed, but not all.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, triggering events are not specified, or we have no buyout provision.", "points": 1, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_7",
            "text": "Does your agreement include a method for determining the value of an ownership interest (formula, appraisal process, etc.)?",
            "options": [
                {"value": "green", "label": "Yes, there is a clear valuation formula or process.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "The agreement mentions valuation but doesn't specify a method.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, there is no valuation method.", "points": 1, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_8",
            "text": "Does your agreement include a right of first refusal that requires owners to offer their interest to existing owners before selling to an outsider?",
            "options": [
                {"value": "green", "label": "Yes, we have a right of first refusal.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure if this is included.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, any owner can sell to anyone.", "points": 1, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_9",
            "text": "Does your agreement include non-compete and non-solicitation provisions that apply if an owner leaves the business?",
            "options": [
                {"value": "green", "label": "Yes, departing owners are restricted from competing and soliciting clients/employees.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We have some restrictions, but they may not be comprehensive.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, there are no non-compete or non-solicitation protections.", "points": 1, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_10",
            "text": "Does your agreement address what happens to an owner's interest if they pass away?",
            "options": [
                {"value": "green", "label": "Yes, the agreement specifies how a deceased owner's interest is handled.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I think it's addressed, but I'm not sure of the details.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, death is not addressed in the agreement.", "points": 1, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_11",
            "text": "Does your agreement define what constitutes disability and what happens to a disabled owner's interest and responsibilities?",
            "options": [
                {"value": "green", "label": "Yes, disability is defined and provisions are in place.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure if disability is addressed.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, disability is not addressed.", "points": 1, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_12",
            "text": "Does your agreement protect the business in the event of an owner's divorce?",
            "options": [
                {"value": "green", "label": "Yes, there are provisions preventing a spouse from claiming business interest.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure if divorce scenarios are addressed.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, there are no divorce protections.", "points": 1, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_13",
            "text": "Does your agreement include a process for resolving deadlocks when owners cannot agree on a decision?",
            "options": [
                {"value": "green", "label": "Yes, there is a formal deadlock resolution process.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure if this is addressed.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, there is no deadlock resolution mechanism.", "points": 1, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_14",
            "text": "Does your agreement specify how and when owners can take distributions from the business?",
            "options": [
                {"value": "green", "label": "Yes, distribution rules are clearly documented.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We take distributions, but the rules aren't formally documented.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, we have no formal distribution policy.", "points": 1, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_15",
            "text": "Does your agreement include confidentiality provisions protecting proprietary business information?",
            "options": [
                {"value": "green", "label": "Yes, all owners are bound by confidentiality obligations.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure if confidentiality is addressed.", "points": 2, "trigger_flag": False},
                {"value": "yellow2", "label": "No, there are no confidentiality provisions.", "points": 2, "trigger_flag": False}
            ],
            "module": "ownership"
        },
        {
            "id": "own_16",
            "text": "Does your agreement include indemnification provisions that protect individual owners from liability caused by another owner's actions?",
            "options": [
                {"value": "green", "label": "Yes, indemnification provisions are in place.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure if indemnification is addressed.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, there are no indemnification provisions.", "points": 1, "trigger_flag": True}
            ],
            "module": "ownership"
        },
        {
            "id": "own_17",
            "text": "Does your agreement address how new owners or members can be admitted to the business?",
            "options": [
                {"value": "green", "label": "Yes, the admission process and approval requirements are documented.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure if this is addressed.", "points": 2, "trigger_flag": False},
                {"value": "yellow2", "label": "No, there is no admission process.", "points": 2, "trigger_flag": False}
            ],
            "module": "ownership"
        },
        {
            "id": "own_18",
            "text": "Does your agreement include provisions for capital calls and what happens if an owner cannot contribute additional funds when needed?",
            "options": [
                {"value": "green", "label": "Yes, capital call procedures and consequences are clearly defined.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure if capital calls are addressed.", "points": 2, "trigger_flag": False},
                {"value": "yellow2", "label": "No, there are no capital call provisions.", "points": 2, "trigger_flag": False}
            ],
            "module": "ownership"
        },
        {
            "id": "own_19",
            "text": "Does your agreement include a dispute resolution clause specifying how internal conflicts will be handled?",
            "options": [
                {"value": "green", "label": "Yes, dispute resolution (mediation, arbitration, etc.) is specified.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure if this is addressed.", "points": 2, "trigger_flag": False},
                {"value": "yellow2", "label": "No, there is no dispute resolution process.", "points": 2, "trigger_flag": False}
            ],
            "module": "ownership"
        },
        {
            "id": "own_20",
            "text": "When was the last time your ownership agreement was reviewed and updated to reflect current operations?",
            "options": [
                {"value": "green", "label": "Within the past two years.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "More than two years ago.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "It has never been updated, or I don't know.", "points": 1, "trigger_flag": True}
            ],
            "module": "ownership"
        }
    ],
    "acquisition": [
        {
            "id": "acq_1",
            "text": "Do you understand whether you are making an asset purchase or a stock/membership interest purchase, and have you discussed the legal and tax implications with a professional?",
            "options": [
                {"value": "green", "label": "Yes, I understand the structure and have consulted a professional.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I have a general idea but haven't received professional guidance.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, I'm not sure what type of purchase this is.", "points": 1, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_2",
            "text": "Has comprehensive due diligence been conducted, including a review of financial records, tax returns (at least 3 years), debts, litigation, and regulatory compliance?",
            "options": [
                {"value": "green", "label": "Yes, thorough due diligence has been completed.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "Some due diligence has been done, but it may not be complete.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, or I am relying on the seller's word.", "points": 1, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_3",
            "text": "Have all existing contracts, leases, and vendor agreements been reviewed, and have you confirmed they can be legally transferred to you?",
            "options": [
                {"value": "green", "label": "Yes, all agreements have been reviewed and confirmed as transferable.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I've reviewed some agreements but not all.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, I haven't reviewed existing contracts for transferability.", "points": 1, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_4",
            "text": "Has all intellectual property (trademarks, trade names, patents, domains, social media accounts) been documented and confirmed to transfer with the sale?",
            "options": [
                {"value": "green", "label": "Yes, all IP is documented and included in the purchase agreement.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I've discussed IP but not everything is formally documented.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, IP hasn't been addressed or I'm not sure what IP the business owns.", "points": 1, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_5",
            "text": "Have you checked for any existing or pending lawsuits against the business, and does the purchase agreement specify who is responsible for them?",
            "options": [
                {"value": "green", "label": "Yes, I've verified litigation status and responsibility is assigned in the agreement.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I asked the seller verbally but haven't verified independently.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, I haven't checked for pending or existing litigation.", "points": 1, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_6",
            "text": "Have all employee-related matters been addressed, including employment agreements, non-competes, benefits obligations, and potential notification requirements?",
            "options": [
                {"value": "green", "label": "Yes, all employee matters are documented and accounted for.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm aware of the employees but haven't reviewed all the details.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, employee matters have not been formally addressed.", "points": 1, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_7",
            "text": "Have all required government permits, licenses, and regulatory approvals been identified, and have you confirmed they are transferable?",
            "options": [
                {"value": "green", "label": "Yes, all permits and licenses have been verified and confirmed transferable.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I know some permits are needed but haven't confirmed transferability.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, I haven't reviewed permits or licensing requirements.", "points": 1, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_8",
            "text": "Does the purchase agreement include detailed representations and warranties from the seller about the condition and legal standing of the business?",
            "options": [
                {"value": "green", "label": "Yes, the agreement includes comprehensive representations and warranties.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "There are some reps and warranties, but they may be limited.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, or I'm not sure what representations the seller has made.", "points": 1, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_9",
            "text": "Does the agreement include an indemnification clause that protects you if the seller's representations turn out to be false or if undisclosed liabilities surface?",
            "options": [
                {"value": "green", "label": "Yes, indemnification provisions are in place with clear terms.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "There is some indemnification language but I'm not sure it's adequate.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, there is no indemnification clause.", "points": 1, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_10",
            "text": "Does the deal include an escrow or holdback provision to cover any post-closing adjustments or undisclosed liabilities?",
            "options": [
                {"value": "green", "label": "Yes, funds are being held in escrow for a defined period.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We discussed escrow but it's not finalized.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, the full purchase price is being paid at closing with no holdback.", "points": 1, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_11",
            "text": "Does the seller have a non-compete agreement preventing them from starting or joining a competing business after the sale?",
            "options": [
                {"value": "green", "label": "Yes, a non-compete with clear terms (duration, geography, scope) is included.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We've discussed it verbally but it's not in the agreement yet.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, there is no non-compete agreement with the seller.", "points": 1, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_12",
            "text": "Does the purchase agreement address the transition period, including the seller's cooperation, training, and client introductions?",
            "options": [
                {"value": "green", "label": "Yes, transition terms including timeline and seller obligations are documented.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We've discussed a transition but it's informal.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, there is no formal transition plan.", "points": 1, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_13",
            "text": "Does the agreement include clear closing conditions and a timeline for what must happen before the sale is finalized?",
            "options": [
                {"value": "green", "label": "Yes, closing conditions and timeline are clearly defined.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "We have a general timeline but conditions are not all documented.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, closing conditions are not specified.", "points": 1, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_14",
            "text": "Has a qualified tax professional reviewed the deal structure and the allocation of the purchase price among assets?",
            "options": [
                {"value": "green", "label": "Yes, a tax professional has reviewed the structure and allocation.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I plan to but haven't done it yet.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, I haven't consulted a tax professional.", "points": 1, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_15",
            "text": "Have environmental liabilities been investigated, especially if the business involves real property, manufacturing, or hazardous materials?",
            "options": [
                {"value": "green", "label": "Yes, environmental due diligence has been completed.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm not sure if environmental issues apply to this business.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, environmental liabilities have not been investigated.", "points": 1, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_16",
            "text": "Have you checked whether key customer or vendor contracts include change-of-control provisions that could be triggered by the sale?",
            "options": [
                {"value": "green", "label": "Yes, all key contracts have been reviewed for change-of-control clauses.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I've reviewed some contracts but not all.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, I haven't checked for change-of-control provisions.", "points": 1, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_17",
            "text": "Have the business's financial statements been reviewed or audited by a qualified accountant?",
            "options": [
                {"value": "green", "label": "Yes, reviewed or audited financials have been provided and verified.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I have financial statements but they are unaudited and unverified.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, I'm relying on the seller's internal numbers.", "points": 1, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_18",
            "text": "Is your financing secured and are loan terms finalized?",
            "options": [
                {"value": "green", "label": "Yes, financing is fully approved and terms are locked.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm in the process but financing is not yet finalized.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, I haven't secured financing yet.", "points": 1, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_19",
            "text": "Have you reviewed any franchise agreements, licensing arrangements, or joint venture agreements that affect the business?",
            "options": [
                {"value": "green", "label": "Yes, all such agreements have been reviewed and transfer requirements are understood.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I'm aware of some agreements but haven't reviewed them all.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, or I'm not sure if such agreements exist.", "points": 1, "trigger_flag": True}
            ],
            "module": "acquisition"
        },
        {
            "id": "acq_20",
            "text": "Do you have a post-closing integration plan covering updated entity documents, bank accounts, insurance, and vendor notifications?",
            "options": [
                {"value": "green", "label": "Yes, a detailed integration plan is in place.", "points": 3, "trigger_flag": False},
                {"value": "yellow", "label": "I have a general idea but nothing formal.", "points": 2, "trigger_flag": False},
                {"value": "red", "label": "No, I haven't planned for post-closing integration.", "points": 1, "trigger_flag": True}
            ],
            "module": "acquisition"
        }
    ]
}

# Risk descriptions for each module - mapped to RED answer trigger flags
RISK_DESCRIPTIONS = {
    "lease": {
        "personal_name": {"title": "Lease Under Personal Name", "description": "Signing a lease personally exposes your personal assets to business liabilities."},
        "personal_guarantee": {"title": "Unlimited Personal Guarantee", "description": "An unlimited personal guarantee means your personal assets are at risk if the business can't pay rent."},
        "unknown_costs": {"title": "Unknown Cost Exposure", "description": "Not understanding your total lease costs could lead to unexpected financial burdens."},
        "no_cam_cap": {"title": "No CAM Cap", "description": "Without a cap on CAM increases, your costs could rise unpredictably each year."},
        "unclear_terms": {"title": "Unclear Lease Terms", "description": "Not knowing your renewal deadlines or term length could result in losing your space."},
        "no_assignment": {"title": "No Assignment Rights", "description": "Without assignment or sublease rights, you may be stuck with the lease if you need to exit."},
        "no_early_termination": {"title": "No Early Termination Option", "description": "Without an early exit clause, you're locked in regardless of business circumstances."},
        "unclear_maintenance": {"title": "Unclear Maintenance Responsibilities", "description": "Ambiguous repair obligations can lead to disputes and unexpected costs."},
        "no_rent_abatement": {"title": "No Rent Abatement", "description": "If the property is damaged, you could be paying rent while unable to operate."},
        "verbal_promises": {"title": "Undocumented Promises", "description": "Verbal promises not in writing are unenforceable and can lead to disputes."},
        "insurance_unknown": {"title": "Unknown Insurance Requirements", "description": "Not meeting lease insurance requirements could result in default."},
        "ada_unclear": {"title": "ADA Compliance Unclear", "description": "Unclear ADA responsibilities could result in costly modifications or liability."},
        "use_restrictions": {"title": "Restrictive Use Clauses", "description": "Use restrictions could limit your ability to adapt your business."},
        "never_reviewed": {"title": "Lease Never Reviewed", "description": "A lease that's never been professionally reviewed may contain unfavorable terms."}
    },
    "acquisition": {
        "structure_unclear": {"title": "Unclear Deal Structure", "description": "Not understanding asset vs. stock purchase affects liability exposure and tax treatment."},
        "no_diligence": {"title": "Inadequate Due Diligence", "description": "Without proper investigation, you may inherit unknown problems, debts, or liabilities."},
        "unreviewed_contracts": {"title": "Unreviewed Contracts", "description": "Existing contracts may contain unfavorable terms or change-of-control provisions."},
        "ip_not_documented": {"title": "IP Not Documented", "description": "Intellectual property that doesn't transfer properly could undermine your purchase."},
        "litigation_unchecked": {"title": "Litigation Not Verified", "description": "Undiscovered legal issues could become your responsibility post-closing."},
        "employee_issues": {"title": "Employee Matters Unaddressed", "description": "Unclear employee arrangements can lead to HR problems and compliance issues."},
        "permits_not_verified": {"title": "Permits Not Verified", "description": "Non-transferable permits could prevent you from operating the business."},
        "no_reps_warranties": {"title": "Missing Representations", "description": "Without seller guarantees, you have no recourse if problems are discovered later."},
        "no_indemnification": {"title": "No Indemnification", "description": "Without indemnification, you pay for all of the seller's past problems."},
        "no_escrow": {"title": "No Escrow Holdback", "description": "Paying full price at closing leaves no protection for undisclosed liabilities."},
        "no_noncompete": {"title": "No Seller Non-Compete", "description": "The seller could start a competing business and take your customers."},
        "no_transition": {"title": "No Transition Plan", "description": "Without a formal transition, you risk losing key relationships and knowledge."},
        "no_closing_conditions": {"title": "No Closing Conditions", "description": "Unclear closing conditions could lead to disputes or failed transactions."},
        "no_tax_review": {"title": "No Tax Professional Review", "description": "Poor structuring could result in significant unexpected tax bills."},
        "environmental_risk": {"title": "Environmental Liability Risk", "description": "Uninvestigated environmental issues could result in massive cleanup costs."},
        "financials_unverified": {"title": "Unverified Financials", "description": "Relying on seller's numbers without verification is extremely risky."},
        "financing_not_secured": {"title": "Financing Not Secured", "description": "Unsecured financing could derail the deal or force unfavorable terms."},
        "no_integration_plan": {"title": "No Integration Plan", "description": "Without post-closing planning, the transition could be chaotic and costly."}
    },
    "ownership": {
        "no_agreement": {"title": "No Written Agreement", "description": "Without a formal agreement, state default rules apply - which may not match your intentions."},
        "verbal_only": {"title": "Verbal Understanding Only", "description": "Verbal agreements are difficult to enforce and lead to disputes."},
        "roles_undefined": {"title": "Roles Not Defined", "description": "Unclear roles and responsibilities lead to conflicts and inefficiency."},
        "no_voting_process": {"title": "No Voting Process", "description": "Without clear decision-making rules, major decisions become contentious."},
        "no_buyout": {"title": "No Buyout Provision", "description": "Without exit provisions, partner departures become costly disputes."},
        "no_trigger_events": {"title": "Trigger Events Not Addressed", "description": "Death, disability, or divorce without provisions can destabilize the business."},
        "no_valuation": {"title": "No Valuation Method", "description": "Disputes over business value can derail buyouts and create expensive litigation."},
        "no_rofr": {"title": "No Right of First Refusal", "description": "Owners could sell to outsiders without giving partners a chance to buy."},
        "no_noncompete": {"title": "No Non-Compete Protection", "description": "Departing owners could compete directly against the business."},
        "death_not_addressed": {"title": "Death Not Addressed", "description": "A deceased owner's interest going to heirs could disrupt business operations."},
        "disability_not_addressed": {"title": "Disability Not Addressed", "description": "A disabled owner's situation needs clear provisions for business continuity."},
        "divorce_not_addressed": {"title": "Divorce Not Addressed", "description": "Without protection, a divorcing spouse could claim business ownership."},
        "no_deadlock_resolution": {"title": "No Deadlock Resolution", "description": "When owners can't agree, without a process the business can become paralyzed."},
        "no_distribution_policy": {"title": "No Distribution Policy", "description": "Unclear distribution rules lead to disputes about taking money from the business."},
        "no_indemnification": {"title": "No Owner Indemnification", "description": "Without protection, one owner's actions could create liability for all."},
        "never_updated": {"title": "Agreement Never Updated", "description": "An outdated agreement may not reflect current operations or ownership."}
    }
}

# ----- HELPER FUNCTIONS -----

def calculate_score_and_risks(answers: List[AssessmentAnswer], modules: List[str]) -> Dict[str, Any]:
    total_score = sum(a.points for a in answers)

    # Calculate max possible score (20 questions per module x 3 points = 60 per module)
    max_score = len(modules) * 60  # 60 points max per category

    # Collect trigger flags (RED answers on critical items)
    trigger_flags = []
    for answer in answers:
        if answer.trigger_flag:
            trigger_flags.append(answer.question_id)

    # Calculate percentage for display
    score_percentage = (total_score / max_score * 100) if max_score > 0 else 0

    # Determine risk level based on new scoring:
    # Per category (20 questions): 50-60 = GREEN, 35-49 = YELLOW, 20-34 = RED
    # For single module: score >= 50 = GREEN, 35-49 = YELLOW, < 35 = RED
    # For multiple modules, calculate average per module
    avg_score_per_module = total_score / len(modules) if modules else 0

    if avg_score_per_module >= 50:
        risk_level = "green"
    elif avg_score_per_module >= 35:
        risk_level = "yellow"
    else:
        risk_level = "red"

    # Override to yellow/red if there are critical RED answers (trigger flags)
    if len(trigger_flags) >= 3 and risk_level == "green":
        risk_level = "yellow"
    if len(trigger_flags) >= 5:
        risk_level = "red"
    
    # Identify top risks based on low-point answers (RED = 1 point is worst)
    top_risks = []
    # Sort by points ascending (lowest/worst first)
    sorted_answers = sorted(answers, key=lambda x: x.points)

    for answer in sorted_answers[:7]:  # Top 7 risks
        if answer.points <= 2:  # Only include YELLOW (2) and RED (1) answers
            question_id = answer.question_id
            module = question_id.split("_")[0]
            if module == "acq":
                module = "acquisition"
            elif module == "own":
                module = "ownership"

            # Map question to risk description
            risk_key = get_risk_key(question_id)
            if risk_key and risk_key in RISK_DESCRIPTIONS.get(module, {}):
                risk_info = RISK_DESCRIPTIONS[module][risk_key]
                top_risks.append({
                    "title": risk_info["title"],
                    "description": risk_info["description"],
                    "severity": "high" if answer.points == 1 else "medium",
                    "module": module
                })
    
    # Generate action plan
    action_plan = generate_action_plan(top_risks, risk_level, modules)

    # Calculate confidence level based on score percentage
    # Higher score = higher confidence
    confidence = int(score_percentage) - (len(trigger_flags) * 5)
    
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

def get_risk_key(question_id: str) -> Optional[str]:
    """Map question IDs to risk description keys"""
    mappings = {
        # Lease questions
        "lease_1": "personal_name",
        "lease_2": "unknown_costs",
        "lease_3": "personal_guarantee",
        "lease_4": "unknown_costs",
        "lease_5": "no_cam_cap",
        "lease_6": "unclear_terms",
        "lease_7": "no_assignment",
        "lease_8": "no_early_termination",
        "lease_9": "unclear_maintenance",
        "lease_10": "no_rent_abatement",
        "lease_11": "verbal_promises",
        "lease_13": "insurance_unknown",
        "lease_16": "ada_unclear",
        "lease_17": "use_restrictions",
        "lease_20": "never_reviewed",
        # Acquisition questions
        "acq_1": "structure_unclear",
        "acq_2": "no_diligence",
        "acq_3": "unreviewed_contracts",
        "acq_4": "ip_not_documented",
        "acq_5": "litigation_unchecked",
        "acq_6": "employee_issues",
        "acq_7": "permits_not_verified",
        "acq_8": "no_reps_warranties",
        "acq_9": "no_indemnification",
        "acq_10": "no_escrow",
        "acq_11": "no_noncompete",
        "acq_12": "no_transition",
        "acq_13": "no_closing_conditions",
        "acq_14": "no_tax_review",
        "acq_15": "environmental_risk",
        "acq_16": "unreviewed_contracts",
        "acq_17": "financials_unverified",
        "acq_18": "financing_not_secured",
        "acq_19": "unreviewed_contracts",
        "acq_20": "no_integration_plan",
        # Ownership questions
        "own_1": "no_agreement",
        "own_2": "verbal_only",
        "own_3": "roles_undefined",
        "own_4": "no_voting_process",
        "own_5": "no_buyout",
        "own_6": "no_trigger_events",
        "own_7": "no_valuation",
        "own_8": "no_rofr",
        "own_9": "no_noncompete",
        "own_10": "death_not_addressed",
        "own_11": "disability_not_addressed",
        "own_12": "divorce_not_addressed",
        "own_13": "no_deadlock_resolution",
        "own_14": "no_distribution_policy",
        "own_15": "no_agreement",
        "own_16": "no_indemnification",
        "own_20": "never_updated"
    }

    return mappings.get(question_id)

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
