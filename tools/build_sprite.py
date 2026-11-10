"""Inline the Lucide icons used by the app as an SVG sprite into index.html.

Run after adding an icon:  python3 tools/build_sprite.py /path/to/lucide-static/icons
Lucide is ISC licensed (https://lucide.dev).
"""
import pathlib
import re
import sys

ICONS = ["search", "sparkles", "sun", "snowflake", "leaf", "cloud-sun", "moon", "briefcase", "heart",
         "dumbbell", "coffee", "plus", "check", "x", "star", "trash-2", "download", "upload", "shuffle",
         "wind", "compass", "camera"]

src = pathlib.Path(sys.argv[1])
root = pathlib.Path(__file__).resolve().parent.parent
symbols = []
for name in ICONS:
    svg = (src / f"{name}.svg").read_text()
    inner = re.search(r"<svg[^>]*>(.*)</svg>", svg, re.S).group(1)
    inner = re.sub(r"<!--.*?-->", "", inner, flags=re.S)
    inner = re.sub(r"\s+", " ", inner).strip()
    symbols.append(f'<symbol id="i-{name}" viewBox="0 0 24 24">{inner}</symbol>')
sprite = f'<svg width="0" height="0" style="position:absolute" aria-hidden="true">{"".join(symbols)}</svg>'

html = (root / "index.html").read_text()
html = re.sub(r"<!--SPRITE-->|<svg width=\"0\" height=\"0\" style=\"position:absolute\" aria-hidden=\"true\">.*?</svg>(?=\n<header)",
              lambda _: sprite, html, count=1, flags=re.S)
(root / "index.html").write_text(html)
print(f"{len(symbols)} icons inlined")
