#!/usr/bin/env python3
"""Generate social card images for blog posts that don't have one yet.

Scans content/posts/*.md for frontmatter, generates a dark-themed social card
PNG (1200x630) for any post missing an og_image in [extra]. Outputs to
static/img/social-cards/<slug>.png and prints the frontmatter line to add.

Usage:
    python3 scripts/generate-social-cards.py [--force]

    --force: regenerate all cards, even if they already exist
"""

import os
import re
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("ERROR: Pillow required. Install with: pip3 install Pillow")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
POSTS_DIR = ROOT / "content" / "posts"
OUT_DIR = ROOT / "static" / "img" / "social-cards"
W, H = 1200, 630

# Colors (slate palette)
BG = (15, 23, 42)
ACCENT = (56, 189, 248)
TEXT = (248, 250, 252)
SUB = (148, 163, 184)
DOT = (30, 41, 59)

# Font discovery
BOLD_CANDIDATES = [
    "/System/Library/Fonts/SFPro-Bold.otf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]
REG_CANDIDATES = [
    "/System/Library/Fonts/SFPro-Regular.otf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def find_font(candidates, size):
    for fp in candidates:
        if os.path.exists(fp):
            return ImageFont.truetype(fp, size)
    return ImageFont.load_default()


def wrap_text(text, font, max_width, draw):
    """Wrap text to fit within max_width pixels."""
    words = text.split()
    lines = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return "\n".join(lines)


def parse_frontmatter(path):
    """Extract title and slug from a Zola markdown file."""
    content = path.read_text()
    match = re.search(r'^\+\+\+\s*\n(.*?)\n\+\+\+', content, re.DOTALL)
    if not match:
        return None, None, False
    fm = match.group(1)

    title_m = re.search(r'^title\s*=\s*"(.+?)"', fm, re.MULTILINE)
    title = title_m.group(1) if title_m else path.stem.replace("-", " ").title()

    has_og = "og_image" in fm
    slug = path.stem
    return title, slug, has_og


def generate_card(title, slug):
    """Generate a social card PNG and return the output path."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"{slug}.png"

    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    title_font = find_font(BOLD_CANDIDATES, 56)
    sub_font = find_font(REG_CANDIDATES, 28)

    # Accent bar
    draw.rectangle([0, 0, W, 6], fill=ACCENT)

    # Title (wrapped)
    wrapped = wrap_text(title, title_font, 900, draw)
    draw.multiline_text((80, 180), wrapped, font=title_font, fill=TEXT, spacing=16)

    # Author + site
    draw.text((80, 520), "Andreas Lindh", font=sub_font, fill=ACCENT)
    draw.text((320, 520), "·  andskli.github.io", font=sub_font, fill=SUB)

    # Decorative dots
    for x in range(850, 1150, 30):
        for y in range(150, 500, 30):
            draw.ellipse([x, y, x + 4, y + 4], fill=DOT)

    img.save(out_path, "PNG", optimize=True)
    return out_path


def main():
    force = "--force" in sys.argv
    generated = 0

    for md in sorted(POSTS_DIR.glob("*.md")):
        if md.name == "_index.md":
            continue
        title, slug, has_og = parse_frontmatter(md)
        if not title:
            continue

        out_path = OUT_DIR / f"{slug}.png"
        if has_og and not force:
            if out_path.exists():
                continue

        if out_path.exists() and not force:
            print(f"  exists: {slug}")
            continue

        generate_card(title, slug)
        generated += 1
        rel = f"/img/social-cards/{slug}.png"
        print(f"  ✓ {slug}")
        if not has_og:
            print(f"    Add to frontmatter: og_image = \"{rel}\"")

    if generated == 0:
        print("All posts already have social cards.")
    else:
        print(f"\nGenerated {generated} card(s) in static/img/social-cards/")


if __name__ == "__main__":
    main()
