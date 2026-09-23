"""Prop: 2 m chain-link fence segment (runs along X, top overhang leans to the front / glTF -Z).
Wire diamonds are real thin geometry; a faint alpha sheet (material CHAINLINK) fills the mesh."""
import math
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common

HALF = 1.0
Z0, Z1 = 0.05, 2.0
OVER = (0.32, 0.32)  # overhang offset (y, z)


def clip_line(sign, c):
    """Segment of the line z = sign*x + c inside the fence rectangle, or None."""
    pts = []
    for x in (-HALF, HALF):
        z = sign * x + c
        if Z0 <= z <= Z1:
            pts.append((x, z))
    for z in (Z0, Z1):
        x = (z - c) / sign
        if -HALF <= x <= HALF:
            pts.append((x, z))
    pts = sorted(set((round(x, 5), round(z, 5)) for x, z in pts))
    if len(pts) < 2:
        return None
    return pts[0], pts[-1]


def build():
    common.reset()
    m = common.Model("fence")
    # posts + overhang arms
    for x in (-HALF, HALF):
        m.cyl(0.04, Z1 + 0.05, (x, 0, (Z1 + 0.05) / 2), "GALV", verts=8)
        m.cyl(0.05, 0.03, (x, 0, Z1 + 0.06), "GALV", verts=8)
        m.limb((x, 0, Z1), (x, OVER[0], Z1 + OVER[1]), 0.022, "GALV", verts=6, smooth=False)
        m.cyl(0.07, 0.08, (x, 0, 0.04), "CONCRETE", verts=8)
    # rails
    for z in (Z0, Z1, 1.0):
        m.limb((-HALF, 0, z), (HALF, 0, z), 0.018, "GALV", verts=6, smooth=False)
    # barbed strands on the overhang
    for k in range(1, 4):
        f = k / 3
        m.limb((-HALF, OVER[0] * f, Z1 + OVER[1] * f), (HALF, OVER[0] * f, Z1 + OVER[1] * f),
               0.006, "GALV", verts=4, smooth=False)
    # diamond chain-link wires
    step = 0.26
    for sign in (1, -1):
        c = -3.0
        while c < 3.0:
            seg = clip_line(sign, c)
            if seg:
                (xa, za), (xb, zb) = seg
                m.limb((xa, 0, za), (xb, 0, zb), 0.007, "GALV", verts=3, smooth=False)
            c += step
    # translucent mesh fill (double sided via two faces with slight offset)
    e = 0.004
    m.mesh([(-HALF, e, Z0), (HALF, e, Z0), (HALF, e, Z1), (-HALF, e, Z1),
            (-HALF, -e, Z0), (HALF, -e, Z0), (HALF, -e, Z1), (-HALF, -e, Z1)],
           [(0, 1, 2, 3), (7, 6, 5, 4)], "CHAINLINK", recalc=False)
    return common.finish(m, view=(0.7, 1.0, 0.5))


if __name__ == "__main__":
    build()
