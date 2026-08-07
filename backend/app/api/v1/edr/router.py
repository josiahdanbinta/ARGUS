from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.elasticsearch import get_elasticsearch
from app.core.dependencies import get_current_user, require_permission
from app.models.asset import Endpoint, Asset
from app.models.notification import AuditLog
from app.models.user import User
from app.schemas.asset import EndpointUpdate, EndpointResponse, EndpointHealthCheck
from app.utils import generate_uuid, utcnow


class KillProcessRequest(BaseModel):
    process_name: str
    process_id: int | None = None


class QuarantineFileRequest(BaseModel):
    file_path: str


class EvidenceCollectionRequest(BaseModel):
    evidence_types: list[str] | None = None


router = APIRouter(prefix="/api/v1/edr", tags=["EDR/XDR"])


@router.get("/endpoints", response_model=list[EndpointResponse])
async def list_endpoints(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Endpoint)
        .join(Asset, Endpoint.asset_id == Asset.id)
        .where(Asset.organization_id == current_user.organization_id)
        .order_by(Asset.hostname.nulls_last())
    )
    endpoints = result.scalars().all()
    return [EndpointResponse.model_validate(ep) for ep in endpoints]


@router.get("/endpoints/{endpoint_id}", response_model=EndpointResponse)
async def get_endpoint(
    endpoint_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Endpoint)
        .join(Asset, Endpoint.asset_id == Asset.id)
        .where(Endpoint.id == endpoint_id, Asset.organization_id == current_user.organization_id)
    )
    endpoint = result.scalar_one_or_none()
    if not endpoint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found")
    return EndpointResponse.model_validate(endpoint)


@router.post("/endpoints/{endpoint_id}/heartbeat", response_model=EndpointResponse)
async def endpoint_heartbeat(
    endpoint_id: str,
    payload: EndpointHealthCheck,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Endpoint)
        .join(Asset, Endpoint.asset_id == Asset.id)
        .where(Endpoint.id == endpoint_id, Asset.organization_id == current_user.organization_id)
    )
    endpoint = result.scalar_one_or_none()
    if not endpoint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found")

    if payload.cpu_usage is not None:
        endpoint.cpu_usage = payload.cpu_usage
    if payload.memory_usage is not None:
        endpoint.memory_usage = payload.memory_usage
    if payload.disk_usage is not None:
        endpoint.disk_usage = payload.disk_usage
    if payload.agent_version is not None:
        endpoint.agent_version = payload.agent_version
    if payload.installed_software is not None:
        endpoint.installed_software = payload.installed_software

    endpoint.agent_status = "active"
    endpoint.last_heartbeat = utcnow()
    endpoint.updated_at = utcnow()

    asset = await db.get(Asset, endpoint.asset_id)
    if asset:
        asset.last_seen = utcnow()

    await db.commit()
    await db.refresh(endpoint)
    return EndpointResponse.model_validate(endpoint)


@router.post("/endpoints/{endpoint_id}/isolate", response_model=EndpointResponse)
async def isolate_endpoint(
    endpoint_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("edr:isolate")),
):
    result = await db.execute(
        select(Endpoint)
        .join(Asset, Endpoint.asset_id == Asset.id)
        .where(Endpoint.id == endpoint_id, Asset.organization_id == current_user.organization_id)
    )
    endpoint = result.scalar_one_or_none()
    if not endpoint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found")

    endpoint.isolation_status = "isolated"
    endpoint.updated_at = utcnow()

    audit = AuditLog(
        id=generate_uuid(),
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        action="isolate_endpoint",
        resource="endpoint",
        resource_id=endpoint_id,
        details=f"Endpoint {endpoint_id} isolated by {current_user.email}",
        created_at=utcnow(),
    )
    db.add(audit)

    await db.commit()
    await db.refresh(endpoint)
    return EndpointResponse.model_validate(endpoint)


@router.post("/endpoints/{endpoint_id}/unisolate", response_model=EndpointResponse)
async def unisolate_endpoint(
    endpoint_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("edr:isolate")),
):
    result = await db.execute(
        select(Endpoint)
        .join(Asset, Endpoint.asset_id == Asset.id)
        .where(Endpoint.id == endpoint_id, Asset.organization_id == current_user.organization_id)
    )
    endpoint = result.scalar_one_or_none()
    if not endpoint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found")

    endpoint.isolation_status = "none"
    endpoint.updated_at = utcnow()

    audit = AuditLog(
        id=generate_uuid(),
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        action="unisolate_endpoint",
        resource="endpoint",
        resource_id=endpoint_id,
        details=f"Endpoint {endpoint_id} unisolated by {current_user.email}",
        created_at=utcnow(),
    )
    db.add(audit)

    await db.commit()
    await db.refresh(endpoint)
    return EndpointResponse.model_validate(endpoint)


