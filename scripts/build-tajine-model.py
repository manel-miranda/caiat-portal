#!/usr/bin/env python3
"""
Builds the photo-based prototype dish used by the guest portal 3D/AR preview.

Input : a real photo of the tajine plate (not committed; pass with --photo).
Output: public/models/caiat-tajine.gltf + .bin + .jpg  (~34 cm plate, real scale)

Usage: python3 scripts/build-tajine-model.py --photo /path/to/photo.jpg
"""
import argparse, base64, json, math, os, struct

R = 0.17          # plate radius (m) -> ~34 cm across
SEG = 128         # radial segments
RINGS = 40        # rings from centre to rim
OUT_DIR = "public/models"
NAME = "caiat-tajine"


def build_texture(photo, ellipse):
    from PIL import Image, ImageEnhance
    im = Image.open(photo).convert("RGB")
    xc, yc, rx, ry = ellipse
    quad = (xc - rx, yc, xc, yc + ry, xc + rx, yc, xc, yc - ry)
    out = im.transform((1024, 1024), Image.QUAD, quad, Image.BICUBIC)
    out = ImageEnhance.Color(out).enhance(1.08)
    out.save(os.path.join(OUT_DIR, f"{NAME}.jpg"), quality=88)


def profile(t):
    """Height (m) of the plate surface at normalised radius t in [0,1]."""
    if t <= 0.60:                       # mounded food in the centre
        return 0.040 + 0.016 * math.cos(t / 0.60 * math.pi / 2)
    if t <= 0.80:                       # inner wall rising to the rim
        k = (t - 0.60) / 0.20
        return 0.040 + 0.020 * (1 - math.cos(k * math.pi / 2))
    k = (t - 0.80) / 0.20               # flat outer rim, slight outward fall
    return 0.060 - 0.008 * k * k


def add_normals(pos, idx):
    n = [[0.0, 0.0, 0.0] for _ in pos]
    for a, b, c in zip(idx[0::3], idx[1::3], idx[2::3]):
        p, q, r = pos[a], pos[b], pos[c]
        u = (q[0] - p[0], q[1] - p[1], q[2] - p[2])
        v = (r[0] - p[0], r[1] - p[1], r[2] - p[2])
        f = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
        for i in (a, b, c):
            n[i][0] += f[0]; n[i][1] += f[1]; n[i][2] += f[2]
    out = []
    for x, y, z in n:
        m = math.sqrt(x * x + y * y + z * z) or 1.0
        out.append((x / m, y / m, z / m))
    return out


def top_surface():
    pos, uv, idx = [], [], []
    for ri in range(RINGS + 1):
        t = ri / RINGS
        r = t * R
        y = profile(t)
        for si in range(SEG + 1):
            a = si / SEG * math.tau
            x, z = math.cos(a) * r, math.sin(a) * r
            pos.append((x, y, z))
            uv.append((0.5 + x / (2 * R), 0.5 + z / (2 * R)))
    row = SEG + 1
    for ri in range(RINGS):
        for si in range(SEG):
            a = ri * row + si; b = a + 1; c = a + row; d = c + 1
            idx += [a, b, c, b, d, c]
    return pos, uv, idx


def body():
    """Dark ceramic outer wall + foot + bottom."""
    rim_y = profile(1.0)
    levels = [(R, rim_y), (R * 1.01, rim_y - 0.010), (R * 0.95, 0.018), (R * 0.70, 0.005), (R * 0.60, 0.0)]
    pos, idx = [], []
    for r, y in levels:
        for si in range(SEG + 1):
            a = si / SEG * math.tau
            pos.append((math.cos(a) * r, y, math.sin(a) * r))
    row = SEG + 1
    for li in range(len(levels) - 1):
        for si in range(SEG):
            a = li * row + si; b = a + 1; c = a + row; d = c + 1
            idx += [a, c, b, b, c, d]
    centre = len(pos)
    pos.append((0.0, 0.0, 0.0))
    base = (len(levels) - 1) * row
    for si in range(SEG):
        idx += [centre, base + si, base + si + 1]
    return pos, idx


