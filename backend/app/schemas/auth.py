from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str | None = None
    exp: int | None = None
    type: str | None = None


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=100)
    full_name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    organization_name: str | None = Field(None, max_length=255)


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)


class MFAEnableRequest(BaseModel):
    method: str = "totp"


class MFAVerifyRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6)


class APIKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class APIKeyResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    is_active: bool
    last_used: datetime | None = None
    expires_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class APIKeyCreated(BaseModel):
    id: str
    name: str
    api_key: str
    key_prefix: str


class UserBase(BaseModel):
    email: EmailStr
    username: str
    full_name: str
    role: str = "read_only"
    organization_id: str | None = None
    phone: str | None = None
    department: str | None = None
    avatar_url: str | None = None


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128)


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    phone: str | None = None
    department: str | None = None
    avatar_url: str | None = None
    is_active: bool | None = None


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    full_name: str
    role: str
    is_active: bool
    is_verified: bool
    mfa_enabled: bool
    organization_id: str | None = None
    phone: str | None = None
    department: str | None = None
    avatar_url: str | None = None
    last_login: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserProfile(BaseModel):
    id: str
    email: str
    username: str
    full_name: str
    role: str
    is_active: bool
    organization_id: str | None = None
    organization_name: str | None = None

    model_config = {"from_attributes": True}


class RoleBase(BaseModel):
    name: str
    description: str | None = None


class RoleCreate(RoleBase):
    pass


class RoleResponse(RoleBase):
    id: str
    permissions: list["PermissionResponse"] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class PermissionResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    resource: str
    action: str

    model_config = {"from_attributes": True}


class SessionResponse(BaseModel):
    id: str
    device_info: str | None = None
    ip_address: str | None = None
    is_active: bool
    expires_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}
