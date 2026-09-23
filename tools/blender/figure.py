"""Stylized low-poly character shared by pawn (street thug) and king (The Boss).

Coordinates below are authored for a pawn-sized figure (s=1) standing on the base,
facing Blender +Y. `s` scales everything, `w` widens the body (not the head).
"""
import math

from mathutils import Euler, Vector

from common import BASE_TOP


def figure(m, s=1.0, w=1.0, king=False):
    B = BASE_TOP

    def P(x, y, z, wide=True):
        return (x * s * (w if wide else 1.0), y * s, B + z * s)

    def S(v):
        return v * s

    shirt, accent = "TEAM_PRIMARY", "TEAM_ACCENT"
    pants = "KHAKI" if king else "DENIM"
    shoes = "LEATHER" if king else "SHOE_WHITE"

    # ---- legs & feet
    for sx in (-1, 1):
        m.box((S(0.075) * w, S(0.135), S(0.05)), P(sx * 0.055, 0.018, 0.025), shoes, bevel=S(0.012))
        if not king:
            m.box((S(0.077) * w, S(0.137), S(0.012)), P(sx * 0.055, 0.018, 0.006), accent)
        m.limb(P(sx * 0.055, 0, 0.045), P(sx * 0.06, 0, 0.215), S(0.042) * w, pants, r2=S(0.05) * w)
    m.cyl(S(0.1), S(0.07), P(0, 0, 0.215), pants, verts=10, scale=(w, 0.75, 1), smooth=True)
    m.cyl(S(0.103), S(0.022), P(0, 0, 0.245), "BLACK", verts=10, scale=(w, 0.76, 1))
    m.box((S(0.03), S(0.01), S(0.022)), P(0, 0.078, 0.245, False), "GOLD" if king else "CHROME")

    # ---- torso (shirt)
    z0, h, r1, r2, sy = 0.25, 0.19, 0.105, 0.13, 0.72
    m.cyl(S(r1), S(h), P(0, 0, z0 + h / 2), shirt, r2=S(r2), verts=12, scale=(w, sy, 1), smooth=True)
    if king:  # boss belly
        m.sphere(S(0.108), P(0, 0.035, 0.305), shirt, scale=(w * 1.02, 0.78, 0.82), seg=12, rings=8)
    for sx in (-1, 1):  # shoulders / sleeve caps
        m.sphere(S(0.06), P(sx * 0.122, 0, 0.415), shirt, scale=(1.05, 1, 0.9), seg=10, rings=6)
    # open collar: skin V + collar flaps
    fy = r2 * sy * s + 0.002 * s
    vw = 0.055 if king else 0.04
    vb = 0.355 if king else 0.38
    m.mesh([(-S(vw), fy, B + S(0.44)), (S(vw), fy, B + S(0.44)), (0, fy, B + S(vb)),
            (-S(vw), fy - S(0.02), B + S(0.44)), (S(vw), fy - S(0.02), B + S(0.44)),
            (0, fy - S(0.02), B + S(vb))],
           [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], "SKIN")
    for sx in (-1, 1):
        m.box((S(0.05), S(0.012), S(0.03)), P(sx * (vw + 0.012), r2 * sy + 0.004, 0.43, False),
              shirt, rot=(10, 0, sx * -30))

    # floral print: pentagon "hibiscus" decals on the shirt
    rows = [(0.285, 0), (0.335, 0.5), (0.385, 0.2)]
    for zi, (z, off) in enumerate(rows):
        n = 7
        for k in range(n):
            th = 2 * math.pi * (k + off) / n + 0.3
            if abs(math.sin(th) - 1) < 0.12 and z > 0.36:
                continue  # keep the V-neck clear
            t = (z - z0) / h
            r = r1 + (r2 - r1) * t
            a, b = r * w, r * sy
            if king and z < 0.34:  # sit on the belly bulge
                a, b = a * 1.06, b * 1.1
            px, py = a * math.cos(th), b * math.sin(th)
            nrm = Vector((math.cos(th) / a, math.sin(th) / b, 0)).normalized()
            c = Vector((px * s, py * s, B + z * s)) + nrm * 0.002 * s
            m.disc(c, nrm, S(0.021), S(0.006), accent, verts=5, spin=k * 23)

    # ---- neck & head
    m.cyl(S(0.042), S(0.06), P(0, 0, 0.45, False), "SKIN", verts=8, smooth=True)
    hc = P(0, 0.005, 0.54, False)
    m.sphere(S(0.1), hc, "SKIN", scale=(0.95, 0.95, 1.05), seg=12, rings=8)
    for sx in (-1, 1):
        m.sphere(S(0.022), P(sx * 0.094, 0, 0.54, False), "SKIN", scale=(0.6, 1, 1.1), seg=6, rings=4)
    m.sphere(S(0.018), P(0, 0.099, 0.525, False), "SKIN", scale=(1, 1, 1.2), seg=6, rings=4)
    if king:
        # sunglasses
        for sx in (-1, 1):
            m.box((S(0.058), S(0.014), S(0.034)), P(sx * 0.037, 0.093, 0.553, False), "BLACK",
                  rot=(0, 0, sx * -12), bevel=S(0.006))
        m.box((S(0.03), S(0.012), S(0.01)), P(0, 0.1, 0.562, False), "GOLD")
        m.box((S(0.19), S(0.01), S(0.008)), P(0, 0.086, 0.568, False), "GOLD")
        # slicked-back hair + quiff
        m.sphere(S(0.104), P(0, -0.012, 0.578, False), "HAIR", scale=(1, 1.03, 0.62), seg=12, rings=6)
        m.sphere(S(0.06), P(0, 0.045, 0.632, False), "HAIR", scale=(1.3, 1.25, 0.62), seg=10, rings=6)
        for sx in (-1, 1):
            m.box((S(0.012), S(0.03), S(0.05)), P(sx * 0.093, 0.01, 0.55, False), "HAIR")
        # gold crown, worn at a jaunty tilt
        cc = Vector(P(0, -0.015, 0.664, False))
        tilt = Euler((math.radians(-10), math.radians(14), 0)).to_matrix()
        m.cyl(S(0.058), S(0.04), cc, "GOLD", r2=S(0.068), verts=10, rot=(-10, 14, 0))
        for k in range(5):
            a = 2 * math.pi * k / 5 + math.pi / 2
            off = tilt @ Vector((math.cos(a) * S(0.058), math.sin(a) * S(0.058), S(0.038)))
            m.cyl(S(0.016), S(0.04), cc + off, "GOLD", r2=0.0, verts=4, rot=(-10, 14, 45))
            tip = tilt @ Vector((math.cos(a) * S(0.058), math.sin(a) * S(0.058), S(0.062)))
            m.sphere(S(0.008), cc + tip, "GOLD", seg=5, rings=3)
        gem = tilt @ Vector((0, S(0.066), S(0.0)))
        m.sphere(S(0.013), cc + gem, "RUBY", seg=6, rings=4)
        # gold chain + medallion
        m.torus(S(0.072), S(0.009), P(0, 0.035, 0.43, False), "GOLD", rot=(-38, 0, 0),
                seg=14, sides=5, scale=(1.05, 1, 1))
        m.disc(P(0, 0.112, 0.385, False), (0, 1, 0.25), S(0.024), S(0.008), "GOLD", verts=8)
        # cigar with glowing tip
        a, b = Vector(P(0.025, 0.096, 0.505, False)), Vector(P(0.06, 0.155, 0.495, False))
        m.limb(a, b, S(0.009), "LEATHER", verts=6)
        m.sphere(S(0.0095), b, "EMBER", seg=6, rings=4)
    else:
        for sx in (-1, 1):
            m.sphere(S(0.014), P(sx * 0.036, 0.088, 0.552, False), "BLACK", seg=6, rings=4)
            m.box((S(0.038), S(0.01), S(0.01)), P(sx * 0.037, 0.093, 0.578, False), "HAIR",
                  rot=(0, sx * 8, 0))
        # backwards snapback cap
        m.sphere(S(0.104), P(0, -0.004, 0.59, False), accent, scale=(1, 1, 0.6), seg=12, rings=6)
        m.box((S(0.12), S(0.095), S(0.012)), P(0, -0.125, 0.588, False), accent, rot=(-12, 0, 0),
              bevel=S(0.004))
        m.cyl(S(0.012), S(0.01), P(0, 0, 0.652, False), accent, verts=6)

    # ---- arms
    def arm(sh, el, ha, watch=None):
        sh, el, ha = Vector(sh), Vector(el), Vector(ha)
        m.limb(sh, sh.lerp(el, 0.55), S(0.05) * w, shirt, r2=S(0.046) * w, verts=8)
        m.limb(sh.lerp(el, 0.4), el, S(0.034) * w, "SKIN", r2=S(0.032) * w)
        m.sphere(S(0.032) * w, el, "SKIN", seg=8, rings=5)
        m.limb(el, ha, S(0.031) * w, "SKIN", r2=S(0.028) * w)
        m.sphere(S(0.037) * w, ha, "SKIN", seg=8, rings=6)
        if watch:
            m.limb(el.lerp(ha, 0.72), el.lerp(ha, 0.84), S(0.035) * w, watch, verts=8, smooth=False)

    if king:
        # left: fist on hip; right: flashing a fan of cash
        arm(P(-0.14, 0, 0.405), P(-0.225, -0.035, 0.31), P(-0.13, 0.01, 0.255))
        hand = Vector(P(0.13, 0.13, 0.27))
        arm(P(0.14, 0, 0.405), P(0.19, 0.035, 0.29), hand, watch="GOLD")
        for k, ang in enumerate((-36, -12, 12, 36)):
            R = Euler((0, math.radians(ang), 0)).to_matrix()
            off = R @ Vector((0, 0, S(0.05)))
            m.box((S(0.042), S(0.004), S(0.075)), hand + off + Vector((0, S(0.02) + k * 0.001, 0)),
                  "CASH", rot=(0, ang, 0))
        m.box((S(0.05), S(0.03), S(0.02)), hand + Vector((0, S(0.018), S(0.012))), "GOLD")
    else:
        arm(P(-0.14, 0, 0.405), P(-0.168, -0.01, 0.275), P(-0.158, 0.012, 0.165))
        hand = Vector(P(0.07, 0.132, 0.335))
        arm(P(0.14, 0, 0.405), P(0.168, 0.025, 0.285), hand, watch="CHROME")
        # phone held up, screen tilted toward the face
        R = Euler((math.radians(-53), 0, 0)).to_matrix()
        pc = hand + Vector((-S(0.004), S(0.008), S(0.03)))
        m.box((S(0.056), S(0.012), S(0.098)), pc, "BLACK", rot=(-53, 0, 0), bevel=S(0.004))
        m.box((S(0.047), S(0.004), S(0.084)), pc + R @ Vector((0, -S(0.007), 0)), "SCREEN",
              rot=(-53, 0, 0))
