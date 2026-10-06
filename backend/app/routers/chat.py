import asyncio
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import settings
from app.db import get_database
from app.models import ChatRequest, ChatResponse
from app.services import llm, smalltalk
from app.services.retrieval import (
    FALLBACK,
    TREATMENT_INTENT,
    answer_query,
    build_response,
    collect_sources,
    find_matches,
    suggest,
)

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, db: AsyncIOMotorDatabase = Depends(get_database)):
    history = [t.model_dump() for t in payload.history]
    return await answer_query(db, payload.message, history)


@router.post("/chat/stream")
async def chat_stream(payload: ChatRequest, db: AsyncIOMotorDatabase = Depends(get_database)):
    """Server-sent events: tokens as they are produced, then the sources.

    Generation runs at a handful of tokens per second on CPU, so streaming is
    what makes the chat feel responsive — the first words land in about a
    second instead of the reader waiting for the whole answer.
    """
    history = [t.model_dump() for t in payload.history]

    # "hi", "thanks", "who are you" — no index lookup, no generation, no wait.
    canned = smalltalk.match(payload.message)
    docs = (
        []
        if canned is not None
        else await find_matches(db, payload.message, limit=settings.llm_context_docs)
    )

    async def events():
        if canned is not None:
            yield _sse("token", {"text": canned.answer})
            yield _sse("done", _done(canned))
            return

        if not docs:
            yield _sse("token", {"text": FALLBACK.answer})
            yield _sse("done", _done(FALLBACK))
            return

        references, internal_links = collect_sources(docs)
        sources = {
            "references": [r.model_dump() for r in references],
            "internalLinks": [link.model_dump() for link in internal_links],
            "suggestions": suggest(docs, payload.message),
        }

        # Treatment advice is quoted, not generated — see answer_query().
        if not llm.available() or TREATMENT_INTENT.search(payload.message):
            fallback = build_response(docs[0], payload.message)
            yield _sse("token", {"text": fallback.answer})
            yield _sse("done", sources)
            return

        context = llm.build_context(docs, settings.llm_context_docs)
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()
        SENTINEL = object()

        def produce():
            # generate() is blocking, so it runs off the event loop and hands
            # chunks back through the queue.
            try:
                for chunk in llm.stream(context, payload.message, history):
                    loop.call_soon_threadsafe(queue.put_nowait, chunk)
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, SENTINEL)

        loop.run_in_executor(None, produce)

        produced = False
        while True:
            chunk = await queue.get()
            if chunk is SENTINEL:
                break
            produced = True
            yield _sse("token", {"text": chunk})

        if not produced:
            yield _sse("token", {"text": build_response(docs[0], payload.message).answer})
        yield _sse("done", sources)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _done(response) -> dict:
    """The closing frame of a canned reply, in the same shape as a generated one."""
    return {
        "references": [r.model_dump() for r in response.references],
        "internalLinks": [link.model_dump() for link in response.internalLinks],
        "suggestions": response.suggestions,
    }
