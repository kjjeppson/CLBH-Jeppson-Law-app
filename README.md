## CLBH Quick Checkup (MVP)

This repo contains a **minimum viable product** for the “Clean Legal Bill of Health (CLBH) — Quick Checkup”:

- **Public flow**: landing → select modules → assessment → results → lead capture
- **Admin flow**: `/admin` lead dashboard + CSV export

### Quick start (recommended): Docker Compose

Requirements: Docker + Docker Compose.

#### Production Setup

1. **Copy and configure environment variables:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` and set secure values:**
   - Generate a secure `ADMIN_KEY`:
     ```bash
     python -c "import secrets; print(secrets.token_urlsafe(32))"
     ```
   - Set a strong `MONGO_ROOT_PASSWORD`
   - Update `CORS_ORIGINS` if needed

3. **Build and start all services:**
   ```bash
   docker compose up --build
   ```

4. **Access the application:**
   - **Frontend**: `http://localhost:3000`
   - **Backend API**: `http://localhost:8000/api/`
   - **Admin Dashboard**: `http://localhost:3000/admin`

#### Development Setup (with Hot-Reloading)

For development with automatic code reloading:

```bash
# Use the development configuration
docker compose -f docker-compose.dev.yml up --build
```

This will:
- Mount source code directories for hot-reloading
- Use development database (`clbh_dev`)
- Enable debug logging
- Auto-restart on code changes

#### Docker Features

✅ **Security Hardened:**
- Non-root users in all containers
- MongoDB authentication enabled
- Admin endpoints protected by `ADMIN_KEY`
- `.dockerignore` files to prevent leaking sensitive data

✅ **Production Ready:**
- Health checks for all services
- Automatic restart policies
- Resource limits (CPU/memory)
- Multi-stage builds for optimized images

✅ **Developer Friendly:**
- Hot-reloading in development mode
- Separate dev/prod configurations
- Easy environment variable management

#### Docker Commands

```bash
# Start services
docker compose up

# Start in background
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down

# Stop and remove volumes (deletes data!)
docker compose down -v

# Rebuild specific service
docker compose build backend
docker compose up -d backend

# Check service health
docker compose ps
```

### Admin access

Admin endpoints are protected by the `ADMIN_KEY` environment variable:

1. Set `ADMIN_KEY` in your `.env` file
2. Open `http://localhost:3000/admin`
3. Enter the admin key to access the dashboard

**Security Note:** Always set a strong `ADMIN_KEY` in production!

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

