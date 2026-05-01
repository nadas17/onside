"""
Halısaha — Pitch Notation
A tactical-cartographic landing artifact rendered at poster scale (18 × 24").
"""

import math
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

FONT_DIR = (
    "C:/Users/dogkn/AppData/Roaming/Claude/local-agent-mode-sessions/"
    "skills-plugin/9c107e23-1809-4dcd-b6ae-91d4dfa3621f/"
    "44015787-d29a-4c31-8975-da6a2347d913/skills/canvas-design/canvas-fonts/"
)
pdfmetrics.registerFont(TTFont("Display", FONT_DIR + "BigShoulders-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Display-Reg", FONT_DIR + "BigShoulders-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Mono", FONT_DIR + "JetBrainsMono-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Mono-Bold", FONT_DIR + "JetBrainsMono-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Serif-Italic", FONT_DIR + "InstrumentSerif-Italic.ttf"))
pdfmetrics.registerFont(TTFont("Serif", FONT_DIR + "InstrumentSerif-Regular.ttf"))

# 18" × 24" portrait (poster scale)
W, H = 18 * 72, 24 * 72  # 1296 × 1728 pt

# Color palette — limited, intentional
LINEN = HexColor("#ede2cc")      # paper / linen ground
EMERALD = HexColor("#0e4a36")    # primary ink
EMERALD_HAIR = HexColor("#586d5d")  # softer hairline emerald
AMBER = HexColor("#c87a1c")      # single warm accent
INK = HexColor("#1a1f1c")        # near-black for select bodies
HIGHLIGHT = HexColor("#fbf6e6")  # ultra-cream highlight on emerald

c = canvas.Canvas(
    "C:/Users/dogkn/Desktop/Pitch/design/halisaha-landing.pdf",
    pagesize=(W, H),
)

# ─────────────────────────────────────────────────────────────────────────────
# 1. GROUND — solid linen
# ─────────────────────────────────────────────────────────────────────────────
c.setFillColor(LINEN)
c.rect(0, 0, W, H, fill=1, stroke=0)

# ─────────────────────────────────────────────────────────────────────────────
# 2. INNER FRAME — graph-paper hairline at 50pt margin
# ─────────────────────────────────────────────────────────────────────────────
MARGIN = 50
c.setStrokeColor(EMERALD_HAIR)
c.setLineWidth(0.35)
c.rect(MARGIN, MARGIN, W - 2 * MARGIN, H - 2 * MARGIN, fill=0, stroke=1)

# ─────────────────────────────────────────────────────────────────────────────
# 3. TOP HEADER STRIP — figure / volume / coordinates
# ─────────────────────────────────────────────────────────────────────────────
top_y = H - MARGIN - 28
c.setFillColor(EMERALD)
c.setFont("Mono", 7.5)
c.drawString(MARGIN + 18, top_y, "HALISAHA  ·  FIG. I — TACTICAL CARTOGRAPHY")
c.drawRightString(W - MARGIN - 18, top_y, "VOL. I  ·  MMXXVI  ·  PL")

# Hairline beneath header
c.setStrokeColor(EMERALD_HAIR)
c.setLineWidth(0.4)
c.line(MARGIN + 18, top_y - 12, W - MARGIN - 18, top_y - 12)

# ─────────────────────────────────────────────────────────────────────────────
# 4. WORDMARK
# ─────────────────────────────────────────────────────────────────────────────
wordmark = "HALISAHA"
wm_size = 232
c.setFillColor(EMERALD)
c.setFont("Display", wm_size)
wm_w = c.stringWidth(wordmark, "Display", wm_size)
wm_y = H - MARGIN - 250
c.drawString((W - wm_w) / 2, wm_y, wordmark)

# Tagline beneath the wordmark — one quiet italic line
tagline = "yakındaki pickup futbol için bir saha kartografisi"
c.setFillColor(INK)
c.setFont("Serif-Italic", 17)
tg_w = c.stringWidth(tagline, "Serif-Italic", 17)
c.drawString((W - tg_w) / 2, wm_y - 28, tagline)

# Decorative center hairline — a thin underscore that anchors the wordmark block
center_x = W / 2
c.setStrokeColor(EMERALD_HAIR)
c.setLineWidth(0.5)
c.line(center_x - 110, wm_y - 56, center_x + 110, wm_y - 56)
# Two tiny end caps for that "engraved plate" feel
c.setLineWidth(0.7)
c.line(center_x - 110, wm_y - 60, center_x - 110, wm_y - 52)
c.line(center_x + 110, wm_y - 60, center_x + 110, wm_y - 52)

