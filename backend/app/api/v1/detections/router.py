from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.siem import SIEMEvent
from app.schemas.detections import (
    DetectionRunRequest,
    EnrichmentRequest,
    EnrichmentResponse,
    RansomwareFinding,
    RansomwareRule,
    RansomwareScanResponse,
)
from app.services.detection_service import (
    RECOMMENDED_ACTIONS,
    RANSOMWARE_RULES,
    enrich_indicator,
    match_ransomware_rule,
)

router = APIRouter(prefix="/api/v1/detections", tags=["Detections & Enrichment"])


@router.get("/ransomware/rules", response_model=list[RansomwareRule])
async def list_ransomware_rules(
    current_user=Depends(get_current_user),
):
    return [
        RansomwareRule(
            id=r["id"],
            name=r["name"],
            description=r["description"],
            severity=r["severity"],
            mitre_techniques=r["mitre_techniques"],
            event_type=r.get("event_type"),
            patterns=r["patterns"],
            false_positives=r.get("false_positives"),
            enabled=True,
        )
        for r in RANSOMWARE_RULES
    ]


@router.post("/ransomware/scan", response_model=RansomwareScanResponse)
async def scan_ransomware(
    body: DetectionRunRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    body = body or DetectionRunRequest()
    hours = {"24h": 24, "7d": 168, "30d": 720}.get(body.time_range, 24)
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    query = select(SIEMEvent).where(SIEMEvent.timestamp >= since).limit(20000)
    if body.event_type:
        query = query.where(SIEMEvent.event_type.ilike(f"%{body.event_type}%"))

    result = await db.execute(query)
    events = result.scalars().all()

    findings_by_rule: dict[str, list] = {}
    for event in events:
        for rule in RANSOMWARE_RULES:
            if match_ransomware_rule(rule, event):
                findings_by_rule.setdefault(rule["id"], []).append(event)

    findings = []
    critical = 0
    for rule in RANSOMWARE_RULES:
        matches = findings_by_rule.get(rule["id"], [])
        if not matches:
            continue
        if rule["severity"] == "critical":
            critical += 1
        hosts = sorted({m.hostname for m in matches if m.hostname})
        findings.append(
            RansomwareFinding(
                rule_id=rule["id"],
                rule_name=rule["name"],
                severity=rule["severity"],
                description=rule["description"],
                events=[
                    {
                        "id": e.id,
                        "timestamp": e.timestamp.isoformat() if e.timestamp else None,
                        "hostname": e.hostname,
                        "event_type": e.event_type,
                        "source": e.source,
                        "source_ip": e.source_ip,
                        "message": (e.message or e.raw_data or "")[:300],
                    }
                    for e in matches[:10]
                ],
                affected_hosts=hosts,
                mitre_techniques=rule["mitre_techniques"],
                recommended_actions=RECOMMENDED_ACTIONS,
            )
        )

    return RansomwareScanResponse(
        scanned_events=len(events),
        time_range=body.time_range,
        findings=findings,
        total_findings=len(findings),
        critical_findings=critical,
        detected_at=datetime.now(timezone.utc),
    )


@router.post("/enrich", response_model=EnrichmentResponse)
async def enrich(
    body: EnrichmentRequest,
    current_user=Depends(get_current_user),
):
    result = await enrich_indicator(body.indicator, body.indicator_type, body.providers)
    return EnrichmentResponse(**result)
