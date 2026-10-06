import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import close_client, ensure_indexes, ping
from app.routers import chat, diseases, health, predict
from app.services import llm

logger = logging.getLogger("dermascan")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Check the database once at boot so a bad MONGODB_URI shows up here, in the
    # logs, rather than as a confusing failure on someone's first request.
    # Deliberately non-fatal: /predict needs no database, so the API stays useful
    # for prediction even when Mongo is unreachable. /health reports the truth.
    try:
        await ping()
        await ensure_indexes()
        logger.info("MongoDB connected (db=%s)", settings.mongodb_db_name)
    except Exception as exc:  # noqa: BLE001 - startup must not crash on this
        logger.error(
            "MongoDB unreachable at startup: %s. /diseases and /chat will fail "
            "until it is available; /predict is unaffected.",
            exc,
        )

    # Loading the chat model takes ~20s. Doing it in the background here means
    # the first person to open the chatbot does not wait for it, while startup
    # itself is not blocked either.
    if llm.available():
        threading.Thread(target=llm.warm, name="llm-warmup", daemon=True).start()

    yield

    close_client()


app = FastAPI(title="DermaScan API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(diseases.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(predict.router, prefix="/api")
