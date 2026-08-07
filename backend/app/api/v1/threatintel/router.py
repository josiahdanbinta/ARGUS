from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.siem import ThreatFeed, IOC
from app.models.notification import AuditLog
from app.schemas.siem import IOCResponse, ThreatFeedResponse
from app.schemas.common import PaginatedResponse
from app.utils import generate_uuid, utcnow
from app.workers.tasks import sync_threat_intel

router = APIRouter(prefix="/api/v1/threatintel", tags=["Threat Intelligence"])


@router.get("/feeds", response_model=PaginatedResponse)
async def list_threat_feeds(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    is_enabled: bool | None = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    base_query = select(ThreatFeed)
    if is_enabled is not None:
        base_query = base_query.where(ThreatFeed.is_enabled == is_enabled)

    count_query = select(func.count()).select_from(base_query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = base_query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    feeds = result.scalars().all()

    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
        items=[ThreatFeedResponse.model_validate(f) for f in feeds],
    )


@router.post("/feeds/sync-all")
async def sync_all_feeds(current_user=Depends(get_current_user)):
    sync_threat_intel.delay()
    return {"status": "sync_triggered"}


@router.get("/feeds/{feed_id}", response_model=ThreatFeedResponse)
async def get_threat_feed(
    feed_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(ThreatFeed).where(ThreatFeed.id == feed_id))
    feed = result.scalar_one_or_none()
    if not feed:
        raise HTTPException(status_code=404, detail="Threat feed not found")
    return ThreatFeedResponse.model_validate(feed)


@router.get("/iocs/search")
async def search_iocs(
    q: str = Query(..., min_length=1),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = select(IOC).where(
        IOC.value.ilike(f"%{q}%") | IOC.description.ilike(f"%{q}%")
    )
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size))
    iocs = result.scalars().all()

    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
        items=[IOCResponse.model_validate(i) for i in iocs],
    )
