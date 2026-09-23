"""Rook = armored security truck: tall armored cargo box with castle-like roof battlements."""
import math
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Matrix
import common
from common import BASE_TOP as B


def build():
    common.reset()
    m = common.Model("rook")
    P, A = "TEAM_PRIMARY", "TEAM_ACCENT"
    W = 0.2

    wr, ww = 0.105, 0.085
    for side, sx in (("l", -1), ("r", 1)):
        m.wheel("wheel_f" + side, (sx * 0.19, 0.24, B + wr), wr, ww, verts=12)
        m.wheel("wheel_r" + side, (sx * 0.19, -0.23, B + wr), wr, ww, verts=12)

    # chassis
    m.box((0.36, 0.72, 0.06), (0, 0, B + 0.1), "DARK_GREY")
    # cab (side profile)
    cab = [(0.37, B + 0.08), (0.385, B + 0.25), (0.31, B + 0.27), (0.27, B + 0.45),
           (0.12, B + 0.47), (0.12, B + 0.08)]
    m.prism(cab, -W, W, P)
    # armored windshield: glass with a protective bar across
    m.strip((0.272, B + 0.44), (0.308, B + 0.285), 0.006, -0.17, 0.17, "GLASS")
    m.box((0.4, 0.02, 0.025), (0, 0.297, B + 0.37), P, rot=(-24, 0, 0))
    for sx in (-1, 1):
        m.box((0.006, 0.09, 0.07), (sx * (W + 0.002), 0.2, B + 0.38), "GLASS")
        # mirrors
        m.box((0.02, 0.02, 0.06), (sx * (W + 0.03), 0.3, B + 0.33), "BLACK")
    # bumper, grille, bull bar, lights
    m.box((0.44, 0.06, 0.06), (0, 0.39, B + 0.1), "BLACK", bevel=0.01)
    m.box((0.26, 0.012, 0.1), (0, 0.388, B + 0.19), "CHROME")
    for k in range(4):
        m.box((0.24, 0.014, 0.008), (0, 0.395, B + 0.155 + k * 0.024), "BLACK")
    for sx in (-1, 1):
        m.box((0.06, 0.012, 0.04), (sx * 0.15, 0.388, B + 0.2), "HEADLIGHT")
        m.limb((sx * 0.1, 0.42, B + 0.08), (sx * 0.1, 0.42, B + 0.23), 0.012, "BLACK", verts=6)
    m.limb((-0.1, 0.42, B + 0.23), (0.1, 0.42, B + 0.23), 0.012, "BLACK", verts=6)
    # cab roof beacons
    for sx in (-1, 1):
        m.cyl(0.025, 0.02, (sx * 0.11, 0.2, B + 0.48), "BLACK", verts=8)
        m.sphere(0.024, (sx * 0.11, 0.2, B + 0.495), "AMBER", scale=(1, 1, 1.1), seg=8, rings=5)

    # armored cargo box
    cz0, cz1, cy0, cy1 = B + 0.08, B + 0.63, -0.385, 0.11
    m.box((2 * W + 0.02, cy1 - cy0, cz1 - cz0), (0, (cy0 + cy1) / 2, (cz0 + cz1) / 2), P, bevel=0.015)
    # team band + riveted armor seams
    m.box((2 * W + 0.03, cy1 - cy0 + 0.01, 0.07), (0, (cy0 + cy1) / 2, B + 0.42), A)
    for sx in (-1, 1):
        for y in (-0.22, -0.05):
            m.box((0.008, 0.012, 0.3), (sx * (W + 0.012), y, B + 0.24), "DARK_GREY")
        # shield emblem
        m.disc((sx * (W + 0.018), -0.13, B + 0.54), (sx, 0, 0), 0.05, 0.008, A, verts=6, spin=30)
        m.disc((sx * (W + 0.022), -0.13, B + 0.54), (sx, 0, 0), 0.026, 0.006, "GOLD", verts=6, spin=30)
        # side skirt / armor between wheels
        m.box((0.02, 0.2, 0.06), (sx * (W + 0.005), 0.005, B + 0.1), "DARK_GREY")
        # gun-port slits
        m.box((0.008, 0.08, 0.018), (sx * (W + 0.012), -0.3, B + 0.35), "BLACK")
    # rear: vault door
    m.box((0.006, 0.006, 0.44), (0, cy0 - 0.001, B + 0.33), "BLACK")
    m.torus(0.055, 0.008, (0, cy0 - 0.012, B + 0.3), "CHROME", rot=(90, 0, 0), seg=12, sides=4)
    for a in (0, 60, 120):
        m.box((0.11, 0.008, 0.008), (0, cy0 - 0.012, B + 0.3), "CHROME", rot=(0, a, 0))
    for sx in (-1, 1):
        m.box((0.05, 0.012, 0.03), (sx * 0.15, cy0 - 0.004, B + 0.14), "TAILLIGHT")
    m.box((0.42, 0.05, 0.04), (0, cy0 - 0.01, B + 0.09), "BLACK")

    # castle battlements on the roof (the "rook" read)
    t = 0.07
    merlons = []
    for y in (cy0 + 0.04, (cy0 + cy1) / 2, cy1 - 0.04):
        for sx in (-1, 1):
            merlons.append((sx * (W - 0.03), y))
    for x in (0,):
        merlons += [(x, cy0 + 0.04), (x, cy1 - 0.04)]
    for x, y in merlons:
        m.box((0.075, 0.075, t), (x, y, cz1 + t / 2 - 0.005), A, bevel=0.008)
    # rotating warning beacon
    m.cyl(0.04, 0.03, (0, (cy0 + cy1) / 2, cz1 + 0.015), "BLACK", verts=10)
    m.sphere(0.036, (0, (cy0 + cy1) / 2, cz1 + 0.05), "AMBER", scale=(1, 1, 1.3), seg=10, rings=6)
    m.limb((0.12, cy0 + 0.1, cz1), (0.14, cy0 + 0.06, cz1 + 0.14), 0.005, "BLACK", verts=4)

    # squeeze into the 0.8 x 0.8 footprint
    m.transform_all(Matrix.Diagonal((0.94, 0.94, 1.0, 1.0)))
    m.base(0.35)
    return common.finish(m)


if __name__ == "__main__":
    build()
