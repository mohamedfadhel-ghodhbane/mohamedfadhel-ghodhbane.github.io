"""Render a 1200x630 link-preview card for every published post into public/og/<post>.jpg.

Run from the website folder after adding or retitling a post:

    python tools/og-images.py

Needs Python with Pillow, Google Chrome (set CHROME_PATH if it is not in the default place), and `npm install`
already run so the site's fonts are in node_modules. Posts without a card fall back to public/og-default.jpg.
"""
import base64
import datetime
import html
import os
import pathlib
import random
import re
import subprocess
import tempfile

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
POSTS = ROOT / "src" / "content" / "posts"
OUT = ROOT / "public" / "og"
CHROME = os.environ.get("CHROME_PATH", r"C:\Program Files\Google\Chrome\Application\chrome.exe")
TYPE_LABEL = {"article": "Guide", "writeup": "Writeup", "note": "Note"}


def front_matter(text):
    match = re.match(r"^---\s*\n(.*?)\n---", text, re.S)
    data = {}
    for line in (match.group(1) if match else "").splitlines():
        key, sep, value = line.partition(":")
        if sep and not line.startswith(" "):
            data[key.strip()] = value.strip().strip('"').strip("'")
    return data


def font(rel):
    return "data:font/woff2;base64," + base64.b64encode((ROOT / "node_modules" / rel).read_bytes()).decode()


def chart(seed):
    """A small static strip chart: quiet baseline, one peak over the dashed threshold, ringed."""
    rng = random.Random(seed)
    width, height, base, top = 380, 110, 92, 14
    points, value, peak_at = [], 0.0, 0.66
    for i in range(96):
        t = i / 95
        value = value * 0.86 + (0.9 if i == round(95 * peak_at) else 0)
        v = 0.04 + (rng.random() - 0.5) * 0.06 + value * (0.6 + 0.4 * rng.random())
        points.append((t * width, base - v * (base - top)))
    px, py = min(points, key=lambda p: p[1])
    threshold = base - 0.55 * (base - top)
    line = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
    return f"""<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" fill="none">
  <line x1="0" y1="{base + 0.5}" x2="{width}" y2="{base + 0.5}" stroke="#ddd5c6"/>
  <line x1="0" y1="{threshold:.1f}" x2="{width}" y2="{threshold:.1f}" stroke="#086b50" stroke-dasharray="4 5" opacity="0.6"/>
  <polyline points="{line}" stroke="#1f1d1a" stroke-width="1.6" stroke-linejoin="round"/>
  <circle cx="{px:.1f}" cy="{py:.1f}" r="9" stroke="#086b50" stroke-width="1.8"/>
</svg>"""


def card_html(title, meta, seed, serif, sans):
    glyph = ('<svg viewBox="0 0 32 32"><g fill="#086b50"><circle cx="16" cy="6.5" r="2.1"/><circle cx="11" cy="12.5" r="1.6"/>'
             '<circle cx="21" cy="12.5" r="1.6"/><circle cx="16" cy="16.5" r="2.5"/></g><g fill="#6c675e"><circle cx="8.5" cy="20.5" r="1.4"/>'
             '<circle cx="23.5" cy="20.5" r="1.4"/><circle cx="12.5" cy="25" r="1.2"/><circle cx="19.5" cy="25" r="1.2"/></g></svg>')
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
@font-face {{ font-family: "OG Serif"; src: url({serif}) format("woff2"); font-weight: 200 800; }}
@font-face {{ font-family: "OG Sans"; src: url({sans}) format("woff2"); font-weight: 100 900; }}
html, body {{ margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #f6f3ec; }}
.card {{ position: relative; box-sizing: border-box; width: 1200px; height: 630px; padding: 64px 80px 62px; border-bottom: 10px solid #086b50; display: flex; flex-direction: column; }}
.top {{ display: flex; justify-content: space-between; align-items: center; }}
.brand {{ display: flex; align-items: center; gap: 12px; font: 500 25px/1 "OG Serif"; color: #1f1d1a; }}
.brand svg {{ width: 34px; height: 34px; }}
.meta {{ font: 600 20px/1 "OG Sans"; color: #086b50; }}
h1 {{ margin: 52px 0 0; max-width: 1000px; max-height: 300px; font: 400 64px/1.1 "OG Serif"; letter-spacing: -0.015em; color: #1f1d1a; text-wrap: balance; }}
.bottom {{ margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; }}
.url {{ font: 600 19px/1 "OG Sans"; color: #4a4640; }}
</style></head><body><div class="card">
  <div class="top"><div class="brand">{glyph}Mohamed Fadhel Ghodhbane</div><div class="meta">{html.escape(meta)}</div></div>
  <h1 id="t">{html.escape(title)}</h1>
  <div class="bottom"><div class="url">mohamedfadhel-ghodhbane.github.io</div>{chart(seed)}</div>
</div>
<script>
  // shrink long titles until they fit the title box
  var t = document.getElementById('t'), size = 64;
  document.fonts.ready.then(function () {{
    while (t.scrollHeight > 300 && size > 40) {{ size -= 2; t.style.fontSize = size + 'px'; }}
  }});
</script></body></html>"""


def main():
    serif = font("@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2")
    sans = font("@fontsource-variable/albert-sans/files/albert-sans-latin-wght-normal.woff2")
    OUT.mkdir(parents=True, exist_ok=True)
    made = 0
    with tempfile.TemporaryDirectory() as tmp:
        for post in sorted(POSTS.glob("*.md")):
            data = front_matter(post.read_text(encoding="utf-8"))
            if data.get("status") != "published":
                continue
            meta = TYPE_LABEL.get(data.get("type", ""), "Article")
            if data.get("date"):
                day = datetime.date.fromisoformat(data["date"][:10])
                meta += f" · {day.day} {day.strftime('%B %Y')}"
            page = pathlib.Path(tmp) / f"{post.stem}.html"
            page.write_text(card_html(data.get("title", post.stem), meta, post.stem, serif, sans), encoding="utf-8")
            shot = pathlib.Path(tmp) / f"{post.stem}.png"
            subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
                            "--window-size=1200,630", "--virtual-time-budget=5000", f"--screenshot={shot}", page.as_uri()],
                           check=True, capture_output=True, timeout=120)
            image = Image.open(shot).convert("RGB").resize((1200, 630), Image.LANCZOS)
            image.save(OUT / f"{post.stem}.jpg", "JPEG", quality=88, optimize=True, progressive=True)
            made += 1
            print("card", OUT / f"{post.stem}.jpg")
    print(f"{made} cards written")


if __name__ == "__main__":
    main()
