"""Sunset Strand props -> public/models/arenas/strand/."""
import math

from mathutils import Vector

import common
import propkit as K


def ferris_wheel():
    """D 20 m wheel spinning about local X (hub 11.8 m up), 12 gondolas, A-frame supports.
    Nodes: ferris_wheel (static frame) > Wheel (pivot = hub) > Gondola_00..11 (pivot = hang point)."""
    K.begin()
    K.tint("TINT_Gondola", "#ff7ab8", 0.5)
    K.tint("TINT_Frame", "#f2f0ea", 0.5, 0.3)
    K.emissive("EMISSIVE_Bulbs", "#ffe7b0")
    m = common.Model("ferris_wheel")
    H, R = 11.8, 10.0
    hub = Vector((0, 0, H))
    for sx in (-1, 1):
        x = sx * 1.7
        for sy in (-1, 1):
            m.limb((x + sx * 0.8, sy * 5.2, 0), (x, 0, H), 0.22, "TINT_Frame", verts=6, smooth=False)
        m.limb((x + sx * 0.8, -5.2, 0.15), (x + sx * 0.8, 5.2, 0.15), 0.2, "TINT_Frame", verts=4, smooth=False)
        m.limb((x + sx * 0.4, -2.6, H / 2), (x + sx * 0.4, 2.6, H / 2), 0.12, "TINT_Frame", verts=4, smooth=False)
    m.limb((-1.7, 0, H), (1.7, 0, H), 0.28, "DARK_STEEL", verts=8)  # axle
    m.box((1.2, 3.0, 2.4), (0, -5.0, 1.2), "TINT_Frame", bevel=0.05)  # loading hut
    m.box((1.3, 3.1, 0.15), (0, -5.0, 2.45), "TINT_Gondola")
    g = "Wheel"
    for sx in (-1, 1):
        m.torus(R, 0.13, hub + Vector((sx * 0.7, 0, 0)), "TINT_Frame", rot=(0, 90, 0), seg=36, sides=4,
                smooth=False, group=g)
        m.torus(R * 0.55, 0.08, hub + Vector((sx * 0.7, 0, 0)), "TINT_Frame", rot=(0, 90, 0), seg=24, sides=4,
                smooth=False, group=g)
    m.cyl(0.9, 1.8, hub, "DARK_STEEL", rot=(0, 90, 0), verts=10, group=g)
    m.cyl(0.95, 0.2, hub, "EMISSIVE_Bulbs", rot=(0, 90, 0), verts=10, group=g)
    n_sp = 24
    for k in range(n_sp):
        a = 2 * math.pi * k / n_sp
        d = Vector((0, math.cos(a), math.sin(a)))
        for sx in (-1, 1):
            o = hub + Vector((sx * 0.7, 0, 0))
            m.limb(o + d * 0.8, o + d * R, 0.05, "TINT_Frame", verts=3, smooth=False, group=g)
            m.box((0.22, 0.22, 0.22), o + d * (R + 0.18), "EMISSIVE_Bulbs", rot=(math.degrees(a), 0, 0), group=g)
        m.limb(hub + Vector((-0.7, 0, 0)) + d * R, hub + Vector((0.7, 0, 0)) + d * R, 0.05, "TINT_Frame",
               verts=3, smooth=False, group=g)
    m.set_pivot(g, hub)
    for i in range(12):
        a = 2 * math.pi * i / 12
        hp = hub + Vector((0, math.cos(a), math.sin(a))) * R
        gn = "Gondola_%02d" % i
        m.limb(hp, hp + Vector((0, 0, -0.7)), 0.05, "DARK_STEEL", verts=4, group=gn)
        m.cyl(0.9, 0.12, hp + Vector((0, 0, -0.75)), "TINT_Gondola", verts=8, group=gn)  # roof
        m.cyl(0.72, 0.9, hp + Vector((0, 0, -1.5)), "TINT_Gondola", r2=0.78, verts=8, group=gn)
        m.cyl(0.8, 0.5, hp + Vector((0, 0, -1.9)), "TINT_Frame", r2=0.75, verts=8, group=gn)  # tub
        m.cyl(0.7, 0.06, hp + Vector((0, 0, -2.18)), "DARK_STEEL", verts=8, group=gn)
        m.set_pivot(gn, hp)
    objs = m.build_objects()
    byname = {o.name: o for o in objs}
    for i in range(12):
        K.reparent(byname["Gondola_%02d" % i], byname["Wheel"])
    return K.finish(objs, "arenas/strand/ferris_wheel", view=(1.0, -0.6, 0.35))


