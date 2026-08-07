from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.soc import Alert, Incident
from app.models.asset import Asset, Endpoint
from app.models.siem import SIEMEvent
from app.schemas.common import DashboardResponse, DashboardWidget

router = APIRouter(prefix="/api/v1/dashboard", tags=["Dashboard"])


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

    incident_counts = await db.execute(
        select(
            func.count(Incident.id),
            func.count(Incident.id).filter(Incident.status != "closed"),
        )
    )
    total_incidents, active_incidents = incident_counts.one()

    asset_counts = await db.execute(
        select(
            func.count(Asset.id).filter(Asset.is_active == True),
            func.count(Endpoint.id),
        )
    )
    total_assets, endpoint_count = asset_counts.one()

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

    metrics = {
        "total_events": total_events,
        "events_per_second": events_per_second,
        "critical_alerts": critical_alerts,
        "active_incidents": active_incidents,
        "endpoint_count": endpoint_count,
        "threat_feed_status": "operational",
        "risk_score": round(float(risk_avg), 1),
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
