"""Graffiti hangout / trap-house props -> public/models/arenas/trap/."""
import math
import random

import common
import propkit as K


def _sofa(m, width, seats, fabric, rnd, arm_mat=None, legs="WOOD_DARK", back_h=0.85, worn=True):
    """Seat faces the front (-Y). width along X."""
    arm_mat = arm_mat or fabric
    d = 0.9
    m.box((width, d, 0.3), (0, 0, 0.27), fabric, bevel=0.04)                      # base
    m.box((width, 0.22, back_h - 0.25), (0, d / 2 - 0.11, 0.25 + (back_h - 0.25) / 2 + 0.1), fabric, bevel=0.06)
    for sx in (-1, 1):
        m.box((0.2, d, 0.62), (sx * (width / 2 - 0.1), 0, 0.39), arm_mat, bevel=0.06)
        for sy in (-1, 1):
            m.box((0.06, 0.06, 0.1), (sx * (width / 2 - 0.1), sy * (d / 2 - 0.08), 0.05), legs)
    cw = (width - 0.4) / seats
    for k in range(seats):
        x = -width / 2 + 0.2 + cw * (k + 0.5)
        sag = rnd.uniform(-0.03, 0.0) if worn else 0.0
        m.box((cw - 0.02, d - 0.26, 0.16), (x, -0.1, 0.5 + sag), fabric, bevel=0.05,
              rot=(rnd.uniform(-3, 3) if worn else 0, rnd.uniform(-3, 3) if worn else 0, 0))
        m.box((cw - 0.04, 0.16, 0.42), (x, d / 2 - 0.3, 0.78 + sag), fabric, bevel=0.06,
              rot=(-12 + (rnd.uniform(-5, 5) if worn else 0), 0, 0))


def couch():
    K.begin()
    K.tint("TINT_Fabric", "#8a5a3c", 0.95)
    m = common.Model("couch")
    rnd = random.Random(3)
    _sofa(m, 2.1, 3, "TINT_Fabric", rnd)
    m.box((0.5, 0.02, 0.3), (0.55, -0.24, 0.62), "CREAM", rot=(0, 0, 8))   # a torn patch / throw
    m.box((0.45, 0.25, 0.12), (-0.7, 0.05, 0.66), "TINT_Fabric", rot=(20, 10, 25), bevel=0.04)  # cushion askew
    return K.finish(m.build_objects(), "arenas/trap/couch")


def armchair():
    K.begin()
    K.tint("TINT_Fabric", "#5d6b3c", 0.95)
    m = common.Model("armchair")
    _sofa(m, 0.9, 1, "TINT_Fabric", random.Random(5))
    return K.finish(m.build_objects(), "arenas/trap/armchair")


def fluoro_light():
    """Ceiling fixture: origin at the top (mount on the ceiling), hangs down 0.1 m."""
    K.begin()
    K.emissive("EMISSIVE_Tube", "#eaf6ff")
    m = common.Model("fluoro_light")
    m.box((1.3, 0.3, 0.05), (0, 0, -0.025), "WHITE", bevel=0.01)
    for sx in (-1, 1):
        m.cyl(0.025, 1.22, (0, sx * 0.07, -0.075), "EMISSIVE_Tube", rot=(0, 90, 0), verts=6)
        m.box((0.03, 0.26, 0.05), (sx * 0.63, 0, -0.07), "WHITE")
    return K.finish(m.build_objects(), "arenas/trap/fluoro_light", view=(0.9, -1.0, -0.5))


def arcade_cabinet():
    K.begin()
    K.tint("TINT_Cabinet", "#6a2fd6", 0.6)
    K.emissive("EMISSIVE_Screen", "#29e3d6")
    K.emissive("EMISSIVE_Marquee", "#ff5fa2")
    m = common.Model("arcade_cabinet")
    C = "TINT_Cabinet"
    # side profile (y,z): front at -y
    prof = [(0.35, 0.0), (0.35, 1.8), (-0.2, 1.8), (-0.3, 1.55), (-0.15, 1.05), (-0.4, 0.95), (-0.4, 0.85),
            (-0.25, 0.8), (-0.25, 0.0)]
    m.prism(prof, -0.36, 0.36, C)
    m.prism([(-0.2, 1.79), (-0.3, 1.56), (-0.32, 1.56), (-0.22, 1.79)], -0.33, 0.33, "EMISSIVE_Marquee")
    m.prism([(-0.28, 1.5), (-0.16, 1.1), (-0.18, 1.1), (-0.3, 1.5)], -0.3, 0.3, "EMISSIVE_Screen")
    m.box((0.66, 0.3, 0.03), (0, -0.32, 0.92), "BLACK", rot=(8, 0, 0))    # control deck
    for sx, mat in ((-0.15, "BLACK"), (0.05, "RUBBER")):
        m.cyl(0.012, 0.08, (sx, -0.34, 0.97), "BLACK", verts=6)
    m.sphere(0.03, (-0.15, -0.34, 1.02), "SIREN_RED", seg=6, rings=4)
    for k in range(3):
        m.cyl(0.022, 0.02, (0.04 + k * 0.08, -0.36, 0.95), ("SIREN_RED", "SIREN_BLUE", "AMBER")[k], verts=8)
    m.box((0.2, 0.02, 0.1), (0, -0.26, 0.55), "CHROME")  # coin door
    for sx in (-1, 1):
        m.box((0.02, 0.8, 0.05), (sx * 0.365, 0.05, 1.3), "EMISSIVE_Marquee", rot=(-20, 0, 0))  # side neon stripe
    return K.finish(m.build_objects(), "arenas/trap/arcade_cabinet")


def pool_table():
    K.begin()
    K.tint("TINT_Felt", "#1f7a4d", 0.95)
    m = common.Model("pool_table")
    Lx, Ly = 2.5, 1.4
    m.box((Lx - 0.2, Ly - 0.2, 0.06), (0, 0, 0.76), "TINT_Felt")
    for sx in (-1, 1):
        m.box((Lx, 0.12, 0.12), (0, sx * (Ly / 2 - 0.06), 0.77), "WOOD_DARK", bevel=0.02)
        m.box((0.12, Ly, 0.12), (sx * (Lx / 2 - 0.06), 0, 0.77), "WOOD_DARK", bevel=0.02)
        for sy in (-1, 1):
            m.box((0.14, 0.14, 0.7), (sx * 1.05, sy * 0.55, 0.35), "WOOD_DARK", bevel=0.02)
    m.box((Lx - 0.3, Ly - 0.3, 0.25), (0, 0, 0.6), "WOOD")
    for sx in (-1, 0, 1):
        for sy in (-1, 1):
            m.cyl(0.05, 0.02, (sx * (Lx / 2 - 0.12), sy * (Ly / 2 - 0.12), 0.8), "FELT_POCKET", verts=8)
    rnd = random.Random(9)
    cols = ["SIREN_RED", "AMBER", "SIREN_BLUE", "BLACK", "WHITE", "GOLD", "LEAF"]
    for k, c in enumerate(cols):
        m.sphere(0.03, (rnd.uniform(-0.9, 0.9), rnd.uniform(-0.45, 0.45), 0.82), c, seg=6, rings=4)
    m.limb((-0.3, 0.1, 0.815), (0.9, 0.35, 0.83), 0.012, "WOOD", verts=4)  # cue
    return K.finish(m.build_objects(), "arenas/trap/pool_table")


BUILDERS = {"couch": couch, "fluoro_light": fluoro_light, "armchair": armchair, "arcade_cabinet": arcade_cabinet,
            "pool_table": pool_table}