def lifeguard_tower():
    K.begin()
    K.tint("TINT_Hut", "#7fd8d0", 0.7)
    K.tint("TINT_Trim", "#ff8fb8", 0.6)
    m = common.Model("lifeguard_tower")
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((0.14, 0.14, 1.75), (sx * 0.85, sy * 0.85, 0.875), "WHITE")
        m.limb((sx * 0.85, -0.85, 0.2), (sx * 0.85, 0.85, 1.5), 0.04, "WHITE", verts=4)
    m.box((2.3, 2.3, 0.12), (0, 0, 1.8), "TINT_Trim")  # deck
    for x in (-1.1, 1.1):
        m.box((0.05, 0.05, 0.6), (x, -1.1, 2.15), "WHITE")
    m.box((2.25, 0.05, 0.05), (0, -1.1, 2.45), "WHITE")
    m.box((1.8, 1.4, 1.35), (0, 0.35, 2.54), "TINT_Hut", bevel=0.04)
    m.box((1.4, 0.03, 0.5), (0, -0.37, 2.75), "GLASS")
    for x in (-0.7, 0.7):
        m.box((0.04, 1.0, 0.45), (x * 1.29, 0.35, 2.75), "GLASS")
    m.box((1.86, 0.06, 0.1), (0, -0.36, 2.02), "TINT_Trim")
    m.prism([(-0.55, 3.2), (1.25, 3.4), (1.25, 3.5), (-0.55, 3.3)], -1.15, 1.15, "TINT_Trim", bevel=0.02)
    for sx in (-1, 1):
        m.box((0.3, 0.02, 0.14), (sx * 0.5, -0.38, 3.08), "TINT_Trim")
    m.cyl(0.03, 1.1, (0.95, 0.9, 3.9), "WHITE", verts=6)
    m.box((0.02, 0.4, 0.25), (0.95, 1.1, 4.3), "TINT_Trim")
    # ramp down the front (toward -Y)
    m.prism([(-1.1, 1.8), (-3.0, 0.05), (-3.0, 0.0), (-1.1, 1.7)], -0.45, 0.45, "WOOD")
    for sx in (-1, 1):
        m.limb((sx * 0.45, -3.0, 0.7), (sx * 0.45, -1.1, 2.45), 0.03, "WHITE", verts=4)
        m.limb((sx * 0.45, -3.0, 0.0), (sx * 0.45, -3.0, 0.7), 0.03, "WHITE", verts=4)
    return K.finish(m.build_objects(), "arenas/strand/lifeguard_tower")


def beach_umbrella():
    K.begin()
    K.tint("TINT_Canopy", "#ff5fa2", 0.7)
    K.tint("TINT_Canopy2", "#fff6ec", 0.7)
    m = common.Model("beach_umbrella")
    m.cyl(0.025, 2.3, (0, 0, 1.15), "WHITE", verts=6)
    n, R, z0, z1 = 12, 1.1, 1.85, 2.28
    ring = [(R * math.cos(2 * math.pi * k / n), R * math.sin(2 * math.pi * k / n)) for k in range(n)]
    for k in range(n):
        a, b = ring[k], ring[(k + 1) % n]
        mat = "TINT_Canopy" if k % 2 == 0 else "TINT_Canopy2"
        m.mesh([(0, 0, z1), (a[0], a[1], z0), (b[0], b[1], z0)], [(0, 1, 2)], mat, recalc=False)
        m.mesh([(0, 0, z1 - 0.02), (b[0], b[1], z0 - 0.02), (a[0], a[1], z0 - 0.02)], [(0, 1, 2)], mat, recalc=False)
        m.mesh([(a[0], a[1], z0), (b[0], b[1], z0), (b[0] * 1.02, b[1] * 1.02, z0 - 0.12),
                (a[0] * 1.02, a[1] * 1.02, z0 - 0.12)], [(0, 3, 2, 1)], mat, recalc=False)
        m.mesh([(a[0], a[1], z0), (b[0], b[1], z0), (b[0] * 1.02, b[1] * 1.02, z0 - 0.12),
                (a[0] * 1.02, a[1] * 1.02, z0 - 0.12)], [(0, 1, 2, 3)], mat, recalc=False)
    m.sphere(0.05, (0, 0, z1 + 0.03), "WHITE", seg=6, rings=4)
    return K.finish(m.build_objects(), "arenas/strand/beach_umbrella")


