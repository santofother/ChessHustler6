"""Stylized low-poly NPC body + clothing kit, skinned to the shared skeleton.

Same family as tools/blender/figure.py (pawn/king): chunky lofted limbs, big mitten
hands, boxy shoes, sphere head with dot eyes / block brows, flat Principled colours.
A `look` dict (see variants.py) picks the body shape and wardrobe pieces.

Recolourable materials (exact names): TINT_Top, TINT_Bottom, SKIN, HAIR, TINT_Accent.
"""
import math

from mathutils import Vector

from skeleton import seg

HC = Vector((0, 0.02, 1.64))  # head centre
HEAD_R = 0.13


def lerp(a, b, t):
    return a + (b - a) * t


# ----------------------------------------------------------------------------- torso
def torso_rings(look):
    """[(z, rx, ry, yoff)] for the upper body from the hem to the neck."""
    fem = look.get("fem", False)
    bulk = look.get("bulk", 1.0)
    belly = look.get("belly", 0.0)
    if fem:
        tbl = [(0.97, 0.170, 0.122, 0.0), (1.06, 0.145, 0.108, 0.0), (1.18, 0.150, 0.110, 0.004),
               (1.29, 0.168, 0.118, 0.01), (1.37, 0.178, 0.110, 0.0), (1.43, 0.13, 0.092, 0.0),
               (1.465, 0.062, 0.058, 0.004)]
    else:
        tbl = [(0.97, 0.176, 0.126, 0.0), (1.06, 0.166, 0.120, 0.0), (1.18, 0.176, 0.124, 0.005),
               (1.30, 0.192, 0.128, 0.01), (1.38, 0.200, 0.118, 0.0), (1.44, 0.145, 0.10, 0.0),
               (1.475, 0.066, 0.062, 0.004)]
    out = []
    for z, rx, ry, yo in tbl:
        b = belly * math.exp(-((z - 1.1) / 0.1) ** 2)
        out.append((z, rx * bulk + b * 0.5, ry * bulk + b, yo + b * 0.8))
    return out