def pack(prims):
    buf = bytearray()
    views, accs = [], []

    def add(data, fmt, target, comp_type, typ, count, mn, mx):
        off = len(buf)
        buf.extend(data)
        while len(buf) % 4:
            buf.append(0)
        views.append({"buffer": 0, "byteOffset": off, "byteLength": len(data), "target": target})
        acc = {"bufferView": len(views) - 1, "componentType": comp_type, "count": count, "type": typ}
        if mn:
            acc["min"], acc["max"] = mn, mx
        accs.append(acc)
        return len(accs) - 1

    out = []
    for p in prims:
        pos, nor, uv, idx = p["pos"], p["nor"], p.get("uv"), p["idx"]
        flat = [c for v in pos for c in v]
        mn = [min(v[i] for v in pos) for i in range(3)]
        mx = [max(v[i] for v in pos) for i in range(3)]
        a_pos = add(struct.pack(f"<{len(flat)}f", *flat), "f", 34962, 5126, "VEC3", len(pos), mn, mx)
        flat = [c for v in nor for c in v]
        a_nor = add(struct.pack(f"<{len(flat)}f", *flat), "f", 34962, 5126, "VEC3", len(nor), None, None)
        attrs = {"POSITION": a_pos, "NORMAL": a_nor}
        if uv:
            flat = [c for v in uv for c in v]
            attrs["TEXCOORD_0"] = add(struct.pack(f"<{len(flat)}f", *flat), "f", 34962, 5126, "VEC2", len(uv), None, None)
        a_idx = add(struct.pack(f"<{len(idx)}I", *idx), "I", 34963, 5125, "SCALAR", len(idx), None, None)
        out.append({"attributes": attrs, "indices": a_idx, "material": p["material"]})
    return out, bytes(buf), views, accs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--photo")
    ap.add_argument("--ellipse", default="876,1954,988,649", help="xc,yc,rx,ry of the plate rim in the photo")
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    if args.photo:
        build_texture(args.photo, tuple(float(v) for v in args.ellipse.split(",")))

    tp, tuv, tidx = top_surface()
    bp, bidx = body()
    prims, bin_data, views, accs = pack([
        {"pos": tp, "nor": add_normals(tp, tidx), "uv": tuv, "idx": tidx, "material": 0},
        {"pos": bp, "nor": add_normals(bp, bidx), "idx": bidx, "material": 1},
    ])

    gltf = {
        "asset": {"version": "2.0", "generator": "caiat-dish-prototype"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "CaiatTajine"}],
        "meshes": [{"name": "CaiatTajine", "primitives": prims}],
        "materials": [
            {
                "name": "DishTop",
                "pbrMetallicRoughness": {
                    "baseColorTexture": {"index": 0},
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.45,
                },
            },
            {
                "name": "Ceramic",
                "pbrMetallicRoughness": {
                    "baseColorFactor": [0.16, 0.11, 0.09, 1.0],
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.55,
                },
            },
        ],
        "textures": [{"source": 0, "sampler": 0}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
        "images": [{"uri": f"{NAME}.jpg"}],
        "buffers": [{"uri": f"{NAME}.bin", "byteLength": len(bin_data)}],
        "bufferViews": [],
        "accessors": [],
    }
    gltf["bufferViews"] = views
    gltf["accessors"] = accs

    with open(os.path.join(OUT_DIR, f"{NAME}.bin"), "wb") as f:
        f.write(bin_data)
    with open(os.path.join(OUT_DIR, f"{NAME}.gltf"), "w") as f:
        json.dump(gltf, f)
    print("wrote", OUT_DIR, len(bin_data), "bytes of geometry")


if __name__ == "__main__":
    main()
