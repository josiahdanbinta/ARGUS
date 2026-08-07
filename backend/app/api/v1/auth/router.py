from __future__ import annotations

import asyncio
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import get_logger
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
from app.models.user import APIKey, MFAMethod, PasswordReset, Session, User
from app.schemas.auth import (
    APIKeyCreate,
    APIKeyCreated,
    APIKeyResponse,
    LoginRequest,
    LoginResponse,
    MFAEnableRequest,
    MFALoginRequest,
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
logger = get_logger(__name__)

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


@router.post("/login", response_model=LoginResponse, dependencies=[Depends(rate_limit)])
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str | bool | None]:
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    # Step 1 of 2: user has MFA enabled — issue a short-lived challenge token
    if user.mfa_enabled:
        mfa_token = create_access_token(
            data={"sub": user.id, "purpose": "mfa"},
            expires_delta=timedelta(minutes=5),
        )
        return {"requires_mfa": True, "mfa_token": mfa_token}

    return await _issue_tokens(user, request, db)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
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

    reset_url = f"http://localhost:5173/reset-password?token={reset_token}"

    def _send_reset_email():
        import aiosmtplib
        from email.mime.text import MIMEText

        loop = asyncio.new_event_loop()
        try:
            msg = MIMEText(
                f"Hello {user.full_name},\n\n"
                f"You requested a password reset. Click the link below to reset your password:\n\n"
                f"{reset_url}\n\n"
                f"This link expires in 1 hour.\n\n"
                f"If you did not request this, please ignore this email.\n\n"
                f"– ARGUS Security Platform"
            )
            msg["Subject"] = "ARGUS - Password Reset Request"
            msg["From"] = settings.SMTP_FROM
            msg["To"] = user.email
            loop.run_until_complete(
                aiosmtplib.send(
                    msg,
                    hostname=settings.SMTP_HOST,
                    port=settings.SMTP_PORT,
                    username=settings.SMTP_USER or None,
                    password=settings.SMTP_PASSWORD or None,
                )
            )
        except Exception:
            pass
        finally:
            loop.close()

    if settings.SMTP_HOST:
        background_tasks.add_task(_send_reset_email)

    logger.info("password_reset_link", email=user.email)
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

    # Revoke all active sessions/tokens for the account (fix #4)
    session_result = await db.execute(
        select(Session).where(Session.user_id == reset.user_id, Session.is_active == True)
    )
    for s in session_result.scalars().all():
        s.is_active = False
        db.add(s)

    await db.commit()

    return {"message": "Password has been reset successfully"}


@router.get("/password/validate-reset-token")
async def validate_reset_token(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(PasswordReset).where(
            PasswordReset.token == token,
            PasswordReset.is_used == False,
            PasswordReset.expires_at > utcnow(),
        )
    )
    reset = result.scalar_one_or_none()
    return {"isValid": reset is not None, "message": "Token is valid" if reset else "Token is invalid or expired"}


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


async def _issue_tokens(
    user: User,
    request: Request | None,
    db: AsyncSession,
) -> dict[str, str]:
    access_token = create_access_token(data={"sub": user.id})
    refresh_token = create_refresh_token(data={"sub": user.id, "jti": generate_uuid()})

    device_info = request.headers.get("User-Agent") if request else None
    ip_address = request.client.host if request and request.client else None

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


@router.post("/mfa/enable")
async def mfa_enable(
    body: MFAEnableRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    if current_user.mfa_enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="MFA is already enabled")

    try:
        import pyotp  # type: ignore[import-untyped]
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="pyotp is not installed. Install it with: pip install pyotp",
        )

    result = await db.execute(
        select(MFAMethod).where(
            MFAMethod.user_id == current_user.id,
            MFAMethod.method_type == body.method,
        )
    )
    existing = result.scalar_one_or_none()

    secret = pyotp.random_base32()
    if existing:
        existing.secret = secret
        existing.is_default = True
        db.add(existing)
    else:
        db.add(
            MFAMethod(
                id=generate_uuid(),
                user_id=current_user.id,
                method_type=body.method,
                secret=secret,
                is_default=True,
            )
        )
    await db.commit()

    provisioning_uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=current_user.email, issuer_name="ARGUS"
    )
    # mfa_enabled only flips to True once /mfa/verify confirms the code.
    return {"message": "Scan the QR code, then verify with a code", "secret": secret, "provisioning_uri": provisioning_uri}


@router.post("/mfa/verify")
async def mfa_verify(
    body: MFAVerifyRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    try:
        import pyotp  # type: ignore[import-untyped]
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="pyotp is not installed. Install it with: pip install pyotp",
        )

    result = await db.execute(
        select(MFAMethod).where(
            MFAMethod.user_id == current_user.id,
            MFAMethod.method_type == "totp",
        )
    )
    mfa_method = result.scalar_one_or_none()
    if not mfa_method:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No TOTP method configured")

    totp = pyotp.TOTP(mfa_method.secret)
    if not totp.verify(body.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid MFA code")

    # Code verified — confirm/save activation state for the user.
    if not current_user.mfa_enabled:
        current_user.mfa_enabled = True
        db.add(current_user)
        await db.commit()

    return {"message": "MFA verified successfully"}


@router.post("/mfa/login",
             response_model=Token)
async def mfa_login(
    body: MFALoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    payload = decode_token(body.mfa_token)
    if not payload or payload.get("purpose") != "mfa" or not payload.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired MFA challenge")

    result = await db.execute(select(User).where(User.id == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    if not user.mfa_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA is not enabled for this account")

    result = await db.execute(
        select(MFAMethod).where(
            MFAMethod.user_id == user.id,
            MFAMethod.method_type == "totp",
        )
    )
    mfa_method = result.scalar_one_or_none()
    if not mfa_method:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No TOTP method configured")

    try:
        import pyotp  # type: ignore[import-untyped]
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="pyotp is not installed. Install it with: pip install pyotp",
        )

    if not pyotp.TOTP(mfa_method.secret).verify(body.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid MFA code")

    return await _issue_tokens(user, request, db)


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


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
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