# ─────────────────────────────────────────────────────────────────────────────
# 5. PITCH DIAGRAM — full FIFA markings, 4–3–3 formation
# ─────────────────────────────────────────────────────────────────────────────
# Field measurements driven by FIFA ratios
# Standard pitch: 105 m × 68 m  →  ratio 1.544 : 1 (length : width)
PITCH_W = 590       # rendered width  (the short side)
PITCH_H = 911       # rendered length (the long side)  — 590 × 1.5444
pitch_x = (W - PITCH_W) / 2
pitch_y = 290       # bottom margin to leave room for footer block

# Helper: scale a real-world meter measurement onto the rendered pitch
def s_long(meters: float) -> float:
    return meters / 105 * PITCH_H

def s_short(meters: float) -> float:
    return meters / 68 * PITCH_W

c.setStrokeColor(EMERALD)
c.setFillColor(EMERALD)

# Outer rectangle
c.setLineWidth(1.6)
c.rect(pitch_x, pitch_y, PITCH_W, PITCH_H, fill=0, stroke=1)

# Halfway line
c.line(pitch_x, pitch_y + PITCH_H / 2, pitch_x + PITCH_W, pitch_y + PITCH_H / 2)

# Center circle (radius 9.15 m)
center_r = s_long(9.15)
c.circle(pitch_x + PITCH_W / 2, pitch_y + PITCH_H / 2, center_r, stroke=1, fill=0)

# Center spot
c.circle(pitch_x + PITCH_W / 2, pitch_y + PITCH_H / 2, 2.0, stroke=0, fill=1)

# Penalty boxes (40.32 m × 16.5 m)
pb_w = s_short(40.32)
pb_h = s_long(16.5)
# Top (away end)
c.rect(
    pitch_x + (PITCH_W - pb_w) / 2,
    pitch_y + PITCH_H - pb_h,
    pb_w, pb_h, fill=0, stroke=1,
)
# Bottom (home end)
c.rect(pitch_x + (PITCH_W - pb_w) / 2, pitch_y, pb_w, pb_h, fill=0, stroke=1)

# Six-yard goal areas (18.32 m × 5.5 m)
ga_w = s_short(18.32)
ga_h = s_long(5.5)
c.rect(
    pitch_x + (PITCH_W - ga_w) / 2,
    pitch_y + PITCH_H - ga_h,
    ga_w, ga_h, fill=0, stroke=1,
)
c.rect(pitch_x + (PITCH_W - ga_w) / 2, pitch_y, ga_w, ga_h, fill=0, stroke=1)

# Penalty spots (11 m from goal)
ps_offset = s_long(11.0)
top_spot = (pitch_x + PITCH_W / 2, pitch_y + PITCH_H - ps_offset)
bot_spot = (pitch_x + PITCH_W / 2, pitch_y + ps_offset)
c.circle(*top_spot, 1.6, stroke=0, fill=1)
c.circle(*bot_spot, 1.6, stroke=0, fill=1)

# Penalty arcs ('D's) — only the visible portion outside the box
arc_r = s_long(9.15)
delta = pb_h - ps_offset           # how far the box edge sits beyond the spot
half_chord = math.sqrt(arc_r ** 2 - delta ** 2)
# Top arc
c.arc(
    top_spot[0] - arc_r, top_spot[1] - arc_r,
    top_spot[0] + arc_r, top_spot[1] + arc_r,
    180 + math.degrees(math.atan2(delta, half_chord)),
    180 - 2 * math.degrees(math.atan2(delta, half_chord)),
)
# Bottom arc
c.arc(
    bot_spot[0] - arc_r, bot_spot[1] - arc_r,
    bot_spot[0] + arc_r, bot_spot[1] + arc_r,
    math.degrees(math.atan2(delta, half_chord)),
    180 - 2 * math.degrees(math.atan2(delta, half_chord)),
)

# Corner arcs (radius 1 m)
corner_r = s_short(1.0)
# top-left
c.arc(pitch_x - corner_r, pitch_y + PITCH_H - corner_r,
      pitch_x + corner_r, pitch_y + PITCH_H + corner_r, 270, 90)
# top-right
c.arc(pitch_x + PITCH_W - corner_r, pitch_y + PITCH_H - corner_r,
      pitch_x + PITCH_W + corner_r, pitch_y + PITCH_H + corner_r, 180, 90)
