"""A small handwritten-digit reader that runs on plain numpy (no deep-learning framework needed on the server).

The weights (``digit_model.npz``, about 1 MB) come from a compact convolutional network trained on the public MNIST
handwriting set with heavy distortion (tilt, thin and thick pen strokes, blur, noise), so it copes with phone photos.
It looks at one digit at a time: the sheet's one-digit-per-box layout is what makes this reliable.
"""

from __future__ import annotations

import os
from functools import lru_cache

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

MODEL_PATH = os.path.join(os.path.dirname(__file__), 'digit_model.npz')


@lru_cache(maxsize=1)
def _weights():
    data = np.load(MODEL_PATH)
    return {name: data[name].astype(np.float32) for name in data.files}


def _conv3x3(x, weight, bias):
    xp = np.pad(x, ((0, 0), (0, 0), (1, 1), (1, 1)))
    windows = sliding_window_view(xp, (3, 3), axis=(2, 3))               # n, C, H, W, 3, 3
    out = np.einsum('nchwij,ocij->nohw', windows, weight, optimize=True)
    return out + bias[None, :, None, None]


def _pool2(x):
    n, c, h, w = x.shape
    return x.reshape(n, c, h // 2, 2, w // 2, 2).max(axis=(3, 5))


def predict(images: np.ndarray) -> np.ndarray:
    """Probabilities (n, 10) for ``images`` shaped (n, 28, 28), values 0 (paper) to 1 (ink)."""
    w = _weights()
    x = images.astype(np.float32)[:, None, :, :]
    x = _pool2(np.maximum(_conv3x3(x, w['c1w'], w['c1b']), 0))
    x = _pool2(np.maximum(_conv3x3(x, w['c2w'], w['c2b']), 0))
    x = np.maximum(x.reshape(x.shape[0], -1) @ w['f1w'].T + w['f1b'], 0)
    logits = x @ w['f2w'].T + w['f2b']
    logits -= logits.max(axis=1, keepdims=True)
    e = np.exp(logits)
    return e / e.sum(axis=1, keepdims=True)
