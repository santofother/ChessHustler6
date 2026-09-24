"""Nocturno Tower rooftop props -> public/models/arenas/tower/."""
import math
import random

from mathutils import Vector

import common
import propkit as K
from trap import _sofa


def helicopter():
    """Luxury twin-engine helicopter, nose toward the front (+Z). Nodes: Rotor (pivot on the mast,
    spins about Y), TailRotor (pivot at the hub, spins about X)."""
    K.begin()
    K.tint("TINT_Body", "#16151b", 0.3, 0.6)
    K.tint("TINT_Stripe", "#ffc23d", 0.3, 0.8)
    K.emissive("EMISSIVE_Nav", "#ff2a3a")
    K.emissive("EMISSIVE_NavGreen", "#2aff6a")
    m = common.Model("helicopter")
    B = "TINT_Body"
    # fuselage: lofted-ish from boxes + prism profile (y,z), nose at -y
    m.prism([(-3.6, 1.2), (-3.2, 0.75), (-1.5, 0.55), (1.6, 0.55), (2.2, 1.2), (2.2, 2.2), (0.8, 2.6),
             (-1.6, 2.55), (-3.2, 1.9)], -0.95, 0.95, B, bevel=0.15)
    m.prism([(-3.5, 1.3), (-3.15, 1.95), (-1.7, 2.45), (-1.6, 2.4), (-3.0, 1.9), (-3.35, 1.3)], -0.9, 0.9, "GLASS")
    for sx in (-1, 1):
        m.box((0.03, 2.2, 0.55), (sx * 0.99, -0.4, 1.75), "GLASS")  # cabin windows
        m.box((0.02, 5.5, 0.1), (sx * 0.985, -0.6, 1.2), "TINT_Stripe")
    # engines + tail boom + fin + stabilisers
    m.box((1.3, 2.6, 0.55), (0, 0.4, 2.8), B, bevel=0.15)
    for sx in (-1, 1):
        m.cyl(0.18, 0.2, (sx * 0.4, 1.75, 2.8), "DARK_STEEL", rot=(90, 0, 0), verts=8)
    m.limb((0, 2.0, 1.9), (0, 8.4, 2.3), 0.45, B, r2=0.18, verts=10)
    m.prism([(7.6, 2.2), (8.8, 3.6), (9.2, 3.6), (8.7, 2.1)], -0.06, 0.06, B)
    m.box((2.0, 0.5, 0.08), (0, 7.8, 2.25), B)
    m.box((2.02, 0.1, 0.1), (0, 7.8, 2.25), "TINT_Stripe")
    # skids
    for sx in (-1, 1):
        m.limb((sx * 1.0, -2.6, 0.08), (sx * 1.0, 2.2, 0.08), 0.06, "CHROME", verts=6)
        m.limb((sx * 1.0, -2.6, 0.08), (sx * 1.0, -2.9, 0.25), 0.06, "CHROME", verts=6)
        for y in (-1.3, 1.1):
            m.limb((sx * 1.0, y, 0.08), (sx * 0.7, y, 0.6), 0.05, "CHROME", verts=6)
    m.box((0.12, 0.12, 0.12), (1.0, -0.2, 0.6), "EMISSIVE_NavGreen")
    m.box((0.12, 0.12, 0.12), (-1.0, -0.2, 0.6), "EMISSIVE_Nav")
    m.box((0.14, 0.14, 0.14), (0, 9.0, 3.65), "EMISSIVE_Nav")
    # main rotor (node Rotor): hub on the mast
    hub = Vector((0, 0.2, 3.35))
    m.cyl(0.08, 0.35, hub - Vector((0, 0, 0.15)), "DARK_STEEL", verts=8)
    m.cyl(0.28, 0.18, hub, "DARK_STEEL", verts=8, group="Rotor")
    for k in range(4):
        a = 90.0 * k + 45
        d = Vector((math.cos(math.radians(a)), math.sin(math.radians(a)), 0))
        m.box((5.6, 0.32, 0.05), hub + d * 2.9 + Vector((0, 0, 0.06)), B, rot=(0, 0, a), group="Rotor")
        m.box((0.4, 0.33, 0.06), hub + d * 5.5 + Vector((0, 0, 0.06)), "TINT_Stripe", rot=(0, 0, a), group="Rotor")
    m.set_pivot("Rotor", hub)
    th = Vector((0.18, 8.75, 3.05))
    m.cyl(0.08, 0.1, th, "DARK_STEEL", rot=(0, 90, 0), verts=6, group="TailRotor")
    for k in range(2):
        m.box((0.03, 0.14, 1.3), th + Vector((0.05, 0, 0)), B, rot=(90 * k, 0, 0), group="TailRotor")
    m.set_pivot("TailRotor", th)
    return K.finish(m.build_objects(), "arenas/tower/helicopter", view=(1.0, -0.8, 0.5))


