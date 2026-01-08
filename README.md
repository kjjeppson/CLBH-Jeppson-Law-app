## CLBH Quick Checkup (MVP)

This repo contains a **minimum viable product** for the “Clean Legal Bill of Health (CLBH) — Quick Checkup”:

- **Public flow**: landing → select modules → assessment → results → lead capture
- **Admin flow**: `/admin` lead dashboard + CSV export

### Quick start (recommended): Docker Compose

Requirements: Docker + Docker Compose.

```bash
docker compose up --build
```

Then open:
- **Frontend**: `http://localhost:3000`
- **Backend API**: `http://localhost:8000/api/`

### Admin access (MVP protection)

You can optionally protect admin endpoints:

- Set `ADMIN_KEY` in `docker-compose.yml` (backend service) **or** in `backend/.env`.
- Open `http://localhost:3000/admin`
- Enter the same key in the **Admin Key** field to load/export leads.

If `ADMIN_KEY` is not set, admin endpoints are accessible (MVP/local dev convenience).

### Local dev (without Docker)

#### Backend (FastAPI)

1) Create `backend/.env` (copy from `backend/.env.example`)
2) Install deps and run:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.server:app --reload --port 8000
```

#### Frontend (React)

1) Create `frontend/.env` (copy from `frontend/.env.example`)
2) Install deps and run:

```bash
cd frontend
yarn install
yarn start
```

