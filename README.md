# CLBH Quick Checkup

A legal risk assessment tool for business owners to identify preventable legal risks in their business agreements.

## Overview

The "Clean Legal Bill of Health (CLBH) Quick Checkup" helps business owners:
- Assess legal risks in **Commercial Leases**, **Business Acquisitions**, and **Partnership Agreements**
- Get a clear **Green/Yellow/Red** risk score
- Receive a prioritized **action plan** based on identified risks
- Connect with legal professionals for follow-up

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 19, React Router, Tailwind CSS, Radix UI, shadcn/ui |
| Backend | FastAPI (Python), Motor (async MongoDB driver) |
| Database | MongoDB 7 |
| Container | Docker, Docker Compose |

## Quick Start (Docker Compose)

**Prerequisites:** Docker and Docker Compose installed.

1. Clone the repository:
   ```bash
   git clone https://github.com/kjjeppson/CLBH-Jeppson-Law-app.git
   cd CLBH-Jeppson-Law-app
   ```

2. Create a `.env` file in the project root:
   ```bash
   # .env
   ADMIN_KEY=your-secure-admin-key-here
   ```

3. Start all services:
   ```bash
   docker compose up --build
   ```

4. Access the application:
   - **Frontend:** http://localhost:3000
   - **Backend API:** http://localhost:8000/api
   - **Admin Dashboard:** http://localhost:3000/admin

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ADMIN_KEY` | Protects `/api/admin/*` endpoints. If not set, admin endpoints are open. | No (recommended for production) |
| `MONGO_URL` | MongoDB connection string | Yes (set in docker-compose.yml) |
| `DB_NAME` | MongoDB database name | Yes (set in docker-compose.yml) |
| `CORS_ORIGINS` | Allowed CORS origins | Yes (set in docker-compose.yml) |

## Local Development (Without Docker)

### Prerequisites
- Python 3.10+
- Node.js 18+
- MongoDB (local or cloud instance)
- Yarn

### Backend Setup

```bash
# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Set environment variables
export MONGO_URL=mongodb://localhost:27017
export DB_NAME=clbh

# Run the server
uvicorn backend.server:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
yarn install

# Set environment variables (or create frontend/.env)
export REACT_APP_BACKEND_URL=http://localhost:8000

# Start development server
yarn start
```

## API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/` | Health check |
| GET | `/api/questions` | Get all questions |
| GET | `/api/questions/{module}` | Get questions for a module (`lease`, `acquisition`, `ownership`) |
| POST | `/api/assessments` | Create new assessment |
| POST | `/api/assessments/submit` | Submit assessment answers |
| GET | `/api/assessments/{id}` | Get assessment results |
| POST | `/api/leads` | Submit lead capture form |

### Admin Endpoints (Protected)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/leads` | List all leads |
| GET | `/api/admin/leads/export` | Export leads as CSV |

**Authentication:** Pass the admin key via:
- Header: `X-Admin-Key: your-key`
- Query param: `?admin_key=your-key`

## Admin Dashboard

1. Navigate to http://localhost:3000/admin
2. Enter the `ADMIN_KEY` in the input field
3. Click "Save & Refresh"

Features:
- View all leads with risk levels
- Filter by risk category (Red/Yellow/Green)
- Export leads to CSV

## Project Structure

```
.
├── backend/
│   ├── server.py          # FastAPI application
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/         # React page components
│   │   ├── components/    # UI components (shadcn/ui)
│   │   └── App.js         # Main app with routing
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── .env                   # Environment variables (gitignored)
└── README.md
```

## Assessment Modules

| Module | Key Areas Assessed |
|--------|-------------------|
| **Commercial Lease** | Personal guarantees, assignment rights, default terms, rent increases, indemnification |
| **Business Acquisition** | Due diligence, deal structure, representations & warranties, indemnification, non-compete |
| **Partnership/Ownership** | Operating agreements, buy-sell provisions, decision authority, exit provisions, succession planning |

## Risk Scoring

| Level | Criteria | Meaning |
|-------|----------|---------|
| Green | Score < 30%, no trigger flags | Likely stable, confirm with brief review |
| Yellow | Score 30-60% or 1-2 trigger flags | Common gaps found, recommend review soon |
| Red | Score > 60% or 3+ trigger flags | High-risk flags, priority review recommended |

## License

Proprietary - Jeppsonlaw, LLP
