from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    index: str | None = None
    time_range: str = "24h"
    from_: int = 0
    size: int = 50
    sort_field: str | None = None
    sort_order: str = "desc"


class SearchResponse(BaseModel):
    total: int
    took_ms: float
    results: list[dict] = []
    aggregations: dict | None = None


class DashboardWidget(BaseModel):
    widget_type: str
    title: str
    config: dict | None = None


class DashboardResponse(BaseModel):
    widgets: list[DashboardWidget] = []
    metrics: dict = {}


class AuditLogResponse(BaseModel):
    id: str
    organization_id: str | None = None
    user_id: str | None = None
    action: str
    resource: str
    resource_id: str | None = None
    details: str | None = None
    ip_address: str | None = None
    correlation_id: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    title: str
    message: str | None = None
    notification_type: str
    severity: str
    is_read: bool
    link: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class HealthResponse(BaseModel):
    status: str = "healthy"
    version: str = "1.0.0"
    services: dict = {}
    uptime_seconds: float = 0


class MetricResponse(BaseModel):
    endpoint: str
    method: str
    count: int
    avg_latency_ms: float


class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None
    correlation_id: str | None = None


class PaginatedResponse(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int
    items: list = []
