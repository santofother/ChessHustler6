"""King = The Boss: big guy, floral shirt, gold chain, shades, cigar, crown on slicked hair."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common
from figure import figure


def build():
    common.reset()
    m = common.Model("king")
    m.base(0.36)
    m.torus(0.335, 0.009, (0, 0, common.BASE_TOP), "GOLD", seg=24, sides=4)
    figure(m, s=1.55, w=1.18, king=True)
    return common.finish(m)


if __name__ == "__main__":
    build()
