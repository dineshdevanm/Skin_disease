import re

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import settings

from app.models import ChatResponse, InternalLink, Reference
from app.services import llm, smalltalk

TREATMENT_INTENT = re.compile(
    r"\btreat(ment|ments|ed|ing)?\b|\bcure[sd]?\b|\bremed(y|ies)\b|\bheal(ing)?\b|\bmanage\b"
    r"|\bfirst\s*aid\b|\bwhat\s*(should|do)\s*i\s*do\b",
    re.IGNORECASE,
)

# Kept as a module-level name because the router and the tests both reach for it.
FALLBACK = smalltalk.NO_MATCH


def _brief(text: str, sentences: int = 2) -> str:
    """First couple of sentences only.

    This is the no-LLM path. Returning a whole knowledge-base entry verbatim is
    what made short questions produce a wall of text, so even the fallback now
    reads like something a chatbot would say.
    """
    parts = re.split(r"(?<=[.!?])\s+", " ".join(text.split()))
    return " ".join(parts[:sentences]).strip()


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", text.lower()).strip()


# Words that carry no topic, so two questions sharing only these are unrelated.
_FILLER = {
    "what", "whats", "which", "how", "why", "when", "who", "where", "is", "are",
    "the", "a", "an", "of", "for", "to", "do", "does", "did", "i", "my", "me",
    "should", "can", "could", "would", "will", "and", "or", "it", "its", "on",
    "in", "about", "there", "you", "your",
}


def _topic_words(text: str) -> set[str]:
    """Content words, truncated so 'treat' and 'treated' count as the same."""
    return {w[:5] for w in _norm(text).split() if w not in _FILLER and len(w) > 2}


def _same_question(chip: str, asked: str) -> bool:
    """True when a chip is just the question that was already answered.

    Substring matching is not enough: "how do i treat melanoma" and "How is
    Melanoma treated?" contain neither one another, yet offering the second
    after the first is a dead end.
    """
    a, b = _topic_words(chip), _topic_words(asked)
    if not a or not b:
        return False
    return len(a & b) / len(a) >= 0.6


def suggest(docs: list[dict], asked: str = "") -> list[str]:
    """Follow-ups drawn from what was actually retrieved, so the chips always
    lead somewhere the knowledge base can answer."""
    out: list[str] = []
    for d in docs[:3]:
        if d.get("type") == "disease":
            name = d.get("name")
            if not name:
                continue
            if d.get("treatment"):
                out.append(f"How is {name} treated?")
            out.append(f"What does {name} look like?")
        elif d.get("question"):
            out.append(d["question"])
    # Three is as many as fit in the widget without wrapping twice. Never offer
    # the question that was just asked back to the reader.
    seen: dict[str, None] = {}
    for q in out:
        if asked and _same_question(q, asked):
            continue
        seen.setdefault(q, None)
    return list(seen)[:3]


async def find_matches(db: AsyncIOMotorDatabase, query: str, limit: int = 3) -> list[dict]:
    """Top matches by MongoDB text score, most relevant first."""
    cursor = (
        db.knowledge_base.find(
            {"$text": {"$search": query}},
            {"score": {"$meta": "textScore"}},
        )
        .sort([("score", {"$meta": "textScore"})])
        .limit(limit)
    )
    return await cursor.to_list(length=limit)


async def find_best_match(db: AsyncIOMotorDatabase, query: str) -> dict | None:
    docs = await find_matches(db, query, limit=1)
    return docs[0] if docs else None


def collect_sources(docs: list[dict]) -> tuple[list[Reference], list[InternalLink]]:
    """References from every document that fed the answer, de-duplicated by URL."""
    refs: dict[str, Reference] = {}
    links: dict[str, InternalLink] = {}
    for d in docs:
        for r in d.get("references", []):
            refs.setdefault(r["url"], Reference(**r))
        for t in (d.get("treatment") or {}).get("references", []):
            refs.setdefault(t["url"], Reference(**t))
        for link in d.get("internalLinks", []):
            links.setdefault(link["to"], InternalLink(**link))
    return list(refs.values())[:4], list(links.values())[:2]


def build_response(doc: dict | None, message: str) -> ChatResponse:
    if doc is None:
        return FALLBACK

    if doc["type"] == "disease":
        treatment = doc.get("treatment")
        if treatment and TREATMENT_INTENT.search(message):
            answer = _brief(" ".join(treatment["firstAid"]) + " " + treatment["seekCare"], 3)
            references = [Reference(**r) for r in treatment.get("references", [])]
            return ChatResponse(answer=answer, references=references, internalLinks=[])

        answer = _brief(doc["summary"] + " " + " ".join(doc["keyPoints"]))
        references = [Reference(**r) for r in doc.get("references", [])]
        return ChatResponse(answer=answer, references=references, internalLinks=[])

    references = [Reference(**r) for r in doc.get("references", [])]
    internal_links = [InternalLink(**link) for link in doc.get("internalLinks", [])]
    return ChatResponse(
        answer=_brief(doc["answer"]), references=references, internalLinks=internal_links
    )


async def answer_query(
    db: AsyncIOMotorDatabase, message: str, history: list[dict] | None = None
) -> ChatResponse:
    """Small talk, then retrieval, then let the LLM phrase an answer from what
    was retrieved.

    Falls back to a short extract of the best-matching document whenever the
    model is disabled, missing, or produces nothing."""
    canned = smalltalk.match(message)
    if canned is not None:
        return canned

    docs = await find_matches(db, message, limit=settings.llm_context_docs)
    if not docs:
        return FALLBACK

    followups = suggest(docs, message)

    # Treatment questions are answered from the knowledge base verbatim, never
    # generated. Asked "how do I treat basal cell carcinoma", the model happily
    # produced "surgical excision, cryotherapy, or topical medications" — true,
    # but nowhere in the retrieved context. Correct-sounding invented treatment
    # advice is the one failure this chatbot cannot ship with, so for these
    # questions the reader is taken out of the loop entirely.
    if TREATMENT_INTENT.search(message):
        return build_response(docs[0], message).model_copy(
            update={"suggestions": followups}
        )

    if llm.available():
        context = llm.build_context(docs, settings.llm_context_docs)
        answer = llm.complete(context, message, history)
        if answer:
            references, internal_links = collect_sources(docs)
            return ChatResponse(
                answer=answer,
                references=references,
                internalLinks=internal_links,
                suggestions=followups,
            )

    return build_response(docs[0], message).model_copy(update={"suggestions": followups})
