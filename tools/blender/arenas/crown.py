"""Crown Hills props -> public/models/arenas/crown/."""
import math

from mathutils import Vector

import common
import propkit as K


def mansion():
    """Mediterranean / art-deco mansion facade (front half), 24 x 10 x 11, front = -Y."""
    K.begin()
    K.tint("TINT_Wall", "#f1e6cf", 0.8)
    K.tint("TINT_Roof", "#c7643a", 0.8)
    K.emissive("EMISSIVE_Windows", "#ffd79a")
    m = common.Model("mansion")
    W, D = 24.0, 10.0
    # main block (two storeys) + raised centre pavilion
    m.box((W, D, 7.0), (0, 0, 3.5), "TINT_Wall")
    m.box((8.0, D + 1.0, 9.0), (0, -0.5, 4.5), "TINT_Wall")
    m.box((W + 0.3, D + 0.3, 0.3), (0, 0, 3.6), "CREAM")       # floor cornice
    m.box((W + 0.4, D + 0.4, 0.35), (0, 0, 7.05), "CREAM")
    m.box((8.4, D + 1.4, 0.35), (0, -0.5, 9.05), "CREAM")
    # hipped tile roofs (prism along X with sloped ends faked by boxes)
    m.prism([(-5.2, 7.2), (0.0, 9.6), (5.2, 7.2)], -12.2, 12.2, "TINT_Roof")
    m.prism([(-6.2, 9.2), (-0.5, 11.0), (5.2, 9.2)], -4.3, 4.3, "TINT_Roof")
    for x in (-8.0, 8.0):
        m.box((1.0, 1.0, 1.6), (x, 1.0, 9.5), "TINT_Wall")      # chimneys
        m.box((1.2, 1.2, 0.2), (x, 1.0, 10.35), "CREAM")
    fy = -D / 2 - 0.03
    # ground floor arcade: arches (glass inside) between pilasters
    for i in range(-5, 6):
        x = i * 2.1
        if abs(x) < 3.0:
            continue
        m.box((1.3, 0.1, 2.2), (x, fy, 1.4), "GLASS")
        m.cyl(0.65, 0.12, (x, fy, 2.5), "GLASS", rot=(90, 0, 0), verts=10)
        m.box((1.1, 0.06, 1.6), (x, fy - 0.03, 1.3), "EMISSIVE_Windows")
        m.box((0.35, 0.3, 3.2), (x + 1.05, fy - 0.1, 1.6), "CREAM")
    # upper windows with little balconies
    for i in range(-5, 6):
        x = i * 2.1
        if abs(x) < 3.0:
            continue
        m.box((1.0, 0.1, 1.6), (x, fy, 5.2), "GLASS")
        m.box((0.8, 0.06, 1.2), (x, fy - 0.03, 5.1), "EMISSIVE_Windows")
        m.box((1.3, 0.12, 0.15), (x, fy - 0.05, 6.1), "CREAM")
        if i % 2 == 0:
            m.box((1.6, 0.7, 0.12), (x, fy - 0.35, 4.3), "CREAM")
            for k in range(5):
                m.cyl(0.05, 0.6, (x - 0.7 + k * 0.35, fy - 0.62, 4.66), "CREAM", verts=6)
            m.box((1.6, 0.1, 0.08), (x, fy - 0.64, 5.0), "CREAM")
    # centre: grand arched entrance + deco fins + big arched window above
    cy = fy - 1.0
    m.box((3.0, 0.1, 3.4), (0, cy, 1.9), "GLASS")
    m.cyl(1.5, 0.12, (0, cy, 3.6), "GLASS", rot=(90, 0, 0), verts=14)
    m.box((2.2, 0.06, 2.6), (0, cy - 0.03, 1.5), "EMISSIVE_Windows")
    m.box((2.0, 0.1, 2.6), (0, cy, 6.3), "GLASS")
    m.cyl(1.0, 0.12, (0, cy, 7.6), "GLASS", rot=(90, 0, 0), verts=12)
    m.box((1.6, 0.06, 2.0), (0, cy - 0.03, 6.2), "EMISSIVE_Windows")
    for sx in (-1, 1):
        m.box((0.3, 0.4, 8.8), (sx * 2.6, cy - 0.1, 4.4), "CREAM")      # deco fins
        m.box((0.2, 0.3, 7.6), (sx * 3.4, cy - 0.05, 3.8), "CREAM")
        m.cyl(0.35, 4.0, (sx * 1.9, cy - 1.2, 2.0), "CREAM", verts=10)  # portico columns
    m.box((5.0, 2.6, 0.35), (0, cy - 1.0, 4.15), "CREAM")                # portico roof / balcony
    for k in range(9):
        m.cyl(0.05, 0.7, (-2.2 + k * 0.55, cy - 2.2, 4.7), "CREAM", verts=6)
    m.box((5.0, 0.12, 0.1), (0, cy - 2.2, 5.08), "CREAM")
    for k in range(4):  # front steps
        m.box((6.0 - k * 0.5, 0.45, 0.16), (0, cy - 3.2 + k * 0.45, 0.08 + k * 0.16), "SAND_STONE")
    return K.finish(m.build_objects(), "arenas/crown/mansion", view=(0.6, -1.0, 0.35))


