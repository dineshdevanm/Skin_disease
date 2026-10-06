"""Chatbot: RAG prompt construction, grounding, streaming and the fallback."""

import json

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.services import llm, retrieval, smalltalk


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


DOCS = [
    {
        "type": "disease",
        "name": "Melanoma",
        "category": "Malignant",
        "summary": "A serious skin cancer arising from pigment-producing cells.",
        "keyPoints": ["Often identified using the ABCDE rule.", "Early removal improves outcomes."],
        "treatment": {"firstAid": ["Do not pick at it."], "seekCare": "See a dermatologist."},
    },
    {"type": "topic", "question": "Sun protection", "answer": "Use SPF 30 or higher."},
]


class TestContextBuilding:
    def test_includes_every_document_up_to_the_limit(self):
        ctx = llm.build_context(DOCS, limit=2)
        assert "Melanoma" in ctx and "Sun protection" in ctx

    def test_respects_the_limit(self):
        assert "Sun protection" not in llm.build_context(DOCS, limit=1)

    def test_numbers_each_block(self):
        ctx = llm.build_context(DOCS, limit=2)
        assert ctx.startswith("[1]") and "[2]" in ctx

    def test_folds_treatment_into_the_disease_block(self):
        assert "dermatologist" in llm.build_context(DOCS, limit=1)

    def test_blocks_are_clipped(self):
        """Prompt length drives first-token latency, so blocks must be bounded."""
        big = [{"type": "topic", "question": "Q", "answer": "word " * 500}]
        block = llm.build_context(big, limit=1)
        assert len(block) < llm.MAX_BLOCK_CHARS + 60

    def test_clipping_does_not_break_a_word(self):
        clipped = llm._clip("alpha beta gamma delta epsilon zeta", limit=20)
        assert not clipped.endswith("-")
        assert all(w in "alpha beta gamma delta epsilon zeta" for w in clipped.split())


class TestPromptAssembly:
    def test_system_prompt_forbids_diagnosis(self):
        assert "never diagnose" in llm.SYSTEM_PROMPT.lower()

    def test_system_prompt_confines_the_model_to_context(self):
        assert "only the context" in llm.SYSTEM_PROMPT.lower()

    def test_context_and_question_reach_the_model(self):
        msgs = llm._messages("CTX", "what is it?", None)
        assert msgs[0]["role"] == "system"
        assert "CTX" in msgs[-1]["content"] and "what is it?" in msgs[-1]["content"]

    def test_history_is_included_as_turns(self):
        history = [{"role": "user", "text": "hi"}, {"role": "bot", "text": "hello"}]
        roles = [m["role"] for m in llm._messages("CTX", "q", history)]
        assert "assistant" in roles

    def test_history_is_capped(self):
        history = [{"role": "user", "text": f"turn {i}"} for i in range(10)]
        # system + at most 2 history turns + the question
        assert len(llm._messages("CTX", "q", history)) <= 4

    def test_empty_history_turns_are_dropped(self):
        msgs = llm._messages("CTX", "q", [{"role": "user", "text": "   "}])
        assert len(msgs) == 2


class TestChatEndpoint:
    def test_answers_a_known_question(self, client):
        r = client.post("/api/chat", json={"message": "what is melanoma"})
        if r.status_code != 200:
            pytest.skip("MongoDB not reachable")
        body = r.json()
        assert len(body["answer"]) > 40
        assert body["references"], "an answer should carry its sources"

    def test_accepts_conversation_history(self, client):
        r = client.post("/api/chat", json={
            "message": "is that serious?",
            "history": [
                {"role": "user", "text": "what is melanoma?"},
                {"role": "bot", "text": "Melanoma is a serious skin cancer."},
            ],
        })
        if r.status_code != 200:
            pytest.skip("MongoDB not reachable")
        assert len(r.json()["answer"]) > 10

    def test_history_is_optional(self, client):
        r = client.post("/api/chat", json={"message": "what is melanoma"})
        assert r.status_code in (200, 503)

    def test_rejects_a_malformed_history(self, client):
        r = client.post("/api/chat", json={"message": "hi", "history": [{"role": "user"}]})
        assert r.status_code == 422

    def test_answer_is_grounded_not_invented(self, client):
        """The retrieved documents never mention a brand-name drug, so the
        model must not produce one."""
        r = client.post("/api/chat", json={"message": "what is melanoma"})
        if r.status_code != 200:
            pytest.skip("MongoDB not reachable")
        answer = r.json()["answer"].lower()
        for invented in ("mg", "dosage", "prescription", "buy", "$"):
            assert invented not in answer, f"answer contains invented detail: {invented}"


