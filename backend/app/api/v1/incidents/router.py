from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.soc import Incident, IncidentNote, IncidentTask, Evidence, TimelineEvent
from app.models.notification import AuditLog
from app.schemas.soc import (
    IncidentCreate, IncidentUpdate, IncidentResponse,
    IncidentNoteCreate, IncidentNoteResponse,
    IncidentTaskCreate, IncidentTaskUpdate, IncidentTaskResponse,
    EvidenceCreate, EvidenceResponse,
    TimelineEventCreate, TimelineEventResponse,
)
from app.schemas.common import PaginatedResponse
from app.utils import generate_uuid, utcnow

router = APIRouter(prefix="/api/v1/incidents", tags=["Incidents"])


class AssignRequest(BaseModel):
    user_id: str


class NoteRequest(BaseModel):
    content: str


@router.get("/", response_model=PaginatedResponse)
async def list_incidents(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    severity: str | None = Query(None),
    status: str | None = Query(None),
    assigned_to: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = select(Incident)
    count_query = select(func.count(Incident.id))

    if severity:
        query = query.where(Incident.severity == severity)
        count_query = count_query.where(Incident.severity == severity)
    if status:
        query = query.where(Incident.status == status)
        count_query = count_query.where(Incident.status == status)
    if assigned_to:
        query = query.where(Incident.assigned_to == assigned_to)
        count_query = count_query.where(Incident.assigned_to == assigned_to)

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    offset = (page - 1) * page_size
    query = query.order_by(Incident.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    items = result.scalars().all()

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size if total else 1,
    )


@router.post("/", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
async def create_incident(
    data: IncidentCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    incident = Incident(
        id=generate_uuid(),
        created_at=utcnow(),
        updated_at=utcnow(),
        **data.model_dump(),
    )
    db.add(incident)
    await db.commit()
    await db.refresh(incident)
    return incident


@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(Incident)
        .where(Incident.id == incident_id)
        .options(
            selectinload(Incident.notes),
            selectinload(Incident.tasks),
            selectinload(Incident.evidence),
            selectinload(Incident.timeline_events),
        )
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    return incident


@router.patch("/{incident_id}", response_model=IncidentResponse)
async def update_incident(
    incident_id: str,
    data: IncidentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(incident, field, value)

    incident.updated_at = utcnow()
    await db.commit()
    await db.refresh(incident)
    return incident


@router.post("/{incident_id}/notes", response_model=IncidentNoteResponse, status_code=status.HTTP_201_CREATED)
async def add_note(
    incident_id: str,
    body: NoteRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    note = IncidentNote(
        id=generate_uuid(),
        incident_id=incident_id,
        content=body.content,
        created_by=current_user.id,
        created_at=utcnow(),
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


@router.get("/{incident_id}/notes", response_model=list[IncidentNoteResponse])
async def list_notes(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(IncidentNote)
        .where(IncidentNote.incident_id == incident_id)
        .order_by(IncidentNote.created_at.desc())
    )
    notes = result.scalars().all()
    return notes


@router.post("/{incident_id}/tasks", response_model=IncidentTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    incident_id: str,
    data: IncidentTaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    task = IncidentTask(
        id=generate_uuid(),
        incident_id=incident_id,
        created_at=utcnow(),
        updated_at=utcnow(),
        **data.model_dump(),
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.patch("/{incident_id}/tasks/{task_id}", response_model=IncidentTaskResponse)
async def update_task(
    incident_id: str,
    task_id: str,
    data: IncidentTaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(IncidentTask).where(
            IncidentTask.id == task_id,
            IncidentTask.incident_id == incident_id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)

    task.updated_at = utcnow()
    await db.commit()
    await db.refresh(task)
    return task


@router.post("/{incident_id}/evidence", response_model=EvidenceResponse, status_code=status.HTTP_201_CREATED)
async def add_evidence(
    incident_id: str,
    data: EvidenceCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    evidence = Evidence(
        id=generate_uuid(),
        incident_id=incident_id,
        created_at=utcnow(),
        **data.model_dump(),
    )
    db.add(evidence)
    await db.commit()
    await db.refresh(evidence)
    return evidence


@router.post("/{incident_id}/timeline", response_model=TimelineEventResponse, status_code=status.HTTP_201_CREATED)
async def add_timeline_event(
    incident_id: str,
    data: TimelineEventCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    event = TimelineEvent(
        id=generate_uuid(),
        incident_id=incident_id,
        timestamp=utcnow(),
        **data.model_dump(),
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


@router.get("/{incident_id}/timeline", response_model=list[TimelineEventResponse])
async def get_timeline(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(TimelineEvent)
        .where(TimelineEvent.incident_id == incident_id)
        .order_by(TimelineEvent.timestamp.asc())
    )
    events = result.scalars().all()
    return events


@router.post("/{incident_id}/close", response_model=IncidentResponse)
async def close_incident(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    incident.status = "closed"
    incident.closed_at = utcnow()
    incident.updated_at = utcnow()
    await db.commit()
    await db.refresh(incident)
    return incident


@router.post("/{incident_id}/assign", response_model=IncidentResponse)
async def assign_incident(
    incident_id: str,
    body: AssignRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    incident.assigned_to = body.user_id
    incident.updated_at = utcnow()
    await db.commit()
    await db.refresh(incident)
    return incident
