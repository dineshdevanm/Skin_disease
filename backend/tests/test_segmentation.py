"""Segmentation model: loading, mask properties and post-processing."""

import cv2
import numpy as np
import pytest
import torch

from app.services import segmentation


class TestModelLoading:
    def test_architecture_matches_checkpoint_exactly(self, seg_model):
        """strict=True is what proves the reconstruction is right: a single
        wrong layer name or shape would raise here."""
        state = torch.load(segmentation.settings.segmentation_model_path, map_location="cpu")
        fresh = segmentation.DeepLabV3ResNet50()
        fresh.load_state_dict(state, strict=True)

    def test_model_is_in_eval_mode(self, seg_model):
        assert not seg_model.training

    def test_model_is_cached_between_calls(self, seg_model):
        assert segmentation.get_model() is seg_model


class TestMaskPrediction:
    def test_mask_is_binary_uint8(self, seg_model, sample_image):
        mask = segmentation.predict_mask(seg_model, sample_image)
        assert mask.dtype == np.uint8
        assert set(np.unique(mask)).issubset({0, 255})

    def test_mask_is_model_input_sized(self, seg_model, sample_image):
        mask = segmentation.predict_mask(seg_model, sample_image)
        assert mask.shape == (segmentation.IMAGE_SIZE, segmentation.IMAGE_SIZE)

    def test_finds_a_lesion_in_a_real_photo(self, seg_model, sample_image):
        mask = segmentation.predict_mask(seg_model, sample_image)
        assert (mask > 0).any(), "no lesion detected in a known melanoma image"

    def test_lesion_covers_a_plausible_share_of_the_frame(self, seg_model, sample_image):
        mask = segmentation.predict_mask(seg_model, sample_image)
        ratio = (mask > 0).sum() / mask.size
        assert 0.05 < ratio < 0.90, f"implausible lesion coverage: {ratio:.2%}"

    def test_prediction_is_deterministic(self, seg_model, sample_image):
        a = segmentation.predict_mask(seg_model, sample_image)
        b = segmentation.predict_mask(seg_model, sample_image)
        assert np.array_equal(a, b)

    def test_blank_image_yields_little_or_nothing(self, seg_model, blank_image):
        mask = segmentation.predict_mask(seg_model, blank_image)
        ratio = (mask > 0).sum() / mask.size
        assert ratio < 0.5, f"flat grey should not read as a lesion ({ratio:.2%})"


class TestMaskCleanup:
    def test_resizes_to_the_original_frame(self):
        raw = np.zeros((224, 224), np.uint8)
        cv2.circle(raw, (112, 112), 60, 255, -1)
        out = segmentation.clean_mask(raw, 640, 480)
        assert out.shape == (480, 640)

    def test_keeps_only_the_largest_region(self):
        raw = np.zeros((224, 224), np.uint8)
        cv2.circle(raw, (60, 60), 40, 255, -1)   # large
        cv2.circle(raw, (190, 190), 12, 255, -1)  # small, should be dropped
        out = segmentation.clean_mask(raw, 224, 224)
        contours, _ = cv2.findContours(out, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        assert len(contours) == 1

    def test_returns_none_when_nothing_survives(self):
        assert segmentation.clean_mask(np.zeros((224, 224), np.uint8), 224, 224) is None

    def test_output_stays_binary(self):
        raw = np.zeros((224, 224), np.uint8)
        cv2.circle(raw, (112, 112), 50, 255, -1)
        out = segmentation.clean_mask(raw, 300, 300)
        assert set(np.unique(out)).issubset({0, 255})


class TestCropAndOverlay:
    def test_crop_is_smaller_than_the_frame(self, lesion_crop, sample_image):
        crop, _ = lesion_crop
        assert crop.size > 0
        assert crop.shape[0] <= sample_image.height
        assert crop.shape[1] <= sample_image.width

    def test_background_is_removed(self, lesion_crop):
        """Pixels outside the lesion are zeroed, so the crop must contain
        pure-black corners that the original photo does not."""
        crop, _ = lesion_crop
        assert (crop.sum(axis=2) == 0).any(), "no background was masked out"

    def test_overlay_keeps_the_original_dimensions(self, sample_image):
        bgr = cv2.cvtColor(np.array(sample_image), cv2.COLOR_RGB2BGR)
        mask = np.zeros(bgr.shape[:2], np.uint8)
        cv2.circle(mask, (bgr.shape[1] // 2, bgr.shape[0] // 2), 50, 255, -1)
        out = segmentation.overlay_mask(bgr, mask)
        assert out.shape == bgr.shape

    def test_overlay_tints_only_inside_the_mask(self, sample_image):
        bgr = cv2.cvtColor(np.array(sample_image), cv2.COLOR_RGB2BGR)
        mask = np.zeros(bgr.shape[:2], np.uint8)
        cv2.circle(mask, (60, 60), 30, 255, -1)
        out = segmentation.overlay_mask(bgr, mask)
        assert out[60, 60][1] > bgr[60, 60][1], "green channel not raised inside the mask"
        far = (bgr.shape[0] - 5, bgr.shape[1] - 5)
        assert abs(int(out[far][1]) - int(bgr[far][1] * 0.7)) < 3

    def test_coverage_is_a_fraction(self):
        mask = np.zeros((100, 100), np.uint8)
        mask[:50, :] = 255
        assert segmentation.coverage(mask) == pytest.approx(0.5, abs=0.01)
