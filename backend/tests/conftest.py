"""Shared fixtures.

Model loading is expensive, so the checkpoints are loaded once per session and
shared. Tests that need weights skip cleanly when the files are absent, so the
suite still runs on a machine without them.

Two image fixtures, deliberately separate:

* `sample_bytes` always yields something — a real dermoscopy photo if one has
  been dropped in `fixtures/`, otherwise a synthetic lesion. Structural tests
  (shapes, dtypes, API contract) use this, so they always run.
* `melanoma_bytes` yields only a real, confirmed melanoma. The known-answer
  tests use it and skip without one, because "predicts mel" means nothing
  against a drawn circle.
"""

import io
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFilter

from app.config import settings

FIXTURES = Path(__file__).parent / "fixtures"
# Drop a confirmed melanoma photo here to enable the known-answer tests.
SAMPLE = FIXTURES / "melanoma.jpg"


def _synthetic_lesion() -> Image.Image:
    """Skin-toned field with one irregular dark blob, lightly textured so the
    segmentation model has an edge to find."""
    rng = np.random.default_rng(7)
    w, h = 600, 450
    base = np.zeros((h, w, 3), np.uint8)
    base[:, :] = (198, 150, 120)
    base = base + rng.normal(0, 7, base.shape)
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))

    draw = ImageDraw.Draw(img)
    cx, cy = w // 2, h // 2
    draw.ellipse((cx - 95, cy - 78, cx + 88, cy + 85), fill=(74, 56, 52))
    draw.ellipse((cx - 30, cy - 62, cx + 70, cy + 20), fill=(58, 42, 40))
    return img.filter(ImageFilter.GaussianBlur(1.2))


@pytest.fixture(scope="session")
def sample_bytes() -> bytes:
    """A lesion image that is always available."""
    if SAMPLE.exists():
        return SAMPLE.read_bytes()
    buf = io.BytesIO()
    _synthetic_lesion().save(buf, format="JPEG", quality=94)
    return buf.getvalue()


@pytest.fixture(scope="session")
def sample_image(sample_bytes) -> Image.Image:
    return Image.open(io.BytesIO(sample_bytes)).convert("RGB")


@pytest.fixture(scope="session")
def melanoma_bytes() -> bytes:
    """A real, confirmed melanoma. Required for the known-answer tests."""
    if not SAMPLE.exists():
        pytest.skip(
            f"no real lesion photo at {SAMPLE} — known-answer tests need one"
        )
    return SAMPLE.read_bytes()


@pytest.fixture(scope="session")
def seg_model():
    if not settings.segmentation_model_path.exists():
        pytest.skip("segmentation checkpoint not present")
    from app.services import segmentation

    model = segmentation.get_model()
    if model is None:
        pytest.skip("segmentation checkpoint failed to load")
    return model


@pytest.fixture(scope="session")
def cls_model():
    if not settings.classifier_model_path.exists():
        pytest.skip("classifier checkpoint not present")
    from app.services import classifier

    model = classifier.get_model()
    if model is None:
        pytest.skip("classifier checkpoint failed to load")
    return model


@pytest.fixture(scope="session")
def lesion_crop(seg_model, sample_image):
    """The background-removed lesion the classifier actually receives."""
    import cv2

    from app.services import segmentation

    bgr = cv2.cvtColor(np.array(sample_image), cv2.COLOR_RGB2BGR)
    h, w = bgr.shape[:2]
    raw = segmentation.predict_mask(seg_model, sample_image)
    mask = segmentation.clean_mask(raw, w, h)
    assert mask is not None, "segmentation found no lesion in the sample"
    return segmentation.crop_lesion(bgr, mask), mask


@pytest.fixture
def blank_image() -> Image.Image:
    """Flat mid-grey: no lesion, no structure for the model to latch onto."""
    return Image.new("RGB", (400, 300), (128, 128, 128))


@pytest.fixture
def synthetic_lesion() -> Image.Image:
    """Skin-toned field with one dark blob, for shape-level assertions."""
    img = Image.new("RGB", (400, 300), (198, 150, 120))
    ImageDraw.Draw(img).ellipse((160, 110, 240, 190), fill=(70, 54, 50))
    return img
