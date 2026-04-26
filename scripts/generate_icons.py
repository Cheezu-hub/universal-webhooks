"""
Generate PNG icons for the Chrome Extension from the master PNG.
Run: python scripts/generate_icons.py
"""
import os
from PIL import Image

SRC = os.path.join(os.path.dirname(__file__), "..", "extension", "icons", "icon128_src.png")
SIZES = [16, 32, 48, 128]
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "extension", "icons")

os.makedirs(OUT_DIR, exist_ok=True)

try:
    img = Image.open(SRC).convert("RGBA")
    for size in SIZES:
        resized = img.resize((size, size), Image.LANCZOS)
        out_path = os.path.join(OUT_DIR, f"icon{size}.png")
        resized.save(out_path, "PNG")
        print(f"Created {out_path}")
    print("✅ All icons generated.")
except FileNotFoundError:
    print(f"❌ Source not found: {SRC}")
    print("   Copy your 128x128 icon PNG to extension/icons/icon128_src.png first.")
except ImportError:
    print("❌ Pillow not installed. Run: pip install Pillow")
