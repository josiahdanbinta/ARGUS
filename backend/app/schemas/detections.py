from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class RansomwareRule(BaseModel):
    id: str
    name: str
    description: str
    severity: str
    mitre_techniques: list[str]
    event_type: str | None = None
    patterns: list[str]
    false_positives: str | None = None
    enabled: bool = True


class RansomwareFinding(BaseModel):
    rule_id: str
    rule_name: str
    severity: str
    description: str
    events: list[dict[str, Any]]
    affected_hosts: list[str]
    mitre_techniques: list[str]
    recommended_actions: list[str]


class RansomwareScanResponse(BaseModel):
    scanned_events: int
    time_range: str
    findings: list[RansomwareFinding]
    total_findings: int
    critical_findings: int
    detected_at: datetime


class EnrichmentRequest(BaseModel):
    indicator: str
    indicator_type: str = "ip"
    providers: list[str] = ["virustotal", "abuseipdb", "greynoise", "shodan"]


class EnrichmentProviderResult(BaseModel):
    provider: str
    success: bool
    error: str | None = None
    data: dict[str, Any] | None = None


class EnrichmentResponse(BaseModel):
    indicator: str
    indicator_type: str
    results: list[EnrichmentProviderResult]
    overall_score: int | None = None
    verdict: str | None = None
    enriched_at: datetime


class DetectionRunRequest(BaseModel):
    time_range: str = "24h"
    event_type: str | None = None
