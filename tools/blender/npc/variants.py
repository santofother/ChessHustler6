"""The NPC wardrobe: 8 variants on the shared skeleton.

Each variant = default colours for the five recolourable materials + a build function.
Fixed materials (never tinted by the game) live in FIXED.
"""
import math

from mathutils import Vector

import body as B

# name -> (hex, roughness, metallic, emission, alpha)  (same layout as common.PALETTE)
FIXED = {
    "EYE": ("#141014", 0.3, 0.0, 0, 1),
    "MOUTH": ("#6a3325", 0.7, 0.0, 0, 1),
    "LIP": ("#b8424e", 0.5, 0.0, 0, 1),
    "LENS": ("#101218", 0.12, 0.4, 0, 1),
    "PRINT": ("#ffe27a", 0.6, 0.0, 0, 1),
    "PRINT_B": ("#fff6ec", 0.6, 0.0, 0, 1),
    "HIVIS": ("#ff7a12", 0.55, 0.0, 0.15, 1),
    "REFLECT": ("#e6eef2", 0.25, 0.5, 0, 1),
    "SHIRT_WHITE": ("#f4f2ee", 0.6, 0.0, 0, 1),
}


def mats(top, bottom, skin, hair, accent, shoes):
    return {"TINT_Top": (top, 0.65, 0.0, 0, 1), "TINT_Bottom": (bottom, 0.75, 0.0, 0, 1),
            "TINT_Skin": (skin, 0.7, 0.0, 0, 1), "TINT_Hair": (hair, 0.6, 0.0, 0, 1),
            "TINT_Accent": (accent, 0.5, 0.0, 0, 1), "TINT_Shoes": (shoes, 0.55, 0.0, 0, 1)}


def base(m, look):
    B.head(m, look)
    B.shoes(m, look)


# ---------------------------------------------------------------------------------------------
def floral_guy(m):
    """Vice City classic: short-sleeve floral shirt, chinos, sneakers, gold chain."""
    look = dict(hair="short", shoes="sneaker", watch="GOLD")
    base(m, look)
    B.pelvis(m, look, "TINT_Bottom")
    B.upper_body(m, look, grow=0.004)
    B.collar_v(m, look, flaps="TINT_Top")
    B.floral(m, look, mat="TINT_Accent", rows=4, per=9, grow=0.006)
    B.arms(m, look, sleeve_u=0.55)
    B.legs(m, look, 1.86)
    m.bind = "chest"
    m.torus(0.075, 0.009, (0, 0.045, 1.425), "GOLD", rot=(-35, 0, 0), seg=12, sides=4)


def tank_woman(m):
    """Crop tank top, denim cut-offs, ponytail, hoops, sneakers."""
    look = dict(fem=True, hair="pony", shoes="sneaker", hoops=True)
    base(m, look)
    B.pelvis(m, look, "TINT_Bottom")

    def top(z):
        if z < 1.1:
            return "TINT_Skin"
        return "TINT_Top" if z < 1.35 else "TINT_Skin"

    rings = B.upper_body(m, look, top)
    # crop-top hem and bust
    m.bind = "torso"
    a, b, y = B.ring_at(B.torso_rings(look), 1.12)
    m.cyl(a + 0.01, 0.025, (0, y, 1.115), "TINT_Top", verts=12, scale=(1, (b + 0.01) / (a + 0.01), 1), smooth=True)
    m.bind = "chest"
    for sx in (-1, 1):
        m.sphere(0.06, (sx * 0.06, 0.09, 1.275), "TINT_Top", scale=(1.0, 0.72, 0.85), seg=8, rings=6)
        # straps
        p, n = B.torso_surface(look, 1.4, math.radians(90 - sx * 60), 0.004)
        m.box((0.03, 0.2, 0.012), (sx * 0.1, 0.0, 1.43), "TINT_Top", rot=(0, sx * 22, 0))
    B.arms(m, look, sleeve_u=None)
    B.legs(m, look, 0.42, flare=0.012)
    m.bind = "torso"
    m.cyl(B.ring_at(rings, 1.0)[0] + 0.018, 0.03, (0, 0, 1.0), "LEATHER", verts=12,
          scale=(1, 0.72, 1))


def hoodie_guy(m):
    """Streetwear: hoodie, joggers, cap, chunky sneakers."""
    look = dict(hair="short", hat="cap", shoes="sneaker", bulk=1.04)
    base(m, look)
    B.pelvis(m, look, "TINT_Bottom")
    B.upper_body(m, look, hem=0.93, grow=0.012)
    B.arms(m, look, sleeve_u=1.9, cuff=(1.8, "TINT_Accent"))
    B.legs(m, look, 1.88, cuff=(1.76, "TINT_Bottom"))
    m.bind = "torso"
    # kangaroo pocket
    p, n = B.torso_surface(look, 1.08, math.radians(90), 0.02)
    m.box((0.2, 0.03, 0.11), p, "TINT_Top", rot=(-4, 0, 0), bevel=0.01)
    # hood bunched behind the neck + drawstrings
    m.bind = "chest"
    m.torus(0.1, 0.035, (0, -0.02, 1.455), "TINT_Top", rot=(-18, 0, 0), seg=12, sides=6, scale=(1.1, 1.05, 1))
    m.sphere(0.09, (0, -0.12, 1.47), "TINT_Top", scale=(1.3, 0.7, 0.9), seg=8, rings=6)
    for sx in (-1, 1):
        m.limb((sx * 0.035, 0.125, 1.41), (sx * 0.04, 0.14, 1.30), 0.006, "SHIRT_WHITE", verts=4)
    # print on the chest
    p, n = B.torso_surface(look, 1.3, math.radians(90), 0.014)
    m.disc(p, n, 0.05, 0.006, "TINT_Accent", verts=6)


