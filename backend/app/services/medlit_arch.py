"""
Reconstructed "MedLiT" architecture for medlit_classif/derma_best_model.pth.

No source code for this checkpoint was found anywhere in the project. This
module was built by inspecting the state_dict's parameter names/shapes and
reproducing the most standard architecture consistent with them:

  - MAE-style patchify: image split into non-overlapping 16x16 patches,
    flattened (p, p, c) and linearly projected (Encoder.Proj, no bias).
  - Learned absolute position embeddings (Encoder.PositionEmbeds).
  - 9 pre-norm transformer blocks, each with:
      * Grouped-Query Attention: 3 KV heads, 2 query heads sharing each
        KV head (6 attention heads total, head_dim=36, 6*36=216=embed_dim).
      * A noisy top-k Mixture-of-Experts FFN (Shazeer-style gating) with a
        GLU-style expert (W, V, W2), expert count/width per block inferred
        from the checkpoint.
  - Final LayerNorm + output projection (Encoder.OutProj, no bias).
  - Mean-pooling over patch tokens (no cls token exists in the checkpoint)
    followed by a linear classification head (Head.fc).

`Encoder.MaskEmbed` and `Encoder.full_pos_idx` are kept as unused
parameters/buffers purely so the pretrained state_dict loads with
strict=True; they are vestiges of MAE-style masked pretraining and play no
role once the model is used for classification (no masking at inference).

Because the exact forward-pass semantics (attention math, MoE routing) were
not documented anywhere, this is a best-effort, self-consistent
reconstruction rather than a guaranteed bit-for-bit match to the original
training code.
"""

import math

import torch
import torch.nn as nn
import torch.nn.functional as F


IMG_SIZE = 256
PATCH_SIZE = 16
EMBED_DIM = 216
DEPTH = 9
NUM_HEADS = 3
QUERIES_PER_HEAD = 2
HEAD_DIM = 36
TOP_K = 2


def patchify(images, patch_size=PATCH_SIZE):
    """(B, C, H, W) -> (B, num_patches, patch_size*patch_size*C), pixel-major/channel-last per patch."""
    B, C, H, W = images.shape
    h, w = H // patch_size, W // patch_size
    x = images.reshape(B, C, h, patch_size, w, patch_size)
    x = x.permute(0, 2, 4, 3, 5, 1)
    x = x.reshape(B, h * w, patch_size * patch_size * C)
    return x


class GQAHead(nn.Module):
    def __init__(self, dim, head_dim, num_queries):
        super().__init__()
        self.key = nn.Linear(dim, head_dim, bias=False)
        self.value = nn.Linear(dim, head_dim, bias=False)
        self.queries = nn.ModuleList(
            [nn.Linear(dim, head_dim, bias=False) for _ in range(num_queries)]
        )
        self.scale = head_dim ** -0.5

    def forward(self, x):
        k = self.key(x)
        v = self.value(x)
        outs = []
        for q_proj in self.queries:
            q = q_proj(x)
            attn = (q @ k.transpose(-2, -1)) * self.scale
            attn = attn.softmax(dim=-1)
            outs.append(attn @ v)
        return torch.cat(outs, dim=-1)


class GQAttention(nn.Module):
    def __init__(self, dim, num_heads, head_dim, queries_per_head):
        super().__init__()
        self.Heads = nn.ModuleList(
            [GQAHead(dim, head_dim, queries_per_head) for _ in range(num_heads)]
        )
        self.proj = nn.Linear(num_heads * queries_per_head * head_dim, dim, bias=False)

    def forward(self, x):
        out = torch.cat([head(x) for head in self.Heads], dim=-1)
        return self.proj(out)


class MoEExpert(nn.Module):
    def __init__(self, dim, hidden_dim):
        super().__init__()
        self.W = nn.Linear(dim, hidden_dim)
        self.V = nn.Linear(dim, hidden_dim)
        self.W2 = nn.Linear(hidden_dim, dim)

    def forward(self, x):
        return self.W2(F.silu(self.W(x)) * self.V(x))


class NoisyTopKMoE(nn.Module):
    def __init__(self, dim, num_experts, hidden_dim, top_k=TOP_K):
        super().__init__()
        self.w_gate = nn.Parameter(torch.zeros(dim, num_experts))
        self.w_noise = nn.Parameter(torch.zeros(dim, num_experts))
        self.experts = nn.ModuleList([MoEExpert(dim, hidden_dim) for _ in range(num_experts)])
        self.top_k = min(top_k, num_experts)

    def forward(self, x):
        logits = x @ self.w_gate
        if self.training:
            noise_std = F.softplus(x @ self.w_noise)
            logits = logits + torch.randn_like(logits) * noise_std

        top_vals, top_idx = logits.topk(self.top_k, dim=-1)
        top_gates = top_vals.softmax(dim=-1)
        gates = torch.zeros_like(logits).scatter(-1, top_idx, top_gates)

        out = 0.0
        for e, expert in enumerate(self.experts):
            out = out + gates[..., e : e + 1] * expert(x)
        return out