class TestStreaming:
    def _collect(self, client, message):
        chunks, sources = [], None
        with client.stream("POST", "/api/chat/stream", json={"message": message}) as s:
            assert s.status_code == 200
            for line in s.iter_lines():
                if line.startswith("data:"):
                    d = json.loads(line[5:])
                    if "text" in d:
                        chunks.append(d["text"])
                    elif "references" in d:
                        sources = d
        return chunks, sources

    def test_streams_the_answer_in_pieces(self, client):
        chunks, _ = self._collect(client, "what is basal cell carcinoma")
        if not chunks:
            pytest.skip("MongoDB not reachable")
        assert len(chunks) > 1, "answer arrived as a single blob, not a stream"

    def test_chunks_reassemble_into_the_answer(self, client):
        chunks, _ = self._collect(client, "what is melanoma")
        if not chunks:
            pytest.skip("MongoDB not reachable")
        assert len("".join(chunks).strip()) > 40

    def test_sources_arrive_at_the_end(self, client):
        _, sources = self._collect(client, "what is melanoma")
        if sources is None:
            pytest.skip("MongoDB not reachable")
        assert "references" in sources and "internalLinks" in sources

    def test_uses_server_sent_events(self, client):
        with client.stream("POST", "/api/chat/stream", json={"message": "hi"}) as s:
            assert "text/event-stream" in s.headers["content-type"]


class TestFallback:
    def test_falls_back_to_retrieval_when_the_model_is_off(self, client, monkeypatch):
        """Disabling the LLM must still produce a usable answer, not an error."""
        monkeypatch.setattr(settings, "llm_enabled", False)
        r = client.post("/api/chat", json={"message": "what is melanoma"})
        if r.status_code != 200:
            pytest.skip("MongoDB not reachable")
        assert len(r.json()["answer"]) > 40

    def test_unmatched_question_returns_the_guidance_answer(self, client):
        r = client.post("/api/chat", json={"message": "zzzqqq vvvxxx"})
        if r.status_code != 200:
            pytest.skip("MongoDB not reachable")
        assert isinstance(r.json()["answer"], str)

class TestSmallTalk:
    """A text index cannot answer "hi". These replies bypass it entirely."""

    @pytest.mark.parametrize("message", [
        "hi", "hey!", "hello there", "good morning",
        "thanks", "thank you very much", "thanks a lot",
        "bye", "see you",
        "who are you", "are you a doctor", "what can you do", "how are you",
    ])
    def test_pleasantries_get_a_short_reply(self, message):
        reply = smalltalk.match(message)
        assert reply is not None, f"{message!r} fell through to retrieval"
        assert len(reply.answer) < 220, "a greeting should not be a paragraph"

    @pytest.mark.parametrize("message", [
        "hi, what is melanoma?",
        "thanks, is melanoma curable?",
        "hello what is a nevus",
        "is that one dangerous?",
        "what is sun damage",
        "melanoma",
        "sun",
    ])
    def test_real_questions_reach_retrieval(self, message):
        assert smalltalk.match(message) is None

    @pytest.mark.parametrize("message", [
        "do i have cancer",
        "is my mole bad",
        "can you diagnose me",
        "whats wrong with my skin",
    ])
    def test_personal_questions_are_referred_to_a_doctor(self, message):
        reply = smalltalk.match(message)
        assert reply is not None
        assert "dermatologist" in reply.answer.lower()

    def test_identity_does_not_claim_to_be_a_doctor(self):
        answer = smalltalk.match("are you a doctor").answer.lower()
        assert "not a doctor" in answer

    def test_greeting_offers_somewhere_to_start(self):
        assert smalltalk.match("hi").suggestions

    def test_no_match_reply_is_short(self):
        """The old fallback was a paragraph of instructions, which is what made
        an unmatched question feel like an error message."""
        assert len(smalltalk.NO_MATCH.answer) < 200


class TestQuestionNormalisation:
    def test_a_bare_keyword_becomes_a_question(self):
        """Someone typing "sun" wants a conversation, not the document."""
        assert llm.as_question("sun") != "sun"
        assert "sun" in llm.as_question("sun")

    @pytest.mark.parametrize("message", [
        "what is melanoma",
        "how do I treat it?",
        "is that one dangerous?",
        "tell me about moles",
    ])
    def test_real_questions_are_left_alone(self, message):
        assert llm.as_question(message) == message

    def test_a_long_phrase_is_left_alone(self):
        msg = "sun protection for children with fair skin"
        assert llm.as_question(msg) == msg


class TestBrevity:
    def test_prompt_asks_for_one_or_two_sentences(self):
        assert "1-2 short sentences" in llm.SYSTEM_PROMPT

    def test_prompt_forbids_lists(self):
        assert "no lists" in llm.SYSTEM_PROMPT.lower()

    def test_fallback_extract_is_not_the_whole_document(self):
        doc = {
            "type": "topic",
            "question": "Q",
            "answer": "One. Two. Three. Four. Five.",
        }
        assert retrieval.build_response(doc, "q").answer == "One. Two."

    def test_disease_fallback_is_trimmed(self):
        answer = retrieval.build_response(DOCS[0], "what is melanoma").answer
        assert answer.count(".") <= 3, f"fallback is still a wall of text: {answer}"


