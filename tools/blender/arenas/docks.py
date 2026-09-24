"""Rustwater Docks props -> public/models/arenas/docks/."""
import math

from mathutils import Vector

import common
import propkit as K


def gantry_crane():
    """Ship-to-shore crane. Boom runs along the length (three.js Z): outreach over the water toward the
    FRONT (+Z), backreach behind. Nodes: gantry_crane > Trolley (rides the boom; move along Z) >
    Spreader (hangs from the trolley; move along Y)."""
    K.begin()
    K.tint("TINT_Steel", "#d8452b", 0.5, 0.4)
    K.emissive("EMISSIVE_Warning", "#ff2a1a")
    m = common.Model("gantry_crane")
    S = "TINT_Steel"
    X, Y0, Y1 = 7.0, -7.0, 7.0  # leg positions (x across rails, y along the boom)
    for sx in (-1, 1):
        for y in (Y0, Y1):
            m.box((0.9, 0.9, 27.0), (sx * X, y, 13.5), S)
            m.box((1.4, 2.2, 0.8), (sx * X, y, 0.4), "DARK_STEEL")  # bogie
            for dy in (-0.7, 0.7):
                m.cyl(0.35, 0.3, (sx * X, y + dy, 0.35), "RUBBER", rot=(0, 90, 0), verts=8)
        m.box((0.8, 14.8, 1.2), (sx * X, 0, 8.0), S)    # sill beams
        m.box((0.8, 14.8, 1.2), (sx * X, 0, 26.6), S)
        m.limb((sx * X, Y0, 8.5), (sx * X, Y1, 26.0), 0.25, S, verts=4, smooth=False)  # diagonal
        # A-frame apex + stays down to the boom tip and back end
        m.limb((sx * X * 0.9, Y1, 27.0), (sx * 1.2, 4.0, 40.0), 0.35, S, verts=4, smooth=False)
        m.limb((sx * X * 0.9, Y0, 27.0), (sx * 1.2, 4.0, 40.0), 0.35, S, verts=4, smooth=False)
        m.limb((sx * 1.2, 4.0, 40.0), (sx * 1.6, -26.0, 30.5), 0.12, S, verts=4, smooth=False)
        m.limb((sx * 1.2, 4.0, 40.0), (sx * 1.6, 15.0, 30.5), 0.12, S, verts=4, smooth=False)
    for y in (Y0, Y1):
        m.box((14.8, 0.8, 1.2), (0, y, 26.6), S)  # portal beams
        m.box((14.8, 0.6, 0.8), (0, y, 8.0), S)
    m.box((3.4, 1.2, 1.0), (0, 4.0, 40.0), S)  # apex
    # boom: two box girders, outreach to y=-26, backreach to +15
    for sx in (-1, 1):
        m.box((0.6, 41.0, 1.6), (sx * 1.6, -5.5, 30.0), S)
        for k in range(14):
            y = -25.0 + k * 3.0
            m.limb((sx * 1.6, y, 29.3), (sx * 1.6, y + 3.0, 30.7), 0.08, S, verts=3, smooth=False)
    for k in range(9):
        m.box((3.8, 0.3, 0.3), (0, -25.0 + k * 5.0, 29.3), S)
    m.box((5.0, 5.0, 3.0), (0, 11.0, 32.3), S, bevel=0.1)       # machinery house
    m.box((5.1, 0.1, 0.8), (0, 8.47, 32.8), "GLASS")
    m.box((2.2, 2.4, 2.0), (0, -2.0, 27.8), "WHITE", bevel=0.05)  # operator cab under the boom
    m.box((2.0, 0.06, 1.1), (0, -3.22, 27.9), "GLASS")
    for p in ((0, 4.0, 40.7), (0, -26.0, 31.0), (0, 13.4, 34.0), (6.9, -7.0, 27.4), (-6.9, -7.0, 27.4)):
        m.box((0.4, 0.4, 0.4), p, "EMISSIVE_Warning")
    # trolley + spreader
    tp = Vector((0, -12.0, 28.8))
    m.box((4.0, 3.0, 1.2), tp, S, group="Trolley")
    m.box((4.2, 0.2, 0.3), tp + Vector((0, -1.5, 0.45)), "DARK_STEEL", group="Trolley")
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.cyl(0.3, 0.3, tp + Vector((sx * 1.6, sy * 1.1, 0.6)), "DARK_STEEL", rot=(0, 90, 0), verts=8,
                  group="Trolley")
    m.set_pivot("Trolley", tp)
    sp = Vector((0, -12.0, 20.0))
    m.box((2.6, 12.4, 0.5), sp, "#ffc21a" and "SPREADER", group="Spreader")
    m.box((1.2, 2.0, 0.8), sp + Vector((0, 0, 0.6)), "SPREADER", group="Spreader")
    for sx in (-1, 1):  # hoist ropes up to the trolley (ride with the spreader)
        for sy in (-1, 1):
            m.limb(sp + Vector((sx * 0.4, sy * 0.6, 1.0)), sp + Vector((sx * 0.4, sy * 0.6, 8.2)), 0.04,
                   "DARK_STEEL", verts=3, smooth=False, group="Spreader")
    m.set_pivot("Spreader", sp)
    common.PALETTE["SPREADER"] = ("#ffc21a", 0.5, 0.2, 0, 1)
    objs = m.build_objects()
    byname = {o.name: o for o in objs}
    K.reparent(byname["Spreader"], byname["Trolley"])
    return K.finish(objs, "arenas/docks/gantry_crane", view=(1.0, -0.8, 0.5))


