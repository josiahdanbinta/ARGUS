from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class SIEMEventBase(BaseModel):
    hostname: str | None = None
    event_type: str
    event_id: int | None = None
    severity: str = "low"
    source: str
    source_ip: str | None = None
    destination_ip: str | None = None
    user: str | None = None
    domain: str | None = None
    country: str | None = None
    message: str | None = None
    raw_data: str | None = None
    mitre_techniques: str | None = None
    tags: str | None = None
    risk_score: int = 0
    timestamp: datetime | None = None


class SIEMEventCreate(SIEMEventBase):
    pass


class SIEMEventResponse(SIEMEventBase):
    id: str
    organization_id: str | None = None
    asset_id: str | None = None
    is_correlated: bool
    correlation_rule_id: str | None = None
    received_at: datetime

    model_config = {"from_attributes": True}


class LogIngestRequest(BaseModel):
    hostname: str | None = Field(None, max_length=255)
    ip: str | None = Field(None, max_length=45)
    source: str = Field(..., max_length=100)
    event_id: int | None = None
    event_type: str | None = None
    message: str | None = None
    severity: str = "low"
    timestamp: datetime | None = None
    user: str | None = None
    country: str | None = None
    raw: str | None = None


class LogIngestBatch(BaseModel):
    events: list[LogIngestRequest] = Field(..., min_length=1, max_length=10000)


class DetectionRuleBase(BaseModel):
    name: str
    description: str | None = None
    rule_type: str
    severity: str = "medium"
    mitre_techniques: str | None = None
    query: str | None = None
    sigma_rule: str | None = None
    yara_rule: str | None = None
    threshold: int | None = None
    time_window_seconds: int | None = None


class DetectionRuleCreate(DetectionRuleBase):
    organization_id: str | None = None


class DetectionRuleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    severity: str | None = None
    is_enabled: bool | None = None
    query: str | None = None
    threshold: int | None = None


class DetectionRuleResponse(DetectionRuleBase):
    id: str
    organization_id: str | None = None
    is_enabled: bool
    false_positive_rate: float | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SigmaRuleBase(BaseModel):
    name: str
    description: str | None = None
    sigma_yaml: str | None = None
    severity: str = "medium"
    mitre_techniques: str | None = None
    log_source: str | None = None


class SigmaRuleCreate(SigmaRuleBase):
    pass


class SigmaRuleResponse(SigmaRuleBase):
    id: str
    is_enabled: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class YaraRuleBase(BaseModel):
    name: str
    description: str | None = None
    yara_rule: str | None = None
    severity: str = "medium"
    mitre_techniques: str | None = None


class YaraRuleCreate(YaraRuleBase):
    pass


class YaraRuleResponse(YaraRuleBase):
    id: str
    is_enabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class IOCBase(BaseModel):
    ioc_type: str
    value: str
    description: str | None = None
    severity: str = "medium"
    confidence: int = 50
    source: str | None = None
    threat_actor: str | None = None
    campaign: str | None = None
    mitre_techniques: str | None = None
    tlp: str | None = None


class IOCCreate(IOCBase):
    pass


class IOCResponse(IOCBase):
    id: str
    is_active: bool
    first_seen: datetime
    last_seen: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ThreatFeedBase(BaseModel):
    name: str
    feed_type: str
    source: str
    url: str | None = None
    api_config: str | None = None
    sync_interval_minutes: int = 60


class ThreatFeedCreate(ThreatFeedBase):
    pass


class ThreatFeedResponse(ThreatFeedBase):
    id: str
    is_enabled: bool
    last_synced: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MITRETechniqueResponse(BaseModel):
    id: str
    technique_id: str
    name: str
    tactic: str
    description: str | None = None
    detection: str | None = None
    platforms: str | None = None
    data_sources: str | None = None

    model_config = {"from_attributes": True}
