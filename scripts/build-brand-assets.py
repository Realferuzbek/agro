"""Build raster contexts from the supplied transparent master PNG without redrawing the mark."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1] / "public" / "brand"
source = Image.open(root / "baraka-agro-mark.png").convert("RGBA")
mark = source.crop(source.getbbox())
cream = (252, 248, 238, 255)

for size in (192, 512):
    canvas = Image.new("RGBA", (size, size), cream)
    target = int(size * .73)
    scaled = mark.copy()
    scaled.thumbnail((target, target), Image.Resampling.LANCZOS)
    canvas.alpha_composite(scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2))
    canvas.save(root / f"baraka-agro-icon-{size}.png", optimize=True)

social = Image.new("RGBA", (1200, 630), cream)
scaled = mark.copy()
scaled.thumbnail((300, 340), Image.Resampling.LANCZOS)
social.alpha_composite(scaled, (140 + (300 - scaled.width) // 2, (145 + (340 - scaled.height) // 2)))
draw = ImageDraw.Draw(social)
font_path = Path("C:/Windows/Fonts/arialbd.ttf")
font = ImageFont.truetype(str(font_path), 76) if font_path.exists() else ImageFont.load_default()
draw.text((505, 247), "Baraka Agro", font=font, fill=(21, 72, 55, 255))
social.convert("RGB").save(root / "baraka-agro-social.jpg", quality=90, optimize=True)