def container():
    """40 ft container, length along X, doors at +X. Corrugation = zig-zag walls."""
    K.begin()
    K.tint("TINT_Body", "#c8412e", 0.7, 0.2)
    m = common.Model("container")
    L, W, H = 12.19, 2.44, 2.59
    n = 8
    side = []
    for k in range(n * 2 + 1):
        x = L / 2 - L * k / (n * 2)
        side.append((x, W / 2 - (0.05 if k % 2 else 0.0)))
    foot = side + [(x, -y) for x, y in reversed(side)]
    N = len(foot)
    z0, z1 = 0.1, H - 0.08
    verts = [(x, y, z0) for x, y in foot] + [(x, y, z1) for x, y in foot]
    faces = [tuple(range(N - 1, -1, -1)), tuple(range(N, 2 * N))]
    faces += [(i, (i + 1) % N, N + (i + 1) % N, N + i) for i in range(N)]
    m.mesh(verts, faces, "TINT_Body")
    m.box((L, W, 0.1), (0, 0, H - 0.05), "TINT_Body")      # roof
    m.box((L, W, 0.1), (0, 0, 0.05), "DARK_STEEL")          # floor frame
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((0.16, 0.16, H), (sx * (L / 2 - 0.08), sy * (W / 2 - 0.08), H / 2), "DARK_STEEL")
    for k in range(4):  # door lock bars
        m.box((0.04, 0.04, H - 0.3), (L / 2 + 0.02, -0.9 + k * 0.6, H / 2), "STEEL")
    return K.finish(m.build_objects(), "arenas/docks/container")


