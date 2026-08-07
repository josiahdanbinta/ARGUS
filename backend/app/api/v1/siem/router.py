from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.elasticsearch import get_elasticsearch
from app.models.siem import (
    DetectionRule,
    IOC,
    MITRETechnique,
    SIEMEvent,
    SigmaRule,
    ThreatFeed,
    YaraRule,
)
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.siem import (
    DetectionRuleCreate,
    DetectionRuleResponse,
    DetectionRuleUpdate,
    IOCCreate,
    IOCResponse,
    LogIngestBatch,
    LogIngestRequest,
    MITRETechniqueResponse,
    SIEMEventCreate,
    SIEMEventResponse,
    SigmaRuleCreate,
    SigmaRuleResponse,
    ThreatFeedCreate,
    ThreatFeedResponse,
    YaraRuleCreate,
    YaraRuleResponse,
)
from app.utils import generate_uuid, utcnow
from app.workers.tasks import process_event, sync_threat_intel

router = APIRouter(prefix="/api/v1/siem", tags=["SIEM"])


def _event_to_dict(event: SIEMEvent) -> dict:
    return {
        "id": event.id,
        "organization_id": event.organization_id,
        "tenant": event.tenant,
        "hostname": event.hostname,
        "asset_id": event.asset_id,
        "event_type": event.event_type,
        "event_id": event.event_id,
        "severity": event.severity,
        "source": event.source,
        "source_ip": event.source_ip,
        "destination_ip": event.destination_ip,
        "source_port": event.source_port,
        "destination_port": event.destination_port,
        "protocol": event.protocol,
        "user": event.user,
        "domain": event.domain,
        "country": event.country,
        "message": event.message,
        "raw_data": event.raw_data,
        "mitre_techniques": event.mitre_techniques,
        "tags": event.tags,
        "risk_score": event.risk_score,
        "is_correlated": event.is_correlated,
        "correlation_rule_id": event.correlation_rule_id,
        "timestamp": event.timestamp.isoformat() if event.timestamp else None,
        "received_at": event.received_at.isoformat() if event.received_at else None,
    }


async def _index_event_es(event: SIEMEvent) -> None:
    es = await get_elasticsearch()
    event_dict = _event_to_dict(event)
    doc_id = hashlib.sha256(json.dumps(event_dict, default=str).encode()).hexdigest()
    await es.index(index="events", id=doc_id, body=event_dict)


async def _process_single_event(db: AsyncSession, event_data: SIEMEventCreate) -> SIEMEvent:
    event = SIEMEvent(
        id=generate_uuid(),
        hostname=event_data.hostname,
        event_type=event_data.event_type,
        event_id=event_data.event_id,
        severity=event_data.severity,
        source=event_data.source,
        source_ip=event_data.source_ip,
        destination_ip=event_data.destination_ip,
        user=event_data.user,
        domain=event_data.domain,
        country=event_data.country,
        message=event_data.message,
        raw_data=event_data.raw_data,
        mitre_techniques=event_data.mitre_techniques,
        tags=event_data.tags,
        risk_score=event_data.risk_score,
        timestamp=event_data.timestamp or utcnow(),
        received_at=utcnow(),
        is_correlated=False,
    )
    db.add(event)
    await db.flush()
    await db.refresh(event)
    return event


# ---------------------------------------------------------------------------
# Event endpoints
# ---------------------------------------------------------------------------


