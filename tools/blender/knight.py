"""Knight = sport bike with rider, popping a wheelie (the rearing-horse read)."""
import math
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Matrix, Vector
import common
from common import BASE_TOP as B


def build():
    common.reset()
    m = common.Model("knight")
    P, A = "TEAM_PRIMARY", "TEAM_ACCENT"
    wr = 0.125
    fy, ry = 0.26, -0.25
    fz = rz = B + wr

    m.wheel("wheel_front", (0, fy, fz), wr, 0.065, verts=16)
    m.wheel("wheel_rear", (0, ry, rz), wr, 0.075, verts=16)

    # fork, handlebars
    for sx in (-1, 1):
        m.limb((sx * 0.04, fy, fz), (sx * 0.04, 0.17, B + 0.39), 0.014, "CHROME", verts=6)
    m.limb((-0.13, 0.155, B + 0.4), (0.13, 0.155, B + 0.4), 0.011, "BLACK", verts=6)
    # front fender
    m.strip((fy - 0.09, fz + wr + 0.01), (fy + 0.06, fz + wr - 0.01), 0.012, -0.04, 0.04, P)

    # fairing / body
    body = [(0.31, B + 0.27), (0.26, B + 0.38), (0.12, B + 0.37), (0.02, B + 0.395),
            (-0.07, B + 0.34), (-0.12, B + 0.22), (0.0, B + 0.14), (0.2, B + 0.17)]
    m.prism(body, -0.078, 0.078, P)
    # upswept tail
    m.prism([(-0.05, B + 0.34), (-0.29, B + 0.41), (-0.32, B + 0.385), (-0.13, B + 0.25)],
            -0.058, 0.058, P)
    m.box((0.06, 0.012, 0.02), (0, -0.315, B + 0.395), "TAILLIGHT", rot=(-20, 0, 0))
    # seat
    m.prism([(-0.03, B + 0.35), (-0.19, B + 0.385), (-0.19, B + 0.405), (-0.03, B + 0.37)],
            -0.062, 0.062, "BLACK")
    # windscreen
    m.prism([(0.26, B + 0.375), (0.2, B + 0.455), (0.185, B + 0.45), (0.24, B + 0.37)],
            -0.055, 0.055, "GLASS")
    # headlight
    m.strip((0.26, B + 0.38), (0.31, B + 0.275), 0.006, -0.045, 0.045, "HEADLIGHT")
    # livery stripe (both sides)
    for x0, x1 in ((0.078, 0.084), (-0.084, -0.078)):
        m.prism([(0.29, B + 0.29), (0.275, B + 0.325), (-0.08, B + 0.3), (-0.07, B + 0.26)], x0, x1, A)
        m.prism([(-0.1, B + 0.33), (-0.26, B + 0.385), (-0.27, B + 0.37), (-0.11, B + 0.31)],
                x0 * 0.75, x1 * 0.75, A)
    # engine, swingarm, exhaust
    m.box((0.11, 0.17, 0.11), (0, 0.02, B + 0.17), "DARK_GREY", bevel=0.01)
    for sx in (-1, 1):
        m.limb((sx * 0.045, ry, rz), (sx * 0.045, -0.06, B + 0.2), 0.016, "DARK_GREY", verts=6)
    m.limb((0.07, 0.0, B + 0.14), (0.075, -0.27, B + 0.3), 0.024, "CHROME", verts=8)
    m.cyl(0.03, 0.02, (0.075, -0.28, B + 0.307), "BLACK", rot=(-60, 0, 0), verts=8)

    # ---- rider (tucked racing pose)
    suit = "BLACK"
    hip = Vector((0, -0.11, B + 0.43))
    chest = Vector((0, 0.03, B + 0.54))
    m.limb(hip, chest, 0.07, suit, r2=0.078, verts=10)
    m.sphere(0.075, chest, suit, scale=(1.15, 1, 0.9), seg=10, rings=6)
    m.sphere(0.07, hip, suit, scale=(1.1, 1, 0.8), seg=10, rings=6)
    # suit racing stripes on the back
    m.limb(hip + Vector((0, 0, 0.062)), chest + Vector((0, 0, 0.07)), 0.022, A, verts=6)
    # helmet + visor
    hc = Vector((0, 0.1, B + 0.615))
    m.sphere(0.078, hc, P, seg=12, rings=8)
    m.sphere(0.07, hc + Vector((0, 0.025, -0.005)), "GLASS", scale=(0.95, 0.85, 0.62), seg=10, rings=6)
    m.box((0.02, 0.12, 0.012), hc + Vector((0, -0.01, 0.074)), A, rot=(-15, 0, 0))
    # arms to the bars
    for sx in (-1, 1):
        sh = Vector((sx * 0.085, 0.045, B + 0.55))
        el = Vector((sx * 0.12, 0.1, B + 0.48))
        ha = Vector((sx * 0.115, 0.155, B + 0.41))
        m.limb(sh, el, 0.03, suit, r2=0.027)
        m.limb(el, ha, 0.027, suit, r2=0.024)
        m.sphere(0.03, ha, A, seg=8, rings=5)
        # legs to the pegs
        hp = Vector((sx * 0.065, -0.1, B + 0.42))
        kn = Vector((sx * 0.1, 0.03, B + 0.36))
        ft = Vector((sx * 0.09, -0.1, B + 0.22))
        m.limb(hp, kn, 0.042, suit, r2=0.035)
        m.sphere(0.036, kn, A, seg=8, rings=5)
        m.limb(kn, ft, 0.033, suit, r2=0.028)
        m.box((0.045, 0.09, 0.045), ft + Vector((0, 0.01, -0.01)), "BLACK", bevel=0.008)

    # ---- wheelie: pitch everything nose-up about the rear axle, then re-centre
    pitch = math.radians(15)
    piv = Vector((0, ry, rz))
    R = Matrix.Translation(piv) @ Matrix.Rotation(pitch, 4, "X") @ Matrix.Translation(-piv)
    m.transform_all(R)
    lo, hi = m.bounds()
    m.transform_all(Matrix.Translation((0, -(lo.y + hi.y) / 2, B - lo.z)))
    m.base(0.34)

    return common.finish(m)


if __name__ == "__main__":
    build()
