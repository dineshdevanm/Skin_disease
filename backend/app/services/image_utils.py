"""Placeholder image-generation helpers for prediction "explanation" outputs.

TODO: once a real model exists, replace generate_mask()/generate_gradcam()
with actual segmentation-mask and Grad-CAM output from the model. Keep the
function signatures (Image in, Image out) so model_service.py doesn't need
to change shape.
"""

import base64
import io
import random

from PIL import Image, ImageDraw, ImageFilter

MAX_DIM = 400


def resize_max(image: Image.Image, max_dim: int = MAX_DIM) -> Image.Image:
    image = image.copy()
    image.thumbnail((max_dim, max_dim))
    return image


def _lesion_center_and_radius(size: tuple[int, int]) -> tuple[int, int, int]:
    w, h = size
    cx = w // 2 + random.randint(-w // 12, w // 12)
    cy = h // 2 + random.randint(-h // 12, h // 12)
    radius = int(min(w, h) * random.uniform(0.22, 0.32))
    return cx, cy, radius


def generate_mask(image: Image.Image, center: tuple[int, int, int]) -> Image.Image:
    cx, cy, radius = center
    mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=max(2, radius // 8)))
    return mask


def mask_to_visual(mask: Image.Image) -> Image.Image:
    return mask.convert("RGB")


def remove_background(image: Image.Image, mask: Image.Image) -> Image.Image:
    white_bg = Image.new("RGB", image.size, (255, 255, 255))
    return Image.composite(image.convert("RGB"), white_bg, mask)


def generate_gradcam(image: Image.Image, center: tuple[int, int, int]) -> Image.Image:
    cx, cy, radius = center
    heat = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(heat)

    layers = [
        (radius * 1.8, (250, 204, 21, 60)),  # outer yellow, soft
        (radius * 1.2, (251, 146, 60, 110)),  # mid orange
        (radius * 0.7, (239, 68, 68, 160)),  # inner red, strongest
    ]
    for r, color in layers:
        r = int(r)
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)

    heat = heat.filter(ImageFilter.GaussianBlur(radius=max(3, radius // 6)))
    base = image.convert("RGBA")
    return Image.alpha_composite(base, heat).convert("RGB")


def to_data_url(image: Image.Image) -> str:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def generate_explanation_images(image: Image.Image) -> dict[str, str]:
    image = resize_max(image.convert("RGB"))
    center = _lesion_center_and_radius(image.size)

    mask = generate_mask(image, center)
    lesion = remove_background(image, mask)
    gradcam = generate_gradcam(image, center)

    return {
        "maskUrl": to_data_url(mask_to_visual(mask)),
        "lesionUrl": to_data_url(lesion),
        "gradcamUrl": to_data_url(gradcam),
    }