def party_woman(m):
    """Sundress / party dress with flared skirt, long hair, strappy sandals."""
    look = dict(fem=True, hair="long", shoes="sandal", hoops=True)
    base(m, look)

    def top(z):
        return "TINT_Top" if z < 1.34 else "TINT_Skin"

    B.upper_body(m, look, top, grow=0.003)
    m.bind = "chest"
    for sx in (-1, 1):
        m.sphere(0.062, (sx * 0.062, 0.088, 1.275), "TINT_Top", scale=(1.0, 0.72, 0.85), seg=8, rings=6)
        m.box((0.024, 0.2, 0.012), (sx * 0.1, 0.0, 1.43), "TINT_Top", rot=(0, sx * 22, 0))
    # skirt: flared cone, hem mid-thigh/knee
    m.bind = "skirt"
    m.loft([((0, 0, 1.03), 0.158, 0.116), ((0, 0.0, 0.93), 0.2, 0.15), ((0, 0.01, 0.78), 0.25, 0.2),
            ((0, 0.015, 0.64), 0.285, 0.235), ((0, 0.015, 0.63), 0.27, 0.22)], "TINT_Bottom", verts=14)
    m.bind = "torso"
    m.cyl(0.165, 0.035, (0, 0, 1.04), "TINT_Accent", verts=12, scale=(1, 0.75, 1))
    B.pelvis(m, look, "TINT_Bottom")  # hidden under the skirt; covers the crotch when sitting
    B.arms(m, look, sleeve_u=None)
    B.legs(m, look, None)
    m.bind = "hand_L"
    h, t = B.seg("hand_L")
    m.box((0.04, 0.13, 0.08), h + (t - h) * 0.5 + Vector((-0.03, 0.0, 0)), "GOLD", bevel=0.01)  # clutch


def dock_worker(m):
    """Rustwater Docks: hard hat, hi-vis vest over a tee, work pants, boots."""
    look = dict(hair="buzz", hat="hardhat", shoes="boot", bulk=1.06, belly=0.02)
    base(m, look)
    B.pelvis(m, look, "TINT_Bottom")
    B.upper_body(m, look, grow=0.003)
    # vest
    B.upper_body(m, look, lambda z: "HIVIS" if z < 1.42 else "TINT_Top", hem=0.95, grow=0.016, verts=12)
    m.bind = "torso"
    for z in (1.06, 1.2):
        a, b, y = B.ring_at(B.torso_rings(look), z)
        m.cyl(a + 0.021, 0.028, (0, y, z), "REFLECT", verts=12, scale=(1, (b + 0.021) / (a + 0.021), 1))
    B.arms(m, look, sleeve_u=0.6)
    B.legs(m, look, 1.84, flare=0.004)
    m.bind = "torso"
    p, n = B.torso_surface(look, 0.98, math.radians(60), 0.03)
    m.box((0.06, 0.05, 0.08), p, "DARK_GREY", rot=(0, 0, -30), bevel=0.01)  # radio pouch
    # gloves
    for side in ("L", "R"):
        h, t = B.seg("hand_" + side)
        m.bind = "hand_" + side
        m.sphere(0.051, h + (t - h) * 0.42, "TINT_Accent", scale=(0.75, 1.0, 1.3), seg=8, rings=6)


def bodyguard(m):
    """Security: dark suit, white shirt, tie, shades, earpiece, big frame."""
    look = dict(hair="buzz", shoes="loafer", shoe_mat="BLACK", shades=True, bulk=1.12, arm_bulk=1.15,
                leg_bulk=1.08, brow="TINT_Hair")
    base(m, look)
    B.pelvis(m, look, "TINT_Bottom")
    B.upper_body(m, look, hem=0.88, grow=0.012)
    B.collar_v(m, look, depth=1.15, width=0.09, mat="SHIRT_WHITE", grow=0.016)
    # tie
    m.bind = "torso"
    p1, n1 = B.torso_surface(look, 1.43, math.radians(90), 0.02)
    p2, n2 = B.torso_surface(look, 1.18, math.radians(90), 0.02)
    m.mesh([p1 + Vector((-0.018, 0, 0)), p1 + Vector((0.018, 0, 0)), p2 + Vector((0.03, 0, 0.02)),
            p2 + Vector((0, 0.0, -0.02)), p2 + Vector((-0.03, 0, 0.02))], [(0, 1, 2, 3, 4)], "TINT_Accent")
    # lapels
    for sx in (-1, 1):
        p, n = B.torso_surface(look, 1.3, math.radians(90 - sx * 22), 0.018)
        m.box((0.05, 0.012, 0.2), p, "TINT_Top", rot=(8, sx * 14, sx * -12))
    B.arms(m, look, sleeve_u=1.88, cuff=(1.82, "SHIRT_WHITE"))
    B.legs(m, look, 1.86)
    m.bind = "head"
    m.sphere(0.012, B.HC + Vector((0.128, 0.0, -0.005)), "SHIRT_WHITE", seg=6, rings=4)  # earpiece
    m.limb(B.HC + Vector((0.128, -0.005, -0.015)), B.HC + Vector((0.11, -0.03, -0.14)), 0.004, "SHIRT_WHITE", verts=4)


