"""Shared props -> public/models/props/ (cars, speaker stack, lounger, plant pot, cooler, food cart).

Blender authoring frame: Z up, FRONT = -Y (exports to three.js +Z), origin at base centre.
For a vehicle facing -Y the driver's LEFT is +X, so Wheel_FL sits at (+x, -y).
"""
import math

from mathutils import Vector

import common
import propkit as K


# ================================================================================= cars
def _car_common(m, L, W, wheel_r, wheel_y, wheel_x, wheel_w=0.26, spokes=5):
    for name, sx, sy in (("Wheel_FL", 1, -1), ("Wheel_FR", -1, -1), ("Wheel_RL", 1, 1), ("Wheel_RR", -1, 1)):
        c = Vector((sx * wheel_x, sy * wheel_y, wheel_r))
        m.cyl(wheel_r, wheel_w, c, "TIRE", rot=(0, 90, 0), verts=14, group=name)
        m.cyl(wheel_r * 0.66, wheel_w + 0.01, c, "TINT_Rims", rot=(0, 90, 0), verts=14, group=name)
        for k in range(spokes):
            a = 180.0 * k / spokes
            m.box((0.02, wheel_r * 1.2, 0.05), c + Vector((sx * (wheel_w / 2 + 0.012), 0, 0)), "TINT_Rims",
                  rot=(a, 0, 0), group=name)
        m.cyl(wheel_r * 0.18, wheel_w + 0.05, c, "CHROME", rot=(0, 90, 0), verts=6, group=name)
        m.set_pivot(name, c)


def car_tuner():
    K.begin()
    K.tint("TINT_Body", "#e04f96", 0.3, 0.5)
    K.tint("TINT_Rims", "#d9d9e0", 0.22, 0.9)
    K.tint("TINT_Stripe", "#f1ede6", 0.4, 0.3)
    K.emissive("EMISSIVE_Underglow", "#ff4fd8")
    K.emissive("EMISSIVE_Headlight", "#fff1d6")
    K.emissive("EMISSIVE_Taillight", "#ff1030")
    m = common.Model("car_tuner")
    W = 0.9
    # lower body (side profile y,z; front at -y)
    m.prism([(-2.2, 0.27), (-2.25, 0.45), (-2.16, 0.6), (-1.45, 0.76), (-0.8, 0.84), (1.5, 0.86), (2.1, 0.92),
             (2.22, 0.8), (2.2, 0.36), (2.0, 0.26)], -W, W, "TINT_Body", bevel=0.04)
    # greenhouse + roof
    m.prism([(-0.82, 0.82), (-0.05, 1.19), (0.95, 1.19), (1.7, 0.86)], -0.72, 0.72, "GLASS")
    m.prism([(-0.02, 1.18), (0.97, 1.18), (0.93, 1.24), (0.05, 1.24)], -0.68, 0.68, "TINT_Body")
    for sx in (-1, 1):  # A/B pillars
        m.box((0.05, 0.08, 0.44), (sx * 0.69, -0.44, 1.0), "TINT_Body", rot=(-62, 0, 0))
        m.box((0.05, 0.09, 0.36), (sx * 0.72, 0.5, 1.02), "TINT_Body")
    # wide-body fender flares
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((0.16, 1.0, 0.26), (sx * 0.86, sy * 1.33, 0.66), "TINT_Body", bevel=0.05)
        m.box((0.05, 1.5, 0.1), (sx * 0.9, 0.0, 0.3), "TRIM", bevel=0.02)  # side skirt
        # livery: a swoosh stripe on each flank
        m.box((0.02, 2.6, 0.07), (sx * 0.915, -0.1, 0.62), "TINT_Stripe", rot=(4, 0, 0))
        m.box((0.02, 1.2, 0.05), (sx * 0.915, 0.4, 0.5), "TINT_Stripe", rot=(-6, 0, 0))
        m.box((0.1, 0.16, 0.08), (sx * 0.84, -0.62, 0.93), "TINT_Body", bevel=0.02)  # mirror
        # lights
        m.box((0.4, 0.06, 0.1), (sx * 0.58, -2.19, 0.62), "EMISSIVE_Headlight", rot=(-20, 0, sx * 6))
        m.box((0.46, 0.05, 0.1), (sx * 0.55, 2.22, 0.74), "EMISSIVE_Taillight")
        # underglow strips hugging the skirts
        m.box((0.035, 2.3, 0.02), (sx * 0.84, 0.0, 0.2), "EMISSIVE_Underglow")
    m.box((1.5, 3.4, 0.012), (0, 0, 0.215), "EMISSIVE_Underglow")
    m.box((0.9, 0.05, 0.12), (0, -2.24, 0.43), "TRIM")  # grille
    m.box((1.85, 0.3, 0.04), (0, -2.12, 0.26), "TRIM")  # splitter
    m.box((1.6, 0.18, 0.12), (0, 2.18, 0.32), "TRIM")   # diffuser
    for sx in (-1, 1):
        m.cyl(0.05, 0.14, (sx * 0.35, 2.25, 0.3), "CHROME", rot=(90, 0, 0), verts=8)
    # GT wing
    for sx in (-1, 1):
        m.box((0.05, 0.12, 0.2), (sx * 0.55, 1.98, 1.0), "TRIM")
        m.box((0.03, 0.34, 0.14), (sx * 0.86, 1.98, 1.12), "TINT_Body")
    m.box((1.74, 0.34, 0.04), (0, 1.98, 1.12), "TINT_Body", rot=(-6, 0, 0))
    _car_common(m, 4.4, 1.8, 0.34, 1.33, 0.8)
    return K.finish(m.build_objects(), "props/car_tuner")


