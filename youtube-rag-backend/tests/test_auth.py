from httpx import AsyncClient, ASGITransport
from app.main import app

import pytest

@pytest.mark.asyncio
async def test_register_and_login():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Register
        res = await ac.post("/auth/register", json={
            "name": "testuserq",
            "email": "testq@example.com",
            "password": "testpass123"
        })
        assert res.status_code == 200

        # Login
        res = await ac.post("/auth/login", json={
            "email": "testq@example.com",
            "password": "testpass123"
        })
        assert res.status_code == 200