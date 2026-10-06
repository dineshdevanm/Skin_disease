"""MedLiT classifier: loading, output validity and the known-answer case."""

import numpy as np
import pytest
import torch

from app.services import classifier
from app.services.medlit_arch import IMG_SIZE, PATCH_SIZE, MedLiT


class TestModelLoading:
    def test_checkpoint_loads_strictly(self, cls_model):
        """The architecture is a reconstruction, so a strict load is the only
        evidence that every layer name and shape lines up."""
        model = MedLiT.from_pretrained(
            str(classifier.settings.classifier_model_path), num_classes=7
        )
        assert model is not None

    def test_head_has_seven_outputs(self, cls_model):
        assert cls_model.Head.fc.out_features == len(classifier.CLASS_IDS) == 7

    def test_encoder_depth_is_nine_blocks(self, cls_model):
        assert len(cls_model.Encoder.TransformerBlocks) == 9

    def test_model_is_in_eval_mode(self, cls_model):
        assert not cls_model.training

    def test_patch_grid_matches_position_embeddings(self, cls_model):
        patches = (IMG_SIZE // PATCH_SIZE) ** 2
        assert cls_model.Encoder.PositionEmbeds.num_embeddings == patches + 1


class TestClassMetadata:
    def test_every_class_has_metadata(self):
        assert set(classifier.CLASS_META) == set(classifier.CLASS_IDS)

    def test_severities_are_valid(self):
        allowed = {"low", "medium", "high"}
        assert all(m["severity"] in allowed for m in classifier.CLASS_META.values())

    def test_melanoma_is_high_severity(self):
        assert classifier.CLASS_META["mel"]["severity"] == "high"

    def test_carcinomas_are_not_low_severity(self):
        for cid in ("bcc", "akiec"):
            assert classifier.CLASS_META[cid]["severity"] != "low"

    def test_metadata_fields_are_complete(self):
        required = {"id", "name", "severity", "summary", "advice", "reasoning"}
        for cid, meta in classifier.CLASS_META.items():
            assert required <= set(meta), f"{cid} missing {required - set(meta)}"


class TestInference:
    def test_forward_returns_seven_logits(self, cls_model):
        with torch.no_grad():
            out = cls_model(torch.randn(1, 3, IMG_SIZE, IMG_SIZE))
        assert out.shape == (1, 7)

    def test_probabilities_sum_to_one(self, cls_model, lesion_crop):
        crop, _ = lesion_crop
        ranked = classifier.classify(crop)
        total = sum(r["confidence"] for r in ranked)
        assert 97 <= total <= 103, f"confidences sum to {total}, not ~100"

    def test_returns_all_seven_ranked(self, lesion_crop):
        crop, _ = lesion_crop
        assert len(classifier.classify(crop)) == 7

    def test_results_are_sorted_by_confidence(self, lesion_crop):
        crop, _ = lesion_crop
        conf = [r["confidence"] for r in classifier.classify(crop)]
        assert conf == sorted(conf, reverse=True)

    def test_known_melanoma_ranks_melanoma_first(self, melanoma_bytes, lesion_crop):
        """Known-answer test. Skips unless a real melanoma photo is present,
        because "predicts mel" proves nothing against a drawn circle."""
        crop, _ = lesion_crop
        top = classifier.classify(crop)[0]
        assert top["id"] == "mel", f"expected mel, got {top['id']} at {top['confidence']}%"

    def test_prediction_is_confident_rather_than_uniform(self, lesion_crop):
        """A broken reconstruction would produce a near-flat distribution
        (~14% each). The top class must stand clearly above that."""
        crop, _ = lesion_crop
        top = classifier.classify(crop)[0]
        assert top["confidence"] > 25, f"distribution looks uniform: {top['confidence']}%"

    def test_inference_is_deterministic(self, lesion_crop):
        crop, _ = lesion_crop
        a = [r["confidence"] for r in classifier.classify(crop)]
        b = [r["confidence"] for r in classifier.classify(crop)]
        assert a == b, "MoE noise is leaking into eval mode"

    def test_empty_input_is_handled(self, cls_model):
        assert classifier.classify(np.zeros((0, 0, 3), np.uint8)) is None


class TestGradCAM:
    def test_matches_the_crop_dimensions(self, lesion_crop):
        crop, _ = lesion_crop
        cam = classifier.gradcam(crop)
        assert cam is not None
        assert cam.shape == crop.shape

    def test_is_a_colour_image(self, lesion_crop):
        crop, _ = lesion_crop
        cam = classifier.gradcam(crop)
        assert cam.dtype == np.uint8 and cam.shape[2] == 3

    def test_highlights_are_not_uniform(self, lesion_crop):
        """A flat heat map would mean the gradients never reached the tokens."""
        crop, _ = lesion_crop
        cam = classifier.gradcam(crop)
        assert cam.std() > 5, "Grad-CAM output has no variation"

    def test_does_not_leave_gradients_on_the_model(self, cls_model, lesion_crop):
        crop, _ = lesion_crop
        classifier.gradcam(crop)
        leftover = [n for n, p in cls_model.named_parameters() if p.grad is not None]
        assert not leftover, f"gradients left on {len(leftover)} parameters"

    def test_empty_input_is_handled(self, cls_model):
        assert classifier.gradcam(np.zeros((0, 0, 3), np.uint8)) is None
