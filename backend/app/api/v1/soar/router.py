from __future__ import annotations

import json
import math

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.soar import AutomationJob, Integration, Playbook, Workflow
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.soar import (
    AutomationJobResponse,
    IntegrationCreate,
    IntegrationResponse,
    IntegrationUpdate,
    PlaybookCreate,
    PlaybookExecute,
    PlaybookResponse,
    PlaybookUpdate,
    WorkflowCreate,
    WorkflowResponse,
)
from app.utils import generate_uuid, utcnow
from app.workers.tasks import execute_playbook

router = APIRouter(prefix="/api/v1/soar", tags=["SOAR"])


@router.get("/playbooks", response_model=PaginatedResponse)
async def list_playbooks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    count_query = select(func.count()).select_from(Playbook)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = (
        select(Playbook)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .order_by(Playbook.created_at.desc())
    )
    result = await db.execute(query)
    playbooks = result.scalars().all()

    return PaginatedResponse(
        total=total, page=page, page_size=page_size,
        pages=max(math.ceil(total / page_size), 1) if total > 0 else 1,
        items=[PlaybookResponse.model_validate(p) for p in playbooks],
    )


@router.post("/playbooks", response_model=PlaybookResponse, status_code=status.HTTP_201_CREATED)
async def create_playbook(
    data: PlaybookCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    playbook = Playbook(
        organization_id=data.organization_id,
        name=data.name, description=data.description,
        trigger_type=data.trigger_type, trigger_config=data.trigger_config,
        workflow_definition=data.workflow_definition, created_by=current_user.id,
    )
    db.add(playbook)
    await db.flush()
    await db.refresh(playbook)
    return PlaybookResponse.model_validate(playbook)


@router.get("/playbooks/{playbook_id}", response_model=PlaybookResponse)
async def get_playbook(
    playbook_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Playbook).where(Playbook.id == playbook_id))
    playbook = result.scalar_one_or_none()
    if playbook is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playbook not found")
    return PlaybookResponse.model_validate(playbook)


@router.put("/playbooks/{playbook_id}", response_model=PlaybookResponse)
async def update_playbook(
    playbook_id: str,
    data: PlaybookUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Playbook).where(Playbook.id == playbook_id))
    playbook = result.scalar_one_or_none()
    if playbook is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playbook not found")
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(playbook, field, value)
    await db.flush()
    await db.refresh(playbook)
    return PlaybookResponse.model_validate(playbook)


@router.delete("/playbooks/{playbook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_playbook(
    playbook_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Playbook).where(Playbook.id == playbook_id))
    playbook = result.scalar_one_or_none()
    if playbook is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playbook not found")
    await db.delete(playbook)


@router.post("/playbooks/{playbook_id}/execute", response_model=AutomationJobResponse)
async def execute_playbook_endpoint(
    playbook_id: str,
    data: PlaybookExecute,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Playbook).where(Playbook.id == playbook_id))
    playbook = result.scalar_one_or_none()
    if playbook is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playbook not found")

    job = AutomationJob(
        organization_id=playbook.organization_id,
        playbook_id=playbook.id, name=playbook.name,
        status="pending",
        trigger_data=json.dumps(data.trigger_data) if data.trigger_data else None,
        started_at=utcnow(),
    )
    db.add(job)
    await db.flush()

    try:
        execute_playbook.delay(playbook_id, data.trigger_data)
        job.status = "running"
        playbook.execution_count = (playbook.execution_count or 0) + 1
        playbook.last_executed = utcnow()
    except Exception:
        job.status = "failed"
        job.error_message = "Failed to dispatch playbook execution"

    await db.flush()
    await db.refresh(job)
    return AutomationJobResponse.model_validate(job)


@router.get("/workflows", response_model=PaginatedResponse)
async def list_workflows(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    count_query = select(func.count()).select_from(Workflow)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = (
        select(Workflow)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .order_by(Workflow.created_at.desc())
    )
    result = await db.execute(query)
    workflows = result.scalars().all()

    return PaginatedResponse(
        total=total, page=page, page_size=page_size,
        pages=max(math.ceil(total / page_size), 1) if total > 0 else 1,
        items=[WorkflowResponse.model_validate(w) for w in workflows],
    )


@router.post("/workflows", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    data: WorkflowCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workflow = Workflow(
        organization_id=data.organization_id,
        name=data.name, description=data.description,
        steps=data.steps, created_by=current_user.id,
    )
    db.add(workflow)
    await db.flush()
    await db.refresh(workflow)
    return WorkflowResponse.model_validate(workflow)


@router.get("/workflows/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    workflow = result.scalar_one_or_none()
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return WorkflowResponse.model_validate(workflow)


@router.put("/workflows/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: str,
    data: WorkflowCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    workflow = result.scalar_one_or_none()
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(workflow, field, value)
    await db.flush()
    await db.refresh(workflow)
    return WorkflowResponse.model_validate(workflow)


@router.delete("/workflows/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    workflow = result.scalar_one_or_none()
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    await db.delete(workflow)


@router.get("/jobs", response_model=PaginatedResponse)
async def list_jobs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    count_query = select(func.count()).select_from(AutomationJob)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = (
        select(AutomationJob)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .order_by(AutomationJob.created_at.desc())
    )
    result = await db.execute(query)
    jobs = result.scalars().all()

    return PaginatedResponse(
        total=total, page=page, page_size=page_size,
        pages=max(math.ceil(total / page_size), 1) if total > 0 else 1,
        items=[AutomationJobResponse.model_validate(j) for j in jobs],
    )


@router.get("/jobs/{job_id}", response_model=AutomationJobResponse)
async def get_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(AutomationJob).where(AutomationJob.id == job_id))
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Automation job not found")
    return AutomationJobResponse.model_validate(job)


@router.get("/integrations", response_model=PaginatedResponse)
async def list_integrations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    count_query = select(func.count()).select_from(Integration)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = (
        select(Integration)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .order_by(Integration.created_at.desc())
    )
    result = await db.execute(query)
    integrations = result.scalars().all()

    return PaginatedResponse(
        total=total, page=page, page_size=page_size,
        pages=max(math.ceil(total / page_size), 1) if total > 0 else 1,
        items=[IntegrationResponse.model_validate(i) for i in integrations],
    )


@router.post("/integrations", response_model=IntegrationResponse, status_code=status.HTTP_201_CREATED)
async def create_integration(
    data: IntegrationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    integration = Integration(
        organization_id=data.organization_id,
        name=data.name, integration_type=data.integration_type,
        config=data.config,
    )
    db.add(integration)
    await db.flush()
    await db.refresh(integration)
    return IntegrationResponse.model_validate(integration)


@router.get("/integrations/{integration_id}", response_model=IntegrationResponse)
async def get_integration(
    integration_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Integration).where(Integration.id == integration_id))
    integration = result.scalar_one_or_none()
    if integration is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration not found")
    return IntegrationResponse.model_validate(integration)


@router.put("/integrations/{integration_id}", response_model=IntegrationResponse)
async def update_integration(
    integration_id: str,
    data: IntegrationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Integration).where(Integration.id == integration_id))
    integration = result.scalar_one_or_none()
    if integration is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration not found")
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(integration, field, value)
    await db.flush()
    await db.refresh(integration)
    return IntegrationResponse.model_validate(integration)


@router.delete("/integrations/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_integration(
    integration_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Integration).where(Integration.id == integration_id))
    integration = result.scalar_one_or_none()
    if integration is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration not found")
    await db.delete(integration)
