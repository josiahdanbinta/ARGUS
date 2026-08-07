from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.ai import AIMessage, AISession
from app.models.user import User
from app.schemas.ai import (
    AISessionDetail,
    AISessionResponse,
    AIMessageResponse,
    AIModelResponse,
    ChatRequest,
    ChatResponse,
    ExplainRequest,
    ExplainResponse,
    InvestigateRequest,
    InvestigateResponse,
    ReportRequest,
    ReportResponse,
    SigmaGenerateRequest,
    SigmaGenerateResponse,
    SummarizeRequest,
    SummarizeResponse,
    ThreatHuntRequest,
    ThreatHuntResponse,
    YaraGenerateRequest,
    YaraGenerateResponse,
)
from app.schemas.common import PaginatedResponse
from app.services.ai_service import ai_service
from app.utils import generate_uuid, utcnow

router = APIRouter(prefix="/api/v1/ai", tags=["AI Copilot"])


async def _get_or_create_session(db: AsyncSession, user: User, session_id: str | None, model: str, provider: str, agent_type: str) -> AISession:
    if session_id:
        result = await db.execute(
            select(AISession).where(AISession.id == session_id, AISession.user_id == user.id)
        )
        session = result.scalar_one_or_none()
        if session:
            return session

    session = AISession(
        id=session_id or generate_uuid(),
        user_id=user.id,
        organization_id=user.organization_id,
        title=None,
        model=model,
        provider=provider,
        agent_type=agent_type,
    )
    db.add(session)
    await db.flush()
    return session


@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    provider = body.provider or "ollama"
    model = body.model or "llama3.2"
    agent_type = body.agent_type or "general"

    session = await _get_or_create_session(
        db, current_user, body.session_id, model, provider, agent_type
    )

    history_result = await db.execute(
        select(AIMessage)
        .where(AIMessage.session_id == session.id)
        .order_by(AIMessage.created_at.asc())
        .limit(20)
    )
    history = [
        {"role": m.role, "content": m.content}
        for m in history_result.scalars().all()
        if m.content
    ]

    user_msg = AIMessage(
        id=generate_uuid(), session_id=session.id, role="user",
        content=body.message, model=model,
    )
    db.add(user_msg)

    try:
        response_text = await ai_service.chat(
            message=body.message,
            provider=provider,
            model=model,
            agent_type=agent_type,
            history=history,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    assistant_msg = AIMessage(
        id=generate_uuid(), session_id=session.id, role="assistant",
        content=response_text, model=model,
    )
    db.add(assistant_msg)

    if not session.title and history_result is None:
        session.title = body.message[:100]

    await db.flush()

    return ChatResponse(
        session_id=session.id,
        message=response_text,
        model=model,
        provider=provider,
    )


@router.get("/sessions", response_model=PaginatedResponse)
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    base = select(AISession).where(AISession.user_id == current_user.id)
    count_query = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = base.order_by(AISession.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    sessions = result.scalars().all()

    return PaginatedResponse(
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size if total > 0 else 1,
        items=[AISessionResponse.model_validate(s) for s in sessions],
    )


@router.get("/sessions/{session_id}", response_model=AISessionDetail)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AISession)
        .where(AISession.id == session_id, AISession.user_id == current_user.id)
        .options(selectinload(AISession.messages))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return AISessionDetail.model_validate(session)


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AISession).where(AISession.id == session_id, AISession.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if session:
        await db.delete(session)


@router.post("/investigate", response_model=InvestigateResponse)
async def investigate(
    body: InvestigateRequest,
    current_user: User = Depends(get_current_user),
):
    context = {}
    if body.context_id:
        context["id"] = body.context_id
    if body.context_type:
        context["type"] = body.context_type

    result = await ai_service.investigate(body.query, context)
    return InvestigateResponse(**result)


@router.post("/threat-hunt", response_model=ThreatHuntResponse)
async def threat_hunt(
    body: ThreatHuntRequest,
    current_user: User = Depends(get_current_user),
):
    provider = ai_service.get_provider()
    try:
        response = await provider.chat(
            [{"role": "user", "content": f"Execute threat hunt: {body.query}. Time range: {body.time_range}. Explain findings."}],
            system_prompt=ai_service.SECURITY_SYSTEM_PROMPT,
        )
        return ThreatHuntResponse(
            query=body.query,
            translation=f"Translated query for {body.time_range} window",
            results_count=1,
            summary=response[:500],
            findings=[{"description": response[:500], "severity": "medium"}],
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Threat hunt failed: {str(e)}")


@router.post("/generate/sigma", response_model=SigmaGenerateResponse)
async def generate_sigma(
    body: SigmaGenerateRequest,
    current_user: User = Depends(get_current_user),
):
    result = await ai_service.generate_sigma_rule(body.description, body.log_source, body.mitre_technique)
    return SigmaGenerateResponse(**result)


@router.post("/generate/yara", response_model=YaraGenerateResponse)
async def generate_yara(
    body: YaraGenerateRequest,
    current_user: User = Depends(get_current_user),
):
    result = await ai_service.generate_yara_rule(body.description, body.target)
    return YaraGenerateResponse(**result)


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize(
    body: SummarizeRequest,
    current_user: User = Depends(get_current_user),
):
    target = f"incident {body.incident_id}" if body.incident_id else f"alert {body.alert_id}" if body.alert_id else "the investigation"
    provider = ai_service.get_provider()
    try:
        response = await provider.chat(
            [{"role": "user", "content": f"Summarize {target} for a {body.format} audience. Include key findings and recommendations."}],
            system_prompt=ai_service.SECURITY_SYSTEM_PROMPT,
        )
        return SummarizeResponse(
            summary=response,
            title=f"Summary of {target}",
            key_findings=["See AI-generated summary above"],
            timeline=[],
            recommendations=["Review full incident details for actionable steps"],
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Summarization failed: {str(e)}")


@router.post("/explain", response_model=ExplainResponse)
async def explain(
    body: ExplainRequest,
    current_user: User = Depends(get_current_user),
):
    target = f"alert {body.alert_id}" if body.alert_id else f"event {body.event_id}" if body.event_id else body.question or "this item"
    provider = ai_service.get_provider()
    try:
        response = await provider.chat(
            [{"role": "user", "content": f"Explain {target} to a SOC analyst. Include severity justification, related MITRE techniques, and suggested actions."}],
            system_prompt=ai_service.SECURITY_SYSTEM_PROMPT,
        )
        return ExplainResponse(
            explanation=response,
            severity_justification="Based on AI analysis",
            related_techniques=[],
            suggested_actions=["Review in context of broader security posture"],
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Explanation failed: {str(e)}")


@router.post("/report", response_model=ReportResponse)
async def generate_report(
    body: ReportRequest,
    current_user: User = Depends(get_current_user),
):
    provider = ai_service.get_provider()
    try:
        response = await provider.chat(
            [{"role": "user", "content": f"Generate a {body.report_type} security report for the last {body.time_range}. Format: {body.format}."}],
            system_prompt=ai_service.SECURITY_SYSTEM_PROMPT,
        )
        return ReportResponse(
            report=response,
            generated_at=datetime.now(timezone.utc),
            report_type=body.report_type,
            key_metrics={},
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Report generation failed: {str(e)}")


@router.get("/models", response_model=list[AIModelResponse])
async def list_models():
    return [AIModelResponse(**p) for p in ai_service.list_providers()]
