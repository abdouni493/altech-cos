"""Draws the Altech POS icon and writes the Windows icon used by the desktop shortcut.

    .venv\\Scripts\\python.exe scripts\\make-icon.py

Same artwork as public/altech-pos.svg and src/components/layout/BrandMark.tsx:
a white "A" crossed by an amber scanner beam on a blue → cyan tile. Drawn with
Pillow only (no Cairo needed), at 4x and downsampled for clean edges.

Writes public/altech-pos.ico (16 → 256 px) and public/altech-pos-512.png.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ICO = ROOT / 'public' / 'altech-pos.ico'
PNG = ROOT / 'public' / 'altech-pos-512.png'
SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]

# Brand gradient stops (diagonal, top-left → bottom-right)
STOPS = [(0.0, (0x1C, 0x3F, 0xE0)), (0.55, (0x2F, 0x5B, 0xFF)), (1.0, (0x00, 0xB8, 0xD9))]


def lerp_color(t: float) -> tuple:
    for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
        if t <= t1:
            k = (t - t0) / (t1 - t0)
            return tuple(round(a + (b - a) * k) for a, b in zip(c0, c1))
    return STOPS[-1][1]


def draw(px: int) -> Image.Image:
    """Draws the icon on a px × px canvas laid out on the 256-unit grid of the SVG."""
    u = px / 256

    def p(v: float) -> float:
        return v * u

    # gradient tile
    grad = Image.new('RGB', (px, px))
    ramp = [lerp_color(i / (2 * px - 2)) for i in range(2 * px - 1)]
    grad.putdata([ramp[x + y] for y in range(px) for x in range(px)])

    # top highlight
    hl = Image.new('L', (px, px), 0)
    hd = ImageDraw.Draw(hl)
    for y in range(px // 2):
        hd.line([(0, y), (px, y)], fill=round(0.28 * 255 * (1 - y / (px / 2))))
    grad = Image.composite(Image.new('RGB', (px, px), (255, 255, 255)), grad, hl)

    mask = Image.new('L', (px, px), 0)
    ImageDraw.Draw(mask).rounded_rectangle([p(8), p(8), p(248), p(248)], radius=p(58), fill=255)
    icon = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    icon.paste(grad, (0, 0), mask)

    def stroke(layer: Image.Image, points, width: float, color) -> None:
        d = ImageDraw.Draw(layer)
        d.line([(p(x), p(y)) for x, y in points], fill=color, width=round(p(width)), joint='curve')
        r = p(width) / 2
        for x, y in points:  # round caps & joins
            d.ellipse([p(x) - r, p(y) - r, p(x) + r, p(y) + r], fill=color)

    # the "A"
    a = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    stroke(a, [(72, 198), (128, 62), (184, 198)], 30, (255, 255, 255, 255))
    icon = Image.alpha_composite(icon, a)

    # scanner beam: soft glow + bright core
    glow = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    stroke(glow, [(50, 152), (206, 152)], 26, (0xF5, 0xA5, 0x24, 90))
    icon = Image.alpha_composite(icon, glow.filter(ImageFilter.GaussianBlur(p(2))))
    core = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    stroke(core, [(50, 152), (206, 152)], 13, (0xFF, 0xC2, 0x4D, 255))
    return Image.alpha_composite(icon, core)


def render(size: int) -> Image.Image:
    return draw(size * 4).resize((size, size), Image.LANCZOS)


def main() -> None:
    master = draw(1024)
    master.resize((512, 512), Image.LANCZOS).save(PNG)
    frames = {s: master.resize((s, s), Image.LANCZOS) if s >= 64 else render(s) for s in SIZES}
    frames[256].save(ICO, format='ICO', sizes=[(s, s) for s in SIZES], append_images=[frames[s] for s in SIZES if s != 256])
    print(f'wrote {ICO.relative_to(ROOT)} ({", ".join(map(str, SIZES))} px) and {PNG.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
