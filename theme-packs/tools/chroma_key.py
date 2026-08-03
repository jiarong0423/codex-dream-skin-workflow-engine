#!/usr/bin/env python3
"""Deterministic build-time chroma keying with edge despill."""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

import numpy as np
from PIL import Image


LOGGER = logging.getLogger("chroma-key")


def parse_hex_color(value: str) -> np.ndarray:
    normalized = value.strip().lstrip("#")
    if len(normalized) != 6:
        raise argparse.ArgumentTypeError("key color must contain exactly six hexadecimal digits")
    try:
        channels = [int(normalized[index : index + 2], 16) for index in (0, 2, 4)]
    except ValueError as exc:
        raise argparse.ArgumentTypeError("key color contains non-hexadecimal characters") from exc
    return np.asarray(channels, dtype=np.float32) / 255.0


def key_image(
    input_path: Path,
    output_path: Path,
    key_color: np.ndarray | None,
    tolerance: float,
    softness: float,
    despill: float,
    aggressive_dominance: bool,
) -> None:
    with Image.open(input_path) as source:
        rgba = np.asarray(source.convert("RGBA"), dtype=np.float32) / 255.0

    rgb = rgba[..., :3]
    source_alpha = rgba[..., 3]
    if key_color is None:
        height, width = rgb.shape[:2]
        border_width = max(2, min(height, width) // 50)
        border_pixels = np.concatenate(
            (
                rgb[:border_width, :, :].reshape(-1, 3),
                rgb[-border_width:, :, :].reshape(-1, 3),
                rgb[:, :border_width, :].reshape(-1, 3),
                rgb[:, -border_width:, :].reshape(-1, 3),
            ),
            axis=0,
        )
        key_color = np.median(border_pixels, axis=0)
        LOGGER.info(
            "auto key color rgb(%d,%d,%d)",
            *(np.rint(key_color * 255.0).astype(np.uint8).tolist()),
        )
    maximum_distance = float(
        np.linalg.norm(np.maximum(key_color, 1.0 - key_color))
    )
    color_distance = np.linalg.norm(rgb - key_color, axis=2) / maximum_distance
    keyed_alpha = np.clip((color_distance - tolerance) / softness, 0.0, 1.0)

    green_key_strength = float(key_color[1] - max(key_color[0], key_color[2]))
    magenta_key_strength = float(min(key_color[0], key_color[2]) - key_color[1])
    is_green = green_key_strength > 0.35
    is_magenta = magenta_key_strength > 0.35

    # Dominance is a better alpha estimate for antialiased chroma edges than
    # Euclidean distance alone. Restrict it to pixels that are not already
    # opaque so similarly colored details inside the subject remain intact.
    if is_green:
        screen_excess = np.maximum(0.0, rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2]))
        dominance_alpha = 1.0 - np.clip(screen_excess / green_key_strength, 0.0, 1.0)
        dominance_scope = np.ones_like(keyed_alpha, dtype=bool) if aggressive_dominance else keyed_alpha < 0.995
        keyed_alpha = np.where(dominance_scope, np.minimum(keyed_alpha, dominance_alpha), keyed_alpha)
    elif is_magenta:
        screen_excess = np.maximum(0.0, np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1])
        dominance_alpha = 1.0 - np.clip(screen_excess / magenta_key_strength, 0.0, 1.0)
        dominance_scope = np.ones_like(keyed_alpha, dtype=bool) if aggressive_dominance else keyed_alpha < 0.995
        keyed_alpha = np.where(dominance_scope, np.minimum(keyed_alpha, dominance_alpha), keyed_alpha)

    alpha = np.minimum(source_alpha, keyed_alpha)
    alpha = np.where(alpha < 0.025, 0.0, alpha)
    alpha = np.where(alpha > 0.995, 1.0, alpha)

    edge_strength = np.clip((1.0 - alpha) * 1.65, 0.0, 1.0) * despill
    keyed = rgb.copy()

    # Recover the foreground color from C = alpha * F + (1 - alpha) * key.
    # This removes the hidden chroma color that otherwise reappears during
    # resize interpolation as a green or magenta fringe.
    mixed_edge = (alpha > 0.0) & (alpha < 0.995)
    safe_alpha = np.maximum(alpha, 0.08)
    unmixed = (rgb - ((1.0 - alpha)[..., None] * key_color)) / safe_alpha[..., None]
    keyed[mixed_edge] = np.clip(unmixed[mixed_edge], 0.0, 1.0)

    if is_green:
        spill = np.maximum(0.0, keyed[..., 1] - np.maximum(keyed[..., 0], keyed[..., 2]))
        correction = spill * edge_strength
        keyed[..., 1] -= correction
        keyed[..., 0] += correction * 0.16
        keyed[..., 2] += correction * 0.16
    elif is_magenta:
        spill = np.maximum(0.0, np.minimum(keyed[..., 0], keyed[..., 2]) - keyed[..., 1])
        correction = spill * edge_strength
        keyed[..., 0] -= correction
        keyed[..., 2] -= correction
        keyed[..., 1] += correction * 0.14

    keyed[alpha == 0.0] = 0.0
    output = np.dstack((np.clip(keyed, 0.0, 1.0), alpha))
    encoded = np.rint(output * 255.0).astype(np.uint8)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(encoded, mode="RGBA").save(output_path, optimize=True)

    opaque_pixels = int(np.count_nonzero(alpha >= 0.98))
    visible_pixels = int(np.count_nonzero(alpha > 0.01))
    LOGGER.info(
        "keyed %s -> %s; visible=%d opaque=%d",
        input_path,
        output_path,
        visible_pixels,
        opaque_pixels,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    key_group = parser.add_mutually_exclusive_group(required=True)
    key_group.add_argument("--key", type=parse_hex_color)
    key_group.add_argument("--auto-key", action="store_true")
    parser.add_argument("--tolerance", type=float, default=0.09)
    parser.add_argument("--softness", type=float, default=0.28)
    parser.add_argument("--despill", type=float, default=1.0)
    parser.add_argument(
        "--aggressive-dominance",
        action="store_true",
        help="apply screen-channel dominance to every pixel; use only when the subject has no key-colored details",
    )
    return parser


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = build_parser()
    args = parser.parse_args()

    if not args.input.is_file():
        parser.error(f"input image does not exist: {args.input}")
    if not 0.0 <= args.tolerance < 1.0:
        parser.error("--tolerance must be in [0, 1)")
    if not 0.01 <= args.softness <= 1.0:
        parser.error("--softness must be in [0.01, 1]")
    if not 0.0 <= args.despill <= 2.0:
        parser.error("--despill must be in [0, 2]")

    key_image(
        args.input,
        args.output,
        None if args.auto_key else args.key,
        args.tolerance,
        args.softness,
        args.despill,
        args.aggressive_dominance,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
