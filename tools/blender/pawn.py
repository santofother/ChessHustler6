"""Pawn = street thug: floral shirt, backwards cap, phone in hand."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common
from figure import figure


def build():
    common.reset()
    m = common.Model("pawn")
    m.base(0.3)
    figure(m, s=1.0, w=1.0, king=False)
    return common.finish(m)


if __name__ == "__main__":
    build()
