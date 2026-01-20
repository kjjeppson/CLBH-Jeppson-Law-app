FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app/backend

COPY backend/requirements.txt /app/backend/requirements.txt

RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/ /app/backend/

EXPOSE 8000

# Use PORT env var for Railway compatibility, default to 8000
CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}