def topiary():
    K.begin()
    K.tint("TINT_Leaves", "#3f8a3a", 0.8)
    m = common.Model("topiary")
    m.box((0.7, 0.7, 0.55), (0, 0, 0.275), "CREAM", bevel=0.03)
    m.box((0.78, 0.78, 0.08), (0, 0, 0.56), "SAND_STONE")
    m.cyl(0.3, 0.05, (0, 0, 0.6), "SOIL", verts=8)
    m.cyl(0.04, 0.4, (0, 0, 0.8), "WOOD_DARK", verts=6)
    m.cyl(0.32, 0.7, (0, 0, 1.1), "TINT_Leaves", r2=0.02, verts=10, smooth=True)
    m.sphere(0.2, (0, 0, 1.6), "TINT_Leaves", seg=10, rings=7)
    return K.finish(m.build_objects(), "arenas/crown/topiary")


def fountain():
    """Tiered marble fountain; node Water (material WATER) holds every water surface."""
    K.begin()
    K.tint("TINT_Stone", "#ece6da", 0.5)
    m = common.Model("fountain")
    S = "TINT_Stone"
    m.cyl(1.75, 0.5, (0, 0, 0.25), S, verts=20)
    m.cyl(1.55, 0.5, (0, 0, 0.3), "DARK_STEEL", verts=20)  # inner wall shade
    m.torus(1.68, 0.1, (0, 0, 0.52), S, seg=20, sides=4)
    m.cyl(0.25, 1.3, (0, 0, 0.9), S, r2=0.18, verts=10, smooth=True)
    m.cyl(0.9, 0.18, (0, 0, 1.5), S, r2=0.7, verts=16)
    m.torus(0.88, 0.06, (0, 0, 1.6), S, seg=16, sides=4)
    m.cyl(0.13, 0.6, (0, 0, 1.9), S, verts=8, smooth=True)
    m.cyl(0.45, 0.12, (0, 0, 2.2), S, r2=0.35, verts=12)
    m.sphere(0.12, (0, 0, 2.4), S, seg=8, rings=5)
    m.cyl(0.03, 0.2, (0, 0, 2.55), S, verts=6)
    # water surfaces + falling sheets (node Water)
    m.cyl(1.56, 0.02, (0, 0, 0.44), "WATER", verts=20, group="Water")
    m.cyl(0.8, 0.02, (0, 0, 1.6), "WATER", verts=16, group="Water")
    m.cyl(0.38, 0.02, (0, 0, 2.27), "WATER", verts=12, group="Water")
    m.cyl(0.9, 1.1, (0, 0, 1.0), "WATER", r2=0.92, verts=16, group="Water")
    m.set_pivot("Water", (0, 0, 0))
    objs = m.build_objects()
    # the falling sheet must not be capped: remove the cap faces of the water tube? keep (thin, looks like a curtain)
    return K.finish(objs, "arenas/crown/fountain")


def balustrade():
    """2 m segment, tileable along X, 1 m tall."""
    K.begin()
    K.tint("TINT_Stone", "#ece6da", 0.5)
    m = common.Model("balustrade")
    S = "TINT_Stone"
    m.box((2.0, 0.3, 0.15), (0, 0, 0.075), S)
    m.box((2.0, 0.3, 0.12), (0, 0, 0.94), S, bevel=0.02)
    for sx in (-1, 1):
        m.box((0.22, 0.26, 0.85), (sx * 0.89, 0, 0.5), S)
    for k in range(6):
        x = -0.63 + k * 0.252
        m.cyl(0.05, 0.12, (x, 0, 0.21), S, r2=0.08, verts=8)
        m.sphere(0.085, (x, 0, 0.38), S, scale=(1, 1, 1.4), seg=8, rings=5)
        m.cyl(0.04, 0.35, (x, 0, 0.67), S, r2=0.06, verts=8)
    return K.finish(m.build_objects(), "arenas/crown/balustrade")