@router.post("/events", response_model=SIEMEventResponse, status_code=status.HTTP_201_CREATED)
async def ingest_event(
    body: SIEMEventCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> SIEMEvent:
    event = await _process_single_event(db, body)
    await _index_event_es(event)
    process_event.delay(_event_to_dict(event))
    return event


@router.post("/events/batch", response_model=list[SIEMEventResponse], status_code=status.HTTP_201_CREATED)
async def ingest_events_batch(
    body: list[SIEMEventCreate],
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[SIEMEvent]:
    events: list[SIEMEvent] = []
    for event_data in body:
        event = await _process_single_event(db, event_data)
        await _index_event_es(event)
        events.append(event)
    return events


@router.get("/events", response_model=PaginatedResponse)
async def list_events(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    event_type: str | None = Query(None),
    severity: str | None = Query(None),
    hostname: str | None = Query(None),
    source: str | None = Query(None),
    start_time: str | None = Query(None, description="ISO format start timestamp"),
    end_time: str | None = Query(None, description="ISO format end timestamp"),
) -> PaginatedResponse:
    query = select(SIEMEvent)
    count_query = select(func.count(SIEMEvent.id))

    if event_type:
        query = query.where(SIEMEvent.event_type == event_type)
        count_query = count_query.where(SIEMEvent.event_type == event_type)
    if severity:
        query = query.where(SIEMEvent.severity == severity)
        count_query = count_query.where(SIEMEvent.severity == severity)
    if hostname:
        query = query.where(SIEMEvent.hostname == hostname)
        count_query = count_query.where(SIEMEvent.hostname == hostname)
    if source:
        query = query.where(SIEMEvent.source == source)
        count_query = count_query.where(SIEMEvent.source == source)
    if start_time:
        start_dt = datetime.fromisoformat(start_time)
        query = query.where(SIEMEvent.timestamp >= start_dt)
        count_query = count_query.where(SIEMEvent.timestamp >= start_dt)
    if end_time:
        end_dt = datetime.fromisoformat(end_time)
        query = query.where(SIEMEvent.timestamp <= end_dt)
        count_query = count_query.where(SIEMEvent.timestamp <= end_dt)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    pages = max(1, (total + page_size - 1) // page_size)

    query = query.order_by(SIEMEvent.timestamp.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    events = result.scalars().all()

    items = [SIEMEventResponse.model_validate(e) for e in events]
    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
        items=items,
    )


@router.get("/events/{event_id}", response_model=SIEMEventResponse)
async def get_event(
    event_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> SIEMEvent:
    result = await db.execute(select(SIEMEvent).where(SIEMEvent.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


# ---------------------------------------------------------------------------
# Log ingestion endpoints
# ---------------------------------------------------------------------------


@router.post("/logs/ingest", response_model=SIEMEventResponse, status_code=status.HTTP_201_CREATED)
async def ingest_log(
    body: LogIngestRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> SIEMEvent:
    event_data = SIEMEventCreate(
        hostname=body.hostname,
        event_type=body.event_type or "log",
        event_id=body.event_id,
        severity=body.severity,
        source=body.source,
        source_ip=body.ip,
        user=body.user,
        country=body.country,
        message=body.message,
        raw_data=body.raw,
        timestamp=body.timestamp,
    )
    event = await _process_single_event(db, event_data)
    await _index_event_es(event)
    process_event.delay(_event_to_dict(event))
    return event


@router.post("/logs/ingest/batch", response_model=list[SIEMEventResponse], status_code=status.HTTP_201_CREATED)
async def ingest_logs_batch(
    body: LogIngestBatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[SIEMEvent]:
    events: list[SIEMEvent] = []
    for log in body.events:
        event_data = SIEMEventCreate(
            hostname=log.hostname,
            event_type=log.event_type or "log",
            event_id=log.event_id,
            severity=log.severity,
            source=log.source,
            source_ip=log.ip,
            user=log.user,
            country=log.country,
            message=log.message,
            raw_data=log.raw,
            timestamp=log.timestamp,
        )
        event = await _process_single_event(db, event_data)
        await _index_event_es(event)
        events.append(event)
    return events


# ---------------------------------------------------------------------------
# Detection Rules endpoints
# ---------------------------------------------------------------------------


@router.get("/rules", response_model=PaginatedResponse)
async def list_detection_rules(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> PaginatedResponse:
    count_result = await db.execute(select(func.count(DetectionRule.id)))
    total = count_result.scalar() or 0
    pages = max(1, (total + page_size - 1) // page_size)

    query = select(DetectionRule).order_by(DetectionRule.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    rules = result.scalars().all()

    items = [DetectionRuleResponse.model_validate(r) for r in rules]
    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
        items=items,
    )


@router.post("/rules", response_model=DetectionRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_detection_rule(
    body: DetectionRuleCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> DetectionRule:
    rule = DetectionRule(
        id=generate_uuid(),
        organization_id=body.organization_id,
        name=body.name,
        description=body.description,
        rule_type=body.rule_type,
        severity=body.severity,
        mitre_techniques=body.mitre_techniques,
        query=body.query,
        sigma_rule=body.sigma_rule,
        yara_rule=body.yara_rule,
        threshold=body.threshold,
        time_window_seconds=body.time_window_seconds,
        is_enabled=True,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    return rule


@router.get("/rules/{rule_id}", response_model=DetectionRuleResponse)
async def get_detection_rule(
    rule_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> DetectionRule:
    result = await db.execute(select(DetectionRule).where(DetectionRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Detection rule not found")
    return rule


@router.put("/rules/{rule_id}", response_model=DetectionRuleResponse)
async def update_detection_rule(
    rule_id: str,
    body: DetectionRuleUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> DetectionRule:
    result = await db.execute(select(DetectionRule).where(DetectionRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Detection rule not found")

    update_data = body.model_dump(exclude_unset=True)
    update_data["updated_at"] = utcnow()

    await db.execute(
        update(DetectionRule).where(DetectionRule.id == rule_id).values(**update_data)
    )
    await db.flush()
    await db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_detection_rule(
    rule_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    result = await db.execute(select(DetectionRule).where(DetectionRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Detection rule not found")
    await db.delete(rule)
    await db.flush()


# ---------------------------------------------------------------------------
# Sigma Rules endpoints
# ---------------------------------------------------------------------------


@router.get("/sigma", response_model=PaginatedResponse)
async def list_sigma_rules(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> PaginatedResponse:
    count_result = await db.execute(select(func.count(SigmaRule.id)))
    total = count_result.scalar() or 0
    pages = max(1, (total + page_size - 1) // page_size)

    query = select(SigmaRule).order_by(SigmaRule.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    rules = result.scalars().all()

    items = [SigmaRuleResponse.model_validate(r) for r in rules]
    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
        items=items,
    )


@router.post("/sigma", response_model=SigmaRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_sigma_rule(
    body: SigmaRuleCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> SigmaRule:
    rule = SigmaRule(
        id=generate_uuid(),
        name=body.name,
        description=body.description,
        sigma_yaml=body.sigma_yaml,
        severity=body.severity,
        mitre_techniques=body.mitre_techniques,
        log_source=body.log_source,
        is_enabled=True,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    return rule


@router.get("/sigma/{sigma_id}", response_model=SigmaRuleResponse)
async def get_sigma_rule(
    sigma_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> SigmaRule:
    result = await db.execute(select(SigmaRule).where(SigmaRule.id == sigma_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sigma rule not found")
    return rule


@router.put("/sigma/{sigma_id}", response_model=SigmaRuleResponse)
async def update_sigma_rule(
    sigma_id: str,
    body: SigmaRuleCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> SigmaRule:
    result = await db.execute(select(SigmaRule).where(SigmaRule.id == sigma_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sigma rule not found")

    update_data = body.model_dump()
    update_data["updated_at"] = utcnow()

    await db.execute(
        update(SigmaRule).where(SigmaRule.id == sigma_id).values(**update_data)
    )
    await db.flush()
    await db.refresh(rule)
    return rule


@router.delete("/sigma/{sigma_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_sigma_rule(
    sigma_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    result = await db.execute(select(SigmaRule).where(SigmaRule.id == sigma_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sigma rule not found")
    await db.delete(rule)
    await db.flush()


# ---------------------------------------------------------------------------
# YARA Rules endpoints
# ---------------------------------------------------------------------------


@router.get("/yara", response_model=PaginatedResponse)
async def list_yara_rules(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> PaginatedResponse:
    count_result = await db.execute(select(func.count(YaraRule.id)))
    total = count_result.scalar() or 0
    pages = max(1, (total + page_size - 1) // page_size)

    query = select(YaraRule).order_by(YaraRule.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    rules = result.scalars().all()

    items = [YaraRuleResponse.model_validate(r) for r in rules]
    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
        items=items,
    )


@router.post("/yara", response_model=YaraRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_yara_rule(
    body: YaraRuleCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> YaraRule:
    rule = YaraRule(
        id=generate_uuid(),
        name=body.name,
        description=body.description,
        yara_rule=body.yara_rule,
        severity=body.severity,
        mitre_techniques=body.mitre_techniques,
        is_enabled=True,
        created_at=utcnow(),
    )
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    return rule


@router.get("/yara/{yara_id}", response_model=YaraRuleResponse)
async def get_yara_rule(
    yara_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> YaraRule:
    result = await db.execute(select(YaraRule).where(YaraRule.id == yara_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="YARA rule not found")
    return rule


@router.delete("/yara/{yara_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_yara_rule(
    yara_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    result = await db.execute(select(YaraRule).where(YaraRule.id == yara_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="YARA rule not found")
    await db.delete(rule)
    await db.flush()


# ---------------------------------------------------------------------------
# IOC endpoints
# ---------------------------------------------------------------------------


@router.get("/iocs", response_model=PaginatedResponse)
async def list_iocs(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    ioc_type: str | None = Query(None),
    severity: str | None = Query(None),
    is_active: bool | None = Query(None),
) -> PaginatedResponse:
    query = select(IOC)
    count_query = select(func.count(IOC.id))

    if ioc_type:
        query = query.where(IOC.ioc_type == ioc_type)
        count_query = count_query.where(IOC.ioc_type == ioc_type)
    if severity:
        query = query.where(IOC.severity == severity)
        count_query = count_query.where(IOC.severity == severity)
    if is_active is not None:
        query = query.where(IOC.is_active == is_active)
        count_query = count_query.where(IOC.is_active == is_active)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    pages = max(1, (total + page_size - 1) // page_size)

    query = query.order_by(IOC.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    iocs = result.scalars().all()

    items = [IOCResponse.model_validate(i) for i in iocs]
    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
        items=items,
    )


@router.post("/iocs", response_model=IOCResponse, status_code=status.HTTP_201_CREATED)
async def create_ioc(
    body: IOCCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> IOC:
    ioc = IOC(
        id=generate_uuid(),
        ioc_type=body.ioc_type,
        value=body.value,
        description=body.description,
        severity=body.severity,
        confidence=body.confidence,
        source=body.source,
        threat_actor=body.threat_actor,
        campaign=body.campaign,
        mitre_techniques=body.mitre_techniques,
        tlp=body.tlp,
        is_active=True,
        first_seen=utcnow(),
        created_at=utcnow(),
    )
    db.add(ioc)
    await db.flush()
    await db.refresh(ioc)
    return ioc


@router.get("/iocs/{ioc_id}", response_model=IOCResponse)
async def get_ioc(
    ioc_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> IOC:
    result = await db.execute(select(IOC).where(IOC.id == ioc_id))
    ioc = result.scalar_one_or_none()
    if not ioc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IOC not found")
    return ioc


@router.delete("/iocs/{ioc_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def deactivate_ioc(
    ioc_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    result = await db.execute(select(IOC).where(IOC.id == ioc_id))
    ioc = result.scalar_one_or_none()
    if not ioc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IOC not found")
    ioc.is_active = False
    await db.flush()


# ---------------------------------------------------------------------------
# Threat Feed endpoints
# ---------------------------------------------------------------------------


@router.get("/threat-feeds", response_model=PaginatedResponse)
async def list_threat_feeds(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> PaginatedResponse:
    count_result = await db.execute(select(func.count(ThreatFeed.id)))
    total = count_result.scalar() or 0
    pages = max(1, (total + page_size - 1) // page_size)

    query = select(ThreatFeed).order_by(ThreatFeed.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    feeds = result.scalars().all()

    items = [ThreatFeedResponse.model_validate(f) for f in feeds]
    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
        items=items,
    )


@router.post("/threat-feeds", response_model=ThreatFeedResponse, status_code=status.HTTP_201_CREATED)
async def create_threat_feed(
    body: ThreatFeedCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ThreatFeed:
    feed = ThreatFeed(
        id=generate_uuid(),
        name=body.name,
        feed_type=body.feed_type,
        source=body.source,
        url=body.url,
        api_config=body.api_config,
        is_enabled=True,
        sync_interval_minutes=body.sync_interval_minutes,
        created_at=utcnow(),
    )
    db.add(feed)
    await db.flush()
    await db.refresh(feed)
    return feed


@router.put("/threat-feeds/{feed_id}", response_model=ThreatFeedResponse)
async def update_threat_feed(
    feed_id: str,
    body: ThreatFeedCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ThreatFeed:
    result = await db.execute(select(ThreatFeed).where(ThreatFeed.id == feed_id))
    feed = result.scalar_one_or_none()
    if not feed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Threat feed not found")

    update_data = body.model_dump()
    await db.execute(
        update(ThreatFeed).where(ThreatFeed.id == feed_id).values(**update_data)
    )
    await db.flush()
    await db.refresh(feed)
    return feed


@router.post("/threat-feeds/{feed_id}/sync")
async def sync_threat_feed(
    feed_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    result = await db.execute(select(ThreatFeed).where(ThreatFeed.id == feed_id))
    feed = result.scalar_one_or_none()
    if not feed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Threat feed not found")

    sync_threat_intel.delay()
    feed.last_synced = utcnow()
    await db.flush()
    return {"status": "syncing", "feed_id": feed_id}


# ---------------------------------------------------------------------------
# MITRE ATT&CK endpoints
# ---------------------------------------------------------------------------


@router.get("/mitre", response_model=PaginatedResponse)
async def list_mitre_techniques(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(100, ge=1, le=1000),
) -> PaginatedResponse:
    count_result = await db.execute(select(func.count(MITRETechnique.id)))
    total = count_result.scalar() or 0
    pages = max(1, (total + page_size - 1) // page_size)

    query = select(MITRETechnique).order_by(MITRETechnique.technique_id)
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    techniques = result.scalars().all()

    items = [MITRETechniqueResponse.model_validate(t) for t in techniques]
    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
        items=items,
    )
