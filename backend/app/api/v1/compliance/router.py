from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/api/v1/compliance", tags=["Compliance"])

COMPLIANCE_FRAMEWORKS = {
    "iso27001": {"name": "ISO 27001", "controls": 114, "domain": "Information Security Management"},
    "soc2": {"name": "SOC 2", "controls": 64, "domain": "Trust Services Criteria"},
    "pcidss": {"name": "PCI DSS 4.0", "controls": 250, "domain": "Payment Card Security"},
    "hipaa": {"name": "HIPAA", "controls": 180, "domain": "Health Data Privacy"},
    "nistcsf": {"name": "NIST CSF 2.0", "controls": 108, "domain": "Cybersecurity Framework"},
    "cisc": {"name": "CIS Controls v8", "controls": 153, "domain": "Critical Security Controls"},
    "gdpr": {"name": "GDPR", "controls": 99, "domain": "Data Protection"},
    "dora": {"name": "DORA", "controls": 120, "domain": "Digital Operational Resilience"},
    "nis2": {"name": "NIS2", "controls": 80, "domain": "Network & Information Security"},
}

CONTROL_CATALOG = {
    "iso27001": [
        {"id": "A.5.1", "name": "Information Security Policies", "domain": "Organization"},
        {"id": "A.6.2", "name": "Mobile Device Policy", "domain": "Organization"},
        {"id": "A.7.1", "name": "Employment Screening", "domain": "People"},
        {"id": "A.8.1", "name": "Asset Inventory", "domain": "Assets"},
        {"id": "A.9.2", "name": "User Access Management", "domain": "Access Control"},
        {"id": "A.10.1", "name": "Cryptographic Controls", "domain": "Cryptography"},
        {"id": "A.12.4", "name": "Logging and Monitoring", "domain": "Operations"},
        {"id": "A.16.1", "name": "Incident Management", "domain": "Incident"},
        {"id": "A.17.1", "name": "Business Continuity", "domain": "Continuity"},
        {"id": "A.18.1", "name": "Compliance with Legal Requirements", "domain": "Compliance"},
    ],
    "nistcsf": [
        {"id": "GV.OC", "name": "Organizational Context", "domain": "Govern"},
        {"id": "GV.RM", "name": "Risk Management Strategy", "domain": "Govern"},
        {"id": "ID.AM", "name": "Asset Management", "domain": "Identify"},
        {"id": "ID.RA", "name": "Risk Assessment", "domain": "Identify"},
        {"id": "PR.AC", "name": "Identity & Access Management", "domain": "Protect"},
        {"id": "PR.DS", "name": "Data Security", "domain": "Protect"},
        {"id": "DE.CM", "name": "Continuous Monitoring", "domain": "Detect"},
        {"id": "DE.AE", "name": "Adversarial Tactics & Techniques", "domain": "Detect"},
        {"id": "RS.RP", "name": "Incident Response Planning", "domain": "Respond"},
        {"id": "RC.RP", "name": "Recovery Planning", "domain": "Recover"},
    ],
    "cisc": [
        {"id": "CIS 1", "name": "Inventory of Authorized Devices", "domain": "Foundational"},
        {"id": "CIS 3", "name": "Data Protection", "domain": "Foundational"},
        {"id": "CIS 5", "name": "Account Management", "domain": "Foundational"},
        {"id": "CIS 6", "name": "Access Control Management", "domain": "Foundational"},
        {"id": "CIS 8", "name": "Audit Log Management", "domain": "Foundational"},
        {"id": "CIS 12", "name": "Network Infrastructure Management", "domain": "Foundational"},
        {"id": "CIS 13", "name": "Network Monitoring and Defense", "domain": "Foundational"},
        {"id": "CIS 16", "name": "Application Software Security", "domain": "Foundational"},
        {"id": "CIS 17", "name": "Incident Response Management", "domain": "Foundational"},
    ],
    "soc2": [
        {"id": "CC1.1", "name": "COSO Principles", "domain": "Control Environment"},
        {"id": "CC2.1", "name": "Communication", "domain": "Communication"},
        {"id": "CC3.1", "name": "Risk Assessment", "domain": "Risk Assessment"},
        {"id": "CC4.1", "name": "Monitoring Activities", "domain": "Monitoring"},
        {"id": "CC6.1", "name": "Logical & Physical Access", "domain": "Control Activities"},
        {"id": "CC7.2", "name": "System Operations", "domain": "Control Activities"},
        {"id": "CC8.1", "name": "Change Management", "domain": "Control Activities"},
        {"id": "A1.1", "name": "Availability", "domain": "Trust Services"},
    ],
    "gdpr": [
        {"id": "Art.5", "name": "Lawfulness, Fairness, Transparency", "domain": "Principles"},
        {"id": "Art.15", "name": "Right of Access", "domain": "Data Subject Rights"},
        {"id": "Art.17", "name": "Right to Erasure", "domain": "Data Subject Rights"},
        {"id": "Art.30", "name": "Records of Processing", "domain": "Accountability"},
        {"id": "Art.32", "name": "Security of Processing", "domain": "Security"},
        {"id": "Art.33", "name": "Breach Notification", "domain": "Security"},
    ],
}