# bottom-left
c.arc(pitch_x - corner_r, pitch_y - corner_r,
      pitch_x + corner_r, pitch_y + corner_r, 0, 90)
# bottom-right
c.arc(pitch_x + PITCH_W - corner_r, pitch_y - corner_r,
      pitch_x + PITCH_W + corner_r, pitch_y + corner_r, 90, 90)

# Goal posts (drawn as a slim bar with two tick stems)
goal_w = s_short(7.32)
post_depth = 9
c.setLineWidth(2.4)
# Top goal
gx1 = pitch_x + (PITCH_W - goal_w) / 2
gx2 = pitch_x + (PITCH_W + goal_w) / 2
gy = pitch_y + PITCH_H
c.line(gx1, gy, gx2, gy)
c.line(gx1, gy, gx1, gy + post_depth)
c.line(gx2, gy, gx2, gy + post_depth)
c.line(gx1, gy + post_depth, gx2, gy + post_depth)
# Bottom goal
gy = pitch_y
c.line(gx1, gy, gx2, gy)
c.line(gx1, gy, gx1, gy - post_depth)
c.line(gx2, gy, gx2, gy - post_depth)
c.line(gx1, gy - post_depth, gx2, gy - post_depth)

# Reset stroke weight
c.setLineWidth(1.6)

# ─────────────────────────────────────────────────────────────────────────────
# 6. PLAYERS — 4-3-3, attacking up
# ─────────────────────────────────────────────────────────────────────────────
players = [
    # (x_frac, y_frac, jersey, role)
    (0.500, 0.060, "1",  "GK"),
    (0.180, 0.215, "2",  "RB"),
    (0.380, 0.195, "5",  "CB"),
    (0.620, 0.195, "4",  "CB"),
    (0.820, 0.215, "3",  "LB"),
    (0.300, 0.420, "8",  "CM"),
    (0.500, 0.475, "6",  "CDM"),
    (0.700, 0.420, "10", "CAM"),
    (0.180, 0.770, "7",  "RW"),
    (0.500, 0.840, "9",  "ST"),   # amber accent
    (0.820, 0.770, "11", "LW"),
]

DOT_R = 11.5
for x_frac, y_frac, num, _role in players:
    px = pitch_x + x_frac * PITCH_W
    py = pitch_y + y_frac * PITCH_H

    # The striker carries the warm accent — every other player is emerald
    is_accent = (num == "9")

    if is_accent:
        # Outer amber halo
        c.setFillColor(AMBER)
        c.circle(px, py, DOT_R + 4.5, stroke=0, fill=1)

    c.setFillColor(EMERALD)
    c.circle(px, py, DOT_R, stroke=0, fill=1)

    c.setFillColor(HIGHLIGHT)
    c.setFont("Mono-Bold", 9.5)
    nw = c.stringWidth(num, "Mono-Bold", 9.5)
    c.drawString(px - nw / 2, py - 3.2, num)

# ─────────────────────────────────────────────────────────────────────────────
# 7. POSITION LABELS — right of pitch
# ─────────────────────────────────────────────────────────────────────────────
c.setFillColor(EMERALD)
c.setFont("Mono", 7.5)
right_label_x = pitch_x + PITCH_W + 22
position_labels = [
    ("FWD", 0.805),
    ("MID", 0.445),
    ("DEF", 0.205),
    ("GK",  0.060),
]
for label, y_frac in position_labels:
    py = pitch_y + y_frac * PITCH_H
    c.drawString(right_label_x, py - 2.5, label)
    c.setStrokeColor(EMERALD_HAIR)
    c.setLineWidth(0.4)
    c.line(right_label_x - 6, py, right_label_x - 14, py)

# ─────────────────────────────────────────────────────────────────────────────
# 8. COORDINATE TICKS — left margin (numbers) + bottom (letters)
# ─────────────────────────────────────────────────────────────────────────────
c.setFillColor(EMERALD)
c.setFont("Mono", 6.5)

# Left ticks 00–10 along pitch height
left_tick_x = pitch_x - 22
for i in range(0, 11):
    y = pitch_y + (i / 10) * PITCH_H
    c.drawRightString(left_tick_x - 7, y - 2, f"{i:02d}")
    c.setStrokeColor(EMERALD_HAIR)
    c.setLineWidth(0.4)
    c.line(left_tick_x, y, left_tick_x - 5, y)

