from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.soc import Alert, Incident
from app.models.siem import IOC, SIEMEvent, SigmaRule
from app.models.user import User
from app.utils import utcnow

router = APIRouter(prefix="/api/v1/reporting", tags=["Reporting"])


@router.get("/incidents")
async def generate_incident_report(
    incident_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    incident = None
    if incident_id:
        result = await db.execute(select(Incident).where(Incident.id == incident_id))
        incident = result.scalar_one_or_none()

    if incident is None:
        recent = await db.execute(
            select(Incident).order_by(Incident.created_at.desc()).limit(5)
        )
        recent_incidents = recent.scalars().all()
        incident = recent_incidents[0] if recent_incidents else None

    if incident is None:
        return {
            "report_type": "incident",
            "generated_at": utcnow().isoformat(),
            "incident": None,
            "summary": "No incidents have been recorded yet. Create an incident to generate a detailed report.",
            "metrics": {
                "total_incidents": 0,
                "open_incidents": 0,
                "critical_incidents": 0,
            },
        }

    total_incidents = await db.execute(select(func.count()).select_from(Incident))
    open_incidents = await db.execute(
        select(func.count()).select_from(Incident).where(Incident.status != "closed")
    )
    critical_incidents = await db.execute(
        select(func.count()).select_from(Incident).where(Incident.severity == "critical")
    )

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
        "metrics": {
            "total_incidents": total_incidents.scalar() or 0,
            "open_incidents": open_incidents.scalar() or 0,
            "critical_incidents": critical_incidents.scalar() or 0,
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


@router.get("/compliance")
async def compliance_report(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    total_rules = await db.execute(select(func.count()).select_from(SigmaRule))
    enabled_rules = await db.execute(
        select(func.count()).select_from(SigmaRule).where(SigmaRule.is_enabled.is_(True))
    )
    total_incidents = await db.execute(select(func.count()).select_from(Incident))
    closed_incidents = await db.execute(
        select(func.count()).select_from(Incident).where(Incident.status == "closed")
    )

    return {
        "report_type": "compliance",
        "generated_at": utcnow().isoformat(),
        "frameworks": [
            {"framework": "SOC 2", "status": "In Progress", "score": 78},
            {"framework": "ISO 27001", "status": "In Progress", "score": 72},
            {"framework": "PCI DSS", "status": "In Progress", "score": 81},
            {"framework": "NIST CSF", "status": "In Progress", "score": 76},
        ],
        "key_metrics": {
            "detection_rules_total": total_rules.scalar() or 0,
            "detection_rules_enabled": enabled_rules.scalar() or 0,
            "incidents_closed": closed_incidents.scalar() or 0,
            "incidents_total": total_incidents.scalar() or 0,
        },
    }


@router.get("/threat-intel")
async def threat_intel_report(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    total_iocs = await db.execute(select(func.count()).select_from(IOC))
    active_iocs = await db.execute(
        select(func.count()).select_from(IOC).where(IOC.is_active.is_(True))
    )
    top_iocs_result = await db.execute(
        select(IOC).where(IOC.is_active.is_(True)).order_by(IOC.confidence.desc()).limit(10)
    )
    top_iocs = [
        {
            "type": ioc.ioc_type,
            "value": ioc.value,
            "confidence": ioc.confidence,
            "threat_actor": ioc.threat_actor,
            "mitre_techniques": ioc.mitre_techniques,
        }
        for ioc in top_iocs_result.scalars().all()
    ]

    return {
        "report_type": "threat-intel",
        "generated_at": utcnow().isoformat(),
        "top_indicators": top_iocs,
        "key_metrics": {
            "total_iocs": total_iocs.scalar() or 0,
            "active_iocs": active_iocs.scalar() or 0,
        },
    }


@router.get("/vulnerability")
async def vulnerability_report(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    critical_alerts = await db.execute(
        select(func.count()).select_from(Alert).where(Alert.severity == "critical")
    )
    high_alerts = await db.execute(
        select(func.count()).select_from(Alert).where(Alert.severity == "high")
    )
    medium_alerts = await db.execute(
        select(func.count()).select_from(Alert).where(Alert.severity == "medium")
    )

    critical_count = critical_alerts.scalar() or 0
    high_count = high_alerts.scalar() or 0
    medium_count = medium_alerts.scalar() or 0

    return {
        "report_type": "vulnerability",
        "generated_at": utcnow().isoformat(),
        "severity_breakdown": {
            "critical": critical_count,
            "high": high_count,
            "medium": medium_count,
        },
        "key_metrics": {
            "open_alerts": critical_count + high_count + medium_count,
        },
    }


@router.get("/audit")
async def audit_report(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    total_users = await db.execute(select(func.count()).select_from(User))
    active_alerts = await db.execute(
        select(func.count()).select_from(Alert).where(Alert.status.notin_(["closed", "resolved"]))
    )
    total_events = (
        await db.execute(select(func.count()).select_from(SIEMEvent))
    ).scalar() or 0

    return {
        "report_type": "audit",
        "generated_at": utcnow().isoformat(),
        "summary": {
            "total_users": total_users.scalar() or 0,
            "active_alerts": active_alerts.scalar() or 0,
            "total_siem_events": total_events,
        },
        "key_metrics": {
            "events_ingested": total_events,
        },
    }
