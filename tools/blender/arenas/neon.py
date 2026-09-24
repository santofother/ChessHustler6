"""Neon Mile street-race props -> public/models/arenas/neon/."""
import common
import propkit as K


def start_tree():
    """Drag-strip 'christmas tree': 3 amber stages, green, red on a post (steady colours)."""
    K.begin()
    K.emissive("EMISSIVE_Amber", "#ffa31a")
    K.emissive("EMISSIVE_Green", "#2aff6a")
    K.emissive("EMISSIVE_Red", "#ff2230")
    m = common.Model("start_tree")
    m.box((0.6, 0.6, 0.1), (0, 0, 0.05), "DARK_STEEL")
    m.cyl(0.06, 1.7, (0, 0, 0.9), "POLE", verts=8)
    m.box((0.36, 0.2, 1.3), (0, 0, 2.3), "BLACK", bevel=0.02)
    rows = [("EMISSIVE_Amber", 2.8), ("EMISSIVE_Amber", 2.6), ("EMISSIVE_Amber", 2.4), ("EMISSIVE_Green", 2.1),
            ("EMISSIVE_Red", 1.85)]
    for mat, z in rows:
        for sx in (-1, 1):
            m.cyl(0.065, 0.05, (sx * 0.09, -0.11, z), mat, rot=(90, 0, 0), verts=10)
            m.cyl(0.08, 0.06, (sx * 0.09, -0.1, z + 0.02), "BLACK", rot=(90, 0, 0), r2=0.08, verts=10)
    m.box((0.1, 0.05, 0.08), (0, -0.11, 2.98), "WHITE")
    return K.finish(m.build_objects(), "arenas/neon/start_tree")


def traffic_light():
    """Miami span-wire style: pole with a mast arm reaching over the lane (toward -X), signal heads face +Z."""
    K.begin()
    K.emissive("EMISSIVE_Red", "#ff2230")
    K.emissive("EMISSIVE_Amber", "#ffa31a")
    K.emissive("EMISSIVE_Green", "#2aff6a")
    m = common.Model("traffic_light")
    m.cyl(0.14, 0.3, (0, 0, 0.15), "CONCRETE", verts=8)
    m.cyl(0.09, 6.0, (0, 0, 3.0), "GALV", r2=0.07, verts=8)
    # mast arm along -Y? spec: 0.5 x 3 x 6 -> arm along the depth axis; heads hang at the arm tip
    m.limb((0, 0, 5.8), (0, -2.9, 5.8), 0.05, "GALV", verts=6)
    m.limb((0, 0, 5.0), (0, -1.5, 5.8), 0.03, "GALV", verts=4)
    for y in (-1.4, -2.7):
        m.box((0.34, 0.3, 1.0), (0, y, 5.2), "BLACK", bevel=0.03)
        for mat, z in (("EMISSIVE_Red", 5.5), ("EMISSIVE_Amber", 5.2), ("EMISSIVE_Green", 4.9)):
            m.cyl(0.1, 0.03, (0, y - 0.16, z), mat, rot=(90, 0, 0), verts=10)
            m.box((0.24, 0.12, 0.03), (0, y - 0.21, z + 0.12), "BLACK")
        m.limb((0, y, 5.7), (0, y, 5.8), 0.02, "GALV", verts=4)
    m.box((0.3, 0.2, 0.4), (0, 0.1, 1.2), "GALV")  # control box
    return K.finish(m.build_objects(), "arenas/neon/traffic_light", view=(1.0, -0.6, 0.3))


def club_front():
    """Nightclub entrance facade section: awning, doors, velvet-rope posts, blank sign board (node SignBoard)."""
    K.begin()
    K.tint("TINT_Wall", "#2a1f3a", 0.8)
    K.emissive("EMISSIVE_Trim", "#ff5fa2")
    K.tint("TINT_Rope", "#b3122e", 0.8)
    m = common.Model("club_front")
    m.box((10.0, 0.6, 7.0), (0, 0.3, 3.5), "TINT_Wall")
    m.box((10.2, 0.8, 0.3), (0, 0.3, 7.1), "BLACK")
    for x in (-4.9, 4.9):
        m.box((0.12, 0.12, 7.0), (x, -0.02, 3.5), "EMISSIVE_Trim")
    m.box((9.8, 0.12, 0.12), (0, -0.02, 6.8), "EMISSIVE_Trim")
    # doors
    m.box((2.4, 0.1, 2.8), (0, -0.02, 1.4), "BLACK")
    for sx in (-1, 1):
        m.box((1.1, 0.06, 2.6), (sx * 0.58, -0.08, 1.35), "GLASS")
        m.box((0.04, 0.08, 0.8), (sx * 0.1, -0.13, 1.3), "CHROME")
    m.box((2.6, 0.08, 0.1), (0, -0.07, 2.85), "EMISSIVE_Trim")
    # awning
    m.prism([(-0.1, 3.3), (-2.2, 3.0), (-2.2, 3.2), (-0.1, 3.5)], -2.2, 2.2, "BLACK")
    m.box((4.4, 0.06, 0.06), (0, -2.22, 3.08), "EMISSIVE_Trim")
    for sx in (-1, 1):
        m.limb((sx * 2.1, -0.05, 4.2), (sx * 2.1, -2.1, 3.25), 0.03, "CHROME", verts=4)
    # sign board (code textures it)
    m.box((5.0, 0.1, 1.4), (0, -0.05, 5.0), "WHITE", group="SignBoard")
    m.set_pivot("SignBoard", (0, -0.1, 5.0))
    m.box((5.2, 0.14, 0.08), (0, -0.05, 5.74), "EMISSIVE_Trim")
    m.box((5.2, 0.14, 0.08), (0, -0.05, 4.26), "EMISSIVE_Trim")
    # windows with glow
    for x in (-3.8, 3.8):
        m.box((1.4, 0.06, 1.8), (x, -0.02, 4.6), "GLASS")
        m.box((1.5, 0.08, 0.06), (x, -0.03, 3.65), "EMISSIVE_Trim")
    # velvet rope posts + ropes
    posts = [(-2.6, -2.6), (-1.6, -2.9), (1.6, -2.9), (2.6, -2.6)]
    for x, y in posts:
        m.cyl(0.14, 0.05, (x, y, 0.025), "GOLD", verts=10)
        m.cyl(0.035, 0.9, (x, y, 0.47), "GOLD", verts=8)
        m.sphere(0.06, (x, y, 0.95), "GOLD", seg=6, rings=4)
    for (x0, y0), (x1, y1) in ((posts[0], posts[1]), (posts[2], posts[3])):
        mid = ((x0 + x1) / 2, (y0 + y1) / 2, 0.7)
        m.limb((x0, y0, 0.88), mid, 0.025, "TINT_Rope", verts=5)
        m.limb(mid, (x1, y1, 0.88), 0.025, "TINT_Rope", verts=5)
    m.box((10.0, 3.2, 0.12), (0, -1.3, 0.06), "CONCRETE")  # entrance slab
    m.box((1.4, 3.0, 0.02), (0, -1.5, 0.125), "TINT_Rope")   # red carpet
    return K.finish(m.build_objects(), "arenas/neon/club_front", view=(0.5, -1.0, 0.35))


BUILDERS = {"start_tree": start_tree, "club_front": club_front, "traffic_light": traffic_light}
