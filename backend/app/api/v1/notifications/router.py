from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_current_superuser
from app.models.notification import Notification, NotificationChannel
from app.models.user import User
from app.schemas.common import NotificationResponse, PaginatedResponse
from app.services.notification_service import dispatch_channel
from app.utils import generate_uuid, utcnow

router = APIRouter(prefix="/api/v1/notifications", tags=["Notifications"])


class ChannelCreate(BaseModel):
    channel_type: str = Field(..., pattern="^(email|slack|sms)$")
    name: str = Field(..., min_length=1, max_length=255)
    is_enabled: bool = True
    config: dict = {}


class ChannelUpdate(BaseModel):
    name: str | None = None
    is_enabled: bool | None = None
    config: dict | None = None


class ChannelResponse(BaseModel):
    id: str
    channel_type: str
    name: str
    is_enabled: bool
    config: dict
    created_at: str

    model_config = {"from_attributes": True}


class TestSendRequest(BaseModel):
    title: str = "ARGUS Test Notification"
    message: str = "This is a test notification from ARGUS SOAR."
    severity: str = "info"


def _config_to_dict(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


@router.get("/channels", response_model=list[ChannelResponse])
async def list_channels(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(NotificationChannel).order_by(NotificationChannel.created_at.desc()))
    channels = result.scalars().all()
    return [
        ChannelResponse(
            id=c.id,
            channel_type=c.channel_type,
            name=c.name,
            is_enabled=c.is_enabled,
            config=_config_to_dict(c.config),
            created_at=c.created_at.isoformat() if c.created_at else "",
        )
        for c in channels
    ]


@router.post("/channels", response_model=ChannelResponse, status_code=status.HTTP_201_CREATED)
async def create_channel(
    body: ChannelCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    channel = NotificationChannel(
        id=generate_uuid(),
        organization_id=current_user.organization_id,
        channel_type=body.channel_type,
        name=body.name,
        is_enabled=body.is_enabled,
        config=json.dumps(body.config),
        created_at=utcnow(),
    )
    db.add(channel)
    await db.flush()
    await db.refresh(channel)
    return ChannelResponse(
        id=channel.id,
        channel_type=channel.channel_type,
        name=channel.name,
        is_enabled=channel.is_enabled,
        config=body.config,
        created_at=channel.created_at.isoformat() if channel.created_at else "",
    )


@router.put("/channels/{channel_id}", response_model=ChannelResponse)
async def update_channel(
    channel_id: str,
    body: ChannelUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    result = await db.execute(select(NotificationChannel).where(NotificationChannel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    if body.name is not None:
        channel.name = body.name
    if body.is_enabled is not None:
        channel.is_enabled = body.is_enabled
    if body.config is not None:
        channel.config = json.dumps(body.config)
    await db.flush()
    await db.refresh(channel)
    return ChannelResponse(
        id=channel.id,
        channel_type=channel.channel_type,
        name=channel.name,
        is_enabled=channel.is_enabled,
        config=_config_to_dict(channel.config),
        created_at=channel.created_at.isoformat() if channel.created_at else "",
    )


@router.delete("/channels/{channel_id}", status_code=204)
async def delete_channel(
    channel_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    result = await db.execute(select(NotificationChannel).where(NotificationChannel.id == channel_id))
    channel = result.scalar_one_or_none()
    if channel:
        await db.delete(channel)


@router.post("/channels/{channel_id}/test")
async def test_channel(
    channel_id: str,
    body: TestSendRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    result = await db.execute(select(NotificationChannel).where(NotificationChannel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if not channel.is_enabled:
        raise HTTPException(status_code=400, detail="Channel is disabled")

    result = await dispatch_channel(
        {
            "channel_type": channel.channel_type,
            "config": _config_to_dict(channel.config),
        },
        body.title,
        body.message,
        body.severity,
    )
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to send test"))
    return result


@router.get("", response_model=PaginatedResponse)
async def list_notifications(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    is_read: bool | None = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = select(Notification).where(Notification.user_id == current_user.id)
    if is_read is not None:
        query = query.where(Notification.is_read == is_read)
    query = query.order_by(Notification.created_at.desc())

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size))
    notifications = result.scalars().all()

    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
        items=[NotificationResponse.model_validate(n) for n in notifications],
    )


@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.is_read = True
    return {"status": "ok"}


@router.post("/read-all")
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,
        )
    )
    notifications = result.scalars().all()
    for n in notifications:
        n.is_read = True
    return {"status": "ok", "count": len(notifications)}


@router.delete("/{notification_id}", status_code=204)
async def delete_notification(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    notification = result.scalar_one_or_none()
    if notification:
        await db.delete(notification)