def forklift():
    """Forks at the front (+Z). Node Forks: pivot at the fork heel on the ground; lift along Y."""
    K.begin()
    K.tint("TINT_Body", "#ffc21a", 0.5, 0.2)
    m = common.Model("forklift")
    B = "TINT_Body"
    m.box((1.1, 1.8, 0.7), (0, 0.2, 0.6), B, bevel=0.05)          # chassis
    m.box((1.1, 0.5, 0.7), (0, 1.05, 0.95), "DARK_STEEL", bevel=0.08)  # counterweight
    m.box((0.5, 0.5, 0.1), (0, 0.35, 1.05), "RUBBER")
    m.box((0.5, 0.12, 0.45), (0, 0.6, 1.3), "RUBBER", rot=(-10, 0, 0))  # seat
    m.limb((0, -0.2, 1.0), (0, -0.05, 1.45), 0.03, "DARK_STEEL", verts=6)
    m.torus(0.14, 0.02, (0, -0.02, 1.48), "RUBBER", rot=(-60, 0, 0), seg=10, sides=4)
    # overhead guard
    for sx in (-1, 1):
        for y in (-0.45, 0.85):
            m.box((0.06, 0.06, 1.25), (sx * 0.5, y, 1.55), "DARK_STEEL")
    m.box((1.1, 1.4, 0.06), (0, 0.2, 2.18), "DARK_STEEL")
    for k in range(4):
        m.box((1.05, 0.04, 0.04), (0, -0.3 + k * 0.33, 2.22), B)
    # mast
    for sx in (-1, 1):
        m.box((0.1, 0.12, 2.1), (sx * 0.35, -0.85, 1.1), "DARK_STEEL")
    m.box((0.8, 0.1, 0.08), (0, -0.85, 2.1), "DARK_STEEL")
    m.box((0.8, 0.1, 0.08), (0, -0.85, 0.35), "DARK_STEEL")
    # wheels
    for sx in (-1, 1):
        m.cyl(0.3, 0.24, (sx * 0.5, -0.5, 0.3), "TIRE", rot=(0, 90, 0), verts=12)
        m.cyl(0.24, 0.2, (sx * 0.5, 0.8, 0.24), "TIRE", rot=(0, 90, 0), verts=12)
        m.cyl(0.14, 0.26, (sx * 0.5, -0.5, 0.3), B, rot=(0, 90, 0), verts=8)
    m.box((0.12, 0.08, 0.1), (0.45, 1.3, 1.3), "EMISSIVE_Beacon" if False else "ORANGE_FLOWER")
    # forks carriage
    fp = Vector((0, -0.95, 0.05))
    m.box((0.9, 0.06, 0.5), fp + Vector((0, 0, 0.3)), "DARK_STEEL", group="Forks")
    for sx in (-1, 1):
        m.box((0.1, 1.1, 0.05), fp + Vector((sx * 0.25, -0.55, 0.03)), "STEEL", group="Forks")
    m.set_pivot("Forks", fp)
    return K.finish(m.build_objects(), "arenas/docks/forklift")


def light_mast():
    K.begin()
    K.emissive("EMISSIVE_Lamp", "#ffae42")
    m = common.Model("light_mast")
    m.cyl(0.35, 0.3, (0, 0, 0.15), "CONCRETE", verts=8)
    m.cyl(0.16, 13.4, (0, 0, 6.9), "GALV", r2=0.09, verts=8)
    m.box((1.2, 0.12, 0.12), (0, 0, 13.6), "GALV")
    m.box((0.12, 1.2, 0.12), (0, 0, 13.6), "GALV")
    for k in range(4):
        a = math.pi / 2 * k
        c = Vector((math.cos(a) * 0.55, math.sin(a) * 0.55, 13.45))
        m.box((0.42, 0.42, 0.18), c, "DARK_STEEL", rot=(0, 0, math.degrees(a)))
        m.box((0.36, 0.36, 0.03), c - Vector((0, 0, 0.1)), "EMISSIVE_Lamp", rot=(0, 0, math.degrees(a)))
    m.box((0.3, 0.3, 0.2), (0, 0, 13.85), "DARK_STEEL")
    return K.finish(m.build_objects(), "arenas/docks/light_mast", view=(1.0, -1.0, 0.3))


def bollard():
    K.begin()
    m = common.Model("bollard")
    m.cyl(0.25, 0.08, (0, 0, 0.04), "DARK_STEEL", verts=10)
    m.cyl(0.14, 0.42, (0, 0, 0.29), "DARK_STEEL", r2=0.12, verts=10, smooth=True)
    m.cyl(0.24, 0.1, (0, 0.05, 0.53), "DARK_STEEL", verts=10)
    m.sphere(0.06, (0, 0.22, 0.53), "DARK_STEEL", seg=6, rings=4)
    return K.finish(m.build_objects(), "arenas/docks/bollard")


