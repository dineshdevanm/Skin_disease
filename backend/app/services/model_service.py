"""Prediction pipeline: segment, crop, classify, explain.

Both trained checkpoints are wired in. DeepLabV3-ResNet50 produces the lesion
mask; the lesion is cropped from its background and handed to MedLiT, which
ranks the seven HAM10000 classes and supplies the Grad-CAM view.

Falls back to the previous simulated output whenever a checkpoint is missing or
fails to load, so the API stays usable without the weights present.
"""

import io
import logging
import random

import cv2
import numpy as np
from PIL import Image

from app.models import Explanation, PredictionResponse, PredictionResult
from app.services import classifier, segmentation
from app.services.image_utils import generate_explanation_images, to_data_url

logger = logging.getLogger("dermascan.predict")

# The seven HAM10000 classes the trained classifier outputs, in its own label
# order. Kept here so the mapping is ready the moment the model is wired in.
HAM_CLASSES = ["akiec", "bcc", "bkl", "df", "mel", "nv", "vasc"]

CONDITIONS = [
    {
        "id": "nevus",
        "name": "Melanocytic Nevus",
        "severity": "low",
        "summary": "A common mole made of pigment-producing cells. Usually harmless.",
        "advice": "Keep an eye on any changes in size, shape, or color over time.",
        "reasoning": (
            "The lesion shows a symmetric shape, uniform coloring, and a well-defined border "
            "— patterns typically associated with benign moles."
        ),
    },
    {
        "id": "melanoma",
        "name": "Melanoma",
        "severity": "high",
        "summary": "A serious form of skin cancer that develops in pigment-producing cells.",
        "advice": "See a dermatologist as soon as possible for a professional evaluation.",
        "reasoning": (
            "The lesion shows asymmetry, an irregular border, and uneven color distribution "
            "— patterns the model associates with malignant growths."
        ),
    },
    {
        "id": "bkl",
        "name": "Benign Keratosis",
        "severity": "low",
        "summary": "A non-cancerous skin growth, often appearing with age.",
        "advice": "Generally no treatment needed unless it becomes irritated.",
        "reasoning": (
            'The surface texture appears rough and "stuck-on" with well-demarcated edges, '
            "consistent with benign keratosis patterns."
        ),
    },
    {
        "id": "bcc",
        "name": "Basal Cell Carcinoma",
        "severity": "medium",
        "summary": "The most common type of skin cancer; grows slowly and rarely spreads.",
        "advice": "Consult a dermatologist for confirmation and treatment options.",
        "reasoning": (
            "A pearly, translucent texture and visible surface blood vessels were the dominant "
            "patterns influencing this prediction."
        ),
    },
    {
        "id": "akiec",
        "name": "Actinic Keratosis",
        "severity": "medium",
        "summary": "A rough, scaly patch caused by years of sun exposure.",
        "advice": "Can sometimes progress; a dermatologist visit is recommended.",
        "reasoning": (
            "A rough, scaly texture on sun-exposed skin was the strongest signal contributing "
            "to this prediction."
        ),
    },
]

MAX_DIM = 400


def _fit(bgr: np.ndarray, max_dim: int = MAX_DIM) -> np.ndarray:
    h, w = bgr.shape[:2]
    scale = min(1.0, max_dim / float(max(h, w)))
    if scale == 1.0:
        return bgr
    return cv2.resize(bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def _bgr_to_data_url(bgr: np.ndarray) -> str:
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    return to_data_url(Image.fromarray(rgb))


def _segment(image: Image.Image) -> dict:
    """Run the trained segmentation model. Returns the generated views plus the
    cropped lesion, or an empty dict when the model or the lesion is missing."""
    model = segmentation.get_model()
    if model is None:
        return {}

    rgb = np.array(image.convert("RGB"))
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    h, w = bgr.shape[:2]

    raw = segmentation.predict_mask(model, image)
    mask = segmentation.clean_mask(raw, w, h)
    if mask is None:
        logger.info("Segmentation found no lesion in this image")
        return {"no_lesion": True}

    lesion = segmentation.crop_lesion(bgr, mask)
    overlay = segmentation.overlay_mask(bgr, mask)

    return {
        "no_lesion": False,
        "coverage": segmentation.coverage(mask),
        "crop": lesion,
        "views": {
            "maskUrl": to_data_url(Image.fromarray(_fit(mask))),
            "lesionUrl": _bgr_to_data_url(_fit(lesion)) if lesion.size else None,
            "overlayUrl": _bgr_to_data_url(_fit(overlay)),
        },
    }


def _placeholder_results() -> list[PredictionResult]:
    shuffled = random.sample(CONDITIONS, k=len(CONDITIONS))
    results = [
        PredictionResult(**cond, confidence=max(5, round((1 / (i + 1.5)) * 60 + random.random() * 10)))
        for i, cond in enumerate(shuffled[:3])
    ]
    results.sort(key=lambda r: r.confidence, reverse=True)
    return results


def predict_image(image_bytes: bytes) -> PredictionResponse:
    image = Image.open(io.BytesIO(image_bytes))

    seg = _segment(image)

    if seg.get("views"):
        views = dict(seg["views"])
        crop = seg.get("crop")

        ranked = classifier.classify(crop)
        if ranked:
            # Keep the runners-up, but stop before the near-zero tail.
            results = [PredictionResult(**r) for r in ranked if r["confidence"] >= 1][:4]
            if not results:
                results = [PredictionResult(**ranked[0])]

            cam = classifier.gradcam(crop)
            if cam is not None:
                views["gradcamUrl"] = _bgr_to_data_url(_fit(cam))

            note = (
                "Generated by the trained models: DeepLabV3-ResNet50 for the mask and lesion, "
                "MedLiT for the classification and Grad-CAM. The MedLiT architecture is a "
                "reconstruction from its checkpoint, so treat the confidences as indicative."
            )
            return PredictionResponse(
                results=results,
                explanation=Explanation(available=True, note=note, **views),
            )

        results = _placeholder_results()
        note = (
            "Segmentation is real: the mask, isolated lesion and overlay below come from the "
            "trained DeepLabV3-ResNet50 model. The classifier checkpoint could not be loaded, "
            "so the condition names above are simulated."
        )
        return PredictionResponse(
            results=results, explanation=Explanation(available=False, note=note, **views)
        )

    # No usable segmentation: either no lesion was found, or the weights are absent.
    if seg.get("no_lesion"):
        note = (
            "The segmentation model did not find a lesion in this image. The condition "
            "names below are simulated."
        )
    else:
        note = (
            "The segmentation checkpoint could not be loaded, so the images below are "
            "illustrative placeholders rather than model output."
        )

    generated = generate_explanation_images(image.convert("RGB"))
    return PredictionResponse(
        results=_placeholder_results(),
        explanation=Explanation(available=False, note=note, **generated),
    )
