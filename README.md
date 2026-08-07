# ARGUS — Advance Response & Guard Unified System

AI-Powered Enterprise Security Operations Platform providing SIEM, SOC, SOAR, EDR, XDR, Threat Intelligence, and AI-powered security operations capabilities.

## Quick Start

```bash
# Start infrastructure
docker-compose up -d postgres redis elasticsearch

# Run migrations
cd backend && alembic upgrade head

# Start backend
uvicorn app.main:app --reload --port 8000

# Start frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Access:
- Frontend: http://localhost:5173
- API Docs: http://localhost:8000/api/v1/docs
- Kibana: http://localhost:5601
- Grafana: http://localhost:3000

## Architecture

```
ARGUS/
├── backend/      # Python 3.13 + FastAPI (26 API routes)
├── frontend/     # React 18 + TypeScript + TailwindCSS (17 pages)
└── infrastructure/ # Docker, Nginx, K8s configs
```

## Stack

| Layer      | Technology |
|------------|-----------|
| Backend    | Python 3.13, FastAPI, SQLAlchemy, Celery |
| Frontend   | React 18, TypeScript, Vite, TailwindCSS |
| Database   | PostgreSQL 16, Redis 7, Elasticsearch 8 |
| AI         | Ollama, OpenAI, Anthropic |
| Infra      | Docker, Nginx, Prometheus, Grafana |
