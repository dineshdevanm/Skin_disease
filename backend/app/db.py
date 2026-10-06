from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import settings

# Name is referenced by seed.py, the routers and the startup index check, so it
# lives here rather than being repeated as a string literal.
KNOWLEDGE_BASE = "knowledge_base"
TEXT_INDEX_NAME = "knowledge_base_text_index"

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(
            settings.mongodb_uri,
            # Motor defaults to 30s here. That means every request sits and waits
            # half a minute when Mongo is unreachable, which looks like a hang
            # rather than an outage. Fail fast and let the caller see a 503.
            serverSelectionTimeoutMS=settings.mongo_server_selection_timeout_ms,
            connectTimeoutMS=settings.mongo_connect_timeout_ms,
            # Bounded pool so a burst of requests cannot open unlimited sockets
            # against a shared Atlas cluster.
            maxPoolSize=settings.mongo_max_pool_size,
            minPoolSize=0,
            retryWrites=True,
        )
    return _client


def get_database() -> AsyncIOMotorDatabase:
    return get_client()[settings.mongodb_db_name]


async def ping() -> None:
    """Raise if the database is unreachable. Used by startup and /health."""
    await get_client().admin.command("ping")


async def ensure_indexes() -> None:
    """Create the text index the chatbot searches against, if it is missing.

    seed.py also creates this, but the app must not depend on the seeder having
    been run — a fresh deploy that skipped seeding would otherwise fail every
    chat query with 'text index required for $text query'. create_index is
    idempotent, so calling it on every startup is safe and cheap.
    """
    db = get_database()
    await db[KNOWLEDGE_BASE].create_index(
        [
            ("name", "text"),
            ("question", "text"),
            ("keywords", "text"),
            ("summary", "text"),
            ("answer", "text"),
        ],
        weights={"name": 5, "keywords": 5, "question": 4, "summary": 1, "answer": 1},
        name=TEXT_INDEX_NAME,
    )


def close_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
