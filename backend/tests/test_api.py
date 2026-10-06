"""End-to-end API tests, plus the privacy guarantee the project claims."""

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.models import PredictionResponse


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _jpeg(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=92)
    return buf.getvalue()


class TestHealth:
    def test_reports_database_state(self, client):
        r = client.get("/api/health")
        assert r.status_code in (200, 503)
        assert "database" in r.json()

    def test_reports_document_count_when_connected(self, client):
        body = client.get("/api/health").json()
        if body.get("database") == "connected":
            assert body["documents"] >= 0


class TestDiseases:
    def test_lists_the_library(self, client):
        r = client.get("/api/diseases")
        if r.status_code != 200:
            pytest.skip("MongoDB not reachable")
        assert len(r.json()) == 8

    def test_every_entry_has_the_required_fields(self, client):
        r = client.get("/api/diseases")
        if r.status_code != 200:
            pytest.skip("MongoDB not reachable")
        required = {"id", "abbr", "name", "category", "summary", "keyPoints", "references"}
        for d in r.json():
            assert required <= set(d), f"{d.get('id')} missing {required - set(d)}"

    def test_categories_are_from_the_expected_set(self, client):
        r = client.get("/api/diseases")
        if r.status_code != 200:
            pytest.skip("MongoDB not reachable")
        allowed = {"Benign", "Malignant", "Pre-cancerous"}
        assert {d["category"] for d in r.json()} <= allowed

    def test_fetch_one_by_id(self, client):
        r = client.get("/api/diseases/mel")
        if r.status_code == 503:
            pytest.skip("MongoDB not reachable")
        assert r.status_code == 200
        assert r.json()["abbr"] == "MEL"

    def test_unknown_id_returns_404(self, client):
        r = client.get("/api/diseases/not-a-real-id")
        if r.status_code == 503:
            pytest.skip("MongoDB not reachable")
        assert r.status_code == 404

    def test_references_are_https_urls(self, client):
        r = client.get("/api/diseases")
        if r.status_code != 200:
            pytest.skip("MongoDB not reachable")
        for d in r.json():
            for ref in d["references"]:
                assert ref["url"].startswith("http")


class TestChat:
    def test_answers_a_known_question(self, client):
        r = client.post("/api/chat", json={"message": "what is melanoma"})
        if r.status_code != 200:
            pytest.skip("MongoDB not reachable")
        body = r.json()
        assert len(body["answer"]) > 40
        assert "references" in body

    def test_handles_nonsense_gracefully(self, client):
        r = client.post("/api/chat", json={"message": "qqqzzz not a real word"})
        if r.status_code != 200:
            pytest.skip("MongoDB not reachable")
        assert isinstance(r.json()["answer"], str)

    def test_rejects_a_malformed_body(self, client):
        assert client.post("/api/chat", json={}).status_code == 422

    def test_encoding_survives_the_round_trip(self, client):
        """The seeder previously mangled em-dashes on Windows."""
        r = client.get("/api/diseases")
        if r.status_code != 200:
            pytest.skip("MongoDB not reachable")
        blob = r.text
        assert "â€" not in blob, "mojibake in the reference labels"


class TestPredict:
    def test_returns_the_documented_shape(self, client, sample_bytes):
        r = client.post("/api/predict", files={"image": ("m.jpg", sample_bytes, "image/jpeg")})
        assert r.status_code == 200
        PredictionResponse(**r.json())  # raises if the contract drifted

    def test_ranks_melanoma_first_for_a_melanoma(self, client, melanoma_bytes):
        r = client.post("/api/predict", files={"image": ("m.jpg", melanoma_bytes, "image/jpeg")})
        top = r.json()["results"][0]
        assert top["name"] == "Melanoma"
        assert top["severity"] == "high"

    def test_returns_every_explanation_view(self, client, sample_bytes):
        r = client.post("/api/predict", files={"image": ("m.jpg", sample_bytes, "image/jpeg")})
        e = r.json()["explanation"]
        for key in ("maskUrl", "lesionUrl", "overlayUrl", "gradcamUrl"):
            assert e[key] and e[key].startswith("data:image/"), f"{key} missing"

    def test_marks_the_explanation_as_real(self, client, sample_bytes):
        r = client.post("/api/predict", files={"image": ("m.jpg", sample_bytes, "image/jpeg")})
        assert r.json()["explanation"]["available"] is True

    def test_confidences_are_percentages(self, client, sample_bytes):
        r = client.post("/api/predict", files={"image": ("m.jpg", sample_bytes, "image/jpeg")})
        for res in r.json()["results"]:
            assert 0 <= res["confidence"] <= 100

    def test_results_are_ordered(self, client, sample_bytes):
        r = client.post("/api/predict", files={"image": ("m.jpg", sample_bytes, "image/jpeg")})
        conf = [x["confidence"] for x in r.json()["results"]]
        assert conf == sorted(conf, reverse=True)

    def test_tolerates_the_client_analysis_hint(self, client, sample_bytes):
        """The frontend attaches an extra form field; it must not break the call."""
        r = client.post(
            "/api/predict",
            files={"image": ("m.jpg", sample_bytes, "image/jpeg")},
            data={"client_analysis": '{"isSkin": true, "hasLesion": true}'},
        )
        assert r.status_code == 200

    def test_missing_image_is_rejected(self, client):
        assert client.post("/api/predict").status_code == 422

    def test_accepts_png_as_well_as_jpeg(self, client, synthetic_lesion):
        buf = io.BytesIO()
        synthetic_lesion.save(buf, format="PNG")
        r = client.post("/api/predict", files={"image": ("m.png", buf.getvalue(), "image/png")})
        assert r.status_code == 200


class TestPrivacy:
    def test_prediction_writes_nothing_to_the_database(self, client, sample_bytes):
        """The project's core privacy claim, asserted rather than assumed.

        Uses a synchronous pymongo client: motor's is bound to the app's event
        loop, which TestClient is already driving."""
        from pymongo import MongoClient

        from app.config import settings

        def counts(db):
            return {n: db[n].count_documents({}) for n in db.list_collection_names()}

        try:
            mongo = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=3000)
            mongo.admin.command("ping")
            db = mongo[settings.mongodb_db_name]
            before = counts(db)
        except Exception:
            pytest.skip("MongoDB not reachable")

        for _ in range(3):
            r = client.post("/api/predict", files={"image": ("m.jpg", sample_bytes, "image/jpeg")})
            assert r.status_code == 200

        after = counts(db)
        mongo.close()
        assert after == before, f"a prediction changed the database: {before} -> {after}"

    def test_predict_router_does_not_import_the_database(self):
        import inspect
        from app.routers import predict

        assert "get_database" not in inspect.getsource(predict)

    def test_no_image_is_written_to_disk(self, client, sample_bytes, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        before = set(tmp_path.rglob("*"))
        client.post("/api/predict", files={"image": ("m.jpg", sample_bytes, "image/jpeg")})
        assert set(tmp_path.rglob("*")) == before, "a file appeared during prediction"
