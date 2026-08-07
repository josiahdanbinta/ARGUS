from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    session_id: str | None = None
    model: str | None = None
    provider: str | None = None
    agent_type: str = "general"
    include_context: bool = True


class ChatResponse(BaseModel):
    session_id: str
    message: str
    model: str
    provider: str
    tool_calls: list | None = None


class InvestigateRequest(BaseModel):
    query: str = Field(..., min_length=1)
    context_type: str | None = None
    context_id: str | None = None


class InvestigateResponse(BaseModel):
    summary: str
    evidence: list[str] = []
    affected_assets: list[str] = []
    related_alerts: list[str] = []
    related_incidents: list[str] = []
    mitre_techniques: list[str] = []
    confidence: float = 0.0
    recommended_steps: list[str] = []
    containment_options: list[str] = []


class ThreatHuntRequest(BaseModel):
    query: str = Field(..., min_length=1)
    time_range: str = "24h"


class ThreatHuntResponse(BaseModel):
    query: str
    translation: str | None = None
    results_count: int = 0
    summary: str
    findings: list[dict] = []


class SigmaGenerateRequest(BaseModel):
    description: str = Field(..., min_length=1)
    log_source: str | None = None
    mitre_technique: str | None = None


class SigmaGenerateResponse(BaseModel):
    sigma_rule: str
    explanation: str
    false_positives: str | None = None
    required_log_sources: list[str] = []
    mitre_techniques: list[str] = []


class YaraGenerateRequest(BaseModel):
    description: str = Field(..., min_length=1)
    target: str | None = None


class YaraGenerateResponse(BaseModel):
    yara_rule: str
    explanation: str
    false_positives: str | None = None


class SummarizeRequest(BaseModel):
    incident_id: str | None = None
    alert_id: str | None = None
    format: str = "analyst"


class SummarizeResponse(BaseModel):
    summary: str
    title: str | None = None
    key_findings: list[str] = []
    timeline: list[str] = []
    recommendations: list[str] = []


class ExplainRequest(BaseModel):
    alert_id: str | None = None
    event_id: str | None = None
    question: str | None = None


class ExplainResponse(BaseModel):
    explanation: str
    severity_justification: str | None = None
    related_techniques: list[str] = []
    suggested_actions: list[str] = []


class ReportRequest(BaseModel):
    report_type: str
    time_range: str = "7d"
    organization_id: str | None = None
    format: str = "executive"
    include_charts: bool = True


class ReportResponse(BaseModel):
    report: str
    generated_at: datetime
    report_type: str
    key_metrics: dict = {}


class AISessionResponse(BaseModel):
    id: str
    title: str | None = None
    model: str
    provider: str
    agent_type: str
    token_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AIMessageResponse(BaseModel):
    id: str
    role: str
    content: str | None = None
    tool_calls: str | None = None
    token_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AISessionDetail(AISessionResponse):
    messages: list[AIMessageResponse] = []


class AIConfig(BaseModel):
    provider: str
    model: str
    enabled: bool


class AIModelResponse(BaseModel):
    provider: str
    models: list[str] = []
    available: bool