def ring_at(rings, z):
    for (z0, a0, b0, y0), (z1, a1, b1, y1) in zip(rings, rings[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return lerp(a0, a1, t), lerp(b0, b1, t), lerp(y0, y1, t)
    z0, a0, b0, y0 = rings[0] if z < rings[0][0] else rings[-1]
    return a0, b0, y0


def pelvis(m, look, mat):
    bulk = look.get("bulk", 1.0)
    hw = 0.185 if look.get("fem") else 0.172
    m.bind = "torso"
    m.loft([((0, 0, 0.80), 0.14 * bulk, 0.095 * bulk), ((0, 0, 0.86), (hw - 0.01) * bulk, 0.118 * bulk),
            ((0, 0, 0.94), hw * bulk, 0.124 * bulk), ((0, 0, 1.03), (hw - 0.02) * bulk, 0.118 * bulk)],
           mat, verts=12)


def upper_body(m, look, mats_fn=None, hem=0.97, top="TINT_Top", verts=12, grow=0.0):
    """Shirt/jacket/vest loft. mats_fn(z_mid) -> material per segment."""
    rings = [r for r in torso_rings(look) if r[0] >= hem - 1e-6]
    if rings[0][0] > hem + 1e-6:
        a, b, y = ring_at(torso_rings(look), hem)
        rings.insert(0, (hem, a, b, y))
    if hem < 0.97:  # jacket hem below the waist: flare over the hips
        base = torso_rings(look)
        rings = [(hem, base[0][1] + 0.012, base[0][2] + 0.01, 0.0)] + [r for r in base]
    pts = [((0, y, z), a + grow, b + grow) for z, a, b, y in rings]
    mats = [mats_fn((rings[i][0] + rings[i + 1][0]) / 2) if mats_fn else top
            for i in range(len(rings) - 1)]
    m.bind = "torso"
    m.loft(pts, mats, verts=verts)
    return rings


def torso_surface(look, z, th, grow=0.0):
    """Point + normal on the upper-body ellipse at height z, angle th (0 = +X, 90 = front)."""
    a, b, y = ring_at(torso_rings(look), z)
    a, b = a + grow, b + grow
    p = Vector((a * math.cos(th), y + b * math.sin(th), z))
    n = Vector((math.cos(th) / a, math.sin(th) / b, 0)).normalized()
    return p, n


# ----------------------------------------------------------------------------- limbs
def chain_point(names, u):
    """u in [0,1] along the first bone, [1,2] along the second (extrapolates)."""
    (h0, t0), (h1, t1) = seg(names[0]), seg(names[1])
    if u <= 1:
        return h0 + (t0 - h0) * u
    return h1 + (t1 - h1) * (u - 1)


def limb(m, bones, bind, prof, sleeve_u=None, cloth="TINT_Top", skin="TINT_Skin", thick=0.012,
         flare=0.0, verts=8, ref=(1, 0, 0), cuff=None):
    """prof: [(u, r)] skin profile. Cloth covers u < sleeve_u (+thick, +flare at the hem).
    cuff = (u0, material): a band of another material from u0 to sleeve_u."""
    rings, mats = [], []
    for i, (u, r) in enumerate(prof):
        if sleeve_u is not None and i > 0 and prof[i - 1][0] < sleeve_u <= u:
            # hem: finish the cloth, step down to skin
            rs = lerp(prof[i - 1][1], r, (sleeve_u - prof[i - 1][0]) / (u - prof[i - 1][0]))
            if cuff and prof[i - 1][0] < cuff[0]:
                rc = lerp(prof[i - 1][1], r, (cuff[0] - prof[i - 1][0]) / (u - prof[i - 1][0]))
                rings.append((cuff[0], rc + thick + flare * 0.6))
                mats.append(cloth)
            rings.append((sleeve_u, rs + thick + flare))
            mats.append(cuff[1] if cuff else cloth)
            if sleeve_u < prof[-1][0]:
                rings.append((sleeve_u, rs))
                mats.append(cuff[1] if cuff else cloth)  # the hem's flat step
        on_cloth = sleeve_u is not None and u < sleeve_u
        rings.append((u, r + (thick if on_cloth else 0)))
        mats.append(cloth if on_cloth else skin)
    # mats[i] is the material of the segment ending at ring i
    seg_mats = mats[1:]
    m.bind = bind
    m.loft([(chain_point(bones, u), r, r) for u, r in rings], seg_mats, verts=verts, ref=ref)


ARM_PROF = [(-0.08, 0.06), (0.3, 0.061), (0.75, 0.053), (1.0, 0.049), (1.2, 0.05), (1.55, 0.046),
            (1.93, 0.036), (2.08, 0.034)]
LEG_PROF = [(-0.13, 0.094), (0.1, 0.093), (0.5, 0.081), (0.85, 0.067), (1.0, 0.063), (1.15, 0.064),
            (1.38, 0.067), (1.78, 0.048), (1.96, 0.044)]


def scale_prof(prof, k):
    return [(u, r * k) for u, r in prof]


def arms(m, look, sleeve_u, cloth="TINT_Top", cap_mat=None, cuff=None):
    bulk = look.get("arm_bulk", look.get("bulk", 1.0)) * (0.9 if look.get("fem") else 1.0)
    for side, sx in (("L", -1), ("R", 1)):
        b = ["upperarm_" + side, "lowerarm_" + side]
        limb(m, b, "arm_" + side, scale_prof(ARM_PROF, bulk), sleeve_u, cloth, cuff=cuff,
             flare=0.006 if sleeve_u and sleeve_u < 1 else 0.0)
        # shoulder cap
        m.bind = "arm_" + side
        cm = cap_mat or (cloth if sleeve_u else "TINT_Skin")
        r = 0.062 * bulk + (0.012 if sleeve_u else 0)
        m.sphere(r, (sx * 0.195, 0, 1.372), cm, scale=(1.0, 0.95, 0.9), seg=8, rings=5)
        hand(m, side, look)


def hand(m, side, look):
    h, t = seg("hand_" + side)
    sx = -1 if side == "L" else 1
    k = 0.92 if look.get("fem") else 1.0
    m.bind = "hand_" + side
    c = h + (t - h) * 0.42
    m.sphere(0.048 * k, c, "TINT_Skin", scale=(0.72, 1.0, 1.3), seg=8, rings=6)
    # thumb, forward and slightly inward
    m.sphere(0.02 * k, c + Vector((-sx * 0.012, 0.035, 0.018)), "TINT_Skin", scale=(1, 1.2, 1.5), seg=6, rings=4)
    if look.get("watch") and side == "L":
        m.bind = "arm_L"
        w = chain_point(["upperarm_L", "lowerarm_L"], 1.86)
        m.limb(w + Vector((0, 0, 0.018)), w - Vector((0, 0, 0.018)), 0.042, look["watch"], verts=8,
               smooth=False)


def legs(m, look, pants_u, cloth="TINT_Bottom", flare=0.0, cuff=None):
    bulk = look.get("leg_bulk", look.get("bulk", 1.0)) * (0.94 if look.get("fem") else 1.0)
    for side in ("L", "R"):
        b = ["upperleg_" + side, "lowerleg_" + side]
        limb(m, b, "leg_" + side, scale_prof(LEG_PROF, bulk), pants_u, cloth, thick=0.013,
             flare=flare, cuff=cuff)


# ----------------------------------------------------------------------------- feet
def shoes(m, look):
    kind = look.get("shoes", "sneaker")
    for side, sx in (("L", -1), ("R", 1)):
        x = sx * 0.112
        m.bind = "foot_" + side
        if kind == "sneaker":
            m.box((0.118, 0.26, 0.085), (x, 0.045, 0.052), "TINT_Shoes", bevel=0.022)
            m.box((0.126, 0.27, 0.028), (x, 0.045, 0.014), "SHOE_WHITE", bevel=0.008)
            m.box((0.07, 0.012, 0.03), (x, 0.172, 0.048), "SHOE_WHITE")
        elif kind == "boot":
            m.box((0.13, 0.27, 0.15), (x, 0.04, 0.085), "TINT_Shoes", bevel=0.025)
            m.box((0.138, 0.28, 0.03), (x, 0.04, 0.015), "BLACK", bevel=0.008)
        elif kind == "loafer":
            m.box((0.112, 0.25, 0.075), (x, 0.045, 0.045), "TINT_Shoes", bevel=0.022)
            m.box((0.118, 0.255, 0.02), (x, 0.045, 0.01), "BLACK", bevel=0.006)
        elif kind == "flipflop":
            m.box((0.092, 0.23, 0.07), (x, 0.04, 0.05), "TINT_Skin", bevel=0.022)
            m.box((0.11, 0.26, 0.022), (x, 0.045, 0.011), "TINT_Shoes", bevel=0.006)
            m.box((0.1, 0.014, 0.02), (x, 0.09, 0.07), "TINT_Shoes", rot=(0, 0, 0))
        elif kind == "sandal":  # strappy platform sandals
            m.box((0.086, 0.22, 0.07), (x, 0.04, 0.06), "TINT_Skin", bevel=0.022)
            m.box((0.105, 0.245, 0.04), (x, 0.042, 0.02), "TINT_Shoes", bevel=0.01)
            for y in (0.0, 0.1):
                m.box((0.096, 0.02, 0.03), (x, y, 0.075), "TINT_Shoes")


# ----------------------------------------------------------------------------- head
def head(m, look):
    m.bind = "neck"
    m.loft([((0, 0, 1.40), 0.058, 0.058), ((0, 0.008, 1.50), 0.056, 0.056), ((0, 0.012, 1.58), 0.054, 0.054)],
           "TINT_Skin", verts=8)
    m.bind = "head"
    fem = look.get("fem", False)
    m.sphere(HEAD_R, HC, "TINT_Skin", scale=(0.94 if fem else 0.97, 1.0, 1.1), seg=12, rings=8)
    if not fem:  # a bit of jaw
        m.sphere(0.085, HC + Vector((0, 0.035, -0.07)), "TINT_Skin", scale=(1.15, 0.95, 0.8), seg=8, rings=5)
    for sx in (-1, 1):
        m.sphere(0.028, HC + Vector((sx * 0.121, -0.005, -0.005)), "TINT_Skin", scale=(0.5, 0.9, 1.25), seg=6, rings=4)
    m.sphere(0.022, HC + Vector((0, 0.13, -0.018)), "TINT_Skin", scale=(1, 1.1, 1.25), seg=6, rings=4)
    if not look.get("shades"):
        for sx in (-1, 1):
            m.sphere(0.017, HC + Vector((sx * 0.045, 0.113, 0.012)), "EYE", seg=6, rings=4)
    brow = look.get("brow", "TINT_Hair")
    for sx in (-1, 1):
        m.box((0.05, 0.016, 0.013), HC + Vector((sx * 0.046, 0.121, 0.05)), brow, rot=(0, sx * 8, 0))
    m.box((0.05, 0.012, 0.011), HC + Vector((0, 0.118, -0.064)), "LIP" if fem else "MOUTH",
          rot=(10, 0, 0))
    if look.get("shades"):
        for sx in (-1, 1):
            m.box((0.07, 0.016, 0.04), HC + Vector((sx * 0.043, 0.125, 0.018)), "LENS",
                  rot=(0, 0, sx * -10), bevel=0.008)
        m.box((0.03, 0.012, 0.01), HC + Vector((0, 0.132, 0.03)), "CHROME")
        for sx in (-1, 1):
            m.box((0.01, 0.12, 0.01), HC + Vector((sx * 0.118, 0.06, 0.03)), "LENS")
    hair(m, look)
    hat(m, look)
    if look.get("hoops"):
        for sx in (-1, 1):
            m.torus(0.022, 0.004, HC + Vector((sx * 0.126, 0.0, -0.05)), "GOLD", rot=(0, 90, 0), seg=10, sides=4)


def hair(m, look):
    style = look.get("hair", "short")
    m.bind = "head"
    if style == "none":
        return
    top = HC + Vector((0, -0.02, 0.05))
    if style in ("short", "slick", "bun", "pony", "long", "buzz", "curly"):
        r = 0.134 if style == "buzz" else 0.141
        m.sphere(r, top, "TINT_Hair", scale=(1.0, 1.02, 0.75 if style != "curly" else 0.85), seg=10, rings=6)
        # back of the head / nape
        m.sphere(r * 0.95, HC + Vector((0, -0.035, 0.0)), "TINT_Hair", scale=(0.98, 0.9, 1.0), seg=8, rings=5)
        # sideburns
        for sx in (-1, 1):
            m.box((0.02, 0.05, 0.07), HC + Vector((sx * 0.118, 0.02, 0.0)), "TINT_Hair")
    if style == "short":
        m.sphere(0.07, HC + Vector((0.03, 0.08, 0.12)), "TINT_Hair", scale=(1.3, 0.9, 0.55), seg=8, rings=5)
    if style == "slick":
        m.sphere(0.08, HC + Vector((0.0, 0.03, 0.12)), "TINT_Hair", scale=(1.3, 1.4, 0.5), seg=8, rings=5)
    if style == "curly":
        for k in range(9):
            a = 2 * math.pi * k / 9
            m.sphere(0.05, HC + Vector((math.cos(a) * 0.1, -0.01 + math.sin(a) * 0.1, 0.1)), "TINT_Hair", seg=6, rings=4)
    if style == "bun":
        m.sphere(0.06, HC + Vector((0, -0.07, 0.15)), "TINT_Hair", seg=8, rings=6)
        m.torus(0.04, 0.012, HC + Vector((0, -0.055, 0.12)), "TINT_Accent", rot=(55, 0, 0), seg=10, sides=4)
    if style == "pony":
        m.torus(0.03, 0.01, HC + Vector((0, -0.13, 0.06)), "TINT_Accent", rot=(80, 0, 0), seg=8, sides=4)
        m.loft([(HC + Vector((0, -0.14, 0.06)), 0.04, 0.04), (HC + Vector((0, -0.19, -0.02)), 0.045, 0.04),
                (HC + Vector((0, -0.2, -0.14)), 0.035, 0.03), (HC + Vector((0, -0.18, -0.24)), 0.012, 0.012)],
               "TINT_Hair", verts=6)
    if style == "long":
        m.box((0.25, 0.09, 0.26), HC + Vector((0, -0.07, -0.1)), "TINT_Hair", bevel=0.035)
        for sx in (-1, 1):
            m.box((0.05, 0.08, 0.22), HC + Vector((sx * 0.115, 0.02, -0.07)), "TINT_Hair", bevel=0.02,
                  rot=(0, sx * -6, 0))
        m.sphere(0.07, HC + Vector((-0.03, 0.085, 0.105)), "TINT_Hair", scale=(1.5, 0.8, 0.5), seg=8, rings=5)


def hat(m, look):
    kind = look.get("hat")
    m.bind = "head"
    if kind == "cap":
        m.sphere(0.145, HC + Vector((0, -0.01, 0.06)), "TINT_Accent", scale=(1.0, 1.02, 0.72), seg=12, rings=6)
        m.box((0.2, 0.13, 0.014), HC + Vector((0, 0.165, 0.07)), "TINT_Accent", rot=(-8, 0, 0), bevel=0.005)
        m.cyl(0.014, 0.012, HC + Vector((0, -0.01, 0.165)), "TINT_Accent", verts=6)
    elif kind == "hardhat":
        m.sphere(0.15, HC + Vector((0, 0.0, 0.07)), "TINT_Accent", scale=(1.0, 1.08, 0.8), seg=12, rings=6)
        m.cyl(0.175, 0.016, HC + Vector((0, 0.02, 0.06)), "TINT_Accent", scale=(1.0, 1.12, 1), verts=14)
        m.box((0.03, 0.26, 0.03), HC + Vector((0, 0.0, 0.185)), "TINT_Accent", bevel=0.01)
    elif kind == "panama":
        m.cyl(0.24, 0.012, HC + Vector((0, 0.0, 0.1)), "TINT_Accent", r2=0.2, verts=16, scale=(1, 1.05, 1))
        m.cyl(0.125, 0.1, HC + Vector((0, -0.005, 0.15)), "TINT_Accent", r2=0.11, verts=12, scale=(1.05, 1.1, 1))
        m.cyl(0.127, 0.03, HC + Vector((0, -0.005, 0.12)), "BLACK", verts=12, scale=(1.05, 1.1, 1))
    elif kind == "shades_up":  # sunglasses pushed up on the hair
        for sx in (-1, 1):
            m.box((0.07, 0.03, 0.04), HC + Vector((sx * 0.046, 0.09, 0.118)), "LENS",
                  rot=(-50, 0, 0), bevel=0.008)
        m.box((0.2, 0.02, 0.012), HC + Vector((0, 0.1, 0.135)), "TINT_Accent", rot=(-50, 0, 0))


# ----------------------------------------------------------------------------- details
def floral(m, look, mat="PRINT", z0=1.02, z1=1.36, rows=4, per=8, grow=0.004, bind="torso"):
    m.bind = bind
    for ri in range(rows):
        z = z0 + (z1 - z0) * ri / (rows - 1)
        for k in range(per):
            th = 2 * math.pi * (k + 0.5 * (ri % 2)) / per + 0.25
            if z > 1.3 and abs(math.sin(th) - 1) < 0.25:
                continue  # keep the collar clear
            p, n = torso_surface(look, z, th, grow)
            decal(m, p, n, 0.032, mat, verts=5, spin=k * 29 + ri * 11)


def collar_v(m, look, depth=1.33, width=0.06, mat="TINT_Skin", grow=0.003, flaps=None):
    """Open-collar V on the chest front (skin or undershirt), optional collar flaps."""
    m.bind = "torso"
    zt = 1.445
    pa, na = torso_surface(look, zt, math.radians(90 - 28), grow)
    pb, nb = torso_surface(look, zt, math.radians(90 + 28), grow)
    pc, nc = torso_surface(look, depth, math.radians(90), grow)
    pa.x, pb.x = width, -width
    t = 0.01
    m.mesh([pa, pb, pc, pa - na * t, pb - nb * t, pc - nc * t],
           [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], mat)
    if flaps:
        for sx in (-1, 1):
            p, n = torso_surface(look, 1.42, math.radians(90 - sx * 22), 0.006)
            m.box((0.065, 0.014, 0.045), p, flaps, rot=(12, 0, sx * -32))


def decal(m, p, n, r, mat, verts=5, spin=0.0):
    """Single flat n-gon lying on a surface (floral print etc.): verts-2 tris."""
    n = Vector(n).normalized()
    q = Vector((0, 0, 1)).rotation_difference(n)
    pts = []
    for k in range(verts):
        a = 2 * math.pi * k / verts + math.radians(spin)
        pts.append(Vector(p) + q @ Vector((math.cos(a) * r, math.sin(a) * r, 0)))
    m.mesh(pts, [tuple(range(verts))], mat, recalc=False)
