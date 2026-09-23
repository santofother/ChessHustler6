"""Queen = police/news helicopter hovering on a display stand.
Nodes: `rotor` (main rotor, spins around glTF +Y) and `tail_rotor` (spins around X)."""
import math
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Matrix
import common
from common import BASE_TOP as B


def build():
    common.reset()
    m = common.Model("queen")
    P, A = "TEAM_PRIMARY", "TEAM_ACCENT"

    # display stand
    m.cyl(0.06, 0.03, (0, 0, B + 0.015), "DARK_GREY", r2=0.035, verts=10)
    m.cyl(0.018, 0.56, (0, -0.04, B + 0.3), "CHROME", verts=8)

    # fuselage
    fc = (0, 0.08, 0.72)
    m.sphere(0.175, fc, P, scale=(1.0, 1.4, 0.92), seg=16, rings=10)
    m.cyl(0.177, 0.05, (0, 0.08, 0.7), A, verts=16, scale=(1.0, 1.4, 1))  # team band
    # glass canopy bubble at the nose
    m.sphere(0.135, (0, 0.2, 0.745), "GLASS", scale=(1.0, 1.08, 0.82), seg=12, rings=8)
    for sx in (-1, 1):
        m.disc((sx * 0.158, 0.09, 0.765), (sx, 0.35, 0.1), 0.06, 0.02, "GLASS", verts=8, spin=22.5)
    # engine housing + mast
    m.box((0.17, 0.26, 0.08), (0, 0.02, 0.87), P, bevel=0.02)
    m.box((0.06, 0.06, 0.03), (0, -0.1, 0.895), "DARK_GREY")
    m.cyl(0.025, 0.12, (0, -0.04, 0.95), "DARK_GREY", verts=8)
    # siren lights on top
    m.box((0.035, 0.06, 0.025), (-0.05, 0.14, 0.9), "SIREN_RED", bevel=0.006)
    m.box((0.035, 0.06, 0.025), (0.05, 0.14, 0.9), "SIREN_BLUE", bevel=0.006)
    # searchlight under the nose
    m.cyl(0.03, 0.05, (0, 0.27, 0.6), "CHROME", rot=(70, 0, 0), verts=8)
    m.disc((0, 0.295, 0.592), (0, 1, -0.36), 0.024, 0.006, "HEADLIGHT", verts=8)

    # tail boom, fin, stabilizer
    m.limb((0, -0.1, 0.75), (0, -0.4, 0.8), 0.07, P, r2=0.028, verts=10, smooth=True)
    m.prism([(-0.33, 0.78), (-0.4, 0.96), (-0.45, 0.96), (-0.43, 0.77)], -0.012, 0.012, A)
    m.box((0.2, 0.055, 0.014), (0, -0.33, 0.795), A, bevel=0.005)
    for sx in (-1, 1):
        m.box((0.01, 0.05, 0.05), (sx * 0.1, -0.33, 0.81), A)

    # skids
    for sx in (-1, 1):
        x = sx * 0.14
        m.limb((x, -0.12, 0.52), (x, 0.2, 0.52), 0.014, "DARK_GREY", verts=6)
        m.limb((x, 0.2, 0.52), (x, 0.25, 0.55), 0.014, "DARK_GREY", verts=6)
        for y in (-0.06, 0.15):
            m.limb((x, y, 0.52), (sx * 0.08, y, 0.62), 0.011, "DARK_GREY", verts=6)

    # main rotor (separate node, pivot on the hub)
    hub = (0, -0.04, 1.02)
    g = "rotor"
    m.cyl(0.045, 0.04, hub, "DARK_GREY", verts=10, group=g)
    m.cyl(0.02, 0.03, (0, -0.04, 1.05), A, verts=8, group=g)
    for k in range(4):
        a = 45 + k * 90
        dx, dy = math.cos(math.radians(a)), math.sin(math.radians(a))
        L = 0.4
        m.box((L - 0.04, 0.08, 0.016), (hub[0] + dx * (0.02 + (L - 0.04) / 2),
                                        hub[1] + dy * (0.02 + (L - 0.04) / 2), hub[2] + 0.006),
              "BLACK", rot=(0, 0, a), group=g)
        m.box((0.06, 0.067, 0.016), (hub[0] + dx * (L - 0.04), hub[1] + dy * (L - 0.04), hub[2] + 0.006),
              A, rot=(0, 0, a), group=g)
    m.set_pivot(g, hub)

    # tail rotor (separate node, spins around X)
    tc = (0.03, -0.41, 0.88)
    g = "tail_rotor"
    m.cyl(0.02, 0.025, tc, "DARK_GREY", rot=(0, 90, 0), verts=8, group=g)
    for a in (0, 90):
        m.box((0.01, 0.028, 0.16), (tc[0] + 0.006, tc[1], tc[2]), "BLACK", rot=(a, 0, 0), group=g)
    m.set_pivot(g, tc)

    # squeeze into the 0.8 x 0.8 footprint (rotor sweep + tail)
    m.transform_all(Matrix.Diagonal((0.9, 0.9, 1.0, 1.0)) @ Matrix.Translation((0, 0.04, 0)))
    m.base(0.34)
    return common.finish(m)


if __name__ == "__main__":
    build()