def horse_statue():
    """Gaudy gold rearing horse on a marble plinth (1.5 x 3 x 3.5)."""
    K.begin()
    K.tint("TINT_Gold", "#ffc23d", 0.25, 0.9)
    m = common.Model("horse_statue")
    G = "TINT_Gold"
    m.box((1.5, 2.6, 0.9), (0, 0, 0.45), "WHITE", bevel=0.04)
    m.box((1.6, 2.7, 0.1), (0, 0, 0.95), "CREAM")
    base = Vector((0, 0, 1.0))
    # hind legs planted, body rearing ~40 deg, head up; front = -Y
    hip = base + Vector((0, 0.6, 1.0))
    sh = base + Vector((0, -0.3, 1.9))
    for sx in (-1, 1):
        m.limb(base + Vector((sx * 0.22, 0.7, 0.05)), hip + Vector((sx * 0.22, 0, -0.4)), 0.09, G, r2=0.13, verts=6)
        m.limb(base + Vector((sx * 0.22, 0.55, 0.05)), base + Vector((sx * 0.22, 0.7, 0.05)), 0.07, G, verts=6)
        m.limb(sh + Vector((sx * 0.2, -0.1, -0.1)), sh + Vector((sx * 0.2, -0.55, -0.35)), 0.09, G, verts=6)
        m.limb(sh + Vector((sx * 0.2, -0.55, -0.35)), sh + Vector((sx * 0.2, -0.6, -0.8 + 0.25 * sx)), 0.07, G,
               verts=6)
    m.limb(hip, sh, 0.42, G, r2=0.45, verts=10)
    m.sphere(0.44, hip, G, seg=10, rings=6)
    m.sphere(0.46, sh, G, seg=10, rings=6)
    neck = sh + Vector((0, -0.35, 0.75))
    m.limb(sh + Vector((0, -0.1, 0.2)), neck, 0.24, G, r2=0.18, verts=8)
    head = neck + Vector((0, -0.35, 0.05))
    m.limb(neck, head, 0.17, G, r2=0.12, verts=8)
    for sx in (-1, 1):
        m.cyl(0.04, 0.18, neck + Vector((sx * 0.08, 0.02, 0.2)), G, r2=0.0, verts=4)
    m.box((0.08, 0.5, 0.35), sh + Vector((0, -0.15, 0.55)), G, rot=(-50, 0, 0))  # mane
    m.limb(hip + Vector((0, 0.35, 0.1)), hip + Vector((0, 0.75, -0.6)), 0.1, G, r2=0.04, verts=6)  # tail
    m.box((0.3, 0.02, 0.12), (0, -1.36, 0.55), "GOLD")  # plaque
    return K.finish(m.build_objects(), "arenas/crown/horse_statue")


def golf_cart():
    K.begin()
    K.tint("TINT_Body", "#f2f0ea", 0.4, 0.2)
    K.tint("TINT_Roof", "#1f7a4d", 0.7)
    m = common.Model("golf_cart")
    B = "TINT_Body"
    m.prism([(-1.2, 0.25), (-1.2, 0.7), (-0.9, 0.75), (-0.6, 0.6), (1.1, 0.6), (1.2, 0.45), (1.2, 0.25)],
            -0.58, 0.58, B, bevel=0.03)
    m.box((1.0, 0.5, 0.14), (0, 0.15, 0.72), "BLACK", bevel=0.03)   # seat
    m.box((1.0, 0.1, 0.4), (0, 0.42, 0.95), "BLACK", bevel=0.03)
    m.box((0.9, 0.5, 0.35), (0, 0.9, 0.78), "DARK_STEEL")          # bag rack
    for x in (-0.25, 0.1, 0.35):
        m.cyl(0.1, 0.8, (x, 0.95, 1.05), "SIREN_RED" if x < 0 else "SIREN_BLUE", verts=8)
    for sx in (-1, 1):
        for y in (-0.75, 0.55):
            m.cyl(0.025, 1.1 if y < 0 else 1.2, (sx * 0.52, y, 1.2 if y < 0 else 1.25), "CHROME", verts=6)
    m.box((1.2, 1.7, 0.06), (0, -0.1, 1.82), "TINT_Roof", bevel=0.02)
    m.prism([(-0.72, 0.8), (-0.78, 1.75), (-0.76, 1.75), (-0.7, 0.8)], -0.5, 0.5, "GLASS")
    m.limb((0, -0.55, 0.75), (0, -0.4, 1.05), 0.02, "DARK_STEEL", verts=6)
    m.torus(0.13, 0.02, (0, -0.38, 1.07), "BLACK", rot=(-55, 0, 0), seg=10, sides=4)
    for sx in (-1, 1):
        for y in (-0.8, 0.8):
            m.cyl(0.2, 0.16, (sx * 0.52, y, 0.2), "TIRE", rot=(0, 90, 0), verts=12)
            m.cyl(0.1, 0.17, (sx * 0.52, y, 0.2), "CHROME", rot=(0, 90, 0), verts=8)
        m.box((0.14, 0.04, 0.06), (sx * 0.4, -1.21, 0.6), "HEADLIGHT")
    return K.finish(m.build_objects(), "arenas/crown/golf_cart")


BUILDERS = {"mansion": mansion, "topiary": topiary, "fountain": fountain, "balustrade": balustrade,
            "horse_statue": horse_statue, "golf_cart": golf_cart}
