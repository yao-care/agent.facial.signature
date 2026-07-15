#!/usr/bin/env python3
"""重新產生 icons/og-image.png（1200x630 社群分享預覽圖）。

用法：python3 tools/make-og-image.py
需求：pillow（僅開發時需要，網站本身不依賴）

配色沿用 index.html hero 的 OKLCH 漸層，改 hero 配色時記得一併重跑本腳本。
產圖後需 bump service-worker.js 的 VERSION。
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
OUT = Path(__file__).resolve().parent.parent / "icons" / "og-image.png"

# macOS 內建繁體黑體。換平台需改成當地可用的 CJK 字型。
FONT_MEDIUM = "/System/Library/Fonts/STHeiti Medium.ttc"
FONT_LIGHT = "/System/Library/Fonts/STHeiti Light.ttc"

TITLE = "長者友善無接觸報到"
SUBTITLE = "純前端 · 資料留本機 · 零雲端"
DOMAIN = "sign.yao.care"


def oklch_to_srgb(L, C, hue_deg):
    """OKLCH → sRGB 8-bit。CSS 的 oklch() 只有瀏覽器懂，產圖得自己轉。"""
    h = math.radians(hue_deg)
    a, b = C * math.cos(h), C * math.sin(h)
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

    def encode(x):
        x = max(0.0, min(1.0, x))
        x = 1.055 * (x ** (1 / 2.4)) - 0.055 if x > 0.0031308 else 12.92 * x
        return round(max(0.0, min(1.0, x)) * 255)

    return (encode(r), encode(g), encode(bb))


# index.html hero: linear-gradient(135deg, oklch(0.25 0.04 250), oklch(0.20 0.06 200))
GRAD_FROM = oklch_to_srgb(0.25, 0.04, 250)
GRAD_TO = oklch_to_srgb(0.20, 0.06, 200)
FG = oklch_to_srgb(0.97, 0.005, 250)  # hero 文字色 var(--bg-base)
# design-tokens --color-pass 的 hue(150)/chroma(0.16) 不變，只提高 L。
# token 的 L=0.48 是為淺底設計的，壓在本圖 L≈0.22 的深底上只有 2.86:1、
# 未達 WCAG AA;L=0.75 量得 8.11:1。
ACCENT = oklch_to_srgb(0.75, 0.16, 150)


def main():
    img = Image.new("RGB", (W, H))
    px = img.load()
    # 135deg 線性漸層：沿 (x/W + y/H) 對角線內插
    for y in range(H):
        for x in range(W):
            t = (x / W + y / H) / 2
            px[x, y] = tuple(
                round(GRAD_FROM[i] + (GRAD_TO[i] - GRAD_FROM[i]) * t) for i in range(3)
            )

    d = ImageDraw.Draw(img)
    f_title = ImageFont.truetype(FONT_MEDIUM, 92, index=0)
    f_sub = ImageFont.truetype(FONT_LIGHT, 40, index=0)
    f_dom = ImageFont.truetype(FONT_MEDIUM, 32, index=0)

    # 綠色重點條，呼應 index.html feature 卡片的 border-left
    d.rounded_rectangle([80, 214, 92, 424], radius=6, fill=ACCENT)
    d.text((130, 220), TITLE, font=f_title, fill=FG)
    d.text((130, 344), SUBTITLE, font=f_sub, fill=FG)
    d.text((130, 408), DOMAIN, font=f_dom, fill=ACCENT)

    img.save(OUT, optimize=True)
    print(f"寫出 {OUT} ({W}x{H})")


if __name__ == "__main__":
    main()