class Block(nn.Module):
    def __init__(self, dim, num_heads, head_dim, queries_per_head, num_experts, expert_hidden):
        super().__init__()
        self.GQAttn = GQAttention(dim, num_heads, head_dim, queries_per_head)
        self.MoE = NoisyTopKMoE(dim, num_experts, expert_hidden)
        self.LayerNorm1 = nn.LayerNorm(dim)
        self.LayerNorm2 = nn.LayerNorm(dim)

    def forward(self, x):
        x = x + self.GQAttn(self.LayerNorm1(x))
        x = x + self.MoE(self.LayerNorm2(x))
        return x


class Encoder(nn.Module):
    def __init__(self, img_size, patch_size, embed_dim, block_configs, num_heads, head_dim, queries_per_head):
        super().__init__()
        num_patches = (img_size // patch_size) ** 2
        patch_dim = patch_size * patch_size * 3

        self.MaskEmbed = nn.Parameter(torch.zeros(embed_dim))
        self.register_buffer("full_pos_idx", torch.arange(num_patches + 1), persistent=True)

        self.Proj = nn.Linear(patch_dim, embed_dim, bias=False)
        self.PositionEmbeds = nn.Embedding(num_patches + 1, embed_dim)

        self.TransformerBlocks = nn.ModuleList(
            [
                Block(embed_dim, num_heads, head_dim, queries_per_head, n_experts, hidden)
                for (n_experts, hidden) in block_configs
            ]
        )

        self.LayerNorm = nn.LayerNorm(embed_dim)
        self.OutProj = nn.Linear(embed_dim, embed_dim, bias=False)

        self.patch_size = patch_size
        self.num_patches = num_patches

    def forward(self, images):
        x = patchify(images, self.patch_size)
        x = self.Proj(x)
        pos = self.PositionEmbeds(self.full_pos_idx[: self.num_patches])
        x = x + pos

        for blk in self.TransformerBlocks:
            x = blk(x)

        x = self.LayerNorm(x)
        x = self.OutProj(x)
        return x


class Head(nn.Module):
    def __init__(self, embed_dim, num_classes):
        super().__init__()
        self.fc = nn.Linear(embed_dim, num_classes)

    def forward(self, x):
        return self.fc(x)


class MedLiT(nn.Module):
    def __init__(
        self,
        num_classes=7,
        img_size=IMG_SIZE,
        patch_size=PATCH_SIZE,
        embed_dim=EMBED_DIM,
        depth=DEPTH,
        num_heads=NUM_HEADS,
        head_dim=HEAD_DIM,
        queries_per_head=QUERIES_PER_HEAD,
        block_configs=None,
    ):
        super().__init__()
        if block_configs is None:
            # (num_experts, expert_hidden_dim) per block, matching derma_best_model.pth
            block_configs = [
                (3, 81), (3, 74), (3, 67),
                (4, 60), (4, 54), (4, 47),
                (5, 40), (5, 33), (5, 27),
            ]
        assert len(block_configs) == depth

        self.Encoder = Encoder(img_size, patch_size, embed_dim, block_configs, num_heads, head_dim, queries_per_head)
        self.Head = Head(embed_dim, num_classes)

    def forward(self, images):
        tokens = self.Encoder(images)
        pooled = tokens.mean(dim=1)
        return self.Head(pooled)

    @staticmethod
    def block_configs_from_state_dict(state_dict):
        """Infer (num_experts, expert_hidden_dim) per block from a checkpoint's state_dict."""
        n_blocks = max(int(k.split(".")[2]) for k in state_dict if k.startswith("Encoder.TransformerBlocks.")) + 1
        configs = []
        for i in range(n_blocks):
            prefix = f"Encoder.TransformerBlocks.{i}.MoE.experts."
            n_experts = max(int(k[len(prefix):].split(".")[0]) for k in state_dict if k.startswith(prefix)) + 1
            hidden = state_dict[f"Encoder.TransformerBlocks.{i}.MoE.experts.0.W.weight"].shape[0]
            configs.append((n_experts, hidden))
        return configs

    @classmethod
    def from_pretrained(cls, checkpoint_path, num_classes=7, map_location="cpu"):
        state_dict = torch.load(checkpoint_path, map_location=map_location)
        block_configs = cls.block_configs_from_state_dict(state_dict)
        ckpt_num_classes = state_dict["Head.fc.weight"].shape[0]
        model = cls(num_classes=ckpt_num_classes, block_configs=block_configs)
        model.load_state_dict(state_dict, strict=True)
        if num_classes != ckpt_num_classes:
            model.Head.fc = nn.Linear(EMBED_DIM, num_classes)
        return model