class TestFollowUps:
    def test_suggestions_come_from_the_retrieved_documents(self):
        chips = retrieval.suggest(DOCS)
        assert chips
        assert any("Melanoma" in c for c in chips)

    def test_a_disease_with_treatment_offers_the_treatment_question(self):
        assert any("treated" in c for c in retrieval.suggest(DOCS))

    def test_the_question_just_asked_is_not_offered_back(self):
        chips = retrieval.suggest(DOCS, "How is Melanoma treated?")
        assert not any("How is Melanoma treated?" == c for c in chips)

    def test_a_reworded_version_of_the_question_is_not_offered_back(self):
        """"how do i treat melanoma" and "How is Melanoma treated?" contain
        neither one another, so substring matching let this through."""
        chips = retrieval.suggest(DOCS, "how do i treat melanoma")
        assert not any("treated" in c for c in chips), chips

    def test_a_genuinely_different_follow_up_survives(self):
        chips = retrieval.suggest(DOCS, "what is melanoma")
        assert any("treated" in c for c in chips), chips

    def test_at_most_three(self):
        assert len(retrieval.suggest(DOCS * 4)) <= 3

    def test_answers_carry_follow_ups(self, client):
        r = client.post("/api/chat", json={"message": "what is melanoma"})
        if r.status_code != 200:
            pytest.skip("MongoDB not reachable")
        assert r.json()["suggestions"]


class TestSmallTalkOverTheWire:
    def test_greeting_is_answered_without_retrieval(self, client):
        """No database, no model — so this must work even with Mongo down."""
        r = client.post("/api/chat", json={"message": "hi"})
        assert r.status_code == 200
        assert len(r.json()["answer"]) < 220

    def test_greeting_streams_the_canned_reply(self, client):
        chunks, sources = TestStreaming()._collect(client, "hello")
        assert "".join(chunks).strip()
        assert sources is not None and "suggestions" in sources

class TestTreatmentIsQuotedNotGenerated:
    """The model invented "surgical excision, cryotherapy, or topical
    medications" for basal cell carcinoma — accurate, but absent from the
    retrieved context. Treatment answers now bypass generation entirely."""

    def test_treatment_intent_is_recognised(self):
        for q in ["how do i treat melanoma", "what should i do about it",
                  "is there a cure for bcc", "first aid for a lesion"]:
            assert retrieval.TREATMENT_INTENT.search(q), q

    def test_a_plain_question_is_not_treatment_intent(self):
        for q in ["what is melanoma", "is melanoma dangerous", "what causes moles"]:
            assert not retrieval.TREATMENT_INTENT.search(q), q

    def test_the_answer_is_the_knowledge_base_text(self, client):
        r = client.post("/api/chat", json={"message": "how do i treat melanoma"})
        if r.status_code != 200:
            pytest.skip("MongoDB not reachable")
        answer = r.json()["answer"]
        assert "Don't attempt to treat" in answer or "do not" in answer.lower(), answer

    def test_it_does_not_wait_on_the_model(self, client):
        """No generation means no multi-second wait."""
        import time
        start = time.time()
        r = client.post("/api/chat", json={"message": "how do i treat melanoma"})
        if r.status_code != 200:
            pytest.skip("MongoDB not reachable")
        assert time.time() - start < 2.5


class TestGroundingRules:
    def test_prompt_forbids_unnamed_treatments(self):
        assert "never name a treatment" in llm.SYSTEM_PROMPT.lower()

    def test_prompt_pins_the_classification(self):
        assert "pre-cancerous condition is not benign" in llm.SYSTEM_PROMPT.lower()

    def test_the_category_is_a_sentence_not_a_parenthetical(self):
        """"(Pre-cancerous)" was skipped by the model, which then called actinic
        keratosis benign."""
        ctx = llm.build_context([{
            "type": "disease", "name": "Actinic Keratosis", "category": "Pre-cancerous",
            "summary": "Rough scaly patch.", "keyPoints": [],
        }], limit=1)
        assert "is classified as Pre-cancerous" in ctx

    def test_treatment_survives_clipping(self):
        """Folded onto one long string, treatment was always clipped away
        first, so treatment questions got answers with no treatment in them."""
        doc = {
            "type": "disease", "name": "X", "category": "Benign",
            "summary": "word " * 200, "keyPoints": ["point " * 80],
            "treatment": {"firstAid": ["Keep it clean."], "seekCare": "See a doctor."},
        }
        ctx = llm.build_context([doc], limit=1)
        assert "Keep it clean." in ctx
        assert "See a doctor." in ctx


class TestAnswerLength:
    def test_sentence_counter(self):
        assert llm._sentences("One. Two! Three?") == 3
        assert llm._sentences("No terminator here") == 0

    def test_cap_is_a_chat_bubble_not_an_article(self):
        assert llm.MAX_SENTENCES <= 3

    def test_answers_stay_short(self, client):
        r = client.post("/api/chat", json={"message": "what is melanoma"})
        if r.status_code != 200:
            pytest.skip("MongoDB not reachable")
        answer = r.json()["answer"]
        assert llm._sentences(answer) <= llm.MAX_SENTENCES + 1, answer
        assert len(answer.split()) < 90, f"{len(answer.split())} words: {answer}"