@router.post("/endpoints/{endpoint_id}/kill-process")
async def kill_process(
    endpoint_id: str,
    payload: KillProcessRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("edr:kill_process")),
):
    result = await db.execute(
        select(Endpoint)
        .join(Asset, Endpoint.asset_id == Asset.id)
        .where(Endpoint.id == endpoint_id, Asset.organization_id == current_user.organization_id)
    )
    endpoint = result.scalar_one_or_none()
    if not endpoint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found")

    audit = AuditLog(
        id=generate_uuid(),
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        action="kill_process",
        resource="endpoint",
        resource_id=endpoint_id,
        details=f"Kill process '{payload.process_name}' (PID: {payload.process_id}) on endpoint {endpoint_id}",
        created_at=utcnow(),
    )
    db.add(audit)
    await db.commit()

    return {"status": "queued", "endpoint_id": endpoint_id, "process_name": payload.process_name}


@router.post("/endpoints/{endpoint_id}/quarantine-file")
async def quarantine_file(
    endpoint_id: str,
    payload: QuarantineFileRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("edr:quarantine")),
):
    result = await db.execute(
        select(Endpoint)
        .join(Asset, Endpoint.asset_id == Asset.id)
        .where(Endpoint.id == endpoint_id, Asset.organization_id == current_user.organization_id)
    )
    endpoint = result.scalar_one_or_none()
    if not endpoint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found")

    audit = AuditLog(
        id=generate_uuid(),
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        action="quarantine_file",
        resource="endpoint",
        resource_id=endpoint_id,
        details=f"Quarantine file '{payload.file_path}' on endpoint {endpoint_id}",
        created_at=utcnow(),
    )
    db.add(audit)
    await db.commit()

    return {"status": "queued", "endpoint_id": endpoint_id, "file_path": payload.file_path}


@router.post("/endpoints/{endpoint_id}/collect-evidence")
async def collect_evidence(
    endpoint_id: str,
    payload: EvidenceCollectionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Endpoint)
        .join(Asset, Endpoint.asset_id == Asset.id)
        .where(Endpoint.id == endpoint_id, Asset.organization_id == current_user.organization_id)
    )
    endpoint = result.scalar_one_or_none()
    if not endpoint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found")

    audit = AuditLog(
        id=generate_uuid(),
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        action="collect_evidence",
        resource="endpoint",
        resource_id=endpoint_id,
        details=f"Evidence collection requested for endpoint {endpoint_id} types={payload.evidence_types}",
        created_at=utcnow(),
    )
    db.add(audit)
    await db.commit()

    return {"status": "queued", "endpoint_id": endpoint_id, "evidence_types": payload.evidence_types}


@router.get("/endpoints/{endpoint_id}/processes")
async def get_endpoint_processes(
    endpoint_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    size: int = Query(100, ge=1, le=1000),
):
    result = await db.execute(
        select(Endpoint)
        .join(Asset, Endpoint.asset_id == Asset.id)
        .where(Endpoint.id == endpoint_id, Asset.organization_id == current_user.organization_id)
    )
    endpoint = result.scalar_one_or_none()
    if not endpoint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found")

    es = await get_elasticsearch()
    es_result = await es.search(
        index="processes",
        body={
            "query": {"term": {"endpoint_id": endpoint_id}},
            "sort": [{"@timestamp": "desc"}],
            "size": size,
        },
    )
    hits = es_result["hits"]["hits"]
    return {"endpoint_id": endpoint_id, "total": es_result["hits"]["total"]["value"], "processes": [h["_source"] for h in hits]}


@router.get("/endpoints/{endpoint_id}/network")
async def get_endpoint_network(
    endpoint_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    size: int = Query(100, ge=1, le=1000),
):
    result = await db.execute(
        select(Endpoint)
        .join(Asset, Endpoint.asset_id == Asset.id)
        .where(Endpoint.id == endpoint_id, Asset.organization_id == current_user.organization_id)
    )
    endpoint = result.scalar_one_or_none()
    if not endpoint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found")

    es = await get_elasticsearch()
    es_result = await es.search(
        index="network",
        body={
            "query": {"term": {"endpoint_id": endpoint_id}},
            "sort": [{"@timestamp": "desc"}],
            "size": size,
        },
    )
    hits = es_result["hits"]["hits"]
    return {"endpoint_id": endpoint_id, "total": es_result["hits"]["total"]["value"], "connections": [h["_source"] for h in hits]}