def car_muscle():
    """80s Miami muscle convertible: long hood, open cabin with seats, chrome bumpers."""
    K.begin()
    K.tint("TINT_Body", "#2ec4d6", 0.3, 0.5)
    K.tint("TINT_Rims", "#d9d9e0", 0.22, 0.9)
    K.tint("TINT_Stripe", "#f1ede6", 0.4, 0.3)
    K.tint("TINT_Seats", "#f2e9dc", 0.6, 0.0)
    K.emissive("EMISSIVE_Underglow", "#29e3d6")
    K.emissive("EMISSIVE_Headlight", "#fff1d6")
    K.emissive("EMISSIVE_Taillight", "#ff1030")
    m = common.Model("car_muscle")
    W = 0.95
    m.prism([(-2.4, 0.3), (-2.42, 0.62), (-2.3, 0.78), (-0.6, 0.86), (-0.45, 0.9), (1.6, 0.9), (2.4, 0.86),
             (2.42, 0.36), (2.25, 0.28)], -W, W, "TINT_Body", bevel=0.04)
    # hood scoop + racing stripes
    m.box((0.5, 0.9, 0.08), (0, -1.3, 0.87), "TINT_Body", bevel=0.03)
    for sx in (-1, 1):
        m.box((0.16, 4.2, 0.012), (sx * 0.16, 0.0, 0.905), "TINT_Stripe")
    # open cabin: sunk tub (trim) + seats + windscreen frame
    m.box((1.6, 1.5, 0.06), (0, 0.4, 0.91), "TRIM")
    for sx in (-1, 1):
        m.box((0.55, 0.5, 0.16), (sx * 0.4, 0.3, 0.98), "TINT_Seats", bevel=0.04)
        m.box((0.55, 0.14, 0.5), (sx * 0.4, 0.6, 1.14), "TINT_Seats", bevel=0.05, rot=(-12, 0, 0))
    m.box((0.5, 1.0, 0.18), (0, 1.35, 0.98), "TINT_Seats", bevel=0.05)  # rear bench
    m.prism([(-0.5, 0.9), (-0.25, 1.3), (-0.19, 1.3), (-0.44, 0.9)], -0.86, 0.86, "GLASS")
    for sx in (-1, 1):
        m.box((0.05, 0.06, 0.48), (sx * 0.88, -0.36, 1.1), "CHROME", rot=(-32, 0, 0))
        m.box((0.2, 2.0, 0.04), (sx * 0.86, 0.6, 0.93), "TINT_Body")  # door tops
        m.box((0.5, 0.05, 0.1), (sx * 0.55, -2.43, 0.62), "EMISSIVE_Headlight")
        m.box((0.55, 0.05, 0.12), (sx * 0.52, 2.43, 0.68), "EMISSIVE_Taillight")
        m.box((0.035, 2.5, 0.02), (sx * 0.88, 0.0, 0.22), "EMISSIVE_Underglow")
        m.box((0.02, 3.4, 0.05), (sx * 0.955, 0.0, 0.66), "CHROME")  # side trim
    m.box((1.7, 3.8, 0.012), (0, 0, 0.23), "EMISSIVE_Underglow")
    m.box((2.0, 0.12, 0.12), (0, -2.46, 0.36), "CHROME", bevel=0.03)
    m.box((2.0, 0.12, 0.12), (0, 2.46, 0.36), "CHROME", bevel=0.03)
    m.box((1.0, 0.05, 0.14), (0, -2.44, 0.6), "TRIM")
    _car_common(m, 4.8, 1.9, 0.35, 1.5, 0.82, spokes=4)
    return K.finish(m.build_objects(), "props/car_muscle")


