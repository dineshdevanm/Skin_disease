"""Small local LLM for the chatbot, used strictly as a RAG reader.

The model never answers from its own knowledge. It is handed the documents the
MongoDB text index retrieved and asked to phrase an answer from those alone,
which is what keeps a 0.5B model useful — and safe — on a medical topic.

CPU-only, so generation runs around 5-6 tok/s. Answers are streamed token by
token, which is what makes that feel responsive rather than slow.
"""

from __future__ import annotations

import logging
import re
import threading
from collections.abc import Iterator

import torch

from app.config import settings

logger = logging.getLogger("dermascan.llm")

SYSTEM_PROMPT = (
    "You are DermaScan's skin-health assistant, chatting in a small pop-up "
    "window. Answer in 1-2 short sentences of plain conversational English, "
    "under 45 words. No lists, no headings, no bullet points. Use ONLY the "
    "CONTEXT; never invent facts, figures or sources. Never call a condition "
    "harmless, safe or minor unless the CONTEXT says so, and repeat the "
    "CONTEXT's own classification word for word — a pre-cancerous condition is "
    "not benign. Never name a treatment, medicine or procedure the CONTEXT "
    "does not name. Never diagnose the user "
    "or comment on their own skin. If the CONTEXT does not cover the question, "
    "say so briefly and point to the Disease Library. Tell anyone describing "
    "something worrying on their own skin to see a doctor."
)

# Each retrieved block is clipped to this many characters. Prompt length is what
# the reader waits on before the first word appears, so it is worth policing.
MAX_BLOCK_CHARS = 420

# A chat bubble, not an article. Generation is cut at the first sentence
# boundary past MIN_ANSWER_CHARS once MAX_SENTENCES is reached.
MAX_SENTENCES = 3
MIN_ANSWER_CHARS = 60

_SENTENCE_END = re.compile(r"[.!?](?:\s|$)")


def _sentences(text: str) -> int:
    return len(_SENTENCE_END.findall(text.strip()))

_model = None
_tokenizer = None
_lock = threading.Lock()
_failed = False


def available() -> bool:
    return settings.llm_enabled and not _failed


def _load():
    """Lazy, cached, and never fatal — the chatbot falls back to the retrieved
    text verbatim when the model cannot be loaded."""
    global _model, _tokenizer, _failed
    if _model is not None or _failed:
        return _model, _tokenizer

    with _lock:
        if _model is not None or _failed:
            return _model, _tokenizer
        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer

            name = settings.llm_model
            logger.info("Loading chat model %s", name)
            tok = AutoTokenizer.from_pretrained(name)
            mdl = AutoModelForCausalLM.from_pretrained(name, dtype=torch.float32)
            mdl.eval()
            torch.set_num_threads(settings.torch_threads)
            _tokenizer, _model = tok, mdl
            logger.info("Chat model ready")
        except Exception:
            logger.exception("Could not load the chat model; falling back to retrieval only")
            _failed = True

    return _model, _tokenizer


_HAS_QUESTION_WORD = re.compile(
    r"\b(what|how|why|when|who|where|which|is|are|was|does|do|did|can|could|"
    r"should|would|will|tell|explain|give)\b",
    re.IGNORECASE,
)


def as_question(message: str) -> str:
    """Turn a bare search term into something answerable.

    Someone who types "sun" and hits enter wants a conversation, not a document.
    Handed the noun on its own the model tends to recite the retrieved block
    back; handed a question it answers in its own words, which is the whole
    point of putting a reader in front of the index.
    """
    text = " ".join(message.split())
    if not text or "?" in text or len(text.split()) > 3:
        return text
    if _HAS_QUESTION_WORD.search(text):
        return text
    return f'Briefly, what should someone know about "{text}" in skin health?'


