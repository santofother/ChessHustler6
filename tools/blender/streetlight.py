"""Prop: ~4 m cobra-head street lamp; arm reaches toward the front (glTF -Z).
The lamp lens uses the emissive material LAMP_EMISSIVE."""
import math
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector
import common


def build():
    common.reset()
    m = common.Model("streetlight")
    m.cyl(0.18, 0.12, (0, 0, 0.06), "CONCRETE", verts=8)
    m.cyl(0.11, 0.35, (0, 0, 0.295), "POLE", r2=0.08, verts=8)
    m.cyl(0.065, 3.45, (0, 0, 0.47 + 3.45 / 2), "POLE", r2=0.045, verts=8, smooth=True)
    # curved arm: quarter arc from vertical to horizontal
    R = 0.55
    c = Vector((0, R, 3.9))
    pts = [c + Vector((0, -R * math.cos(a), R * math.sin(a)))
           for a in [math.radians(d) for d in (0, 22, 45, 67, 90)]]
    for a, b in zip(pts, pts[1:]):
        m.limb(a, b, 0.045, "POLE", verts=8, smooth=True)
    tip = pts[-1]
    end = tip + Vector((0, 0.35, -0.03))
    m.limb(tip, end, 0.04, "POLE", verts=8, smooth=True)
    # cobra head
    hc = end + Vector((0, 0.2, -0.02))
    m.box((0.3, 0.52, 0.11), hc, "POLE", rot=(4, 0, 0), bevel=0.03)
    m.box((0.22, 0.4, 0.03), hc + Vector((0, 0.01, -0.06)), "LAMP_EMISSIVE", rot=(4, 0, 0))
    # small accent: banner bracket
    m.box((0.02, 0.35, 0.7), (0, 0.2, 2.6), "KERB_RED")
    m.limb((0, 0.02, 2.95), (0, 0.38, 2.95), 0.012, "POLE", verts=4, smooth=False)
    m.limb((0, 0.02, 2.25), (0, 0.38, 2.25), 0.012, "POLE", verts=4, smooth=False)
    return common.finish(m, view=(1.0, 0.9, 0.45))


if __name__ == "__main__":
    build()
