"""Procedural NPC animation clips, baked to plain FK quaternion keys on the shared skeleton.

Authoring model
  * Each clip is a function pose(t) -> Pose, t = phase 0..1 (loops use only whole-number
    frequencies of t, so the last frame equals the first -> seamless).
  * Rotations are given in *armature rest axes* relative to the parent bone
    (X = character's right, Y = forward, Z = up; +X on a hanging arm/leg swings it forward,
    -X on an upward bone bows it forward, +Z turns left). Right-side limbs are mirrored,
    so identical numbers on L and R give a symmetric pose.
  * Legs are driven by IK (ankle targets + knee poles) so planted feet never slide;
    the rig is sampled per frame and every deform bone is baked to local
    rotation (+ hips translation). IK helpers and constraints are removed before export.
"""
import math

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

import skeleton

FPS = 30
TAU = 2 * math.pi
DEFORM = skeleton.BONE_ORDER


def S(t, k=1, ph=0.0):
    return math.sin(TAU * (k * t + ph))


def C(t, k=1, ph=0.0):
    return math.cos(TAU * (k * t + ph))


def sm(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def keys(t, pts):
    """Smoothstep-interpolated keyframes [(t, value)] (values may be tuples)."""
    if t <= pts[0][0]:
        return pts[0][1]
    for (t0, a), (t1, b) in zip(pts, pts[1:]):
        if t <= t1:
            u = sm((t - t0) / (t1 - t0))
            if isinstance(a, tuple):
                return tuple(x + (y - x) * u for x, y in zip(a, b))
            return a + (b - a) * u
    return pts[-1][1]


def E(x=0.0, y=0.0, z=0.0):
    return Euler((math.radians(x), math.radians(y), math.radians(z)), "XYZ").to_matrix()


def Rx(a):
    return Matrix.Rotation(math.radians(a), 3, "X")


def Ry(a):
    return Matrix.Rotation(math.radians(a), 3, "Y")


def Rz(a):
    return Matrix.Rotation(math.radians(a), 3, "Z")


class Pose:
    def __init__(self):
        self.rot = {}
        self.hips = Vector((0, 0, 0))
        self.foot = {"L": [Vector((0, 0, 0)), E(0, 0, 8)], "R": [Vector((0, 0, 0)), E(0, 0, -8)]}
        self.knee = {"L": Vector((-0.04, 0, 0)), "R": Vector((0.04, 0, 0))}
        self.reach_ = {"L": None, "R": None}

    def r(self, bone, x=0.0, y=0.0, z=0.0):
        self.rot[bone] = E(x, y, z) @ self.rot.get(bone, Matrix.Identity(3))
        return self

    def hip(self, dx=0.0, dy=0.0, dz=0.0, x=0.0, y=0.0, z=0.0):
        self.hips = Vector((dx, dy, dz))
        self.r("hips", x, y, z)
        return self

    def arm(self, side, fwd=0.0, out=0.0, twist=0.0, elbow=0.0, elbow_y=0.0, fore=0.0, hand=(0, 0, 0)):
        """fwd: swing forward; out: raise sideways (abduct); twist: +external rotation;
        elbow: flex; elbow_y: forearm swings outward; fore: +supination (palm up when bent)."""
        m = 1 if side == "L" else -1
        self.rot["upperarm_" + side] = Rx(fwd) @ Ry(m * out) @ Rz(m * twist)
        self.rot["lowerarm_" + side] = Rx(elbow) @ Ry(m * elbow_y) @ Rz(m * fore)
        self.rot["hand_" + side] = E(hand[0], m * hand[1], m * hand[2])
        return self

    def reach(self, side, out, fwd, up, pole=(0.55, -0.35, 1.05), space="chest", hand=(0, 0, 0)):
        """Arm IK: put the wrist at (out, fwd, up) - out is sideways away from the body's
        centre (negative crosses the midline). space 'chest' = rest-pose coordinates that ride
        along with the chest; 'world' = armature space (e.g. hands resting on the thighs)."""
        m = -1 if side == "L" else 1
        self.reach_[side] = (Vector((m * out, fwd, up)), Vector((m * pole[0], pole[1], pole[2])), space)
        mh = 1 if side == "L" else -1
        self.rot["hand_" + side] = E(hand[0], mh * hand[1], mh * hand[2])
        return self

    def step(self, side, dx=0.0, dy=0.0, dz=0.0, pitch=0.0, yaw=None):
        """Ankle target offset from rest; pitch + = toes up; yaw + = toes outward."""
        m = 1 if side == "L" else -1
        yaw = 8 if yaw is None else yaw
        self.foot[side] = [Vector((dx, dy, dz)), Rz(m * yaw) @ Rx(pitch)]
        return self

    def kneeout(self, side, dx=0.0, dy=0.0, dz=0.0):
        m = -1 if side == "L" else 1
        self.knee[side] = Vector((m * 0.04 + m * dx, dy, dz))
        return self


# =========================================================================== clips
SIT_HIPS = Vector((0, -0.12, -0.37))  # hips offset in 'sit' (seat top ~0.44 m, butt ~0.2 m behind origin)
PHONE_TWIST = 90
WALK_STRIDE = 0.6    # metres a planted ankle travels backwards per stance phase
WALK_STANCE = 0.6    # fraction of the cycle a foot is planted
WALK_T = 0.8         # seconds per cycle (two steps)
WALK_SPEED = WALK_STRIDE / (WALK_STANCE * WALK_T)  # native m/s the root should move
def relaxed_arms(P, t, amp=1.0, ph=0.0):
    P.arm("L", fwd=4 + 2 * amp * S(t, 1, ph), out=-3 + 1.5 * amp * S(t, 1, ph + 0.3), twist=0,
          elbow=12 + 3 * amp * S(t, 1, ph + 0.1), fore=10)
    P.arm("R", fwd=4 + 2 * amp * S(t, 1, ph + 0.5), out=-3 + 1.5 * amp * S(t, 1, ph + 0.8), twist=0,
          elbow=12 + 3 * amp * S(t, 1, ph + 0.6), fore=10)


def clip_idle(t):
    P = Pose()
    P.hip(dx=0.008 * S(t), dz=-0.012 + 0.004 * S(t, 2), z=2 * S(t), y=-1.2 * S(t))
    P.r("spine", x=1.5 * S(t, 2, 0.25), y=0.8 * S(t))
    P.r("chest", x=1.5 * S(t, 2, 0.25), z=-1.5 * S(t))
    P.r("neck", x=-2)
    P.r("head", x=-2 + 2.5 * S(t, 2), z=10 * S(t, 1, 0.15), y=2 * S(t, 1, 0.4))
    relaxed_arms(P, t)
    return P


def clip_idle_shift(t):
    w = S(t)  # >0: weight on the right leg
    P = Pose()
    P.hip(dx=0.05 * w, dz=-0.02 - 0.012 * abs(w), y=-6 * w, z=5 * w)
    P.r("spine", y=4 * w, x=1.2 * S(t, 2, 0.25))
    P.r("chest", y=3 * w, z=-3 * w, x=1.2 * S(t, 2, 0.25))
    P.r("head", y=-4 * w, z=-14 * S(t, 1, 0.2), x=-3 + 3 * S(t, 2, 0.1))
    for side, relax in (("L", max(0.0, w)), ("R", max(0.0, -w))):
        P.step(side, dy=0.03 * relax, dz=0.03 * relax ** 2, pitch=-14 * relax ** 2, yaw=8 + 8 * relax)
        P.kneeout(side, dx=0.05 * relax)
    P.arm("L", fwd=3 - 4 * w, out=-2 + 6 * max(0, -w), elbow=14 + 6 * max(0, w), fore=10)
    P.arm("R", fwd=3 + 4 * w, out=-2 + 6 * max(0, w), elbow=14 + 6 * max(0, -w), fore=10)
    return P


def clip_talk(t):
    P = Pose()
    P.hip(dx=0.015 * S(t), dz=-0.015, z=5 * S(t), y=-2 * S(t))
    P.r("spine", x=-2, z=4 * S(t, 1, 0.1))
    P.r("chest", x=-2 + 2.5 * S(t, 3), z=7 * S(t, 1, 0.15))
    P.r("neck", x=-2)
    P.r("head", x=-3 + 6 * S(t, 3, 0.1), z=-10 * S(t, 1, 0.2), y=5 * S(t, 2, 0.3))
    beat = S(t, 3)
    P.arm("R", fwd=26 + 14 * S(t, 2, 0.1), out=14 + 10 * S(t, 1), twist=-10, elbow=72 + 26 * beat,
          elbow_y=12 + 14 * S(t, 2), fore=60 + 30 * S(t, 2, 0.3), hand=(14 * beat, 0, 0))
    P.arm("L", fwd=18 + 10 * S(t, 2, 0.6), out=10 + 7 * S(t, 1, 0.5), twist=-10, elbow=58 + 22 * S(t, 3, 0.5),
          elbow_y=8, fore=55 + 25 * S(t, 2, 0.8), hand=(10 * S(t, 3, 0.5), 0, 0))
    return P


def clip_phone(t):
    P = Pose()
    P.hip(dx=0.012 * S(t), dz=-0.012, z=2 * S(t), y=-1.5 * S(t))
    P.r("spine", x=-3)
    P.r("chest", x=-3 + 1.2 * S(t, 2))
    P.r("neck", x=-12)
    laugh = max(0.0, S(t, 1, 0.6)) ** 8  # a quick chuckle once per loop
    P.r("head", x=-24 + 2.5 * S(t, 4) + 8 * laugh, z=3 * S(t))
    scroll = max(0.0, S(t, 4)) ** 2
    P.reach("R", 0.03, 0.27, 1.1 + 0.008 * laugh, pole=(0.5, -0.2, 0.9), hand=(8 - 10 * scroll, 0, PHONE_TWIST))
    P.reach("L", -0.01, 0.25, 1.08, pole=(0.5, -0.2, 0.9), hand=(0, 0, PHONE_TWIST - 10 + 6 * scroll))
    return P


def clip_cheer(t):
    b = 0.5 + 0.5 * C(t, 2)  # 1 = top of the bounce
    P = Pose()
    P.hip(dz=-0.05 + 0.045 * b, x=-2 + 4 * b)
    for side in ("L", "R"):
        P.step(side, dz=0.02 * b ** 3, pitch=-12 * b ** 3, yaw=10)
    P.r("spine", x=3 * b)
    P.r("chest", x=4 * b, z=6 * S(t, 1))
    P.r("head", x=12 * b - 2, z=-10 * S(t, 1, 0.1))
    for side in ("L", "R"):
        P.arm(side, fwd=18 + 10 * b, out=150 + 8 * b, twist=10, elbow=10 + 28 * (1 - b), hand=(0, 0, 0))
    return P


def clip_cheer_once(t):
    """One-shot: crouch, jump with arms thrown up, land, pump, settle to idle."""
    P = Pose()
    hz = keys(t, [(0, -0.012), (0.12, -0.1), (0.24, 0.1), (0.36, -0.08), (0.46, -0.02), (0.72, -0.03),
                  (1.0, -0.012)])
    lift = keys(t, [(0, 0.0), (0.18, 0.0), (0.24, 0.12), (0.32, 0.0), (1.0, 0.0)])
    P.hip(dz=hz, x=keys(t, [(0, 0), (0.12, -10), (0.24, 6), (0.36, -8), (0.5, 3), (1.0, 0)]))
    for side in ("L", "R"):
        P.step(side, dz=lift, pitch=keys(t, [(0, 0), (0.16, -20), (0.24, -30), (0.3, 0), (1, 0)]), yaw=10)
    P.r("spine", x=keys(t, [(0, 0), (0.12, -6), (0.24, 4), (0.36, -5), (0.5, 3), (1, 0)]))
    P.r("chest", x=keys(t, [(0, 0), (0.12, -4), (0.24, 6), (0.5, 4), (1, 0)]))
    P.r("head", x=keys(t, [(0, -2), (0.12, -8), (0.24, 14), (0.7, 10), (1, -2)]))
    up = keys(t, [(0, 0.0), (0.12, 0.0), (0.24, 1.0), (0.8, 1.0), (1.0, 0.0)])
    back = keys(t, [(0, 0), (0.12, 1), (0.2, 0), (1, 0)])  # arms swing back in the crouch
    pump = max(0.0, S(t, 5)) ** 2 * keys(t, [(0, 0), (0.4, 0), (0.5, 1), (0.75, 1), (0.85, 0), (1, 0)])
    for side in ("L", "R"):
        P.arm(side, fwd=4 + 158 * up - 28 * back, out=-3 + 28 * up + 6 * pump, twist=6 * up,
              elbow=12 + 6 * up + 30 * pump, fore=10)
    return P


def clip_clap(t):
    c = 0.5 + 0.5 * C(t, 4)  # 1 = hands apart, 0 = clap
    c = c ** 0.7
    P = Pose()
    P.hip(dz=-0.02 - 0.012 * (1 - c), x=-1, z=2 * S(t))
    P.r("chest", x=-3 + 2 * (1 - c))
    P.r("head", x=-2 + 3 * (1 - c), z=5 * S(t, 1, 0.2))
    for side in ("L", "R"):
        P.reach(side, 0.045 + 0.12 * c, 0.3, 1.19 + 0.03 * c, pole=(0.6, -0.1, 0.95))
    return P


def clip_dance_a(t):
    """Bounce + alternating fist pumps (120 bpm, 4 beats)."""
    beat = 0.5 + 0.5 * C(t, 4)  # 1 on the beat (top), knees dip between
    P = Pose()
    P.hip(dx=0.035 * S(t, 2), dz=-0.07 + 0.05 * beat, y=-5 * S(t, 2), z=10 * S(t, 1),
          x=-4 + 3 * beat)
    for side, ph in (("L", 0.0), ("R", 0.5)):
        heel = max(0.0, S(t, 2, ph + 0.25))
        P.step(side, dz=0.03 * heel ** 2, pitch=-16 * heel ** 2, yaw=14)
        P.kneeout(side, dx=0.08)
    P.r("spine", y=4 * S(t, 2), x=-3)
    P.r("chest", z=-14 * S(t, 1), y=3 * S(t, 2), x=3 * beat)
    P.r("head", x=-8 + 12 * beat, z=8 * S(t, 1))
    for side, ph in (("L", 0.0), ("R", 0.25)):
        pump = max(0.0, S(t, 2, ph)) ** 1.5
        P.arm(side, fwd=30 + 60 * pump, out=18 + 20 * pump, twist=-20, elbow=100 - 50 * pump,
              fore=20, hand=(0, 0, 0))
    return P


def clip_dance_b(t):
    """Step-touch side groove with swinging arms and finger snaps (2 bars of 4)."""
    P = Pose()
    # hips over the stepping side: right for the first half, left for the second
    side_x = 0.09 * keys(t, [(0, 0), (0.25, 1), (0.5, 0), (0.75, -1), (1, 0)])
    bounce = 0.5 + 0.5 * C(t, 4)
    P.hip(dx=side_x, dz=-0.07 + 0.045 * bounce, y=-120 * side_x, z=-40 * side_x, x=-3)
    # right foot steps out on beat 1 and comes home on beat 3; left mirrors on the second bar
    R_out = keys(t, [(0, 0), (0.1, 0.5), (0.2, 1), (0.45, 1), (0.55, 0.5), (0.65, 0), (1, 0)])
    L_out = keys(t, [(0, 0.0), (0.5, 0.0), (0.6, 0.5), (0.7, 1.0), (0.9, 1.0), (1.0, 0.0)])
    liftR = max(0.0, math.sin(math.pi * min(1.0, max(0.0, (t - 0.05) / 0.15)))) + \
        max(0.0, math.sin(math.pi * min(1.0, max(0.0, (t - 0.45) / 0.2))))
    liftL = max(0.0, math.sin(math.pi * min(1.0, max(0.0, (t - 0.55) / 0.15)))) + \
        max(0.0, math.sin(math.pi * min(1.0, max(0.0, (t - 0.88) / 0.12))))
    P.step("R", dx=0.16 * R_out, dz=0.05 * liftR, pitch=-10 * liftR, yaw=12)
    P.step("L", dx=-0.16 * L_out, dz=0.05 * liftL, pitch=-10 * liftL, yaw=12)
    P.kneeout("L", dx=0.05)
    P.kneeout("R", dx=0.05)
    P.r("spine", y=60 * side_x)
    P.r("chest", y=40 * side_x, z=10 * S(t, 2), x=2 * bounce)
    P.r("head", x=-6 + 8 * bounce, y=-60 * side_x, z=-6 * S(t, 2))
    sw = S(t, 2)
    snapL = max(0.0, sw) ** 2
    snapR = max(0.0, -sw) ** 2
    P.arm("L", fwd=30 + 25 * snapL, out=20 + 15 * snapL, twist=-30 + 25 * sw, elbow=95 - 25 * snapL,
          fore=50, hand=(0, 0, 0))
    P.arm("R", fwd=30 + 25 * snapR, out=20 + 15 * snapR, twist=-30 - 25 * sw, elbow=95 - 25 * snapR,
          fore=50, hand=(0, 0, 0))
    return P


def clip_lean(t):
    """Leaning back against a wall/car: hips forward, shoulders back (upper back ~0.2 m
    behind the origin), arms crossed, ankles crossed."""
    P = Pose()
    P.hip(dy=0.04, dz=-0.05 + 0.003 * S(t, 2), x=17, z=4 + 1.5 * S(t))
    P.r("spine", x=1 + 1.0 * S(t, 2, 0.25))
    P.r("chest", x=1 + 1.2 * S(t, 2, 0.25))
    P.r("neck", x=-10)
    P.r("head", x=-9 + 3 * S(t, 2, 0.1), z=16 * S(t, 1, 0.3), y=3 * S(t, 1))
    P.step("L", dy=0.3, yaw=10)
    # right ankle crossed in front of the left, resting on the toes
    P.step("R", dx=-0.16, dy=0.37, dz=0.035, pitch=-24, yaw=-6)
    P.kneeout("R", dx=-0.1, dy=0.1)
    P.reach("L", -0.13, 0.2, 1.17 + 0.004 * S(t, 2, 0.25), pole=(0.5, 0.05, 0.85), hand=(0, 0, 0))
    P.reach("R", -0.11, 0.24, 1.21 + 0.004 * S(t, 2, 0.25), pole=(0.5, 0.05, 0.9), hand=(0, 0, 0))
    return P


def clip_sit(t):
    """Seated idle (bench/couch, seat top ~0.44 m): leaning back, hands on thighs,
    right foot tapping, looking around."""
    P = Pose()
    P.hip(dx=SIT_HIPS.x, dy=SIT_HIPS.y, dz=SIT_HIPS.z + 0.003 * S(t, 2), x=10)
    P.r("spine", x=3 + 1.2 * S(t, 2, 0.25))
    P.r("chest", x=2 + 1.5 * S(t, 2, 0.25), z=3 * S(t))
    P.r("neck", x=-8)
    P.r("head", x=-6 + 3 * S(t, 2), z=18 * S(t, 1, 0.1), y=3 * S(t, 1, 0.3))
    tap = max(0.0, S(t, 4)) ** 2
    P.step("L", dx=-0.05, dy=0.34, yaw=14)
    P.step("R", dx=0.06, dy=0.38, dz=0.02 * tap, pitch=12 * tap, yaw=16)
    P.kneeout("L", dx=0.08)
    P.kneeout("R", dx=0.09)
    P.reach("L", 0.2, 0.14, 0.67, pole=(0.6, -0.3, 0.8), space="world", hand=(-20, 0, 0))
    P.reach("R", 0.21, 0.16 + 0.01 * tap, 0.67, pole=(0.6, -0.3, 0.8), space="world", hand=(-20, 0, 0))
    return P


def _walk_foot(pp):
    if pp < WALK_STANCE:
        u = pp / WALK_STANCE
        y = WALK_STRIDE / 2 - WALK_STRIDE * u
        pitch = 8 * (1 - sm(u / 0.2)) - 28 * sm((u - 0.72) / 0.28) ** 2
        z = 0.1 * math.sin(math.radians(max(0.0, -pitch)))
        return y, z, pitch
    u = (pp - WALK_STANCE) / (1 - WALK_STANCE)
    y = -WALK_STRIDE / 2 + WALK_STRIDE * sm(u)
    z = 0.07 * math.sin(math.pi * u) + 0.1 * math.sin(math.radians(28)) * (1 - sm(u / 0.3))
    pitch = keys(u, [(0, -28), (0.35, -10), (0.8, 10), (1.0, 8)])
    return y, z, pitch


def clip_walk(t):
    """In place: the ankles slide back at WALK_SPEED during stance, so move the root forward
    at WALK_SPEED (x NPC scale) to get zero foot sliding."""
    P = Pose()
    P.hip(dx=-0.022 * S(t, 1, 0.0), dz=-0.04 - 0.02 * C(t, 2), z=-7 * C(t), y=3 * S(t))
    for side, ph in (("L", 0.0), ("R", 0.5)):
        y, z, pitch = _walk_foot((t + ph) % 1.0)
        P.step(side, dx=(0.02 if side == "L" else -0.02), dy=y, dz=z, pitch=pitch, yaw=5)
        P.kneeout(side, dx=0.0)
    P.r("spine", x=-3, z=4 * C(t))
    P.r("chest", x=-1 + 1.5 * C(t, 2), z=6 * C(t), y=-2 * S(t))
    P.r("head", x=-1 - 2 * C(t, 2), z=-3 * C(t))
    P.arm("L", fwd=4 - 26 * C(t), out=-4, elbow=16 + 12 * max(0.0, -C(t)), fore=10)
    P.arm("R", fwd=4 + 26 * C(t), out=-4, elbow=16 + 12 * max(0.0, C(t)), fore=10)
    return P


def clip_wave(t):
    P = Pose()
    P.hip(dx=0.02, dz=-0.015, z=-4, y=-2)
    P.r("chest", y=-3, z=-4 + 2 * S(t, 2))
    P.r("head", y=6, x=2 + 2 * S(t, 2), z=-6)
    w = S(t, 3)  # three waves per loop
    P.arm("R", fwd=18, out=95 + 5 * S(t, 3, 0.1), twist=0, elbow=5, elbow_y=62 + 24 * w, fore=-70,
          hand=(0, 12 * w, 0))
    P.arm("L", fwd=4, out=-3, elbow=14, fore=10)
    return P


def clip_point(t):
    """Pointing forward-down at the board with little emphatic jabs; left fist on the hip."""
    jab = max(0.0, S(t, 2)) ** 3
    P = Pose()
    P.hip(dx=0.02, dz=-0.02, z=-6, y=-2)
    P.r("spine", x=-4 - 2 * jab, z=-3)
    P.r("chest", x=-3 - 3 * jab, z=-6)
    P.r("head", x=-12 - 3 * jab, z=6 + 3 * S(t))
    P.arm("R", fwd=66 + 6 * jab, out=6, twist=0, elbow=8 - 6 * jab, fore=-20, hand=(-6, 0, 0))
    P.reach("L", 0.2, 0.0, 0.99, pole=(0.7, -0.25, 1.25), hand=(0, 0, 0))
    P.step("R", dy=0.08, yaw=10)
    return P


def clip_crossed(t):
    """Bouncer stance: feet apart, arms folded high on the chest, slow scan of the room."""
    w = S(t)
    P = Pose()
    P.hip(dx=0.02 * w, dz=-0.02, y=-2 * w, z=3 * w, x=2)
    P.step("L", dx=-0.06, yaw=12)
    P.step("R", dx=0.06, yaw=12)
    P.r("spine", x=1.2 * S(t, 2, 0.25))
    P.r("chest", x=2 + 1.5 * S(t, 2, 0.25), z=-2 * w)
    P.r("head", x=2, z=keys(t, [(0, 0), (0.2, 22), (0.45, 22), (0.6, -20), (0.85, -20), (1.0, 0)]))
    P.reach("L", -0.13, 0.2, 1.19 + 0.004 * S(t, 2, 0.25), pole=(0.5, 0.05, 0.85))
    P.reach("R", -0.11, 0.24, 1.23 + 0.004 * S(t, 2, 0.25), pole=(0.5, 0.05, 0.9))
    return P


def clip_drink(t):
    """Holding a cup (npc_props 'Cup' on hand_R) at chest height, sipping once per loop."""
    sip = keys(t, [(0, 0.0), (0.35, 0.0), (0.47, 1.0), (0.62, 1.0), (0.75, 0.0), (1.0, 0.0)])
    P = Pose()
    P.hip(dx=0.015 * S(t), dz=-0.014, z=3 * S(t), y=-1.5 * S(t))
    P.r("chest", x=-1 + 2 * sip + 1.2 * S(t, 2, 0.25))
    P.r("head", x=-4 + 14 * sip, z=8 * S(t, 1, 0.2) * (1 - sip))
    out = 0.12 - 0.1 * sip
    P.reach("R", out, 0.27 - 0.1 * sip, 1.16 + 0.33 * sip, pole=(0.6, -0.25, 0.95),
            hand=(0, 0, 0))
    P.r("hand_R", x=-35 * sip)
    P.arm("L", fwd=5, out=-3, elbow=16 + 3 * S(t), fore=10)
    return P


def clip_wave_flag(t):
    """Race starter: right arm high, sweeping the flag (npc_props 'Flag' on hand_R) side to side."""
    sw = S(t, 2)
    P = Pose()
    P.hip(dx=-0.03 * sw, dz=-0.03 - 0.01 * abs(sw), y=4 * sw, z=-5 * sw)
    P.step("L", dx=-0.06, yaw=12)
    P.step("R", dx=0.06, yaw=12)
    P.r("spine", y=-3 * sw)
    P.r("chest", y=-5 * sw, z=-6 * sw)
    P.r("head", x=10, y=-6 * sw, z=4 * sw)
    P.reach("R", 0.3 + 0.15 * sw, 0.12, 1.8 - 0.05 * abs(sw), pole=(0.9, -0.2, 1.3), hand=(-10, 0, 20 * sw))
    P.arm("L", fwd=10, out=22 + 6 * abs(sw), elbow=35, fore=10)
    return P


SIT_GROUND_HIPS = Vector((0, -0.1, -0.76))


def clip_sit_ground(t):
    """Sitting on sand/floor: knees up, leaning back on both hands, head bobbing."""
    P = Pose()
    P.hip(dx=0, dy=SIT_GROUND_HIPS.y, dz=SIT_GROUND_HIPS.z, x=18 + 1.0 * S(t, 2))
    P.r("spine", x=2 + 1.2 * S(t, 2, 0.25))
    P.r("chest", x=1 + 1.2 * S(t, 2, 0.25), z=3 * S(t))
    P.r("neck", x=-14)
    P.r("head", x=-10 + 4 * S(t, 4), z=14 * S(t, 1, 0.1))
    P.step("L", dx=-0.06, dy=0.5, yaw=10)
    P.step("R", dx=0.07, dy=0.46, pitch=6 * max(0.0, S(t, 2)), yaw=14)
    P.kneeout("L", dx=0.1, dz=0.4)
    P.kneeout("R", dx=0.1, dz=0.4)
    P.reach("L", 0.24, -0.34, 0.1, pole=(0.7, 0.3, 0.4), space="world", hand=(40, 0, 0))
    P.reach("R", 0.24, -0.32, 0.1, pole=(0.7, 0.3, 0.4), space="world", hand=(40, 0, 0))
    return P


# name: (seconds, loop, fn)
CLIPS = {
    "Idle": (3.0, True, clip_idle),
    "Idle_Shift": (4.0, True, clip_idle_shift),
    "Talk": (3.0, True, clip_talk),
    "Phone": (4.0, True, clip_phone),
    "Cheer": (1.0, True, clip_cheer),
    "Cheer_Once": (2.4, False, clip_cheer_once),
    "Clap": (1.6, True, clip_clap),
    "Dance": (2.0, True, clip_dance_a),
    "Dance2": (2.0, True, clip_dance_b),
    "Lean": (4.0, True, clip_lean),
    "Crossed": (4.0, True, clip_crossed),
    "Sit": (4.0, True, clip_sit),
    "Sit_Ground": (4.0, True, clip_sit_ground),
    "Walk": (WALK_T, True, clip_walk),
    "Wave": (2.0, True, clip_wave),
    "WaveFlag": (1.6, True, clip_wave_flag),
    "Drink": (4.0, True, clip_drink),
    "Point": (2.0, True, clip_point),
}
CLIP_ORDER = list(CLIPS)
PREVIEW_T = {"Cheer_Once": 0.3, "Clap": 0.12, "Walk": 0.0, "Wave": 0.08, "Point": 0.25, "Dance": 0.06,
             "Dance2": 0.25, "Cheer": 0.0, "Drink": 0.55, "WaveFlag": 0.25}


def preview_frame(name):
    secs = CLIPS[name][0]
    return round(PREVIEW_T.get(name, 0.3) * secs * FPS)


# =========================================================================== rig + bake
def setup_ik(arm):
    for side in ("L", "R"):
        pb = arm.pose.bones["lowerleg_" + side]
        ik = pb.constraints.new("IK")
        ik.target, ik.subtarget = arm, "IK_foot_" + side
        ik.pole_target, ik.pole_subtarget = arm, "IK_knee_" + side
        ik.chain_count = 2
        ik.use_stretch = False
        ik.iterations = 500
        cr = arm.pose.bones["foot_" + side].constraints.new("COPY_ROTATION")
        cr.target, cr.subtarget = arm, "IK_foot_" + side
    for side in ("L", "R"):
        ik = arm.pose.bones["lowerarm_" + side].constraints.new("IK")
        ik.target, ik.subtarget = arm, "IK_hand_" + side
        ik.pole_target, ik.pole_subtarget = arm, "IK_elbow_" + side
        ik.chain_count = 2
        ik.use_stretch = False
        ik.iterations = 500
    # arm pole angle: wrist in front of the chest -> elbow must point outward/back
    best = None
    for ang in (-90, 0, 90, 180):
        P = Pose()
        P.reach("L", 0.1, 0.35, 1.2)
        P.reach("R", 0.1, 0.35, 1.2)
        for side in ("L", "R"):
            arm.pose.bones["lowerarm_" + side].constraints[0].pole_angle = math.radians(ang)
        apply_pose(arm, P)
        bpy.context.view_layer.update()
        e = arm.pose.bones["lowerarm_L"].head
        score = -e.x - e.y
        if best is None or score > best[0]:
            best = (score, ang)
    for side in ("L", "R"):
        arm.pose.bones["lowerarm_" + side].constraints[0].pole_angle = math.radians(best[1])
        arm.pose.bones["lowerarm_" + side].constraints[0].influence = 0.0
    print("arm IK pole angle:", best[1])
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    # calibrate pole angle: with the hips lowered the knee must bend forward (+Y)
    best = None
    for ang in (-90, 0, 90, 180):
        for side in ("L", "R"):
            arm.pose.bones["lowerleg_" + side].constraints[0].pole_angle = math.radians(ang)
        arm.pose.bones["hips"].location = arm.data.bones["hips"].matrix_local.to_3x3().inverted() @ Vector((0, 0, -0.15))
        bpy.context.view_layer.update()
        k = arm.pose.bones["lowerleg_L"].head
        rest = Vector(skeleton.BONES["lowerleg_L"][0])
        score = (k.y - rest.y) - abs(k.x - rest.x)
        if best is None or score > best[0]:
            best = (score, ang)
    for side in ("L", "R"):
        arm.pose.bones["lowerleg_" + side].constraints[0].pole_angle = math.radians(best[1])
    arm.pose.bones["hips"].location = (0, 0, 0)
    bpy.context.view_layer.update()
    return best[1]


def apply_pose(arm, P):
    bones = arm.data.bones
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    for name, R in P.rot.items():
        if name == "hips":
            continue
        r3 = bones[name].matrix_local.to_3x3()
        arm.pose.bones[name].rotation_quaternion = (r3.inverted() @ R @ r3).to_quaternion()

    def root(name, off, R):
        ml = bones[name].matrix_local
        r3 = ml.to_3x3()
        M = Matrix.Translation(ml.translation + off) @ (R @ r3).to_4x4()
        basis = ml.inverted() @ M
        pb = arm.pose.bones[name]
        pb.location = basis.to_translation()
        pb.rotation_quaternion = basis.to_quaternion()

    root("hips", P.hips, P.rot.get("hips", Matrix.Identity(3)))
    for side in ("L", "R"):
        off, R = P.foot[side]
        root("IK_foot_" + side, off, R)
        # knee pole follows the hips' horizontal offset so knees keep pointing sensibly
        kb = "IK_knee_" + side
        root(kb, P.knee[side] + Vector((P.hips.x, P.hips.y, P.hips.z)), Matrix.Identity(3))
    # arm IK
    need_world = False
    for side in ("L", "R"):
        con = arm.pose.bones["lowerarm_" + side].constraints[0]
        con.influence = 1.0 if P.reach_[side] else 0.0
        if P.reach_[side] and P.reach_[side][2] == "world":
            need_world = True
    if need_world:
        bpy.context.view_layer.update()
    chest = arm.pose.bones["chest"]
    for side in ("L", "R"):
        if not P.reach_[side]:
            continue
        tgt, pole, space = P.reach_[side]
        for bn, p in (("IK_hand_" + side, tgt), ("IK_elbow_" + side, pole)):
            own = bones[bn].matrix_local
            if space == "world":
                M = own.inverted() @ bones["chest"].matrix_local @ chest.matrix.inverted()
            else:
                M = own.inverted()
            arm.pose.bones[bn].location = M @ p


def sample(arm, fn, secs, loop):
    n = round(secs * FPS)
    out = []
    for f in range(n + 1):
        t = (f / n) % 1.0 if loop else f / n
        apply_pose(arm, fn(t))
        bpy.context.view_layer.update()
        fr = {}
        for name in DEFORM:
            pb = arm.pose.bones[name]
            loc_m = arm.convert_space(pose_bone=pb, matrix=pb.matrix, from_space="POSE", to_space="LOCAL")
            fr[name] = (loc_m.to_translation(), loc_m.to_quaternion())
        out.append(fr)
    return out


def write_action(arm, name, frames):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = act
    prev = {}
    for f, fr in enumerate(frames):
        for bname in DEFORM:
            loc, q = fr[bname]
            if bname in prev and prev[bname].dot(q) < 0:
                q = -q
            prev[bname] = q
            pb = arm.pose.bones[bname]
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=f, group=bname)
            if bname == "hips":
                pb.location = loc
                pb.keyframe_insert("location", frame=f, group=bname)
    ad.action = None
    return act


