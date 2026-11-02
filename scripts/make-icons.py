#!/usr/bin/env python3
"""Regenerate app icons: neutral pine tree + check-mark badge, no text (name-agnostic).
   python3 scripts/make-icons.py   (needs Pillow)"""
from PIL import Image, ImageDraw
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')
BG, TREE, TRUNK, GOLD, INK = (7, 8, 13), (63, 185, 80), (122, 82, 48), (255, 200, 74), (7, 8, 13)

def draw(size, safe):
    S = size * 4
    im = Image.new('RGBA', (S, S), BG + (255,))
    d = ImageDraw.Draw(im)
    if not safe:  # rounded tile for "any"
        im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.22, fill=BG + (255,))
    sc = 0.62 if safe else 0.8           # maskable: keep art inside the 80% safe zone
    off = (1 - sc) / 2 * S
    P = lambda x, y: (off + x * sc * S, off + y * sc * S)
    d.rectangle([*P(0.44, 0.78), *P(0.56, 0.95)], fill=TRUNK)
    for top, base, half in [(0.05, 0.38, 0.22), (0.22, 0.58, 0.31), (0.40, 0.80, 0.40)]:
        d.polygon([P(0.5, top), P(0.5 - half, base), P(0.5 + half, base)], fill=TREE)
    cx, cy, r = P(0.78, 0.76) + (0.17 * sc * S,)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD, outline=BG, width=int(r * 0.15))
    w = int(r * 0.28)
    d.line([(cx - r * 0.45, cy + r * 0.02), (cx - r * 0.1, cy + r * 0.38), (cx + r * 0.5, cy - r * 0.35)], fill=INK, width=w, joint='curve')
    return im.resize((size, size), Image.LANCZOS)

for name, size, safe in [('icon-192.png', 192, False), ('icon-512.png', 512, False),
                         ('maskable-192.png', 192, True), ('maskable-512.png', 512, True),
                         ('apple-touch-icon.png', 180, True)]:
    draw(size, safe).save(os.path.join(OUT, name))
    print('wrote icons/' + name)
