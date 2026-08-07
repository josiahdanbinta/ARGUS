from __future__ import annotations

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["version"] == "1.0.0"


@pytest.mark.asyncio
async def test_root(client: AsyncClient):
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "ARGUS"


@pytest.mark.asyncio
async def test_readiness(client: AsyncClient):
    response = await client.get("/api/v1/ready")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_login_validation(client: AsyncClient):
    response = await client.post("/api/v1/auth/login", json={"email": "", "password": ""})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_unauthenticated_access(client: AsyncClient):
    response = await client.get("/api/v1/dashboard")
    assert response.status_code in (401, 403)
