"""Real lesion segmentation, using the trained DeepLabV3-ResNet50 checkpoint.

The architecture here is reconstructed from the checkpoint itself rather than
guessed: the weights sit under a `model.` prefix, the auxiliary head is still at
its stock 21 channels, and the main classifier ends in a single-channel conv.
`load_state_dict(..., strict=True)` succeeds with no missing or unexpected keys,
which is what confirms the reconstruction is exact.

The mask post-processing (threshold, open/close, largest contour, padded crop)
is a direct port of the project's own utils.py, so the images the API returns
match what the offline pipeline produces.
"""

from __future__ import annotations

import logging
import threading

import cv2
import numpy as np
import torch
from PIL import Image
from torch import nn
from torchvision.models.segmentation import deeplabv3_resnet50
from torchvision import transforms

from app.config import settings

logger = logging.getLogger("dermascan.segmentation")

IMAGE_SIZE = 224
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]

_transform = transforms.Compose(
    [
        transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
    ]
)


class DeepLabV3ResNet50(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        # weights_backbone=None: the checkpoint supplies every backbone weight,
        # so downloading the ImageNet ResNet-50 first would only waste time.
        self.model = deeplabv3_resnet50(
            weights=None, weights_backbone=None, num_classes=21, aux_loss=True
        )
        self.model.classifier[4] = nn.Conv2d(256, 1, kernel_size=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.model(x)["out"]


_model: DeepLabV3ResNet50 | None = None
_load_lock = threading.Lock()
_load_failed = False


def get_model() -> DeepLabV3ResNet50 | None:
    """Load the checkpoint once, on first use. Returns None when the weights are
    absent or unreadable, so the API degrades instead of failing outright."""
    global _model, _load_failed
    if _model is not None or _load_failed:
        return _model

    with _load_lock:
        if _model is not None or _load_failed:
            return _model

        path = settings.segmentation_model_path
        if not path or not path.exists():
            logger.warning("Segmentation checkpoint not found at %s", path)
            _load_failed = True
            return None

        try:
            model = DeepLabV3ResNet50()
            state = torch.load(path, map_location="cpu")
            if isinstance(state, dict) and "state_dict" in state:
                state = state["state_dict"]
            model.load_state_dict(state, strict=True)
            model.eval()
            torch.set_num_threads(settings.torch_threads)
            _model = model
            logger.info("Segmentation model loaded from %s", path)
        except Exception:
            logger.exception("Failed to load the segmentation checkpoint")
            _load_failed = True

    return _model


def predict_mask(model: DeepLabV3ResNet50, image: Image.Image) -> np.ndarray:
    """Binary lesion mask at IMAGE_SIZE, as uint8 0/255."""
    tensor = _transform(image.convert("RGB")).unsqueeze(0)
    with torch.no_grad():
        probs = torch.sigmoid(model(tensor))
        binary = (probs > settings.segmentation_threshold).float()
    mask = binary.squeeze().cpu().numpy()
    return (mask * 255).astype(np.uint8)


def clean_mask(mask: np.ndarray, width: int, height: int) -> np.ndarray | None:
    """Resize the mask to the original frame, denoise it, and keep only the
    largest connected region. Returns None when nothing survives."""
    mask = cv2.resize(mask, (width, height), interpolation=cv2.INTER_NEAREST)
    _, mask = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)

    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    largest = max(contours, key=cv2.contourArea)
    out = np.zeros_like(mask)
    cv2.drawContours(out, [largest], -1, 255, thickness=cv2.FILLED)
    return out


def crop_lesion(bgr: np.ndarray, mask: np.ndarray, padding: int = 20) -> np.ndarray:
    """Lesion with its background removed, cropped to a padded bounding box."""
    h, w = bgr.shape[:2]
    lesion = cv2.bitwise_and(bgr, bgr, mask=mask)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return lesion

    x, y, bw, bh = cv2.boundingRect(max(contours, key=cv2.contourArea))
    x1, y1 = max(0, x - padding), max(0, y - padding)
    x2, y2 = min(w, x + bw + padding), min(h, y + bh + padding)
    return lesion[y1:y2, x1:x2]


def overlay_mask(bgr: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """The original frame tinted where the model says the lesion is."""
    colored = np.zeros_like(bgr)
    colored[:, :, 1] = mask
    return cv2.addWeighted(bgr, 0.7, colored, 0.3, 0)


def coverage(mask: np.ndarray) -> float:
    """Share of the frame the lesion occupies, 0..1."""
    return float((mask > 0).sum()) / float(mask.size or 1)