def hvac_unit():
    """Rooftop condenser; node Fan (spins about Y) under the top grille."""
    K.begin()
    m = common.Model("hvac_unit")
    m.box((2.0, 1.5, 1.2), (0, 0, 0.65), "GALV", bevel=0.03)
    m.box((2.1, 1.6, 0.1), (0, 0, 0.05), "DARK_STEEL")
    for k in range(9):
        m.box((0.02, 1.52, 0.9), (-0.8 + k * 0.2, 0, 0.65), "DARK_STEEL") if False else \
            m.box((1.9, 0.02, 0.05), (0, -0.755, 0.2 + k * 0.1), "DARK_STEEL")
    m.cyl(0.62, 0.06, (0.2, 0, 1.28), "DARK_STEEL", verts=16)
    m.torus(0.62, 0.03, (0.2, 0, 1.32), "GALV", seg=16, sides=4)
    for k in range(4):
        m.box((1.24, 0.03, 0.03), (0.2, -0.45 + k * 0.3, 1.34), "GALV")
    for k in range(3):
        m.box((0.4, 0.14, 0.02), (0.2, 0, 1.25), "BLACK", rot=(12, 0, 120 * k), group="Fan")
    m.cyl(0.08, 0.06, (0.2, 0, 1.25), "BLACK", verts=8, group="Fan")
    m.set_pivot("Fan", (0.2, 0, 1.25))
    m.box((0.35, 0.2, 0.4), (-0.75, -0.8, 0.5), "GALV")
    m.limb((-0.75, -0.9, 0.3), (-0.75, -1.2, 0.05), 0.04, "BLACK", verts=6)
    return K.finish(m.build_objects(), "arenas/tower/hvac_unit")


def antenna_mast():
    K.begin()
    K.emissive("EMISSIVE_Beacon", "#ff2a1a")
    m = common.Model("antenna_mast")
    m.box((1.0, 1.0, 0.3), (0, 0, 0.15), "CONCRETE")
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.limb((sx * 0.4, sy * 0.4, 0.3), (sx * 0.08, sy * 0.08, 10.0), 0.035, "SIREN_RED" if False else "GALV",
                   verts=4)
    for k in range(9):
        z = 0.6 + k * 1.05
        w = 0.4 - 0.32 * (z / 10.0)
        m.box((2 * w, 0.03, 0.03), (0, w, z), "GALV")
        m.box((2 * w, 0.03, 0.03), (0, -w, z), "GALV")
        m.box((0.03, 2 * w, 0.03), (w, 0, z), "GALV")
        m.box((0.03, 2 * w, 0.03), (-w, 0, z), "GALV")
    m.cyl(0.05, 4.8, (0, 0, 12.4), "WHITE", verts=6)
    for z in (11.0, 12.5):
        m.cyl(0.07, 0.3, (0, 0, z), "SIREN_RED", verts=6)
    m.sphere(0.14, (0, 0, 14.9), "EMISSIVE_Beacon", seg=8, rings=5)
    m.sphere(0.1, (0, 0, 10.1), "EMISSIVE_Beacon", seg=6, rings=4)
    return K.finish(m.build_objects(), "arenas/tower/antenna_mast", view=(1.0, -1.0, 0.3))


def throne_sofa():
    K.begin()
    K.tint("TINT_Velvet", "#7a1030", 0.95)
    K.tint("TINT_Gold", "#ffc23d", 0.25, 0.9)
    m = common.Model("throne_sofa")
    _sofa(m, 2.4, 3, "TINT_Velvet", random.Random(1), arm_mat="TINT_Gold", legs="TINT_Gold", back_h=1.1, worn=False)
    # tall scalloped gold crest + crown ornament
    m.box((2.2, 0.12, 0.35), (0, 0.4, 1.2), "TINT_Gold", bevel=0.04)
    for k in range(5):
        x = -0.9 + k * 0.45
        m.sphere(0.12, (x, 0.4, 1.4 + (0.15 if k == 2 else 0.0)), "TINT_Gold", seg=8, rings=5)
    for k in range(5):
        a = 2 * math.pi * k / 5
        m.cyl(0.03, 0.18, (math.cos(a) * 0.12, 0.4 + math.sin(a) * 0.04, 1.68), "TINT_Gold", r2=0.0, verts=4)
    m.sphere(0.05, (0, 0.33, 1.56), "RUBY", seg=6, rings=4)
    for sx in (-1, 1):
        m.sphere(0.12, (sx * 1.1, 0.0, 0.72), "TINT_Gold", seg=8, rings=5)
    return K.finish(m.build_objects(), "arenas/tower/throne_sofa")


BUILDERS = {"helicopter": helicopter, "hvac_unit": hvac_unit, "antenna_mast": antenna_mast,
            "throne_sofa": throne_sofa}
