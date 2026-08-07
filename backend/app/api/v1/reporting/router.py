from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.soc import Incident
from app.models.siem import SIEMEvent
from app.schemas.common import PaginatedResponse
from app.utils import utcnow

router = APIRouter()


@router.get("/incidents")
async def generate_incident_report(
    incident_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    return {
        "report_type": "incident",
        "generated_at": utcnow().isoformat(),
        "incident": {
            "id": incident.id,
            "title": incident.title,
            "severity": incident.severity,
            "status": incident.status,
            "description": incident.description,
            "resolution": incident.resolution,
            "root_cause": incident.root_cause,
            "ai_summary": incident.ai_summary,
            "created_at": incident.created_at.isoformat() if incident.created_at else None,
            "closed_at": incident.closed_at.isoformat() if incident.closed_at else None,
        },
    }


@router.get("/executive")
async def executive_report(
    time_range: str = Query("7d"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from datetime import datetime, timedelta, timezone

    hours = {"24h": 24, "7d": 168, "30d": 720, "90d": 2160}.get(time_range, 168)
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    critical_alerts = await db.execute(
        select(func.count()).select_from(Incident).where(
            Incident.created_at >= since, Incident.severity == "critical"
        )
    )
    total_alerts = await db.execute(
        select(func.count()).select_from(Incident).where(Incident.created_at >= since)
    )
    total_events = await db.execute(
        select(func.count()).select_from(SIEMEvent).where(SIEMEvent.timestamp >= since)
    )

    return {
        "report_type": "executive",
        "generated_at": utcnow().isoformat(),
        "time_range": time_range,
        "key_metrics": {
            "total_events": total_events.scalar() or 0,
            "total_incidents": total_alerts.scalar() or 0,
            "critical_incidents": critical_alerts.scalar() or 0,
        },
    }
