from __future__ import annotations

import math
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.security import hash_password
from app.core.dependencies import get_current_user, get_current_superuser
from app.models.user import User, Role, Permission
from app.models.notification import AuditLog
from app.schemas.auth import UserCreate, UserUpdate, UserResponse, RoleCreate, RoleResponse, PermissionResponse
from app.schemas.common import PaginatedResponse
from app.utils import generate_uuid, utcnow

router = APIRouter(prefix="/api/v1/users", tags=["Users"])


class RoleCreateWithPermissions(BaseModel):
    name: str = Field(..., max_length=100)
    description: str | None = None
    permission_ids: list[str] = []


class RoleUpdateWithPermissions(BaseModel):
    name: str | None = None
    description: str | None = None
    permission_ids: list[str] | None = None


@router.get("", response_model=PaginatedResponse)
async def list_users(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    count_result = await db.execute(select(func.count(User.id)))
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        select(User).order_by(User.created_at.desc()).offset(offset).limit(page_size)
    )
    users = result.scalars().all()

    pages = max(1, math.ceil(total / page_size))
    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
        items=[UserResponse.model_validate(u) for u in users],
    )


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    current_user: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
) -> Any:
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    user = User(
        id=generate_uuid(),
        email=body.email,
        username=body.username,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role=body.role,
        organization_id=body.organization_id,
        phone=body.phone,
        department=body.department,
        avatar_url=body.avatar_url,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(user)

    audit = AuditLog(
        id=generate_uuid(),
        organization_id=body.organization_id,
        user_id=current_user.id,
        action="user.created",
        resource="user",
        resource_id=user.id,
        details=f"Created user {body.email}",
        correlation_id=generate_uuid(),
        created_at=utcnow(),
    )
    db.add(audit)
    await db.flush()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.get("/roles", response_model=list[RoleResponse])
async def list_roles(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    result = await db.execute(select(Role).order_by(Role.created_at.desc()))
    roles = result.scalars().all()
    return [RoleResponse.model_validate(r) for r in roles]


@router.post("/roles", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    body: RoleCreateWithPermissions,
    current_user: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
) -> Any:
    existing = await db.execute(select(Role).where(Role.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role already exists")

    role = Role(
        id=generate_uuid(),
        name=body.name,
        description=body.description,
        created_at=utcnow(),
    )
    if body.permission_ids:
        perm_result = await db.execute(select(Permission).where(Permission.id.in_(body.permission_ids)))
        role.permissions = perm_result.scalars().all()

    db.add(role)

    audit = AuditLog(
        id=generate_uuid(),
        user_id=current_user.id,
        action="role.created",
        resource="role",
        resource_id=role.id,
        details=f"Created role {body.name}",
        correlation_id=generate_uuid(),
        created_at=utcnow(),
    )
    db.add(audit)
    await db.flush()
    await db.refresh(role)
    return RoleResponse.model_validate(role)


@router.put("/roles/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: str,
    body: RoleUpdateWithPermissions,
    current_user: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
) -> Any:
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    if body.name is not None:
        role.name = body.name
    if body.description is not None:
        role.description = body.description
    if body.permission_ids is not None:
        perm_result = await db.execute(select(Permission).where(Permission.id.in_(body.permission_ids)))
        role.permissions = perm_result.scalars().all()

    audit = AuditLog(
        id=generate_uuid(),
        user_id=current_user.id,
        action="role.updated",
        resource="role",
        resource_id=role.id,
        details=f"Updated role {role.name}",
        correlation_id=generate_uuid(),
        created_at=utcnow(),
    )
    db.add(audit)
    await db.flush()
    await db.refresh(role)
    return RoleResponse.model_validate(role)


@router.get("/permissions", response_model=list[PermissionResponse])
async def list_permissions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    result = await db.execute(select(Permission).order_by(Permission.resource, Permission.action))
    permissions = result.scalars().all()
    return [PermissionResponse.model_validate(p) for p in permissions]


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    body: UserUpdate,
    current_user: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
) -> Any:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if body.full_name is not None:
        user.full_name = body.full_name
    if body.role is not None:
        user.role = body.role
    if body.phone is not None:
        user.phone = body.phone
    if body.department is not None:
        user.department = body.department
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.avatar_url is not None:
        user.avatar_url = body.avatar_url

    user.updated_at = utcnow()

    audit = AuditLog(
        id=generate_uuid(),
        organization_id=user.organization_id,
        user_id=current_user.id,
        action="user.updated",
        resource="user",
        resource_id=user.id,
        details=f"Updated user {user.email}",
        correlation_id=generate_uuid(),
        created_at=utcnow(),
    )
    db.add(audit)
    await db.flush()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_user(
    user_id: str,
    current_user: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_active = False
    user.updated_at = utcnow()

    audit = AuditLog(
        id=generate_uuid(),
        organization_id=user.organization_id,
        user_id=current_user.id,
        action="user.deleted",
        resource="user",
        resource_id=user.id,
        details=f"Soft-deleted user {user.email}",
        correlation_id=generate_uuid(),
        created_at=utcnow(),
    )
    db.add(audit)