def tugboat():
    """Harbour tug, bow toward the front (+Z)."""
    K.begin()
    K.tint("TINT_Hull", "#1f4f8a", 0.5, 0.2)
    K.emissive("EMISSIVE_Windows", "#ffd79a")
    m = common.Model("tugboat")
    L = 7.0
    # hull: pointed bow at -y (front), flared deck outline over a narrower keel
    top = [(0, -L - 0.3), (1.5, -5.4), (1.95, -3.0), (1.95, 6.4), (1.4, 7.0), (-1.4, 7.0), (-1.95, 6.4),
           (-1.95, -3.0), (-1.5, -5.4)]
    bot = [(0, -L + 1.0), (1.1, -4.8), (1.5, -2.5), (1.5, 6.0), (1.0, 6.6), (-1.0, 6.6), (-1.5, 6.0),
           (-1.5, -2.5), (-1.1, -4.8)]
    N = len(top)
    verts = [(x, y, 2.1 + (0.3 if y < -5 else 0.0)) for x, y in top] + [(x, y, 0.0) for x, y in bot]
    faces = [tuple(range(N)), tuple(range(2 * N - 1, N - 1, -1))]
    faces += [(i, N + i, N + (i + 1) % N, (i + 1) % N) for i in range(N)]
    m.mesh(verts, faces, "TINT_Hull")
    m.mesh([(x * 1.02, y * 1.0, 2.1 + (0.3 if y < -5 else 0.0) + 0.02) for x, y in top],
           [tuple(range(N))], "RUST")  # deck
    m.mesh([(x * 1.03, y * 1.01, 0.5) for x, y in top] + [(x * 1.03, y * 1.01, 0.75) for x, y in top],
           [(i, (i + 1) % N, N + (i + 1) % N, N + i) for i in range(N)], "RUST")  # boot-top stripe
    # deckhouse + wheelhouse
    m.box((3.0, 5.0, 1.8), (0, 0.5, 3.1), "WHITE", bevel=0.05)
    m.box((2.6, 2.6, 1.3), (0, -0.6, 4.65), "WHITE", bevel=0.05)
    m.box((2.8, 2.9, 0.12), (0, -0.6, 5.35), "TINT_Hull")
    m.box((2.4, 0.04, 0.55), (0, -1.92, 4.75), "EMISSIVE_Windows")
    for sx in (-1, 1):
        m.box((0.04, 2.0, 0.5), (sx * 1.31, -0.6, 4.75), "EMISSIVE_Windows")
        for k in range(3):
            m.cyl(0.12, 0.04, (sx * 1.51, -0.8 + k * 1.2, 3.2), "EMISSIVE_Windows", rot=(0, 90, 0), verts=8)
    m.cyl(0.35, 1.8, (0, 1.8, 4.9), "TINT_Hull", verts=10)       # funnel
    m.cyl(0.37, 0.3, (0, 1.8, 5.5), "BLACK", verts=10)
    m.cyl(0.05, 2.0, (0, -0.4, 6.3), "WHITE", verts=6)           # mast
    # tyre fenders along the sides and a big bow fender
    for sx in (-1, 1):
        for k in range(5):
            m.torus(0.3, 0.1, (sx * 1.98, -4.5 + k * 2.2, 1.5), "TIRE", rot=(0, 90, 0), seg=10, sides=4)
    m.cyl(0.45, 1.6, (0, -L + 0.1, 1.6), "TIRE", rot=(0, 90, 0), verts=10)
    for k in range(2):
        m.cyl(0.25, 0.4, (0, 3.5 + k * 1.2, 2.6), "DARK_STEEL", verts=8)  # bitts
    return K.finish(m.build_objects(), "arenas/docks/tugboat")


def oil_drum_fire():
    K.begin()
    K.tint("TINT_Drum", "#7a3d22", 0.9, 0.3)
    m = common.Model("oil_drum_fire")
    m.cyl(0.29, 0.88, (0, 0, 0.44), "TINT_Drum", verts=12)
    for z in (0.3, 0.6):
        m.cyl(0.3, 0.04, (0, 0, z), "RUST", verts=12)
    m.torus(0.28, 0.015, (0, 0, 0.88), "RUST", seg=12, sides=4)
    m.cyl(0.27, 0.02, (0, 0, 0.72), "BLACK", verts=12)          # char inside
    for k in range(4):
        a = math.pi / 2 * k + 0.4
        m.box((0.3, 0.06, 0.06), (math.cos(a) * 0.08, math.sin(a) * 0.08, 0.76), "WOOD_DARK", rot=(20, 0, math.degrees(a)))
    for k in range(3):
        a = 2 * math.pi * k / 3
        m.box((0.05, 0.02, 0.08), (math.cos(a) * 0.3, math.sin(a) * 0.3, 0.2), "BLACK", rot=(0, 0, math.degrees(a)))
    return K.finish(m.build_objects(), "arenas/docks/oil_drum_fire")


BUILDERS = {"gantry_crane": gantry_crane, "container": container, "forklift": forklift, "light_mast": light_mast,
            "bollard": bollard, "tugboat": tugboat, "oil_drum_fire": oil_drum_fire}