def surfboard():
    """Lying flat, nose toward the front."""
    K.begin()
    K.tint("TINT_Board", "#29b8d6", 0.4)
    m = common.Model("surfboard")
    n = 10
    pts = []
    for k in range(n + 1):
        t = k / n
        pts.append((-1.05 + 2.1 * t, max(0.02, 0.275 * math.sin(math.pi * t) ** 0.6)))
    ring = [(w, y) for y, w in pts] + [(-w, y) for y, w in reversed(pts)]
    N = len(ring)
    top = [(x, y, 0.08) for x, y in ring]
    bot = [(x * 0.92, y, 0.0) for x, y in ring]
    faces = [tuple(range(N)), tuple(range(2 * N - 1, N - 1, -1))]
    faces += [(i, (i + 1) % N, N + (i + 1) % N, N + i) for i in range(N)]
    m.mesh(top + bot, faces, "TINT_Board")
    m.box((0.02, 1.8, 0.004), (0, 0, 0.082), "WHITE")  # stringer
    m.box((0.01, 0.14, 0.1), (0, 0.9, -0.05), "WHITE")  # fin
    return K.finish(m.build_objects(), "arenas/strand/surfboard")


def pier_section():
    """5 m wide x 10 m long deck on piles, tileable along the length; deck top at 3.0 m."""
    K.begin()
    K.tint("TINT_Wood", "#a87c55", 0.85)
    m = common.Model("pier_section")
    for k in range(10):
        m.box((5.0, 0.96, 0.12), (0, -4.5 + k, 2.94), "TINT_Wood")
    for sx in (-1, 1):
        m.box((0.2, 10.0, 0.3), (sx * 2.2, 0, 2.73), "WOOD_DARK")
        for y in (-4.0, 0.0, 4.0):
            m.cyl(0.18, 2.6, (sx * 2.2, y, 1.3), "WOOD_DARK", verts=8)
            m.box((0.12, 0.12, 1.0), (sx * 2.45, y, 3.5), "TINT_Wood")
        m.box((0.1, 10.0, 0.12), (sx * 2.45, 0, 3.95), "TINT_Wood")
        m.box((0.06, 10.0, 0.08), (sx * 2.45, 0, 3.5), "TINT_Wood")
    for y in (-4.0, 0.0, 4.0):
        m.box((4.6, 0.2, 0.25), (0, y, 2.75), "WOOD_DARK")
        m.limb((-2.2, y, 0.6), (2.2, y, 2.4), 0.06, "WOOD_DARK", verts=4)
    return K.finish(m.build_objects(), "arenas/strand/pier_section")


def volleyball_net():
    K.begin()
    m = common.Model("volleyball_net")
    for sx in (-1, 1):
        m.cyl(0.06, 2.5, (sx * 4.5, 0, 1.25), "WHITE", verts=8)
    m.box((8.9, 0.02, 0.06), (0, 0, 2.43), "WHITE")
    m.box((8.9, 0.02, 0.05), (0, 0, 1.55), "WHITE")
    for k in range(1, 30):
        m.box((0.01, 0.01, 0.85), (-4.45 + 8.9 * k / 30, 0, 1.99), "RUBBER")
    for k in range(1, 7):
        m.box((8.9, 0.01, 0.01), (0, 0, 1.55 + 0.88 * k / 7), "RUBBER")
    return K.finish(m.build_objects(), "arenas/strand/volleyball_net")


BUILDERS = {"ferris_wheel": ferris_wheel, "lifeguard_tower": lifeguard_tower, "beach_umbrella": beach_umbrella,
            "surfboard": surfboard, "pier_section": pier_section, "volleyball_net": volleyball_net}
