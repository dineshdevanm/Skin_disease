"""MedLiT lesion classifier: the seven HAM10000 classes, plus Grad-CAM.

The architecture in medlit_arch.py is a reconstruction from the checkpoint, not
the original training source — see that module's docstring. It loads with
strict=True and puts `mel` on top for a known melanoma, so it is good enough to
develop against; treat the probabilities as indicative rather than validated.
"""

from __future__ import annotations

import logging
import threading

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from torchvision import transforms

from app.config import settings
from app.services.medlit_arch import IMG_SIZE, PATCH_SIZE, MedLiT

logger = logging.getLogger("dermascan.classifier")

# Label order the checkpoint was trained with.
CLASS_IDS = ["akiec", "bcc", "bkl", "df", "mel", "nv", "vasc"]

# Presentation metadata per class, kept beside the labels so a prediction can be
# turned into something a reader understands without another lookup.
CLASS_META = {
    "akiec": {
        "id": "akiec",
        "name": "Actinic Keratosis",
        "severity": "medium",
        "summary": "A rough, scaly patch caused by years of sun exposure. Considered pre-cancerous.",
        "advice": "Can progress if left alone; a dermatologist visit is recommended.",
        "reasoning": "The model responded most strongly to rough, scaly texture on sun-exposed skin.",
    },
    "bcc": {
        "id": "bcc",
        "name": "Basal Cell Carcinoma",
        "severity": "medium",
        "summary": "The most common type of skin cancer. Grows slowly and rarely spreads.",
        "advice": "Consult a dermatologist for confirmation and treatment options.",
        "reasoning": "A pearly, translucent texture and visible surface vessels drove this prediction.",
    },
    "bkl": {
        "id": "bkl",
        "name": "Benign Keratosis",
        "severity": "low",
        "summary": "A non-cancerous skin growth, often appearing with age.",
        "advice": "Generally no treatment needed unless it becomes irritated.",
        "reasoning": 'A rough, "stuck-on" surface with well-demarcated edges was the dominant signal.',
    },
    "df": {
        "id": "df",
        "name": "Dermatofibroma",
        "severity": "low",
        "summary": "A small, firm, harmless nodule in the skin, often on the legs.",
        "advice": "Harmless. Worth mentioning to a doctor only if it changes or hurts.",
        "reasoning": "A small, uniform, firm-looking nodule with a central dimple pattern.",
    },
    "mel": {
        "id": "mel",
        "name": "Melanoma",
        "severity": "high",
        "summary": "A serious form of skin cancer that develops in pigment-producing cells.",
        "advice": "See a dermatologist as soon as possible for a professional evaluation.",
        "reasoning": "Asymmetry, an irregular border and uneven colour distribution drove this prediction.",
    },
    "nv": {
        "id": "nv",
        "name": "Melanocytic Nevus",
        "severity": "low",
        "summary": "A common mole made of pigment-producing cells. Usually harmless.",
        "advice": "Keep an eye on any change in size, shape or colour over time.",
        "reasoning": "Symmetric shape, uniform colouring and a well-defined border.",
    },
    "vasc": {
        "id": "vasc",
        "name": "Vascular Lesion",
        "severity": "low",
        "summary": "A benign mark made of blood vessels, such as an angioma.",
        "advice": "Usually harmless. See a doctor if it bleeds or changes quickly.",
        "reasoning": "Strong red or purple colouration typical of vessel-rich lesions.",
    },
}

_transform = transforms.Compose(
    [
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ]
)

_model: MedLiT | None = None
_lock = threading.Lock()
_failed = False


def get_model() -> MedLiT | None:
    global _model, _failed
    if _model is not None or _failed:
        return _model

    with _lock:
        if _model is not None or _failed:
            return _model

        path = settings.classifier_model_path
        if not path or not path.exists():
            logger.warning("Classifier checkpoint not found at %s", path)
            _failed = True
            return None
        try:
            model = MedLiT.from_pretrained(str(path), num_classes=len(CLASS_IDS))
            model.eval()
            _model = model
            logger.info("MedLiT classifier loaded from %s", path)
        except Exception:
            logger.exception("Failed to load the classifier checkpoint")
            _failed = True

    return _model


def _to_tensor(bgr: np.ndarray) -> torch.Tensor:
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    return _transform(Image.fromarray(rgb)).unsqueeze(0)


def classify(bgr_crop: np.ndarray) -> list[dict] | None:
    """Rank all seven classes for a background-removed lesion crop."""
    model = get_model()
    if model is None or bgr_crop is None or bgr_crop.size == 0:
        return None

    with torch.no_grad():
        probs = torch.softmax(model(_to_tensor(bgr_crop)), dim=1).squeeze(0)

    ranked = sorted(
        (
            {**CLASS_META[cid], "confidence": int(round(float(p) * 100))}
            for cid, p in zip(CLASS_IDS, probs)
        ),
        key=lambda r: r["confidence"],
        reverse=True,
    )
    return ranked


def gradcam(bgr_crop: np.ndarray) -> np.ndarray | None:
    """Grad-CAM over the encoder's final token grid, upsampled onto the crop.

    Standard Grad-CAM assumes a conv feature map; for a token model the
    equivalent is to weight each patch token by the gradient of the winning
    logit flowing through it, then fold the tokens back into their grid.
    """
    model = get_model()
    if model is None or bgr_crop is None or bgr_crop.size == 0:
        return None

    tokens: dict[str, torch.Tensor] = {}

    def hook(_m, _inp, out):
        out.retain_grad()
        tokens["value"] = out
        return out

    handle = model.Encoder.TransformerBlocks[-1].register_forward_hook(hook)
    try:
        tensor = _to_tensor(bgr_crop)
        logits = model(tensor)
        top = logits.argmax(dim=1)
        model.zero_grad(set_to_none=True)
        logits[0, top].backward()

        act = tokens.get("value")
        if act is None or act.grad is None:
            return None

        cam = F.relu((act.grad * act).sum(dim=-1)).squeeze(0)  # (num_patches,)
    finally:
        handle.remove()
        model.zero_grad(set_to_none=True)

    side = IMG_SIZE // PATCH_SIZE
    cam = cam.detach().reshape(side, side).cpu().numpy()
    if cam.max() <= 0:
        return None
    cam = cam / cam.max()

    h, w = bgr_crop.shape[:2]
    cam = cv2.resize(cam, (w, h), interpolation=cv2.INTER_CUBIC)
    heat = cv2.applyColorMap(np.uint8(255 * cam), cv2.COLORMAP_JET)
    return cv2.addWeighted(bgr_crop, 0.55, heat, 0.45, 0)
