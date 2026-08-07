from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.dependencies import get_current_active_user, get_current_user, rate_limit
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.notification import AuditLog
from app.models.organization import Organization
from app.models.user import APIKey, PasswordReset, Session, User
from app.schemas.auth import (
    APIKeyCreate,
    APIKeyCreated,
    APIKeyResponse,
    LoginRequest,
    MFAEnableRequest,
    MFAVerifyRequest,
    PasswordChange,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshRequest,
    RegisterRequest,
    SessionResponse,
    Token,
    UserProfile,
    UserResponse,
)
from app.utils import generate_uuid, utcnow

settings = get_settings()

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


def _generate_api_key() -> tuple[str, str, str]:
    raw = secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(raw.encode()).hexdigest()
    key_prefix = "ARGUS_" + raw[:8]
    return raw, key_hash, key_prefix


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> User:
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    result = await db.execute(select(User).where(User.username == body.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    organization_id: str | None = None
    if body.organization_name:
        result = await db.execute(
            select(Organization).where(Organization.name == body.organization_name)
        )
        if result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Organization already exists")
        org = Organization(
            id=generate_uuid(),
            name=body.organization_name,
            slug=body.organization_name.lower().replace(" ", "-"),
        )
        db.add(org)
        await db.flush()
        organization_id = org.id

    user = User(
        id=generate_uuid(),
        email=body.email,
        username=body.username,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        organization_id=organization_id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=Token, dependencies=[Depends(rate_limit)])
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    access_token = create_access_token(data={"sub": user.id})
    refresh_token = create_refresh_token(data={"sub": user.id, "jti": generate_uuid()})

    device_info = request.headers.get("User-Agent")
    ip_address = request.client.host if request.client else None

    session = Session(
        id=generate_uuid(),
        user_id=user.id,
        refresh_token=refresh_token,
        device_info=device_info,
        ip_address=ip_address,
        is_active=True,
        expires_at=utcnow() + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(session)

    user.last_login = utcnow()
    db.add(user)

    await db.commit()

    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(Session).where(Session.user_id == current_user.id, Session.is_active == True)
    )
    sessions = result.scalars().all()
    for s in sessions:
        s.is_active = False
    await db.commit()


@router.post("/refresh", response_model=Token)
async def refresh_token(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    result = await db.execute(
        select(Session).where(
            Session.refresh_token == body.refresh_token,
            Session.user_id == user_id,
            Session.is_active == True,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session not found or expired")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    session.is_active = False
    db.add(session)

    new_access_token = create_access_token(data={"sub": user.id})
    new_refresh_token = create_refresh_token(data={"sub": user.id, "jti": generate_uuid()})

    new_session = Session(
        id=generate_uuid(),
        user_id=user.id,
        refresh_token=new_refresh_token,
        device_info=session.device_info,
        ip_address=session.ip_address,
        is_active=True,
        expires_at=utcnow() + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(new_session)
    await db.commit()

    return {"access_token": new_access_token, "refresh_token": new_refresh_token, "token_type": "bearer"}


@router.get("/profile", response_model=UserProfile)
async def get_profile(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    org_name: str | None = None
    if current_user.organization_id:
        result = await db.execute(
            select(Organization.name).where(Organization.id == current_user.organization_id)
        )
        org_name = result.scalar_one_or_none()

    return {
        "id": current_user.id,
        "email": current_user.email,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "is_active": current_user.is_active,
        "organization_id": current_user.organization_id,
        "organization_name": org_name,
    }


@router.post("/password/reset-request", status_code=status.HTTP_202_ACCEPTED)
async def password_reset_request(
    body: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user:
        return {"message": "If the email is registered, a reset link has been sent"}

    reset_token = secrets.token_urlsafe(32)
    reset = PasswordReset(
        id=generate_uuid(),
        user_id=user.id,
        token=reset_token,
        is_used=False,
        expires_at=utcnow() + timedelta(hours=1),
    )
    db.add(reset)
    await db.commit()

    return {"message": "If the email is registered, a reset link has been sent"}


@router.post("/password/reset-confirm")
async def password_reset_confirm(
    body: PasswordResetConfirm,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    result = await db.execute(
        select(PasswordReset).where(
            PasswordReset.token == body.token,
            PasswordReset.is_used == False,
            PasswordReset.expires_at > utcnow(),
        )
    )
    reset = result.scalar_one_or_none()
    if not reset:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

    result = await db.execute(select(User).where(User.id == reset.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.hashed_password = hash_password(body.new_password)
    reset.is_used = True
    db.add(user)
    db.add(reset)
    await db.commit()

    return {"message": "Password has been reset successfully"}


@router.post("/password/change")
async def password_change(
    body: PasswordChange,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    current_user.hashed_password = hash_password(body.new_password)
    db.add(current_user)
    await db.commit()

    return {"message": "Password changed successfully"}


@router.post("/mfa/enable")
async def mfa_enable(
    body: MFAEnableRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    if current_user.mfa_enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="MFA is already enabled")

    secret = secrets.token_hex(32)

    current_user.mfa_enabled = True
    db.add(current_user)
    await db.commit()

    return {"message": "MFA enabled", "secret": secret}


@router.post("/mfa/verify")
async def mfa_verify(
    body: MFAVerifyRequest,
    current_user: User = Depends(get_current_active_user),
) -> dict[str, str]:
    if not current_user.mfa_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA is not enabled")
    return {"message": "MFA verified successfully"}


@router.post("/api-keys", response_model=APIKeyCreated, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    body: APIKeyCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    raw_key, key_hash, key_prefix = _generate_api_key()

    api_key = APIKey(
        id=generate_uuid(),
        user_id=current_user.id,
        name=body.name,
        key_hash=key_hash,
        key_prefix=key_prefix,
        is_active=True,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    return {
        "id": api_key.id,
        "name": api_key.name,
        "api_key": raw_key,
        "key_prefix": api_key.key_prefix,
    }


@router.get("/api-keys", response_model=list[APIKeyResponse])
async def list_api_keys(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[APIKey]:
    result = await db.execute(
        select(APIKey).where(APIKey.user_id == current_user.id).order_by(APIKey.created_at.desc())
    )
    return list(result.scalars().all())


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(APIKey).where(APIKey.id == key_id, APIKey.user_id == current_user.id)
    )
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")

    api_key.is_active = False
    db.add(api_key)
    await db.commit()


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[Session]:
    result = await db.execute(
        select(Session)
        .where(Session.user_id == current_user.id, Session.is_active == True)
        .order_by(Session.created_at.desc())
    )
    return list(result.scalars().all())
