from __future__ import annotations

import math
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_current_superuser
from app.models.organization import Organization, Team, TeamMember
from app.models.user import User
from app.schemas.organization import OrganizationCreate, OrganizationUpdate, OrganizationResponse, TeamCreate, TeamResponse, TeamMemberResponse
from app.schemas.common import PaginatedResponse
from app.utils import generate_uuid, utcnow

router = APIRouter(prefix="/api/v1/organizations", tags=["Organizations"])


@router.get("", response_model=PaginatedResponse)
async def list_organizations(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    count_result = await db.execute(select(func.count(Organization.id)))
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        select(Organization).order_by(Organization.created_at.desc()).offset(offset).limit(page_size)
    )
    orgs = result.scalars().all()

    pages = max(1, math.ceil(total / page_size))
    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
        items=[OrganizationResponse.model_validate(o) for o in orgs],
    )


@router.post("", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
async def create_organization(
    body: OrganizationCreate,
    current_user: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
) -> Any:
    existing = await db.execute(select(Organization).where(Organization.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Organization slug already exists")

    existing = await db.execute(select(Organization).where(Organization.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Organization name already exists")

    org = Organization(
        id=generate_uuid(),
        name=body.name,
        slug=body.slug,
        description=body.description,
        domain=body.domain,
        logo_url=body.logo_url,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(org)
    await db.flush()
    await db.refresh(org)
    return OrganizationResponse.model_validate(org)


@router.get("/{org_id}", response_model=OrganizationResponse)
async def get_organization(
    org_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return OrganizationResponse.model_validate(org)


@router.put("/{org_id}", response_model=OrganizationResponse)
async def update_organization(
    org_id: str,
    body: OrganizationUpdate,
    current_user: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
) -> Any:
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    if body.name is not None:
        org.name = body.name
    if body.description is not None:
        org.description = body.description
    if body.domain is not None:
        org.domain = body.domain
    if body.logo_url is not None:
        org.logo_url = body.logo_url
    if body.is_active is not None:
        org.is_active = body.is_active
    if body.plan is not None:
        org.plan = body.plan
    if body.max_endpoints is not None:
        org.max_endpoints = body.max_endpoints
    if body.max_users is not None:
        org.max_users = body.max_users

    org.updated_at = utcnow()
    await db.flush()
    await db.refresh(org)
    return OrganizationResponse.model_validate(org)


@router.delete("/{org_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_organization(
    org_id: str,
    current_user: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    org.is_active = False
    org.updated_at = utcnow()


@router.get("/{org_id}/teams", response_model=list[TeamResponse])
async def list_teams(
    org_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    result = await db.execute(
        select(Team).where(Team.organization_id == org_id).order_by(Team.created_at.desc())
    )
    teams = result.scalars().all()
    return [TeamResponse.model_validate(t) for t in teams]


@router.post("/{org_id}/teams", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    org_id: str,
    body: TeamCreate,
    current_user: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
) -> Any:
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    team = Team(
        id=generate_uuid(),
        organization_id=org_id,
        name=body.name,
        description=body.description,
        created_at=utcnow(),
    )
    db.add(team)
    await db.flush()
    await db.refresh(team)
    return TeamResponse.model_validate(team)


@router.post("/{org_id}/teams/{team_id}/members", response_model=TeamMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_team_member(
    org_id: str,
    team_id: str,
    user_id: str = Query(..., description="User ID to add to the team"),
    current_user: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
) -> Any:
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    result = await db.execute(select(Team).where(Team.id == team_id, Team.organization_id == org_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found in this organization")

    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = await db.execute(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already a member of this team")

    member = TeamMember(
        id=generate_uuid(),
        team_id=team_id,
        user_id=user_id,
        joined_at=utcnow(),
    )
    db.add(member)
    await db.flush()
    await db.refresh(member)
    return TeamMemberResponse.model_validate(member)
