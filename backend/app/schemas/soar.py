from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class PlaybookBase(BaseModel):
    name: str
    description: str | None = None
    trigger_type: str
    trigger_config: str | None = None
    workflow_definition: str | None = None


class PlaybookCreate(PlaybookBase):
    organization_id: str | None = None


class PlaybookUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    workflow_definition: str | None = None
    is_enabled: bool | None = None


class PlaybookResponse(PlaybookBase):
    id: str
    organization_id: str | None = None
    is_enabled: bool
    is_approved: bool
    version: str
    execution_count: int
    last_executed: datetime | None = None
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PlaybookExecute(BaseModel):
    trigger_data: dict | None = None


class WorkflowBase(BaseModel):
    name: str
    description: str | None = None
    steps: str | None = None


class WorkflowCreate(WorkflowBase):
    organization_id: str | None = None


class WorkflowResponse(WorkflowBase):
    id: str
    organization_id: str | None = None
    status: str
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AutomationJobResponse(BaseModel):
    id: str
    organization_id: str | None = None
    playbook_id: str | None = None
    name: str
    status: str
    trigger_data: str | None = None
    result_data: str | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class IntegrationBase(BaseModel):
    name: str
    integration_type: str
    config: str | None = None


class IntegrationCreate(IntegrationBase):
    organization_id: str | None = None


class IntegrationUpdate(BaseModel):
    config: str | None = None
    is_enabled: bool | None = None


class IntegrationResponse(IntegrationBase):
    id: str
    organization_id: str | None = None
    is_enabled: bool
    status: str
    last_synced: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
