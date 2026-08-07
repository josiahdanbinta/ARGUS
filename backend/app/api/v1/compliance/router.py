from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user

router = APIRouter()

COMPLIANCE_FRAMEWORKS = {
    "iso27001": {"name": "ISO 27001", "controls": 114},
    "soc2": {"name": "SOC 2", "controls": 64},
    "pcidss": {"name": "PCI DSS 4.0", "controls": 250},
    "hipaa": {"name": "HIPAA", "controls": 180},
    "nistcsf": {"name": "NIST CSF 2.0", "controls": 108},
    "cisc": {"name": "CIS Controls v8", "controls": 153},
    "gdpr": {"name": "GDPR", "controls": 99},
    "dora": {"name": "DORA", "controls": 120},
    "nis2": {"name": "NIS2", "controls": 80},
}


@router.get("/frameworks")
async def list_frameworks(current_user=Depends(get_current_user)):
    return [
        {"id": k, "name": v["name"], "total_controls": v["controls"]}
        for k, v in COMPLIANCE_FRAMEWORKS.items()
    ]


@router.get("/frameworks/{framework_id}")
async def get_framework(framework_id: str, current_user=Depends(get_current_user)):
    fw = COMPLIANCE_FRAMEWORKS.get(framework_id)
    if not fw:
        raise HTTPException(status_code=404, detail="Framework not found")
    return {
        "id": framework_id,
        "name": fw["name"],
        "total_controls": fw["controls"],
        "compliant": 0,
        "non_compliant": 0,
        "not_assessed": fw["controls"],
        "compliance_percentage": 0,
    }


@router.get("/status")
async def compliance_status(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return {
        "overall_score": 0,
        "frameworks_assessed": 0,
        "total_frameworks": len(COMPLIANCE_FRAMEWORKS),
        "last_assessment": None,
        "frameworks": [],
    }
