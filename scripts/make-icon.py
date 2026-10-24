#!/usr/bin/env python3
"""Generate the Mercury app icon: base SVGs, an Icon Composer .icon bundle, and a legacy .icns.

Usage: python3 scripts/make-icon.py [build-dir]   (default: build/)
Needs `resvg` (brew install resvg) and macOS `iconutil`. No Python packages.

Outputs:
  build/icon-svg/      background, wing, bubble (flat layers) + composite.svg (flattened .icns art)
  build/icon.icon/     Icon Composer bundle (Liquid Glass source; compiling it needs Xcode 26's actool)
  build/icon.icns      legacy icon on the Big Sur grid (824 superellipse on a 1024 canvas)
"""
import json, math, os, shutil, subprocess, sys, tempfile

OUT = sys.argv[1] if len(sys.argv) > 1 else "build"
TOP, BOTTOM = "#5B6CF0", "#1E1B4B"  # background gradient: indigo to ink
WING, BUBBLE = "#FFC94A", "#FFFFFF"


def svg(body, defs=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" '
            f'width="1024" height="1024">{defs}{body}</svg>\n')


# Bubble: ellipse plus a tail at the lower left, as one closed path.
cx, cy, rx, ry = 636, 548, 236, 204
def on_ellipse(deg):
    r = math.radians(deg)
    return cx + rx * math.cos(r), cy + ry * math.sin(r)
a1, a2 = on_ellipse(138), on_ellipse(104)
bubble_d = (f"M{a1[0]:.1f},{a1[1]:.1f} A{rx},{ry} 0 1 1 {a2[0]:.1f},{a2[1]:.1f} "
            f"C540,794 494,830 430,842 C464,800 462,748 {a1[0]:.1f},{a1[1]:.1f} Z")
bubble_el = f'<path d="{bubble_d}" fill="{BUBBLE}"/>'

# Wing: tapered feathers fanned from one root behind the bubble. Lengths grow toward the
# top so the leading edge is one smooth curve and only the trailing tips stagger.
wx, wy = 520, 470
fan = [(186, 236, 50), (195, 300, 50), (204, 360, 50), (213, 412, 50), (222, 448, 48)]  # (angle, length, half-width)
parts = [f'<circle cx="{wx}" cy="{wy}" r="90"/>']
for th, L, b in fan:
    d = (f"M0,{-b} C{L*0.55:.0f},{-b*1.1:.0f} {L*0.94:.0f},{-b*0.95:.0f} {L},{-b*0.35:.0f} "
         f"C{L*0.93:.0f},{b*0.5:.0f} {L*0.55:.0f},{b:.0f} 0,{b} Z")
    parts.append(f'<path transform="translate({wx},{wy}) rotate({th})" d="{d}"/>')
wing_el = f'<g fill="{WING}">' + "".join(parts) + "</g>"

gradient = (f'<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{TOP}"/>'
            f'<stop offset="1" stop-color="{BOTTOM}"/></linearGradient>')

# Big Sur grid: continuous-corner body approximated by a superellipse (n=5).
n, half, c = 5, 412, 512
pts = []
for i in range(360):
    t = 2 * math.pi * i / 360
    co, si = math.cos(t), math.sin(t)
    pts.append((c + half * math.copysign(abs(co) ** (2 / n), co), c + half * math.copysign(abs(si) ** (2 / n), si)))
body = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + " Z"
composite_defs = (
    f"<defs>{gradient}<clipPath id=\"body\"><path d=\"{body}\"/></clipPath>"
    '<filter id="drop" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.30"/></filter>'
    '<filter id="lift" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.22"/></filter></defs>')
art = (f'<g transform="translate(100,100) scale({824/1024})">'
       f'<g filter="url(#lift)">{wing_el}</g><g filter="url(#lift)">{bubble_el}</g></g>')
composite = f'<path d="{body}" fill="url(#bg)" filter="url(#drop)"/><g clip-path="url(#body)">{art}</g>'

layers = {
    "background.svg": svg('<rect width="1024" height="1024" fill="url(#bg)"/>', f"<defs>{gradient}</defs>"),
    "wing.svg": svg(wing_el),
    "bubble.svg": svg(bubble_el),
    "composite.svg": svg(composite, composite_defs),
}
svg_dir = os.path.join(OUT, "icon-svg")
os.makedirs(svg_dir, exist_ok=True)
for name, text in layers.items():
    with open(os.path.join(svg_dir, name), "w") as f:
        f.write(text)


def display_p3(hex_rgb):
    """sRGB hex -> Icon Composer's 'display-p3:r,g,b,a' string (same transfer curve, P3 primaries)."""
    lin = [(v / 255) for v in bytes.fromhex(hex_rgb[1:])]
    lin = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in lin]
    m = [[0.8225, 0.1774, 0.0000], [0.0332, 0.9669, 0.0000], [0.0171, 0.0724, 0.9108]]
    p3 = [sum(m[i][j] * lin[j] for j in range(3)) for i in range(3)]
    enc = [12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055 for v in p3]
    return "display-p3:" + ",".join(f"{min(max(v, 0), 1):.5f}" for v in enc) + ",1.00000"


# Icon Composer bundle. Keys mirror a bundle Icon Composer itself wrote (the Tauri-era
# messenger-rust.icon); the background lives in "fill", the glass effects are applied by
# Icon Composer / actool, so the layer SVGs stay flat.
bundle = os.path.join(OUT, "icon.icon")
os.makedirs(os.path.join(bundle, "Assets"), exist_ok=True)
for name in ("wing.svg", "bubble.svg"):
    shutil.copy(os.path.join(svg_dir, name), os.path.join(bundle, "Assets", name))
group = lambda name, image: {
    "hidden": False,
    "layers": [{"image-name": image, "name": name}],
    "lighting": "individual",
    "name": name,
    "shadow": {"kind": "layer-color", "opacity": 0.5},
    "specular": True,
    "translucency": {"enabled": True, "value": 0.25},
}
icon_json = {
    "fill": {
        "linear-gradient": [display_p3(TOP), display_p3(BOTTOM)],
        "orientation": {"start": {"x": 0.5, "y": 0}, "stop": {"x": 0.5, "y": 1}},
    },
    "groups": [group("Bubble", "bubble.svg"), group("Wing", "wing.svg")],
    "supported-platforms": {"squares": "shared"},
}
with open(os.path.join(bundle, "icon.json"), "w") as f:
    json.dump(icon_json, f, indent=2)
    f.write("\n")

# Legacy .icns from the composite.
with tempfile.TemporaryDirectory() as tmp:
    iconset = os.path.join(tmp, "icon.iconset")
    os.makedirs(iconset)
    for size in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            px = size * scale
            suffix = "" if scale == 1 else "@2x"
            subprocess.run(["resvg", "-w", str(px), "-h", str(px), os.path.join(svg_dir, "composite.svg"),
                            os.path.join(iconset, f"icon_{size}x{size}{suffix}.png")], check=True)
    subprocess.run(["iconutil", "-c", "icns", iconset, "-o", os.path.join(OUT, "icon.icns")], check=True)

print(f"wrote {svg_dir}/, {bundle}/, {OUT}/icon.icns")