def _clip(text: str, limit: int = MAX_BLOCK_CHARS) -> str:
    """Trim to the last sentence that fits, so a block never ends mid-word."""
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[:limit]
    stop = max(cut.rfind(". "), cut.rfind("? "), cut.rfind("! "))
    return (cut[: stop + 1] if stop > limit * 0.5 else cut.rsplit(" ", 1)[0]).strip()


def warm() -> None:
    """Load the weights ahead of the first request."""
    _load()


def build_context(docs: list[dict], limit: int = 3) -> str:
    """Flatten the retrieved documents into the block the model may quote from."""
    parts: list[str] = []
    for i, d in enumerate(docs[:limit], 1):
        if d.get("type") == "disease":
            # Clipped separately. Folding treatment onto the end of one long
            # string and clipping the whole thing meant treatment was always the
            # first casualty, so "how do I treat X" got an answer with no
            # treatment in it.
            body = _clip(" ".join([d.get("summary", ""), *d.get("keyPoints", [])]), 280)
            treatment = d.get("treatment") or {}
            if treatment:
                # seekCare is the "go and see someone" line and is never
                # dropped; only the first-aid detail is allowed to be trimmed.
                body += " Treatment: " + _clip(" ".join(treatment.get("firstAid", [])), 180)
                body += " " + treatment.get("seekCare", "")
            # Spelled out as a sentence, not a parenthetical: a 0.5B model
            # skipped "(Pre-cancerous)" and called actinic keratosis benign.
            category = d.get("category") or ""
            head = f"[{i}] {d.get('name', 'Condition')}"
            head += f" is classified as {category}. " if category else ": "
            parts.append(head + body)
        else:
            parts.append(f"[{i}] {d.get('question', 'Topic')}: " + _clip(d.get("answer", "")))
    return "\n\n".join(parts).strip()


def _messages(context: str, message: str, history: list[dict] | None) -> list[dict]:
    msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
    # A couple of prior turns is enough to resolve "it" and "that one" without
    # crowding out the context on a small model.
    for turn in (history or [])[-2:]:
        role = "assistant" if turn.get("role") == "bot" else "user"
        text = (turn.get("text") or "").strip()
        if text:
            msgs.append({"role": role, "content": _clip(text, 260)})
    question = as_question(message)
    msgs.append({"role": "user", "content": f"CONTEXT:\n{context}\n\nQUESTION: {question}"})
    return msgs


def stream(context: str, message: str, history: list[dict] | None = None) -> Iterator[str]:
    """Yield the answer in chunks as the model produces it."""
    model, tok = _load()
    if model is None:
        return

    from transformers import TextIteratorStreamer

    inputs = tok.apply_chat_template(
        _messages(context, message, history),
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
    )

    streamer = TextIteratorStreamer(tok, skip_prompt=True, skip_special_tokens=True)
    kwargs = dict(
        **inputs,
        streamer=streamer,
        max_new_tokens=settings.llm_max_tokens,
        do_sample=False,          # deterministic: same question, same answer
        repetition_penalty=1.05,
        pad_token_id=tok.eos_token_id,
    )

    thread = threading.Thread(target=_generate, args=(model, kwargs), daemon=True)
    thread.start()

    # A 0.5B model treats "1-2 sentences" as a suggestion, so the cap is
    # enforced here instead of asked for. Stopping on a sentence boundary keeps
    # the answer whole, which truncating by token count would not.
    emitted = ""
    for chunk in streamer:
        if not chunk:
            continue
        emitted += chunk
        yield chunk
        if len(emitted) >= MIN_ANSWER_CHARS and _sentences(emitted) >= MAX_SENTENCES:
            break
    thread.join(timeout=1)


def _generate(model, kwargs) -> None:
    try:
        with torch.no_grad():
            model.generate(**kwargs)
    except Exception:
        logger.exception("Generation failed")


def complete(context: str, message: str, history: list[dict] | None = None) -> str | None:
    """Non-streaming convenience wrapper, for the plain JSON endpoint."""
    text = "".join(stream(context, message, history)).strip()
    return text or None