def car_luxury():
    """Long black-and-gold luxury sedan (valet / rooftop)."""
    K.begin()
    K.tint("TINT_Body", "#17161c", 0.25, 0.6)
    K.tint("TINT_Rims", "#ffc23d", 0.25, 0.9)
    K.tint("TINT_Stripe", "#ffc23d", 0.3, 0.8)
    K.emissive("EMISSIVE_Underglow", "#ffc23d")
    K.emissive("EMISSIVE_Headlight", "#fff1d6")
    K.emissive("EMISSIVE_Taillight", "#ff1030")
    m = common.Model("car_luxury")
    W = 1.0
    m.prism([(-2.5, 0.3), (-2.52, 0.62), (-2.4, 0.78), (-1.2, 0.9), (1.9, 0.92), (2.5, 0.88), (2.52, 0.4),
             (2.35, 0.3)], -W, W, "TINT_Body", bevel=0.05)
    m.prism([(-1.15, 0.89), (-0.35, 1.36), (1.2, 1.38), (1.95, 0.93)], -0.82, 0.82, "GLASS")
    m.prism([(-0.3, 1.35), (1.2, 1.37), (1.15, 1.42), (-0.25, 1.4)], -0.78, 0.78, "TINT_Body")
    for sx in (-1, 1):
        for y in (-0.72, 0.42, 1.55):
            m.box((0.05, 0.1, 0.5), (sx * 0.8, y, 1.12), "TINT_Body", rot=(-40 if y < 0 else (35 if y > 1 else 0), 0, 0))
        m.box((0.02, 4.4, 0.04), (sx * 1.005, 0.0, 0.8), "TINT_Stripe")
        m.box((0.02, 4.4, 0.06), (sx * 1.005, 0.0, 0.42), "CHROME")
        m.box((0.46, 0.05, 0.08), (sx * 0.62, -2.53, 0.66), "EMISSIVE_Headlight")
        m.box((0.5, 0.05, 0.08), (sx * 0.62, 2.53, 0.72), "EMISSIVE_Taillight")
        m.box((0.035, 2.6, 0.02), (sx * 0.92, 0.0, 0.22), "EMISSIVE_Underglow")
        m.box((0.1, 0.16, 0.08), (sx * 0.95, -0.9, 1.0), "TINT_Body", bevel=0.02)
    m.box((1.8, 4.0, 0.012), (0, 0, 0.23), "EMISSIVE_Underglow")
    m.box((0.7, 0.05, 0.28), (0, -2.54, 0.55), "CHROME")  # big grille
    for k in range(5):
        m.box((0.02, 0.06, 0.26), (-0.28 + k * 0.14, -2.56, 0.55), "TINT_Stripe")
    m.sphere(0.04, (0, -2.45, 0.83), "TINT_Stripe", seg=6, rings=4)  # bonnet ornament
    _car_common(m, 5.0, 2.0, 0.37, 1.62, 0.88, spokes=6)
    return K.finish(m.build_objects(), "props/car_luxury")


# ================================================================================= small props
def speaker_stack():
    K.begin()
    K.tint("TINT_Cabinet", "#23222a", 0.7)
    K.emissive("EMISSIVE_Ring", "#29e3d6")
    m = common.Model("speaker_stack")
    # stand
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((0.05, 0.05, 0.25), (sx * 0.33, sy * 0.22, 0.125), "DARK_STEEL")
    m.box((0.78, 0.56, 0.05), (0, 0, 0.27), "DARK_STEEL")
    # bass bin + two tops
    m.box((0.8, 0.6, 0.62), (0, 0, 0.605), "TINT_Cabinet", bevel=0.02)
    m.box((0.72, 0.56, 0.44), (0, 0, 1.14), "TINT_Cabinet", bevel=0.02)
    m.box((0.6, 0.5, 0.3), (0, 0, 1.51), "TINT_Cabinet", bevel=0.02)
    fy = -0.305
    m.cyl(0.24, 0.02, (0, fy, 0.6), "SPEAKER_CONE", rot=(90, 0, 0), verts=16)
    m.cyl(0.08, 0.04, (0, fy - 0.01, 0.6), "GRILLE", rot=(90, 0, 0), verts=10)
    m.torus(0.25, 0.018, (0, fy - 0.012, 0.6), "EMISSIVE_Ring", rot=(90, 0, 0), seg=20, sides=4)
    for sx in (-1, 1):
        c = (sx * 0.17, fy + 0.025, 1.14)
        m.cyl(0.13, 0.02, c, "SPEAKER_CONE", rot=(90, 0, 0), verts=12)
        m.torus(0.14, 0.012, (c[0], c[1] - 0.012, c[2]), "EMISSIVE_Ring", rot=(90, 0, 0), seg=14, sides=4)
    m.box((0.4, 0.02, 0.1), (0, fy + 0.05, 1.56), "GRILLE")
    m.cyl(0.05, 0.02, (0, fy + 0.05, 1.45), "SPEAKER_CONE", rot=(90, 0, 0), verts=8)
    return K.finish(m.build_objects(), "props/speaker_stack")


