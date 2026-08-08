from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, HTTPException, Header, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.database import get_db
from app.core.redis import get_redis
from app.models.user import Permission, Role, User

settings = get_settings()
logger = get_logger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")
    return current_user


async def get_current_superuser(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    return current_user


def require_permission(permission: str):
    async def permission_checker(
        current_user: Annotated[User, Depends(get_current_user)],
        db: Annotated[AsyncSession, Depends(get_db)],
    ) -> User:
        if current_user.role == "super_admin":
            return current_user
        user_permissions = await get_user_permissions(current_user, db)
        if permission not in user_permissions:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user
    return permission_checker


async def get_user_permissions(user: User, db: AsyncSession) -> set[str]:
    if user.role == "super_admin":
        return {"*"}
    permissions: set[str] = set()
    result = await db.execute(
        select(Role).where(Role.name == user.role).options(selectinload(Role.permissions))
    )
    role_obj = result.scalar_one_or_none()
    if role_obj:
        for perm in role_obj.permissions:
            permissions.add(perm.name)
    return permissions


async def get_correlation_id(
    x_correlation_id: Annotated[str | None, Header()] = None,
) -> str:
    import uuid
    return x_correlation_id or str(uuid.uuid4())


async def rate_limit(
    request: Request,
    redis: Annotated[Any, Depends(get_redis)],
) -> None:
    client_ip = request.client.host if request.client else "unknown"
    key = f"rate_limit:{client_ip}"
    try:
        current = await redis.incr(key)
        if current == 1:
            await redis.expire(key, settings.RATE_LIMIT_PERIOD)
        if current > settings.RATE_LIMIT_REQUESTS:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded")
    except Exception as e:
        logger.warning("rate_limit_unavailable", ip=client_ip, error=str(e))
