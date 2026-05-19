from httpx import AsyncClient, ASGITransport
import pytest
from app.main import app

@pytest.mark.asyncio
async def test_rate_limit():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        
        for _ in range(35):  # exceed limit (30)
            res = await ac.post("/ask", json={
                "video_id": "test",
                "question": "test?"
            })

        assert res.status_code in [429, 403]