def lounge_chair():
    K.begin()
    K.tint("TINT_Cushion", "#8fd6d0", 0.8)
    m = common.Model("lounge_chair")
    # white frame: two rails + legs; length along Y, head end at +Y (back rest), foot toward -Y (front)
    for sx in (-1, 1):
        m.box((0.05, 1.5, 0.05), (sx * 0.31, -0.15, 0.32), "WHITE", bevel=0.01)
        for y in (-0.85, 0.55):
            m.box((0.05, 0.05, 0.32), (sx * 0.31, y, 0.16), "WHITE")
        m.box((0.05, 0.75, 0.05), (sx * 0.31, 0.72, 0.62), "WHITE", rot=(-52, 0, 0))
        m.cyl(0.06, 0.04, (sx * 0.31, 0.72, 0.06), "RUBBER", rot=(0, 90, 0), verts=8)  # wheels at head end
    # cushion: seat + raised back
    m.box((0.62, 1.45, 0.09), (0, -0.2, 0.39), "TINT_Cushion", bevel=0.03)
    m.box((0.62, 0.72, 0.09), (0, 0.66, 0.66), "TINT_Cushion", bevel=0.03, rot=(-52, 0, 0))
    m.box((0.4, 0.2, 0.08), (0, 0.84, 0.92), "TINT_Cushion", bevel=0.03, rot=(-52, 0, 0))  # pillow
    for y in (-0.6, -0.2, 0.2):
        m.box((0.64, 0.015, 0.02), (0, y, 0.435), "WHITE")  # piping
    return K.finish(m.build_objects(), "props/lounge_chair")


def plant_pot():
    """Tall potted bird-of-paradise."""
    K.begin()
    K.tint("TINT_Pot", "#e8dccb", 0.7)
    m = common.Model("plant_pot")
    m.cyl(0.3, 0.55, (0, 0, 0.275), "TINT_Pot", r2=0.38, verts=12, smooth=True)
    m.cyl(0.4, 0.06, (0, 0, 0.56), "TINT_Pot", verts=12)
    m.cyl(0.35, 0.03, (0, 0, 0.58), "SOIL", verts=12)
    import random
    rnd = random.Random(7)
    for k in range(9):
        a = 2 * math.pi * k / 9 + rnd.uniform(-0.2, 0.2)
        h = rnd.uniform(0.9, 1.5)
        lean = rnd.uniform(0.1, 0.25)
        base = Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, 0.58))
        top = base + Vector((math.cos(a) * lean, math.sin(a) * lean, h * 0.62))
        m.limb(base, top, 0.012, "LEAF", verts=4)
        # paddle leaf: flattened sphere along the stem direction
        d = (top - base).normalized()
        c = top + d * 0.22
        m.sphere(0.24, c, "LEAF_LIGHT" if k % 2 else "LEAF", scale=(0.28, 0.06, 1.0),
                 rot=(0, math.degrees(math.atan2(d.x, d.z)) * 0.6, math.degrees(a) + 90), seg=8, rings=5)
    for k in range(3):  # the orange "bird" flowers
        a = 2 * math.pi * k / 3 + 0.5
        c = Vector((math.cos(a) * 0.12, math.sin(a) * 0.12, 1.25 + 0.08 * k))
        m.limb(Vector((0, 0, 0.6)), c, 0.01, "LEAF", verts=4)
        m.cyl(0.03, 0.2, c + Vector((0, 0, 0.02)), "ORANGE_FLOWER", r2=0.0, rot=(0, 70, math.degrees(a)), verts=4)
    return K.finish(m.build_objects(), "props/plant_pot", view=(0.9, -1.0, 0.4))


