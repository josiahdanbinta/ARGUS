from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.soc import Alert, Incident
from app.models.asset import Asset, Endpoint
from app.models.siem import SIEMEvent, IOC
from app.schemas.common import DashboardResponse, DashboardWidget

router = APIRouter(prefix="/api/v1/dashboard", tags=["Dashboard"])


@router.get("", response_model=DashboardResponse)
@router.get("/", response_model=DashboardResponse)
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    total_events_result = await db.execute(select(func.count(SIEMEvent.id)))
    total_events = total_events_result.scalar() or 0

    alert_counts = await db.execute(
        select(
            func.count(Alert.id).filter(Alert.severity == "critical"),
            func.count(Alert.id).filter(Alert.status == "new"),
        ).where(Alert.status != "closed")
    )
    critical_alerts, active_alerts = alert_counts.one()

    severity_rows = await db.execute(
        select(Alert.severity, func.count(Alert.id))
        .where(Alert.status != "closed")
        .group_by(Alert.severity)
    )
    severity_map = {sev or "unknown": cnt for sev, cnt in severity_rows.all()}
    alert_severity = {
        "critical": severity_map.get("critical", 0),
        "high": severity_map.get("high", 0),
        "medium": severity_map.get("medium", 0),
        "low": severity_map.get("low", 0),
        "informational": severity_map.get("informational", 0),
    }

    incident_counts = await db.execute(
        select(
            func.count(Incident.id),
            func.count(Incident.id).filter(Incident.status != "closed"),
        )
    )
    total_incidents, active_incidents = incident_counts.one()

    incident_status_rows = await db.execute(
        select(Incident.status, func.count(Incident.id)).group_by(Incident.status)
    )
    incident_status = {status or "open": cnt for status, cnt in incident_status_rows.all()}

    recent_incidents_result = await db.execute(
        select(Incident).order_by(Incident.created_at.desc()).limit(6)
    )
    recent_incidents = [
        {
            "id": inc.id,
            "title": inc.title,
            "severity": inc.severity,
            "status": inc.status,
            "created_at": inc.created_at.isoformat() if inc.created_at else None,
        }
        for inc in recent_incidents_result.scalars().all()
    ]

    source_rows = await db.execute(
        select(Alert.source_ip, func.count(Alert.id))
        .where(Alert.source_ip.isnot(None), Alert.status != "closed")
        .group_by(Alert.source_ip)
        .order_by(func.count(Alert.id).desc())
        .limit(8)
    )
    top_sources = [
        {"source": src or "-", "count": cnt} for src, cnt in source_rows.all()
    ]

    category_rows = await db.execute(
        select(Alert.category, func.count(Alert.id))
        .where(Alert.category.isnot(None), Alert.status != "closed")
        .group_by(Alert.category)
        .order_by(func.count(Alert.id).desc())
        .limit(8)
    )
    top_categories = [
        {"category": cat or "uncategorized", "count": cnt} for cat, cnt in category_rows.all()
    ]

    asset_counts = await db.execute(
        select(
            func.count(Asset.id).filter(Asset.is_active == True),
            func.count(Endpoint.id),
        )
    )
    total_assets, endpoint_count = asset_counts.one()

    endpoint_status_rows = await db.execute(
        select(Endpoint.status, func.count(Endpoint.id)).group_by(Endpoint.status)
    )
    endpoint_status = {status or "unknown": cnt for status, cnt in endpoint_status_rows.all()}

    risk_avg_result = await db.execute(select(func.avg(Alert.risk_score)))
    risk_avg = risk_avg_result.scalar() or 0

    recent_events_result = await db.execute(
        select(func.count(SIEMEvent.id)).where(
            SIEMEvent.received_at
            >= func.now() - func.make_interval(0, 0, 0, 0, 0, 0, 60)
        )
    )
    recent_events = recent_events_result.scalar() or 0
    events_per_second = round(recent_events / 60.0, 2)

    threat_rows = await db.execute(
        select(
            func.count(IOC.id),
            func.count(IOC.id).filter(IOC.severity == "critical"),
        )
    )
    total_iocs, critical_iocs = threat_rows.one()

    metrics = {
        "total_events": total_events,
        "events_per_second": events_per_second,
        "critical_alerts": critical_alerts,
        "active_alerts": active_alerts,
        "active_incidents": active_incidents,
        "total_incidents": total_incidents,
        "endpoint_count": endpoint_count,
        "total_assets": total_assets,
        "threat_feed_status": "operational",
        "risk_score": round(float(risk_avg), 1),
        "alert_severity": alert_severity,
        "incident_status": incident_status,
        "recent_incidents": recent_incidents,
        "top_sources": top_sources,
        "top_categories": top_categories,
        "endpoint_status": endpoint_status,
        "total_iocs": total_iocs,
        "critical_iocs": critical_iocs,
    }

    widgets = [
        DashboardWidget(
            widget_type="alert_trend",
            title="Alert Trend (7 Days)",
            config={"chart_type": "line", "time_range": "7d"},
        ),
        DashboardWidget(
            widget_type="incidents_overview",
            title="Active Incidents",
            config={"show_critical": True},
        ),
        DashboardWidget(
            widget_type="threat_map",
            title="Threat Map",
            config={"metric": "source_ip"},
        ),
        DashboardWidget(
            widget_type="endpoint_status",
            title="Endpoint Health",
            config={"total_endpoints": endpoint_count},
        ),
        DashboardWidget(
            widget_type="event_volume",
            title="Event Volume",
            config={"chart_type": "bar", "time_range": "24h"},
        ),
        DashboardWidget(
            widget_type="top_alerts",
            title="Top Alert Categories",
            config={"limit": 10, "time_range": "7d"},
        ),
        DashboardWidget(
            widget_type="mitre_heatmap",
            title="MITRE ATT&CK Coverage",
            config={"time_range": "30d"},
        ),
        DashboardWidget(
            widget_type="asset_inventory",
            title="Asset Summary",
            config={"total_assets": total_assets},
        ),
    ]

    return DashboardResponse(metrics=metrics, widgets=widgets)
