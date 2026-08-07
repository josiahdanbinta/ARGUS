from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AlertBase(BaseModel):
    title: str
    severity: str = "medium"
    risk_score: int = 0
    category: str | None = None
    description: str | None = None
    recommendation: str | None = None
    source: str | None = None
    hostname: str | None = None
    user: str | None = None
    source_ip: str | None = None
    country: str | None = None
    mitre_techniques: str | None = None
    evidence: str | None = None
    confidence: int = 0


class AlertCreate(AlertBase):
    organization_id: str | None = None
    rule_id: str | None = None


class AlertUpdate(BaseModel):
    status: str | None = None
    assigned_to: str | None = None
    severity: str | None = None
    is_false_positive: bool | None = None
    description: str | None = None
    recommendation: str | None = None


class AlertResponse(AlertBase):
    id: str
    organization_id: str | None = None
    status: str
    assigned_to: str | None = None
    incident_id: str | None = None
    rule_id: str | None = None
    is_false_positive: bool
    closed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IncidentBase(BaseModel):
    title: str
    description: str | None = None
    severity: str = "medium"
    risk_score: int = 0
    mitre_techniques: str | None = None
    affected_assets: str | None = None
    affected_users: str | None = None


class IncidentCreate(IncidentBase):
    organization_id: str | None = None


class IncidentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    severity: str | None = None
    status: str | None = None
    risk_score: int | None = None
    assigned_to: str | None = None
    resolution: str | None = None
    root_cause: str | None = None
    mitre_techniques: str | None = None


class IncidentResponse(IncidentBase):
    id: str
    organization_id: str
    status: str
    assigned_to: str | None = None
    resolution: str | None = None
    root_cause: str | None = None
    ai_summary: str | None = None
    closed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IncidentNoteBase(BaseModel):
    content: str


class IncidentNoteCreate(IncidentNoteBase):
    incident_id: str


class IncidentNoteResponse(IncidentNoteBase):
    id: str
    incident_id: str
    user_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class IncidentTaskBase(BaseModel):
    title: str
    description: str | None = None
    assigned_to: str | None = None
    status: str = "pending"
    priority: str = "medium"
    due_date: datetime | None = None


class IncidentTaskCreate(IncidentTaskBase):
    incident_id: str


class IncidentTaskUpdate(BaseModel):
    title: str | None = None
    status: str | None = None
    priority: str | None = None
    assigned_to: str | None = None
    due_date: datetime | None = None


class IncidentTaskResponse(IncidentTaskBase):
    id: str
    incident_id: str
    completed_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class EvidenceBase(BaseModel):
    evidence_type: str
    title: str
    description: str | None = None
    file_hash: str | None = None
    file_size: int = 0
    chain_of_custody: str | None = None


class EvidenceCreate(EvidenceBase):
    incident_id: str


class EvidenceResponse(EvidenceBase):
    id: str
    incident_id: str
    file_path: str | None = None
    collected_by: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TimelineEventBase(BaseModel):
    event_type: str
    title: str
    description: str | None = None
    source: str | None = None
    user: str | None = None
    timestamp: datetime


class TimelineEventCreate(TimelineEventBase):
    incident_id: str


class TimelineEventResponse(TimelineEventBase):
    id: str
    incident_id: str
    created_at: datetime

    model_config = {"from_attributes": True}