def cooler():
    K.begin()
    K.tint("TINT_Body", "#2e7fd6", 0.5)
    m = common.Model("cooler")
    m.box((0.6, 0.4, 0.34), (0, 0, 0.17), "TINT_Body", bevel=0.03)
    m.box((0.62, 0.42, 0.09), (0, 0, 0.385), "WHITE", bevel=0.03)
    for sx in (-1, 1):
        m.box((0.03, 0.14, 0.05), (sx * 0.315, 0, 0.3), "WHITE")
    m.box((0.36, 0.03, 0.03), (0, 0, 0.445), "WHITE")
    return K.finish(m.build_objects(), "props/cooler")


def food_cart():
    """Street taco cart: box body on wheels, counter, striped canopy, glowing sign board."""
    K.begin()
    K.tint("TINT_Canopy", "#ff5fa2", 0.7)
    K.tint("TINT_Body", "#f2d34a", 0.6)
    K.emissive("EMISSIVE_Sign", "#ffd36b")
    m = common.Model("food_cart")
    # body (length along X = 2.0, depth Y = 1.2 incl. counter; serving side = front -Y)
    m.box((1.8, 0.8, 0.8), (0, 0.05, 0.62), "TINT_Body", bevel=0.03)
    m.box((1.84, 0.84, 0.05), (0, 0.05, 1.04), "STEEL")
    m.box((1.9, 0.26, 0.04), (0, -0.46, 0.96), "STEEL")  # serving shelf
    for sx in (-1, 1):
        m.box((0.04, 0.22, 0.04), (sx * 0.8, -0.44, 0.9), "STEEL", rot=(40, 0, 0))
    m.box((1.5, 0.02, 0.4), (0, -0.36, 0.62), "WHITE", bevel=0.01)  # menu panel
    for k in range(3):
        m.box((0.36, 0.01, 0.06), (-0.45 + k * 0.45, -0.372, 0.7), "TINT_Canopy")
    # glass sneeze guard + a few food trays
    m.box((1.5, 0.02, 0.24), (0, -0.2, 1.18), "GLASS")
    for k in range(4):
        m.box((0.3, 0.2, 0.05), (-0.54 + k * 0.36, 0.1, 1.09), ("ORANGE_FLOWER", "LEAF_LIGHT", "CREAM", "RUST")[k])
    # wheels + handle
    for sx in (-1, 1):
        m.cyl(0.22, 0.08, (sx * 0.62, 0.05, 0.22), "TIRE", rot=(0, 90, 0), verts=12)
        m.cyl(0.1, 0.09, (sx * 0.62, 0.05, 0.22), "STEEL", rot=(0, 90, 0), verts=8)
    m.cyl(0.03, 0.26, (0, 0.05, 0.12), "STEEL", verts=6)
    m.limb((0.9, 0.3, 0.8), (1.25, 0.3, 0.95), 0.02, "STEEL", verts=6)
    m.limb((0.9, -0.2, 0.8), (1.25, -0.2, 0.95), 0.02, "STEEL", verts=6)
    m.limb((1.25, 0.32, 0.95), (1.25, -0.22, 0.95), 0.025, "RUBBER", verts=6)
    # canopy posts + striped canopy (6 stripes, pitched toward the front)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.cyl(0.02, 1.0, (sx * 0.86, 0.05 + sy * 0.36, 1.55), "STEEL", verts=6)
    n = 6
    for k in range(n):
        x0 = -1.0 + 2.0 * k / n
        mat = "TINT_Canopy" if k % 2 == 0 else "WHITE"
        m.prism([(-0.6, 2.02), (0.62, 2.12), (0.62, 2.16), (-0.6, 2.06)], x0, x0 + 2.0 / n, mat)
        # scalloped valance at the front
        m.box((2.0 / n - 0.01, 0.02, 0.12), (x0 + 1.0 / n, -0.61, 1.98), mat)
    # sign board on top of the canopy
    m.box((1.2, 0.08, 0.26), (0, 0.0, 2.3), "TINT_Body", bevel=0.02)
    m.box((1.08, 0.02, 0.18), (0, -0.045, 2.3), "EMISSIVE_Sign")
    for k in range(4):  # blocky "letters" (no text needed)
        m.box((0.16, 0.012, 0.1), (-0.36 + k * 0.24, -0.058, 2.3), "TINT_Canopy")
    return K.finish(m.build_objects(), "props/food_cart")


BUILDERS = {
    "car_tuner": car_tuner, "speaker_stack": speaker_stack, "food_cart": food_cart, "lounge_chair": lounge_chair,
    "car_muscle": car_muscle, "car_luxury": car_luxury, "plant_pot": plant_pot, "cooler": cooler,
}
