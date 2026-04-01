# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CLBH Quick Checkup — a legal risk assessment tool for business owners. Users answer 24 questions across 6 legal risk areas, get a Green/Yellow/Red risk score, and optionally submit contact info to receive results via email.

## Commands

### Local Development (Docker)
```bash
docker compose up --build          # Start all services (mongo, backend, frontend)
```
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/api
- Admin: http://localhost:3000/admin

### Local Development (Without Docker)
```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8000

# Frontend
cd frontend
yarn install
yarn start
```

### Frontend
```bash
cd frontend
yarn start      # Dev server (port 3000)
yarn build      # Production build (craco)
yarn test       # Run tests
```

### Linting/Formatting (Backend)
```bash
black backend/
isort backend/
flake8 backend/
mypy backend/
```

## CLBH Pillars (6 Assessment Areas)

Each pillar has 4 questions (24 total). The `area` ID is used in code; the `area_name` is user-facing.

| ID | Area Name | Questions |
|----|-----------|-----------|
| `contracts` | Customer Contracts & Project Risks | q1–q4 |
| `ownership` | Ownership & Governance | q5–q8 |
| `subcontractor` | Vendors | q9–q12 |
| `employment` | Employment & Safety Compliance | q13–q16 |
| `insurance` | Insurance and Risk Management | q17–q20 |
| `systems` | Systems, Records & Digital Risk | q21–q24 |

Defined in `AREAS` and `AREA_NAMES` dicts in `backend/server.py`. Each question maps to one pillar via its `area` field.

## Architecture

### Backend — Single-file FastAPI app (`backend/server.py`)
Everything lives in one ~1400-line file: models, questions data, scoring logic, API routes, email template, and external integrations. Key sections in order:

1. **Imports & Config** (lines 1-52) — env vars, SMTP config, MongoDB setup
2. **`send_results_email()`** (~line 55) — HTML email template with retry logic, sends via SMTP (`outbound-us1.ppe-hosted.com:587`)
3. **`subscribe_to_kit()`** — ConvertKit API integration for marketing list
4. **Pydantic Models** (~line 500) — `Question`, `AssessmentAnswer`, `AssessmentSubmit`, `AreaScore`, `AssessmentResult`, `Lead`
5. **Quiz Data** (~line 570) — `AREAS` dict (6 areas), `QUESTIONS` dict (24 questions under "clbh" module), `RISK_DESCRIPTIONS` dict
6. **Scoring Functions** (~line 950) — `calculate_score_and_risks()`, `calculate_area_risk_level()`, `generate_action_plan()`
7. **API Routes** (~line 1180+) — FastAPI endpoints

### Frontend — React 19 + Tailwind + shadcn/ui
- Built with **Craco** (CRA override), path alias `@/` maps to `src/`
- **5 pages** in `frontend/src/pages/`: LandingPage, ModuleSelection, AssessmentWizard, ResultsPage, AdminDashboard
- **UI components** in `frontend/src/components/ui/` — shadcn/ui (Radix primitives)
- API calls use **axios** with base URL from `REACT_APP_BACKEND_URL`
- No global state management — all state is component-level `useState`

### Database — MongoDB 7 (Motor async driver)
Two collections:
- `assessments` — quiz sessions with answers, scores, risk breakdowns
- `leads` — contact info linked to assessment IDs

### External Services
- **SMTP** (PPE Hosted) — sends results email from Eric's account. Env vars: `ERIC_EMAIL`, `ERIC_EMAIL_PASSWORD`
- **ConvertKit (Kit)** — subscribes leads to marketing list. Env vars: `KIT_API_KEY`, `KIT_FORM_ID`, `KIT_TAG_ID`. Custom fields sent per subscriber:
  - `last_name` — subscriber's last name
  - `risk_level` — overall result: "green", "yellow", or "red"
  - `score` — percentage string, e.g. "62.5%"
  - `top_risks` — comma-separated risk titles, e.g. "No Change Order Process, No Operating Agreement"

### Deployment — Railway.app
Auto-deploys from `main` branch. Config in `railway.json` (Nixpacks builder). Pushing to `main` triggers deploys for both services.

| Railway Service | Role | Domain |
|----------------|------|--------|
| **selfless-adaptation** | Frontend (React) | `assessment.jeppsonlaw.com` |
| **CLBH-Jeppson-Law-app** | Backend (FastAPI) | `clbh-jeppson-law-app-prod...railway.app` |

Backend runs via `Procfile`: `uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}`

## Key Patterns

- **Scoring**: GREEN=3pts, YELLOW=2pts, RED=1pt per question. Per area (4 questions, max 12): 10-12=GREEN, 7-9=YELLOW, 4-6=RED. Overall uses percentage thresholds.
- **Risk data flow**: `calculate_score_and_risks()` produces `red_flag_details`, `yellow_flag_details`, `green_flag_details` — each item has `title`, `description`, `area`, `area_name`. These get stored in the assessment document and passed to the email template.
- **Lead capture flow**: `POST /api/leads` saves to MongoDB, sends results email via SMTP in a background thread, and subscribes to ConvertKit.
- **Admin auth**: `X-Admin-Key` header or `?admin_key=` query param, checked against `ADMIN_KEY` env var.

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `MONGO_URL` | Backend | MongoDB connection string |
| `DB_NAME` | Backend | Database name (default: "clbh") |
| `CORS_ORIGINS` | Backend | Allowed CORS origins |
| `ADMIN_KEY` | Backend | Protects admin endpoints |
| `ERIC_EMAIL` | Backend | SMTP sender address |
| `ERIC_EMAIL_PASSWORD` | Backend | SMTP password |
| `KIT_API_KEY` | Backend | ConvertKit API key |
| `KIT_FORM_ID` | Backend | ConvertKit form ID |
| `KIT_TAG_ID` | Backend | ConvertKit tag ID |
| `REACT_APP_BACKEND_URL` | Frontend | Backend API base URL |
