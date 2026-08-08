from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator

from app.core.config import get_settings
from app.core.database import init_db, close_db
from app.core.elasticsearch import init_elasticsearch, close_elasticsearch
from app.core.logging import setup_logging, get_logger
from app.core.redis import get_redis, close_redis
from app.middleware import RequestLoggingMiddleware, SecurityHeadersMiddleware

from app.api.v1.auth.router import router as auth_router
from app.api.v1.users.router import router as users_router
from app.api.v1.organizations.router import router as org_router
from app.api.v1.assets.router import router as assets_router
from app.api.v1.siem.router import router as siem_router
from app.api.v1.alerts.router import router as alerts_router
from app.api.v1.incidents.router import router as incidents_router
from app.api.v1.soar.router import router as soar_router
from app.api.v1.edr.router import router as edr_router
from app.api.v1.ai.router import router as ai_router
from app.api.v1.search.router import router as search_router
from app.api.v1.dashboard.router import router as dashboard_router
from app.api.v1.audit.router import router as audit_router
from app.api.v1.threatintel.router import router as threatintel_router
from app.api.v1.mitre.router import router as mitre_router
from app.api.v1.compliance.router import router as compliance_router
from app.api.v1.notifications.router import router as notifications_router
from app.api.v1.reporting.router import router as reporting_router
from app.api.v1.detections.router import router as detections_router

settings = get_settings()
setup_logging()
logger = get_logger(__name__)

start_time = datetime.now(timezone.utc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("starting_ARGUS")
    await get_redis()
    await init_elasticsearch()
    await init_db()
    logger.info("ARGUS_started")
    yield
    logger.info("shutting_down_ARGUS")
    await close_db()
    await close_elasticsearch()
    await close_redis()


app = FastAPI(
    title="ARGUS - Advance Response & Guard Unified System",
    description="""
    A comprehensive cybersecurity platform providing SIEM, SOC, SOAR, EDR, XDR,
    Threat Intelligence, and AI-powered security operations capabilities.
    
    ## Features
    * Real-time security event ingestion and correlation
    * Alert management and incident response
    * SOAR playbook automation
    * Endpoint detection and response
    * AI-powered investigation and threat hunting
    * Multi-tenancy and RBAC
    * Threat intelligence integration
    * MITRE ATT&CK mapping
    """,
    version="1.0.0",
    docs_url="/api/v1/docs",
    redoc_url="/api/v1/redoc",
    openapi_url="/api/v1/openapi.json",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Correlation-ID", "X-Response-Time"],
)

# Custom middleware
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

# Prometheus metrics
instrumentator = Instrumentator()
instrumentator.instrument(app).expose(app, endpoint="/metrics")

# Include routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(org_router)
app.include_router(assets_router)
app.include_router(siem_router)
app.include_router(alerts_router)
app.include_router(incidents_router)
app.include_router(soar_router)
app.include_router(edr_router)
app.include_router(ai_router)
app.include_router(search_router)
app.include_router(dashboard_router)
app.include_router(audit_router)
app.include_router(threatintel_router)
app.include_router(mitre_router)
app.include_router(compliance_router)
app.include_router(notifications_router)
app.include_router(reporting_router)
app.include_router(detections_router)


@app.get("/api/v1/health")
async def health_check():
    services = {}
    try:
        import redis.asyncio as aioredis
        r = await get_redis()
        await r.ping()
        services["redis"] = "healthy"
    except Exception as e:
        services["redis"] = f"unhealthy: {e}"

    try:
        from app.core.elasticsearch import get_elasticsearch
        es = await get_elasticsearch()
        await es.ping()
        services["elasticsearch"] = "healthy"
    except Exception as e:
        services["elasticsearch"] = f"unhealthy: {e}"

    try:
        from app.core.database import engine
        async with engine.connect() as conn:
            await conn.execute(select(1))
        services["postgresql"] = "healthy"
    except Exception as e:
        services["postgresql"] = f"unhealthy: {e}"

    all_healthy = all(v == "healthy" for v in services.values())
    status = "healthy" if all_healthy else "degraded"
    uptime = datetime.now(timezone.utc) - start_time

    return {
        "status": status,
        "version": "1.0.0",
        "services": services,
        "uptime_seconds": uptime.total_seconds(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/ready")
async def readiness_check():
    return {"status": "ready"}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("unhandled_exception", path=request.url.path, error=str(exc))
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "correlation_id": request.headers.get("X-Correlation-ID", "unknown"),
        },
    )


from sqlalchemy import select, text as sa_text


@app.get("/")
async def root():
    return {
        "name": "ARGUS",
        "version": "1.0.0",
        "docs": "/api/v1/docs",
        "health": "/api/v1/health",
    }
