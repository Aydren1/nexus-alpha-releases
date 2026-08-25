from pathlib import Path
import sys

from PIL import Image


root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "public" / "logo-concepts" / "nexus-circular-fighter-duel-v5-large-fighters.png"
if not source.is_absolute():
    source = root / source
if not source.is_file():
    raise SystemExit(f"Logo source was not found: {source}")

public = root / "public"
build = root / "build"
public.mkdir(parents=True, exist_ok=True)
build.mkdir(parents=True, exist_ok=True)

source_master = Image.open(source).convert("RGBA")


def tightly_framed(image: Image.Image, threshold: int = 16) -> Image.Image:
    """Remove low-alpha export debris and use the largest centered square crop."""
    alpha = image.getchannel("A")
    significant = alpha.point(lambda value: 255 if value >= threshold else 0)
    bounds = significant.getbbox()
    if bounds is None:
        return image
    left, top, right, bottom = bounds
    side = max(right - left, bottom - top)
    center_x = (left + right) / 2
    center_y = (top + bottom) / 2
    square = (
        round(center_x - side / 2),
        round(center_y - side / 2),
        round(center_x + side / 2),
        round(center_y + side / 2),
    )
    return image.crop(square)


master = tightly_framed(source_master)


def fitted(size: int, padding: int | None = None, background=(0, 0, 0, 0)) -> Image.Image:
    # Windows applies its own taskbar padding. Keep the source canvas at the
    # maximum footprint so the OS does not compound it with internal padding.
    if padding is None:
        padding = 0
    canvas = Image.new("RGBA", (size, size), background)
    available = size - padding * 2
    artwork = master.copy()
    artwork.thumbnail((available, available), Image.Resampling.LANCZOS)
    offset = ((size - artwork.width) // 2, (size - artwork.height) // 2)
    canvas.alpha_composite(artwork, offset)
    return canvas


for size in (32, 64, 180, 192, 512):
    fitted(size).save(public / f"nexus-icon-{size}.png", optimize=True)

fitted(512).save(public / "nexus-icon-512-cyan.png", optimize=True)
fitted(1024).save(public / "nexus-logo.png", optimize=True)
fitted(512, padding=52, background=(5, 9, 15, 255)).convert("RGB").save(
    public / "nexus-icon-maskable-512.png", optimize=True
)

ico = fitted(256)
ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
for destination in (build / "nexus.ico", public / "nexus.ico"):
    ico.save(destination, format="ICO", sizes=ico_sizes)

print(f"Generated NEXUS logo assets from {source}")
