#!/usr/bin/env python3
"""Generate the Mercury app icon: base SVGs, an Icon Composer .icon bundle, and a legacy .icns.

Usage: python3 scripts/make-icon.py [build-dir]   (default: build/)
Needs `resvg` (brew install resvg) and macOS `iconutil`. No Python packages.

Outputs:
  build/icon-svg/      background, wing, bubble (flat layers) + composite.svg (flattened .icns art)
  build/icon.icon/     Icon Composer bundle (Liquid Glass source; compiling it needs Xcode 26's actool)
  build/icon.icns      legacy icon: full-bleed opaque square; macOS applies its own mask
"""
import json, math, os, shutil, subprocess, sys, tempfile

OUT = sys.argv[1] if len(sys.argv) > 1 else "build"
TOP, BOTTOM = "#2C2D34", "#101013"  # background gradient: graphite to near-black


def svg(body, defs=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" '
            f'width="1024" height="1024">{defs}{body}</svg>\n')


# Mark: an outline speech bubble whose ring sweeps into a three-feather wing (Mercury's).
# Both layers share one userSpace chrome gradient so the metal reads as one continuous piece.
cx, cy, r, ring_w = 440, 590, 210, 72
def on_ring(deg):
    t = math.radians(deg)
    return cx + r * math.cos(t), cy + r * math.sin(t)
a1, a2 = on_ring(122), on_ring(152)
bubble_d = f"M{a1[0]:.1f},{a1[1]:.1f} A{r},{r} 0 1 0 {a2[0]:.1f},{a2[1]:.1f} L232,830 Z"
wing_d = ("M470,382 C610,350 760,280 870,180 C840,280 770,360 650,422 Z "
          "M642,460 C730,440 810,390 862,340 C832,418 770,470 670,508 Z "
          "M660,550 C730,538 790,508 828,480 C802,550 750,586 660,600 Z")
# Chrome: bright sky on top, a dark horizon band, bright floor (liquid-metal reflection).
chrome = ('<linearGradient id="chrome" gradientUnits="userSpaceOnUse" x1="0" y1="180" x2="120" y2="870">'
          '<stop offset="0" stop-color="#FFFFFF"/><stop offset="0.35" stop-color="#D3D7E0"/>'
          '<stop offset="0.55" stop-color="#7C8191"/><stop offset="0.75" stop-color="#B9BECB"/>'
          '<stop offset="1" stop-color="#EEF0F5"/></linearGradient>')
bubble_el = (f'<path d="{bubble_d}" fill="none" stroke="url(#chrome)" stroke-width="{ring_w}" '
             'stroke-linejoin="round"/>')
wing_el = f'<path d="{wing_d}" fill="url(#chrome)"/>'
# Specular glints, composite only (Icon Composer adds its own specular to the glass layers).
g1, g2 = on_ring(200), on_ring(245)
glints = (f'<path d="M{g1[0]:.1f},{g1[1]:.1f} A{r},{r} 0 0 1 {g2[0]:.1f},{g2[1]:.1f}" fill="none" stroke="#FFFFFF" '
          'stroke-width="14" stroke-linecap="round" opacity="0.8" filter="url(#soft)"/>'
          '<path d="M560,372 C660,345 760,290 830,232" fill="none" stroke="#FFFFFF" stroke-width="8" '
          'stroke-linecap="round" opacity="0.7" filter="url(#soft)"/>')

gradient = (f'<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{TOP}"/>'
            f'<stop offset="1" stop-color="{BOTTOM}"/></linearGradient>')

# .icns art is a full-bleed opaque square: macOS 26 masks that into its own squircle, while
# art with transparent padding (the old Big Sur 824-on-1024 grid) gets shrunk onto a gray plate.
composite_defs = (
    f"<defs>{gradient}{chrome}"
    '<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>'
    '<filter id="lift" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.45"/></filter></defs>')
art = f'<g filter="url(#lift)">{wing_el}</g><g filter="url(#lift)">{bubble_el}</g>{glints}'
composite = f'<rect width="1024" height="1024" fill="url(#bg)"/>{art}'

layers = {
    "background.svg": svg('<rect width="1024" height="1024" fill="url(#bg)"/>', f"<defs>{gradient}</defs>"),
    "wing.svg": svg(wing_el, f"<defs>{chrome}</defs>"),
    "bubble.svg": svg(bubble_el, f"<defs>{chrome}</defs>"),
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