# Bottom ticks A–H along pitch width
bot_tick_y = pitch_y - 22
for i in range(0, 9):
    x = pitch_x + (i / 8) * PITCH_W
    c.drawCentredString(x, bot_tick_y - 12, chr(ord("A") + i))
    c.setStrokeColor(EMERALD_HAIR)
    c.line(x, bot_tick_y, x, bot_tick_y + 5)

# ─────────────────────────────────────────────────────────────────────────────
# 9. FORMATION LABEL — vertical, left of pitch (centered to pitch height)
# ─────────────────────────────────────────────────────────────────────────────
c.saveState()
c.translate(pitch_x - 90, pitch_y + PITCH_H / 2 - 92)
c.rotate(90)
c.setFillColor(EMERALD)
c.setFont("Display", 50)
c.drawString(0, 0, "4 — 3 — 3")
c.setFont("Mono", 7)
c.drawString(0.5, -18, "FORMATION CLASSIQUE")
c.restoreState()

# ─────────────────────────────────────────────────────────────────────────────
# 10. STRIKER ANNOTATION — small whisper next to the amber dot
# ─────────────────────────────────────────────────────────────────────────────
ann_x = pitch_x + PITCH_W + 32
ann_y = pitch_y + 0.840 * PITCH_H

# Tick connector — clears amber halo, terminates with a small anchor square
striker_x = pitch_x + 0.500 * PITCH_W
c.setStrokeColor(EMERALD_HAIR)
c.setLineWidth(0.55)
c.line(striker_x + DOT_R + 9, ann_y, ann_x - 6, ann_y)
# Terminal anchor — tiny filled square
c.setFillColor(EMERALD_HAIR)
c.rect(ann_x - 8.5, ann_y - 1.25, 2.5, 2.5, stroke=0, fill=1)

c.setFillColor(EMERALD)
c.setFont("Mono-Bold", 7.5)
c.drawString(ann_x, ann_y + 6, "Nö. IX")
c.setFont("Mono", 6.5)
c.setFillColor(EMERALD_HAIR)
c.drawString(ann_x, ann_y - 4, "MVP  —  bonus +10")
c.drawString(ann_x, ann_y - 14, "ELO  K = 32   μ₀ 1000")

# ─────────────────────────────────────────────────────────────────────────────
# 11. FOOTER — coordinates + edition + tagline strip
# ─────────────────────────────────────────────────────────────────────────────
foot_y = 198

# Bottom-left: city coordinates
c.setFillColor(EMERALD)
c.setFont("Mono-Bold", 9)
c.drawString(MARGIN + 18, foot_y, "WARSZAWA")
c.setFont("Mono", 7)
c.drawString(MARGIN + 18, foot_y - 11, "52.2297° N    21.0122° E")

c.setFont("Mono-Bold", 9)
c.drawString(MARGIN + 18, foot_y - 30, "GDAŃSK")
c.setFont("Mono", 7)
c.drawString(MARGIN + 18, foot_y - 41, "54.3520° N    18.6466° E")

# Bottom-right: edition + dimension
c.setFont("Mono", 7)
c.drawRightString(W - MARGIN - 18, foot_y, "EDITION I  ·  PRINTED ON LINEN")
c.drawRightString(W - MARGIN - 18, foot_y - 11, "PITCH  ·  68 m × 105 m")
c.drawRightString(W - MARGIN - 18, foot_y - 30, "FIVE FORMATS")
c.drawRightString(W - MARGIN - 18, foot_y - 41, "5v5  ·  6v6  ·  7v7  ·  8v8  ·  11v11")

# Hairline above bottom block — slightly heavier than top hairline for closure
c.setStrokeColor(EMERALD_HAIR)
c.setLineWidth(0.5)
c.line(MARGIN + 18, 132, W - MARGIN - 18, 132)

# Bottom italic strip — the second whisper, the feature inventory
c.setFillColor(INK)
c.setFont("Serif-Italic", 13)
strip = "pozisyon-ağırlıklı denge  ·  real-time chat  ·  MVP oylaması  ·  Elo skill rating"
sw = c.stringWidth(strip, "Serif-Italic", 13)
c.drawString((W - sw) / 2, 102, strip)

# Bottom design-principle line — tracked for the academic feel
c.setFont("Mono", 7)
c.setFillColor(EMERALD)
princ = "D E S I G N   P R I N C I P L E   N o.  I V   —   P I T C H   N O T A T I O N"
pw = c.stringWidth(princ, "Mono", 7)
c.drawString((W - pw) / 2, 75, princ)

# ─────────────────────────────────────────────────────────────────────────────
c.save()
print("Wrote design/halisaha-landing.pdf")
