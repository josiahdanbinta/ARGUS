from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.soc import Alert
from app.models.notification import AuditLog
from app.schemas.soc import AlertCreate, AlertUpdate, AlertResponse
from app.schemas.common import PaginatedResponse
from app.utils import generate_uuid, utcnow

router = APIRouter(prefix="/api/v1/alerts", tags=["Alerts"])


class AssignRequest(BaseModel):
    user_id: str


class LinkIncidentRequest(BaseModel):
    incident_id: str


@router.get("/", response_model=PaginatedResponse)
async def list_alerts(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    severity: str | None = Query(None),
    status: str | None = Query(None),
    category: str | None = Query(None),
    hostname: str | None = Query(None),
    assigned_to: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = select(Alert)
    count_query = select(func.count(Alert.id))

    if severity:
        query = query.where(Alert.severity == severity)
        count_query = count_query.where(Alert.severity == severity)
    if status:
        query = query.where(Alert.status == status)
        count_query = count_query.where(Alert.status == status)
    if category:
        query = query.where(Alert.category == category)
        count_query = count_query.where(Alert.category == category)
    if hostname:
        query = query.where(Alert.hostname == hostname)
        count_query = count_query.where(Alert.hostname == hostname)
    if assigned_to:
        query = query.where(Alert.assigned_to == assigned_to)
        count_query = count_query.where(Alert.assigned_to == assigned_to)

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    offset = (page - 1) * page_size
    query = query.order_by(Alert.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    items = result.scalars().all()

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size if total else 1,
    )


@router.get("/{alert_id}", response_model=AlertResponse)
async def get_alert(
    alert_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    return alert


@router.post("/", response_model=AlertResponse, status_code=status.HTTP_201_CREATED)
async def create_alert(
    data: AlertCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    alert = Alert(
        id=generate_uuid(),
        created_at=utcnow(),
        updated_at=utcnow(),
        **data.model_dump(),
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return alert


@router.patch("/{alert_id}", response_model=AlertResponse)
async def update_alert(
    alert_id: str,
    data: AlertUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(alert, field, value)

    alert.updated_at = utcnow()
    await db.commit()
    await db.refresh(alert)
    return alert


@router.post("/{alert_id}/assign", response_model=AlertResponse)
async def assign_alert(
    alert_id: str,
    body: AssignRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

    alert.assigned_to = body.user_id
    alert.updated_at = utcnow()
    await db.commit()
    await db.refresh(alert)
    return alert


@router.post("/{alert_id}/close", response_model=AlertResponse)
async def close_alert(
    alert_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

    alert.status = "closed"
    alert.closed_at = utcnow()
    alert.updated_at = utcnow()
    await db.commit()
    await db.refresh(alert)
    return alert


@router.post("/{alert_id}/escalate", response_model=AlertResponse)
async def escalate_alert(
    alert_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

    alert.status = "escalated"
    alert.updated_at = utcnow()
    await db.commit()
    await db.refresh(alert)
    return alert


@router.post("/{alert_id}/link-incident", response_model=AlertResponse)
async def link_incident(
    alert_id: str,
    body: LinkIncidentRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

    alert.incident_id = body.incident_id
    alert.updated_at = utcnow()
    await db.commit()
    await db.refresh(alert)
    return alert