def beach_guy(m):
    """Sunset Strand: tank top, board shorts, flip-flops, shades pushed up."""
    look = dict(hair="curly", hat="shades_up", shoes="flipflop", bulk=1.0, arm_bulk=1.08)
    base(m, look)
    B.pelvis(m, look, "TINT_Bottom")
    B.upper_body(m, look, lambda z: "TINT_Top" if z < 1.36 else "TINT_Skin", grow=0.003)
    m.bind = "chest"
    for sx in (-1, 1):
        m.box((0.045, 0.22, 0.014), (sx * 0.105, 0.0, 1.43), "TINT_Top", rot=(0, sx * 22, 0))
    B.arms(m, look, sleeve_u=None)
    B.legs(m, look, 0.72, flare=0.02)
    # board-shorts side stripe
    for side, sx in (("L", -1), ("R", 1)):
        m.bind = "leg_" + side
        a = B.chain_point(["upperleg_" + side, "lowerleg_" + side], -0.05)
        b = B.chain_point(["upperleg_" + side, "lowerleg_" + side], 0.7)
        m.limb(a + Vector((sx * 0.1, 0, 0)), b + Vector((sx * 0.1, 0, 0)), 0.016, "TINT_Accent", verts=4)
    m.bind = "chest"
    m.torus(0.07, 0.006, (0, 0.045, 1.425), "PRINT_B", rot=(-35, 0, 0), seg=10, sides=3)  # shell necklace


def rich_old(m):
    """Crown Hills money: cream linen suit, open shirt, panama hat, grey hair, belly, loafers."""
    look = dict(hair="slick", hat="panama", shoes="loafer", belly=0.05, watch="GOLD", bulk=1.03)
    base(m, look)
    B.pelvis(m, look, "TINT_Bottom")
    B.upper_body(m, look, hem=0.9, grow=0.012)
    B.collar_v(m, look, depth=1.2, width=0.085, mat="TINT_Accent", grow=0.016)
    B.collar_v(m, look, depth=1.33, width=0.05, mat="TINT_Skin", grow=0.02)
    m.bind = "torso"
    for sx in (-1, 1):
        p, n = B.torso_surface(look, 1.28, math.radians(90 - sx * 27), 0.02)
        m.box((0.05, 0.012, 0.22), p, "TINT_Top", rot=(6, sx * 18, sx * -10))
    p, n = B.torso_surface(look, 1.32, math.radians(90 + 45), 0.02)
    m.box((0.045, 0.012, 0.03), p, "TINT_Accent", rot=(0, 0, 45))  # pocket square
    B.arms(m, look, sleeve_u=1.85)
    B.legs(m, look, 1.86)
    m.bind = "chest"
    m.torus(0.07, 0.007, (0, 0.05, 1.42), "GOLD", rot=(-35, 0, 0), seg=12, sides=4)
    # moustache
    m.bind = "head"
    m.box((0.08, 0.02, 0.018), B.HC + Vector((0, 0.128, -0.045)), "TINT_Hair", bevel=0.006)


VARIANTS = {
    "floral_guy": (floral_guy, mats("#ff5fa2", "#d8c8a4", "#c98a62", "#241812", "#ffe27a", "#29e3d6")),
    "tank_woman": (tank_woman, mats("#ffd36b", "#4b6a9b", "#8d5a3b", "#1c120e", "#ff5fa2", "#ff5fa2")),
    "hoodie_guy": (hoodie_guy, mats("#7a3cff", "#2b2b33", "#5e3a26", "#140e0b", "#ff9a3c", "#f2f2f2")),
    "party_woman": (party_woman, mats("#ff3d7f", "#ff3d7f", "#e2b08c", "#6b3a1e", "#ffc23d", "#ffc23d")),
    "dock_worker": (dock_worker, mats("#3f5566", "#56503f", "#b07650", "#2a2019", "#ffcf1a", "#6a4226")),
    "bodyguard": (bodyguard, mats("#18181d", "#18181d", "#6e4630", "#0e0b0a", "#b3122e", "#141416")),
    "beach_guy": (beach_guy, mats("#f4f2ee", "#29b8d6", "#d9a077", "#c9a060", "#ff5fa2", "#ff9a3c")),
    "rich_old": (rich_old, mats("#efe6d2", "#e8dfc9", "#e0a784", "#cfcfd2", "#f2e7c9", "#7a4a28")),
}
