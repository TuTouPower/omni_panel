"""Process logo: fill transparent pixels inside the circle with white.

Reads the original logo, detects the circle boundary from non-transparent
pixels, then fills all transparent pixels within that circle with pure white.
Pixels outside the circle remain transparent.

Usage: python scripts/process_logo.py
"""

from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parent.parent

SRC = ROOT / "resources" / "archive" / "omniusage_logo_icon_transparent.png"
OUT_ICON = ROOT / "resources" / "icon.png"
OUT_LOGO = ROOT / "src" / "renderer" / "assets" / "logo.png"
OUT_TRAY = ROOT / "resources" / "tray-icon.png"


def find_circle(alpha: np.ndarray) -> tuple[float, float, float]:
    """Find center (cx, cy) and radius of the circle from alpha > 0 pixels."""
    ys, xs = np.where(alpha > 0)
    if len(xs) == 0:
        raise ValueError("No non-transparent pixels found")

    # Center is the bounding-box center of all visible pixels
    cx = (xs.min() + xs.max()) / 2.0
    cy = (ys.min() + ys.max()) / 2.0

    # Radius: max distance from center to any visible pixel + small margin
    distances = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
    radius = distances.max() + 1

    return cx, cy, radius


def process_image(img: Image.Image) -> Image.Image:
    """Fill transparent pixels inside the circle with white."""
    arr = np.array(img)  # H x W x 4 (RGBA)

    alpha = arr[:, :, 3]
    cx, cy, radius = find_circle(alpha)

    print(f"  circle center: ({cx:.1f}, {cy:.1f}), radius: {radius:.1f}")

    h, w = arr.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w]
    dist = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
    inside = dist <= radius
    transparent = alpha == 0
    fill_mask = inside & transparent

    count = fill_mask.sum()
    print(f"  pixels to fill: {count}")

    # Fill with white
    arr[fill_mask] = [255, 255, 255, 255]

    return Image.fromarray(arr, "RGBA"), (cx, cy, radius)


def main() -> None:
    print(f"Loading: {SRC}")
    img = Image.open(SRC).convert("RGBA")
    print(f"  size: {img.size}")

    w, h = img.size
    processed, (cx, cy, radius) = process_image(img)

    # Save full-size icon
    processed.save(OUT_ICON)
    print(f"Saved: {OUT_ICON}")

    # Copy to renderer assets
    processed.save(OUT_LOGO)
    print(f"Saved: {OUT_LOGO}")

    # Generate .ico (multi-size for Windows)
    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    processed.save(ROOT / "resources" / "icon.ico", format="ICO", sizes=sizes)
    print(f"Saved: {ROOT / 'resources' / 'icon.ico'}")

    # Tray icon — crop to circle area + padding, resize to 64x64
    margin = 20
    x0 = max(0, int(cx - radius) - margin)
    y0 = max(0, int(cy - radius) - margin)
    x1 = min(w, int(cx + radius) + margin)
    y1 = min(h, int(cy + radius) + margin)
    cropped = processed.crop((x0, y0, x1, y1))
    tray = cropped.resize((128, 128), Image.LANCZOS)
    tray.save(OUT_TRAY)
    print(f"Saved: {OUT_TRAY} ({tray.size})")

    print("Done.")


if __name__ == "__main__":
    main()
