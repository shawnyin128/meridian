"""Generate the desktop brand assets from the 4096px design sources.

    pip install "meridian[brand]"   # Pillow
    python scripts/brand-assets.py "<source dir>"

The source dir must hold meridian-app-icon-4096.png (the opaque square) and
meridian-logo-mark-4096.png (the mark on transparent background). Everything
lands in apps/desktop/resources/ and is a pure function of those two files:

- icon.png   1024x1024, the square as supplied. Window and taskbar icon on
             win32/linux.
- icon.ico   16/24/32/48/64/128/256 of the same square.
- icon.icns, icon-macos.png
             the macOS 11 icon grid: an 824x824 rounded square, corner radius
             185px, centred on a 1024 canvas with a transparent margin, no
             baked shadow. ICNS is for the future app bundle; PNG is the same
             artwork for Electron's development-time Dock API. Pillow's ICNS
             writer emits 32..1024 and has no 16px chunk; macOS downsamples the
             32px rendition there.
- mark-64.png, mark-128.png
             the transparent mark, cropped to its alpha bounds and centred on a
             square canvas with a 4% margin on every side.
"""
import pathlib
import sys

from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent.parent / "apps/desktop/resources"

ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
# Pillow writes ic07/ic08/ic09/ic10/ic11/ic12/ic13/ic14, which is these pixel sizes.
ICNS_SIZES = [32, 64, 128, 256, 512, 1024]
MARK_SIZES = [64, 128]

# macOS 11+ icon grid: 824x824 of artwork on a 1024 canvas, corner radius 185px.
CANVAS = 1024
ARTWORK = 824
RADIUS = 185
# The mask is drawn at 4x so that the downscale is what antialiases the corners.
SUPERSAMPLE = 4

MARGIN = 0.04

def lanczos(im: Image.Image, size: int) -> Image.Image:
    """`im` resampled to a size x size square with the Lanczos filter."""
    return im.resize((size, size), Image.Resampling.LANCZOS)

src = pathlib.Path(sys.argv[1])
square = Image.open(src / "meridian-app-icon-4096.png").convert("RGBA")
mark = Image.open(src / "meridian-logo-mark-4096.png").convert("RGBA")
OUT.mkdir(parents=True, exist_ok=True)

lanczos(square, CANVAS).save(OUT / "icon.png")

ico = [lanczos(square, size) for size in ICO_SIZES]
ico[-1].save(OUT / "icon.ico", sizes=[(s, s) for s in ICO_SIZES], append_images=ico)

artwork = lanczos(square, ARTWORK * SUPERSAMPLE)
corners = Image.new("L", artwork.size, 0)
ImageDraw.Draw(corners).rounded_rectangle(
    (0, 0, artwork.width - 1, artwork.height - 1), radius=RADIUS * SUPERSAMPLE, fill=255)
artwork.putalpha(corners)
masked = Image.new("RGBA", (CANVAS * SUPERSAMPLE, CANVAS * SUPERSAMPLE), (0, 0, 0, 0))
inset = (CANVAS - ARTWORK) // 2 * SUPERSAMPLE
masked.paste(artwork, (inset, inset))
icns = [lanczos(masked, size) for size in ICNS_SIZES]
icns[-1].save(OUT / "icon.icns", append_images=icns)
icns[-1].save(OUT / "icon-macos.png")

trimmed = mark.crop(mark.getchannel("A").getbbox())
side = round(max(trimmed.size) / (1 - 2 * MARGIN))
centred = Image.new("RGBA", (side, side), (0, 0, 0, 0))
centred.paste(trimmed, ((side - trimmed.width) // 2, (side - trimmed.height) // 2))
for size in MARK_SIZES:
    lanczos(centred, size).save(OUT / f"mark-{size}.png")

print(
    f"wrote icon.png/ico/icns, icon-macos.png and "
    f"mark-{'/'.join(str(s) for s in MARK_SIZES)} -> {OUT}"
)
