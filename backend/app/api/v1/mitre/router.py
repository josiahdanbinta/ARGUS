from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.siem import MITRETechnique
from app.schemas.siem import MITRETechniqueResponse
from app.schemas.common import PaginatedResponse

router = APIRouter(prefix="/api/v1/mitre", tags=["MITRE ATT&CK"])


@router.get("/techniques", response_model=list[MITRETechniqueResponse])
async def list_mitre_techniques(
    tactic: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = select(MITRETechnique)
    if tactic:
        query = query.where(MITRETechnique.tactic == tactic)
    query = query.order_by(MITRETechnique.technique_id)
    result = await db.execute(query)
    techniques = result.scalars().all()
    return [MITRETechniqueResponse.model_validate(t) for t in techniques]


@router.get("/techniques/{technique_id}", response_model=MITRETechniqueResponse)
async def get_mitre_technique(
    technique_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from fastapi import HTTPException
    result = await db.execute(
        select(MITRETechnique).where(MITRETechnique.technique_id == technique_id)
    )
    technique = result.scalar_one_or_none()
    if not technique:
        raise HTTPException(status_code=404, detail="Technique not found")
    return MITRETechniqueResponse.model_validate(technique)


@router.get("/tactics")
async def list_tactics(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(MITRETechnique.tactic).distinct())
    return [row[0] for row in result.all()]
