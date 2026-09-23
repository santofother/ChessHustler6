"""Bishop = touring race car (image 1 style): wedge body, flared arches, big rear wing."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Matrix
import common
from common import BASE_TOP as B


def build():
    common.reset()
    m = common.Model("bishop")
    P, A = "TEAM_PRIMARY", "TEAM_ACCENT"
    W = 0.185  # half body width

    # wheels (oversized, toy proportions)
    wr, ww = 0.1, 0.08
    for side, sx in (("l", -1), ("r", 1)):
        m.wheel("wheel_f" + side, (sx * 0.175, 0.235, B + wr), wr, ww)
        m.wheel("wheel_r" + side, (sx * 0.175, -0.225, B + wr), wr, ww)

    # lower body (side profile, y forward)
    body = [(0.372, B + 0.045), (0.388, B + 0.1), (0.37, B + 0.145), (0.3, B + 0.165),
            (0.13, B + 0.195), (-0.3, B + 0.205), (-0.372, B + 0.2), (-0.385, B + 0.12),
            (-0.37, B + 0.05), (-0.3, B + 0.04), (0.3, B + 0.04)]
    m.prism(body, -W, W, P)
    # flared wheel arches
    for sx in (-1, 1):
        for y in (0.235, -0.225):
            m.prism([(y + 0.125, B + 0.12), (y + 0.09, B + 0.207), (y - 0.09, B + 0.207),
                     (y - 0.125, B + 0.12)], sx * (W - 0.055), sx * (W + 0.03), P)
        # side skirt
        m.box((0.03, 0.26, 0.03), (sx * (W + 0.005), 0.005, B + 0.055), "BLACK")
    # cabin glasshouse + roof panel
    cab = [(0.13, B + 0.19), (-0.02, B + 0.3), (-0.18, B + 0.3), (-0.285, B + 0.2)]
    m.prism(cab, -0.155, 0.155, "GLASS")
    m.prism([(-0.005, B + 0.3), (-0.19, B + 0.3), (-0.185, B + 0.315), (-0.01, B + 0.315)],
            -0.145, 0.145, P)
    # pillars
    for sx in (-1, 1):
        m.strip((-0.285, B + 0.2), (-0.185, B + 0.3), 0.012, sx * 0.157, sx * 0.14, P)
        m.box((0.02, 0.02, 0.1), (sx * 0.148, -0.1, B + 0.25), P)

    # livery: twin hood/roof/deck stripes + side band
    for x in (-0.05, 0.02):
        m.strip((0.13, B + 0.197), (0.3, B + 0.167), 0.004, x, x + 0.03, A)
        m.strip((0.3, B + 0.167), (0.37, B + 0.147), 0.004, x, x + 0.03, A)
        m.box((0.03, 0.18, 0.006), (x + 0.015, -0.095, B + 0.318), A)
        m.strip((-0.372, B + 0.202), (-0.29, B + 0.207), 0.004, x, x + 0.03, A)
    for sx in (-1, 1):
        m.prism([(0.1, B + 0.1), (0.14, B + 0.15), (-0.2, B + 0.17), (-0.26, B + 0.12)],
                sx * W, sx * (W + 0.006), A)
        m.disc((sx * (W + 0.006), -0.04, B + 0.135), (sx, 0, 0), 0.033, 0.006, "SHOE_WHITE", verts=12)
        # mirrors
        m.box((0.045, 0.025, 0.025), (sx * 0.175, 0.1, B + 0.225), P, rot=(0, 0, sx * 10))

    # nose: splitter, grille, headlights
    m.box((0.4, 0.07, 0.012), (0, 0.37, B + 0.04), "BLACK")
    m.box((0.18, 0.012, 0.045), (0, 0.386, B + 0.085), "BLACK")
    for sx in (-1, 1):
        m.box((0.085, 0.012, 0.03), (sx * 0.12, 0.379, B + 0.128), "HEADLIGHT", rot=(-25, 0, 0))
        m.box((0.075, 0.012, 0.03), (sx * 0.12, -0.381, B + 0.17), "TAILLIGHT")
    m.cyl(0.018, 0.04, (0.11, -0.385, B + 0.06), "CHROME", rot=(90, 0, 0), verts=8)
    m.box((0.36, 0.05, 0.035), (0, -0.37, B + 0.055), "BLACK")  # diffuser

    # big rear wing
    for sx in (-1, 1):
        m.box((0.014, 0.05, 0.12), (sx * 0.12, -0.33, B + 0.265), "BLACK")
        m.box((0.012, 0.13, 0.085), (sx * 0.222, -0.335, B + 0.335), "BLACK")
    m.box((0.44, 0.11, 0.02), (0, -0.335, B + 0.335), A, rot=(-8, 0, 0), bevel=0.004)
    m.box((0.43, 0.02, 0.012), (0, -0.39, B + 0.345), "BLACK", rot=(-8, 0, 0))

    # squeeze into the 0.8 x 0.8 footprint
    m.transform_all(Matrix.Diagonal((0.97, 0.97, 1.0, 1.0)))
    m.base(0.34)
    return common.finish(m)


if __name__ == "__main__":
    build()
