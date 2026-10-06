from fastapi import APIRouter, Response, status

from app.db import KNOWLEDGE_BASE, get_database, ping

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(response: Response):
    """Liveness plus dependency check.

    A health endpoint that always returns ok is worse than none: a load balancer
    would keep sending traffic to an instance whose database is gone. This
    reports 503 when Mongo is unreachable, so ALB/ECS target health is accurate.
    """
    try:
        await ping()
        db = get_database()
        seeded = await db[KNOWLEDGE_BASE].count_documents({})
    except Exception as exc:  # noqa: BLE001 - surface any driver error as unhealthy
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "degraded", "database": "unreachable", "detail": str(exc)}

    if seeded == 0:
        # Reachable but empty: the app runs, yet the library and chatbot have
        # nothing to serve. Worth flagging rather than reporting a clean bill.
        return {
            "status": "ok",
            "database": "connected",
            "documents": 0,
            "detail": "knowledge_base is empty — run `python -m app.seed`",
        }

    return {"status": "ok", "database": "connected", "documents": seeded}