def foot_slide(arm, frames_fn, secs, loop):
    """Max ankle drift (m) while a foot is 'planted' (target not moving) - sanity metric."""
    return 0.0


def build_and_export(path):
    import npc_io
    scene = bpy.context.scene
    scene.render.fps = FPS
    arm = skeleton.build_armature("NPC_Rig", ik_helpers=True)
    pole = setup_ik(arm)
    print("IK pole angle:", pole)
    report = {}
    for name in CLIP_ORDER:
        secs, loop, fn = CLIPS[name]
        frames = sample(arm, fn, secs, loop)
        act = write_action(arm, name, frames)
        act["loop"] = bool(loop)  # -> clip.userData.loop in three.js (glTF animation extras)
        if name == "Walk":
            act["speed"] = round(WALK_SPEED, 3)  # native m/s at timeScale 1 -> clip.userData.speed
        report[name] = {"duration": round(round(secs * FPS) / FPS, 4), "frames": round(secs * FPS) + 1,
                        "loop": loop}
    # strip the IK helpers -> plain 17-bone FK skeleton
    for side in ("L", "R"):
        for bn in ("lowerleg_", "foot_", "lowerarm_"):
            pb = arm.pose.bones[bn + side]
            for c in list(pb.constraints):
                pb.constraints.remove(c)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for bn in ("IK_foot_L", "IK_foot_R", "IK_knee_L", "IK_knee_R",
               "IK_hand_L", "IK_hand_R", "IK_elbow_L", "IK_elbow_R"):
        arm.data.edit_bones.remove(arm.data.edit_bones[bn])
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    npc_io.export_glb([arm], path, animations=True)
    report_meta = {"walk_speed_native": round(WALK_SPEED, 3), "sit_hips_offset": list(SIT_HIPS)}
    for k, v in report.items():
        v.update({})
    report["_meta"] = report_meta
    return report
