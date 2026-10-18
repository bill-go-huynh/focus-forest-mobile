"""Generate the app icon (direction B, painterly-flat): the signature tree in golden-hour light.

Writes SVG sources to design/app-icon/ and, with rsvg-convert (librsvg, a local tool, not an app
dependency), the PNGs app.json uses:
  assets/icon.png                    1024, full bleed (iOS and the legacy Android icon)
  assets/android-icon-background.png 1024, the adaptive icon's background
  assets/android-icon-foreground.png 1024, the tree inside the adaptive safe zone (66% circle)
  assets/android-icon-monochrome.png 1024, one-color silhouette for Android themed icons
  assets/splash-icon.png             1024, the tree on transparent

Deterministic: the cluster outlines use the renderer's ripple formula with fixed phases.
Run from the repo root: python3 design/tools/generate-app-icon.py
"""

import math
import os
import subprocess

S = 1024
C = S / 2

# Golden-hour palette from src/tree/signature/palette.ts and the art direction canvas.
SKY = ("#F8E6C4", "#EDB98A")
SUN = "#FFE7AE"
LEAF = {"back": ("#C9D58E", "#86A85F", "#4F7444"), "main": ("#DCDC86", "#93B35C", "#557A42"),
        "front": ("#A9C26A", "#6E9550", "#3F6638")}
BARK = ("#9A6E4E", "#6E4B34", "#4A3021")
GROUND = ("#BFB476", "#958B55")


def blob(cx, cy, rx, ry, seed, depth=0.15, points=40):
    ph = [(seed * 0.618) % 6.28, (seed * 1.37) % 6.28, (seed * 2.11) % 6.28]
    pts = []
    for i in range(points):
        a = i / points * math.tau
        ripple = (0.4 * math.sin(3 * a + ph[0]) + 0.22 * math.sin(5 * a + ph[1])
                  + 0.22 * math.sin(11 * a + ph[2]) + 0.16 * math.sin(19 * a + ph[0] + ph[2]))
        reach = 0.99 - depth * (0.5 + 0.5 * ripple)
        pts.append((cx + rx * reach * math.cos(a), cy + ry * reach * math.sin(a)))
    mid = lambda p, q: f"{(p[0]+q[0])/2:.1f} {(p[1]+q[1])/2:.1f}"
    d = f"M{mid(pts[-1], pts[0])}"
    for i, p in enumerate(pts):
        d += f" Q{p[0]:.1f} {p[1]:.1f} {mid(p, pts[(i + 1) % points])}"
    return d + "Z"


def gradient(gid, stops, kind="radial"):
    s = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    if kind == "radial":
        return f'<radialGradient id="{gid}" cx="30%" cy="24%" r="86%">{s}</radialGradient>'
    return f'<linearGradient id="{gid}" x1="0" y1="0" x2="{1 if kind=="h" else 0}" y2="{0 if kind=="h" else 1}">{s}</linearGradient>'


# The tree, centered for the adaptive safe zone: canopy y 200-640, trunk to 800.
BACK = [(512, 300, 150, 112), (360, 390, 120, 92), (664, 386, 122, 94)]
MAIN = [(512, 360, 170, 128), (380, 452, 132, 100), (644, 450, 134, 102), (512, 500, 150, 104),
        (300, 520, 90, 70), (724, 516, 92, 72)]
FRONT = [(450, 578, 96, 64), (590, 584, 92, 60)]


def tree(mono=None):
    def fill(layer):
        return mono or f"url(#leaf-{layer})"
    out = []
    # Trunk and two branches.
    trunk = "M478 800 Q486 690 494 560 L530 560 Q538 690 546 800 Z"
    out.append(f'<path d="{trunk}" fill="{mono or "url(#bark)"}"/>')
    for d in ("M500 640 Q440 600 392 520", "M524 628 Q590 590 636 514"):
        out.append(f'<path d="{d}" stroke="{mono or BARK[2]}" stroke-width="22" stroke-linecap="round" fill="none"/>')
    for i, c in enumerate(BACK):
        out.append(f'<path d="{blob(*c, seed=i + 1)}" fill="{fill("back")}"/>')
    for i, c in enumerate(MAIN):
        out.append(f'<path d="{blob(*c, seed=i + 11)}" fill="{fill("main")}"/>')
    for i, c in enumerate(FRONT):
        out.append(f'<path d="{blob(*c, seed=i + 31)}" fill="{fill("front")}"/>')
    if not mono:
        # Sun-touched leaf edges and a few blossoms: the tree in bloom.
        for x, y in ((470, 300), (610, 340), (400, 450), (660, 480)):
            out.append(f'<circle cx="{x}" cy="{y}" r="22" fill="#F6D5DE"/><circle cx="{x}" cy="{y}" r="8" fill="#F0B44C"/>')
    return "".join(out)


DEFS = "<defs>" + "".join([
    gradient("sky", [(0, SKY[0]), (1, SKY[1])], "v"),
    f'<radialGradient id="sun" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="{SUN}" stop-opacity="1"/><stop offset="1" stop-color="{SUN}" stop-opacity="0"/></radialGradient>',
    gradient("ground", [(0, GROUND[0]), (1, GROUND[1])], "v"),
    gradient("bark", [(0, BARK[0]), (0.45, BARK[1]), (1, BARK[2])], "h"),
    *[gradient(f"leaf-{k}", [(0, v[0]), (0.55, v[1]), (1, v[2])]) for k, v in LEAF.items()],
]) + "</defs>"


def background():
    return (f'<rect width="{S}" height="{S}" fill="url(#sky)"/>'
            f'<circle cx="260" cy="250" r="330" fill="url(#sun)"/>'
            f'<circle cx="260" cy="250" r="92" fill="{SUN}"/>'
            f'<path d="M0 820 Q512 740 1024 820 V1024 H0 Z" fill="url(#ground)"/>')


def svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{S}" height="{S}" viewBox="0 0 {S} {S}">{DEFS}{body}</svg>'


def main():
    os.makedirs("design/app-icon", exist_ok=True)
    files = {
        "icon": svg(background() + tree()),
        "android-icon-background": svg(background()),
        "android-icon-foreground": svg(tree()),
        "android-icon-monochrome": svg(tree(mono="#FFFFFF")),
        "splash-icon": svg(tree()),
    }
    for name, content in files.items():
        src = f"design/app-icon/{name}.svg"
        with open(src, "w") as out:
            out.write(content)
        subprocess.run(["rsvg-convert", "-w", str(S), "-h", str(S), src, "-o", f"assets/{name}.png"], check=True)
        print(f"assets/{name}.png")


if __name__ == "__main__":
    main()
