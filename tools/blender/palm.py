"""Prop: tall curved-trunk Vice City palm (~5 m)."""
import math
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector
import common

H = 4.7       # crown height
BEND = 0.65   # trunk lean (towards +X)


def trunk_pt(t):
    return Vector((BEND * t * t, 0.0, H * t))


def frond(m, top, azim, length, lift, droop, width, mat, n=6):
    """Arching V-folded leaf strip; top + bottom sheets so it is visible from both sides."""
    d = Vector((math.cos(azim), math.sin(azim), 0))
    side = Vector((-d.y, d.x, 0))
    top_rows, bot_rows = [], []
    for i in range(n + 1):
        s = i / n
        c = top + d * (length * s) + Vector((0, 0, length * (lift * s - droop * s * s)))
        w = width * (math.sin(math.pi * min(s * 1.15, 1.0)) ** 0.7) + 0.015
        fold = Vector((0, 0, -w * 0.4))
        row = [c + side * w + fold, c, c - side * w + fold]
        top_rows.append(row)
        bot_rows.append([p + Vector((0, 0, -0.025)) for p in row])
    verts, faces = [], []
    for rows, flip in ((top_rows, False), (bot_rows, True)):
        base = len(verts)
        for row in rows:
            verts.extend(tuple(p) for p in row)
        for i in range(n):
            for j in range(2):
                a = base + i * 3 + j
                q = (a, a + 1, a + 4, a + 3)
                faces.append(q[::-1] if flip else q)
    m.mesh(verts, faces, mat, recalc=False)


def build():
    common.reset()
    m = common.Model("palm")
    # flared root
    m.cyl(0.3, 0.3, (0, 0, 0.15), "BARK_DARK", r2=0.19, verts=8)
    # ringed trunk
    n = 12
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        a, b = trunk_pt(t0), trunk_pt(t1)
        r = 0.19 - 0.07 * t0
        m.limb(a, b, r * 1.12, "BARK" if i % 2 else "BARK_DARK", r2=r * 0.9, verts=8, smooth=False)
    top = trunk_pt(1.0)
    # crown bulb + coconuts
    m.sphere(0.2, top + Vector((0, 0, 0.05)), "BARK_DARK", scale=(1, 1, 1.2), seg=8, rings=6)
    for k in range(4):
        a = k * math.pi / 2 + 0.4
        m.sphere(0.1, top + Vector((math.cos(a) * 0.17, math.sin(a) * 0.17, -0.12)), "COCONUT",
                 seg=8, rings=5)
    # fronds: long drooping outer ring + shorter, perkier inner ring
    for k in range(9):
        az = 2 * math.pi * k / 9 + (0.15 if k % 2 else 0)
        frond(m, top + Vector((0, 0, 0.12)), az, 2.0 + 0.2 * (k % 3), 0.5, 1.2, 0.32,
              "FROND" if k % 2 else "FROND_LIGHT")
    for k in range(5):
        az = 2 * math.pi * k / 5 + 0.3
        frond(m, top + Vector((0, 0, 0.2)), az, 1.2, 1.0, 1.0, 0.22, "FROND_LIGHT", n=4)
    return common.finish(m, view=(0.8, 1.0, 0.45))


if __name__ == "__main__":
    build()
