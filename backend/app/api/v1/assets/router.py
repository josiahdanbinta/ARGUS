from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.asset import Asset, Endpoint
from app.models.user import User
from app.schemas.asset import AssetCreate, AssetUpdate, AssetResponse, EndpointResponse
from app.schemas.common import PaginatedResponse
from app.utils import generate_uuid, utcnow

router = APIRouter(prefix="/api/v1/assets", tags=["Assets"])


@router.get("", response_model=PaginatedResponse)
@router.get("/", response_model=PaginatedResponse)
async def list_assets(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    asset_type: str | None = Query(None),
    criticality: str | None = Query(None),
    is_active: bool | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base_query = select(Asset).where(Asset.organization_id == current_user.organization_id)

    if asset_type:
        base_query = base_query.where(Asset.asset_type == asset_type)
    if criticality:
        base_query = base_query.where(Asset.criticality == criticality)
    if is_active is not None:
        base_query = base_query.where(Asset.is_active == is_active)

    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    items_result = await db.execute(
        base_query.order_by(Asset.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    items = items_result.scalars().all()

    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        pages=max((total + page_size - 1) // page_size, 1),
        items=[AssetResponse.model_validate(item) for item in items],
    )


@router.post("", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
async def create_asset(
    payload: AssetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset = Asset(
        id=generate_uuid(),
        organization_id=payload.organization_id,
        name=payload.name,
        asset_type=payload.asset_type,
        hostname=payload.hostname,
        ip_address=payload.ip_address,
        mac_address=payload.mac_address,
        operating_system=payload.operating_system,
        os_version=payload.os_version,
        owner=payload.owner,
        department=payload.department,
        criticality=payload.criticality,
        location=payload.location,
        tags=payload.tags,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return AssetResponse.model_validate(asset)


@router.get("/{asset_id}", response_model=AssetResponse)
async def get_asset(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.organization_id == current_user.organization_id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    endpoint_result = await db.execute(select(Endpoint).where(Endpoint.asset_id == asset_id))
    endpoint = endpoint_result.scalar_one_or_none()

    response = AssetResponse.model_validate(asset)
    response.endpoint = EndpointResponse.model_validate(endpoint) if endpoint else None
    return response


@router.patch("/{asset_id}", response_model=AssetResponse)
async def update_asset(
    asset_id: str,
    payload: AssetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.organization_id == current_user.organization_id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(asset, field, value)
    asset.updated_at = utcnow()

    await db.commit()
    await db.refresh(asset)
    return AssetResponse.model_validate(asset)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_asset(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.organization_id == current_user.organization_id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    asset.is_active = False
    asset.updated_at = utcnow()
    await db.commit()
