from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.notification import AuditLog
from app.models.user import User
from app.schemas.common import AuditLogResponse, PaginatedResponse

router = APIRouter(prefix="/api/v1/audit", tags=["Audit"])


def require_audit_access():
    async def checker(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.role not in ("super_admin", "auditor"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Requires superadmin or auditor role",
            )
        return current_user
    return checker


@router.get("/logs", response_model=PaginatedResponse)
async def list_audit_logs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    action: str | None = Query(None),
    resource: str | None = Query(None),
    user_id: str | None = Query(None),
    organization_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_audit_access()),
):
    query = select(AuditLog)
    count_query = select(func.count(AuditLog.id))

    if action:
        query = query.where(AuditLog.action == action)
        count_query = count_query.where(AuditLog.action == action)
    if resource:
        query = query.where(AuditLog.resource == resource)
        count_query = count_query.where(AuditLog.resource == resource)
    if user_id:
        query = query.where(AuditLog.user_id == user_id)
        count_query = count_query.where(AuditLog.user_id == user_id)
    if organization_id:
        query = query.where(AuditLog.organization_id == organization_id)
        count_query = count_query.where(AuditLog.organization_id == organization_id)

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    offset = (page - 1) * page_size
    query = query.order_by(AuditLog.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    items = result.scalars().all()

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size if total else 1,
    )


@router.get("/logs/{log_id}", response_model=AuditLogResponse)
async def get_audit_log(
    log_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_audit_access()),
):
    result = await db.execute(select(AuditLog).where(AuditLog.id == log_id))
    log_entry = result.scalar_one_or_none()
    if not log_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit log entry not found",
        )
    return log_entry
