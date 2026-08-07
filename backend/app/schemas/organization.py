from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class OrganizationBase(BaseModel):
    name: str = Field(..., max_length=255)
    description: str | None = None
    domain: str | None = None
    logo_url: str | None = None


class OrganizationCreate(OrganizationBase):
    slug: str = Field(..., max_length=100)


class OrganizationUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    domain: str | None = None
    logo_url: str | None = None
    is_active: bool | None = None
    plan: str | None = None
    max_endpoints: int | None = None
    max_users: int | None = None


class OrganizationResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: str | None = None
    logo_url: str | None = None
    domain: str | None = None
    is_active: bool
    plan: str
    max_endpoints: int
    max_users: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TeamBase(BaseModel):
    name: str
    description: str | None = None


class TeamCreate(TeamBase):
    organization_id: str


class TeamResponse(TeamBase):
    id: str
    organization_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TeamMemberResponse(BaseModel):
    id: str
    team_id: str
    user_id: str
    joined_at: datetime

    model_config = {"from_attributes": True}
