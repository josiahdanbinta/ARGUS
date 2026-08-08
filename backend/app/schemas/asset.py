from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AssetBase(BaseModel):
    name: str
    asset_type: str
    hostname: str | None = None
    ip_address: str | None = None
    mac_address: str | None = None
    operating_system: str | None = None
    os_version: str | None = None
    owner: str | None = None
    department: str | None = None
    criticality: str = "low"
    location: str | None = None
    tags: str | None = None


class AssetCreate(AssetBase):
    organization_id: str


class AssetUpdate(BaseModel):
    name: str | None = None
    asset_type: str | None = None
    hostname: str | None = None
    ip_address: str | None = None
    operating_system: str | None = None
    owner: str | None = None
    department: str | None = None
    criticality: str | None = None
    location: str | None = None
    tags: str | None = None
    risk_score: int | None = None
    is_active: bool | None = None


class AssetResponse(BaseModel):
    id: str
    organization_id: str
    name: str
    asset_type: str
    hostname: str | None = None
    ip_address: str | None = None
    mac_address: str | None = None
    operating_system: str | None = None
    os_version: str | None = None
    owner: str | None = None
    department: str | None = None
    criticality: str
    location: str | None = None
    tags: str | None = None
    risk_score: int
    last_seen: datetime | None = None
    is_active: bool
    endpoint: "EndpointResponse | None" = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EndpointBase(BaseModel):
    asset_id: str
    agent_version: str | None = None
    agent_status: str = "inactive"
    isolation_status: str = "none"


class EndpointUpdate(BaseModel):
    agent_status: str | None = None
    isolation_status: str | None = None
    policy_id: str | None = None


class EndpointResponse(BaseModel):
    id: str
    asset_id: str
    hostname: str | None = None
    operating_system: str | None = None
    ip_address: str | None = None
    agent_version: str | None = None
    agent_status: str
    isolation_status: str
    cpu_usage: float | None = None
    memory_usage: float | None = None
    disk_usage: float | None = None
    policy_id: str | None = None
    last_heartbeat: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EndpointHealthCheck(BaseModel):
    endpoint_id: str
    cpu_usage: float | None = None
    memory_usage: float | None = None
    disk_usage: float | None = None
    agent_version: str | None = None
    installed_software: str | None = None
