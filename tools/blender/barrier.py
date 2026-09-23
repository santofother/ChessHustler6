"""Prop: 2 m concrete race barrier (jersey profile, runs along X) with red/white kerb
striping, plus a painted kerb strip on the track side (front = glTF -Z)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common

HALF = 1.0
LOWER = [(-0.3, 0.0), (0.3, 0.0), (0.3, 0.08), (0.13, 0.25), (-0.13, 0.25), (-0.3, 0.08)]
UPPER = [(-0.13, 0.25), (0.13, 0.25), (0.1, 0.8), (-0.1, 0.8)]


def build():
    common.reset()
    m = common.Model("barrier")
    m.prism(LOWER, -HALF, HALF, "CONCRETE")
    n = 4
    w = 2 * HALF / n
    for i in range(n):
        x0 = -HALF + i * w
        col = "KERB_RED" if i % 2 == 0 else "KERB_WHITE"
        m.prism(UPPER, x0, x0 + w, col)
        # sloped kerb on the track side
        m.prism([(0.3, 0.0), (0.7, 0.0), (0.7, 0.012), (0.3, 0.06)], x0, x0 + w,
                "KERB_WHITE" if i % 2 == 0 else "KERB_RED")
    # cap rail + lifting slots
    m.box((2 * HALF, 0.21, 0.025), (0, 0, 0.81), "CONCRETE")
    for x in (-0.6, 0.6):
        m.box((0.25, 0.62, 0.06), (x, 0, 0.03), "DARK_GREY")
    return common.finish(m, view=(0.7, 1.0, 0.55))


if __name__ == "__main__":
    build()
