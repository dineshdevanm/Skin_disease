"""Conversational layer in front of retrieval.

The knowledge base answers questions about skin. It cannot answer "hi",
"thanks" or "who are you" — asked those, the text index returns nothing and the
chatbot falls back to a paragraph of instructions, which is what made it feel
like a lookup table rather than something you talk to.

These replies are matched before retrieval runs, so they are also instant: no
database round trip, no generation.
"""

from __future__ import annotations

import re

from app.models import ChatResponse, InternalLink

LIBRARY = InternalLink(label="Browse the Disease Library", to="/diseases")
SCAN = InternalLink(label="Scan a photo", to="/upload")

# What someone can usefully ask next. Shown as tappable chips.
OPENERS = [
    "What is melanoma?",
    "How do I protect my skin from the sun?",
    "When should I see a dermatologist?",
]


def _intent(patterns: str) -> re.Pattern[str]:
    return re.compile(patterns, re.IGNORECASE)


GREETING = _intent(r"^(hi|hii+|hey+|hello+|yo|hiya|sup|howdy|namaste|good (morning|afternoon|evening|day))\b")
THANKS = _intent(r"\b(thanks|thank you|thx|ty|cheers|appreciate it|thank u)\b")
BYE = _intent(r"\b(bye|goodbye|good ?bye|see ya|see you|cya|good night|gn)\b")
IDENTITY = _intent(r"\b(who are you|who r u|what are you|whats your name|what is your name|your name|are you (a |an )?(human|bot|robot|real|doctor|person|ai|chatgpt))\b")
CAPABILITY = _intent(r"\b(what can you do|what do you do|what can i ask|how can you help|how do you help|what are you for|^help$)\b")
HOW_ARE_YOU = _intent(r"\b(how are you|how r u|hows it going|how do you do|whats up|wassup)\b")

# Deliberately narrow: first person about their own skin. "Is that one
# dangerous?" is a real question about a condition and must still reach
# retrieval, so nothing here may match it.
PERSONAL = _intent(
    r"\b(do i have|have i got|am i going to|will i die|is my \w+|my (mole|rash|spot|skin|lesion|bump|patch) (is|looks|has|hurts|itches)"
    r"|do you think i|can you (diagnose|tell me what i)|whats wrong with (me|my))\b"
)

# "Is a mole on my arm bad?" slips past the patterns above, and the model will
# cheerfully answer "yes, that could be concerning" — a verdict on someone's own
# skin, which is exactly what this assistant must not give. So: first person,
# plus something on the body, plus a request for a verdict.
#
# All three are required because "how do I protect my skin from the sun?" has the
# first two and is a perfectly ordinary question.
FIRST_PERSON = _intent(r"\b(my|mine|i have|i've got|ive got|on me|myself|i)\b")
BODY = _intent(
    r"\b(mole|moles|spot|spots|skin|rash|lesion|bump|patch|freckle|growth|sore|mark|"
    r"wart|arm|leg|face|back|hand|neck|scalp|nose|chest|shoulder|thing)\b"
)
VERDICT = _intent(
    r"\b(bad|serious|dangerous|cancer|cancerous|malignant|melanoma|worry|worried|"
    r"worrying|normal|ok|okay|fine|wrong|scary|concern(ed|ing)?|harmful|deadly)\b"
)


def _wants_a_verdict(text: str) -> bool:
    return bool(FIRST_PERSON.search(text) and BODY.search(text) and VERDICT.search(text))


# Checked before ORDER so a greeting glued to a real question is not swallowed.
ORDER = [
    ("thanks", THANKS),
    ("bye", BYE),
    ("identity", IDENTITY),
    ("capability", CAPABILITY),
    ("how_are_you", HOW_ARE_YOU),
    ("greeting", GREETING),
]

REPLIES: dict[str, ChatResponse] = {
    "greeting": ChatResponse(
        answer="Hey! Ask me anything about skin conditions, moles or sun safety.",
        internalLinks=[],
        suggestions=OPENERS,
    ),
    "thanks": ChatResponse(
        answer="Happy to help. Anything else about your skin you want to know?",
        internalLinks=[],
        suggestions=[],
    ),
    "bye": ChatResponse(
        answer="Take care — and keep an eye on anything that changes.",
        internalLinks=[],
        suggestions=[],
    ),
    "how_are_you": ChatResponse(
        answer="Doing fine, thanks! What would you like to know about skin health?",
        internalLinks=[],
        suggestions=OPENERS,
    ),
    "identity": ChatResponse(
        answer=(
            "I'm DermaScan's skin-health assistant — a small AI that answers from "
            "our own reference library. I'm not a doctor, so I can't diagnose anyone."
        ),
        internalLinks=[LIBRARY],
        suggestions=OPENERS,
    ),
    "capability": ChatResponse(
        answer=(
            "I can explain the skin conditions in our library, how they're treated, "
            "sun protection, and when a spot is worth showing a dermatologist."
        ),
        internalLinks=[LIBRARY, SCAN],
        suggestions=OPENERS,
    ),
}

# Shown when the text index matched nothing. Short, and it names what I actually
# cover rather than scolding the reader for asking.
NO_MATCH = ChatResponse(
    answer=(
        "I don't know that one — I only cover skin conditions, moles, sun safety "
        "and when to see a dermatologist. Try asking about one of those."
    ),
    internalLinks=[LIBRARY],
    suggestions=OPENERS,
)

PERSONAL_REPLY = ChatResponse(
    answer=(
        "I can't tell you what's on your own skin — only a dermatologist can do "
        "that. If something is new, changing, itching or bleeding, get it looked "
        "at. You can also run a photo through a scan for a preliminary read."
    ),
    internalLinks=[SCAN, LIBRARY],
    suggestions=["What is the ABCDE rule?", "When should I see a dermatologist?"],
)


FILLER = _intent(
    r"\b(there|again|please|pls|mate|buddy|bot|dermascan|everyone|guys|so much|a lot|very much|much|and|you|u)\b"
)


def _is_only(message: str, pattern: re.Pattern[str]) -> bool:
    """True when the message is the pleasantry and nothing more.

    "hi" is a greeting; "hi, what is melanoma?" is a question with a greeting
    attached, and must go to retrieval. So the match is removed, padding words
    like "there" and "so much" go with it, and whatever is left is checked for
    actual content.
    """
    rest = FILLER.sub(" ", pattern.sub(" ", message))
    return len(re.sub(r"[^a-z]", "", rest.lower())) < 3


def match(message: str) -> ChatResponse | None:
    """A canned reply when the message is small talk, otherwise None."""
    text = " ".join(message.split())
    if not text:
        return None

    if PERSONAL.search(text) or _wants_a_verdict(text):
        return PERSONAL_REPLY

    for name, pattern in ORDER:
        if pattern.search(text) and _is_only(text, pattern):
            return REPLIES[name]
    return None