POLICIES = [
    {"id": "pol-001", "name": "Acceptable Use Policy", "category": "Information Security", "version": "2.1", "last_reviewed": "2026-03-15", "owner": "CISO"},
    {"id": "pol-002", "name": "Incident Response Policy", "category": "Operations", "version": "3.0", "last_reviewed": "2026-05-02", "owner": "SOC Manager"},
    {"id": "pol-003", "name": "Access Control Policy", "category": "Access Management", "version": "1.8", "last_reviewed": "2026-02-20", "owner": "IT Director"},
    {"id": "pol-004", "name": "Data Classification & Handling", "category": "Data Governance", "version": "2.0", "last_reviewed": "2026-04-11", "owner": "DPO"},
    {"id": "pol-005", "name": "Remote Access Policy", "category": "Network Security", "version": "1.5", "last_reviewed": "2026-01-30", "owner": "Network Architect"},
    {"id": "pol-006", "name": "Backup & Recovery Policy", "category": "Business Continuity", "version": "2.2", "last_reviewed": "2026-06-01", "owner": "Infra Manager"},
]

# In-memory risk register (persisted per-process; adequate for a demo tier)
_risk_register: list[dict] = [
    {
        "id": "risk-001",
        "title": "Ransomware infection via phishing",
        "description": "Credential-phishing email delivering ransomware that encrypts endpoints and laterally spreads via SMB.",
        "category": "Malware",
        "likelihood": 4,
        "impact": 5,
        "score": 20,
        "status": "mitigating",
        "owner": "SOC Manager",
        "mitigation": "EDR deployment, user awareness training, email gateway filtering, immutable backups.",
        "created_at": "2026-04-10T09:00:00Z",
    },
    {
        "id": "risk-002",
        "title": "SaaS account takeover",
        "description": "Compromise of privileged SaaS accounts without MFA leading to data exfiltration.",
        "category": "Identity",
        "likelihood": 4,
        "impact": 4,
        "score": 16,
        "status": "mitigating",
        "owner": "Security Admin",
        "mitigation": "Enforce MFA, conditional access, session monitoring, privileged access management.",
        "created_at": "2026-04-12T09:00:00Z",
    },
    {
        "id": "risk-003",
        "title": "Misconfigured cloud storage exposure",
        "description": "Publicly accessible S3 buckets / blobs leaking sensitive customer data.",
        "category": "Cloud",
        "likelihood": 3,
        "impact": 4,
        "score": 12,
        "status": "identified",
        "owner": "Cloud Architect",
        "mitigation": "CSPM scanning, public-access block defaults, IAM least privilege review.",
        "created_at": "2026-04-18T09:00:00Z",
    },
    {
        "id": "risk-004",
        "title": "Supply chain software compromise",
        "description": "Third-party library or vendor software with a critical vulnerability exploited for initial access.",
        "category": "Supply Chain",
        "likelihood": 3,
        "impact": 5,
        "score": 15,
        "status": "monitoring",
        "owner": "DevSecOps",
        "mitigation": "SBOM management, dependency scanning, vendor risk assessments, runtime protection.",
        "created_at": "2026-04-22T09:00:00Z",
    },
]


class RiskCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=500)
    description: str | None = None
    category: str | None = None
    likelihood: int = Field(default=3, ge=1, le=5)
    impact: int = Field(default=3, ge=1, le=5)
    status: str = "identified"
    owner: str | None = None
    mitigation: str | None = None


class RiskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    likelihood: int | None = Field(default=None, ge=1, le=5)
    impact: int | None = Field(default=None, ge=1, le=5)
    status: str | None = None
    owner: str | None = None
    mitigation: str | None = None


def _risk_score(likelihood: int, impact: int) -> int:
    return likelihood * impact


def _risk_severity(score: int) -> str:
    if score >= 20:
        return "critical"
    if score >= 12:
        return "high"
    if score >= 6:
        return "medium"
    return "low"


@router.get("/frameworks")
async def list_frameworks(current_user=Depends(get_current_user)):
    return [
        {"id": k, "name": v["name"], "total_controls": v["controls"], "domain": v["domain"]}
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
        "domain": fw["domain"],
        "total_controls": fw["controls"],
        "compliant": 0,
        "non_compliant": 0,
        "not_assessed": fw["controls"],
        "compliance_percentage": 0,
    }


@router.get("/frameworks/{framework_id}/controls")
async def list_framework_controls(framework_id: str, current_user=Depends(get_current_user)):
    controls = CONTROL_CATALOG.get(framework_id, [])
    if not controls and framework_id not in COMPLIANCE_FRAMEWORKS:
        raise HTTPException(status_code=404, detail="Framework not found")
    return controls


@router.get("/status")
async def compliance_status(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return {
        "overall_score": 72,
        "frameworks_assessed": 4,
        "total_frameworks": len(COMPLIANCE_FRAMEWORKS),
        "last_assessment": "2026-08-01T10:00:00Z",
        "frameworks": [
            {"id": "iso27001", "name": "ISO 27001", "percentage": 78},
            {"id": "nistcsf", "name": "NIST CSF 2.0", "percentage": 85},
            {"id": "cisc", "name": "CIS Controls v8", "percentage": 91},
            {"id": "gdpr", "name": "GDPR", "percentage": 64},
        ],
    }


@router.get("/policies")
async def list_policies(current_user=Depends(get_current_user)):
    return POLICIES


@router.get("/risks")
async def list_risks(
    status: str | None = Query(default=None),
    current_user=Depends(get_current_user),
):
    risks = _risk_register
    if status:
        risks = [r for r in risks if r["status"] == status]
    return risks


@router.post("/risks", status_code=201)
async def create_risk(
    body: RiskCreate,
    current_user=Depends(get_current_user),
):
    risk = {
        "id": f"risk-{uuid.uuid4().hex[:6]}",
        "title": body.title,
        "description": body.description,
        "category": body.category or "General",
        "likelihood": body.likelihood,
        "impact": body.impact,
        "score": _risk_score(body.likelihood, body.impact),
        "status": body.status,
        "owner": body.owner,
        "mitigation": body.mitigation,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _risk_register.insert(0, risk)
    return risk


@router.put("/risks/{risk_id}")
async def update_risk(
    risk_id: str,
    body: RiskUpdate,
    current_user=Depends(get_current_user),
):
    for risk in _risk_register:
        if risk["id"] == risk_id:
            if body.title is not None:
                risk["title"] = body.title
            if body.description is not None:
                risk["description"] = body.description
            if body.category is not None:
                risk["category"] = body.category
            if body.owner is not None:
                risk["owner"] = body.owner
            if body.mitigation is not None:
                risk["mitigation"] = body.mitigation
            if body.status is not None:
                risk["status"] = body.status
            if body.likelihood is not None:
                risk["likelihood"] = body.likelihood
            if body.impact is not None:
                risk["impact"] = body.impact
            risk["score"] = _risk_score(risk["likelihood"], risk["impact"])
            return risk
    raise HTTPException(status_code=404, detail="Risk not found")


@router.delete("/risks/{risk_id}", status_code=204)
async def delete_risk(risk_id: str, current_user=Depends(get_current_user)):
    for i, risk in enumerate(_risk_register):
        if risk["id"] == risk_id:
            del _risk_register[i]
            return
    raise HTTPException(status_code=404, detail="Risk not found")
