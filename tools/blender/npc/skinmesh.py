"""Skinned low-poly mesh builder on top of common.Model.

Every primitive is added under a *binding* (m.bind = "...") that decides how its
vertices are weighted to the shared skeleton:

  rigid bone name   -> 100% that bone ("head", "hand_L", "foot_R", ...)
  "torso"           -> hips/spine/chest chain, crotch blended into the thighs
  "neck"            -> chest/neck/head chain
  "arm_L"/"arm_R"   -> chest -> upperarm -> lowerarm -> hand chain
  "leg_L"/"leg_R"   -> hips -> upperleg -> lowerleg -> foot chain
  "skirt"           -> hips, hem partially following both thighs

Chains weight by the vertex's position *along* the chain (nearest bone segment),
blending smoothly across each joint, so overlapping layers (sleeve over arm, vest over
shirt) deform identically and elbows/knees bend without candy-wrapping.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import common
from skeleton import BONE_ORDER, seg

CHAINS = {
    # name: (parent, [bones], [(joint_offset, half_width) per joint incl. parent joint])
    "torso": (None, ["hips", "spine", "chest"], [None, (0, 0.07), (0, 0.08)]),
    "neck": (None, ["chest", "neck", "head"], [None, (0.01, 0.035), (0.0, 0.03)]),
}
for _s in ("L", "R"):
    CHAINS["arm_" + _s] = ("chest", ["upperarm_" + _s, "lowerarm_" + _s, "hand_" + _s],
                           [(-0.035, 0.045), (0, 0.06), (0, 0.03)])
    CHAINS["leg_" + _s] = ("hips", ["upperleg_" + _s, "lowerleg_" + _s, "foot_" + _s],
                           [(0.0, 0.07), (0, 0.075), (0, 0.035)])


def _smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def _closest(p, a, b):
    ab = b - a
    L2 = ab.length_squared
    u = 0.0 if L2 == 0 else max(0.0, min(1.0, (p - a).dot(ab) / L2))
    return u, (a + ab * u - p).length


def chain_weights(p, chain):
    parent, bones, joints = CHAINS[chain]
    segs = [seg(b) for b in bones]
    lens = [(t - h).length for h, t in segs]
    cum = [0.0]
    for L in lens:
        cum.append(cum[-1] + L)
    best = None
    for k, (h, t) in enumerate(segs):
        u, d = _closest(p, h, t)
        if best is None or d < best[0] - 1e-9:
            best = (d, k, u)
    _, k, u = best
    s = cum[k] + u * lens[k]
    if k == 0 and u == 0.0:  # beyond the chain start: project along first bone
        h, t = segs[0]
        s = (p - h).dot((t - h).normalized())
    w = {bones[k]: 1.0}
    for j, spec in enumerate(joints):
        if spec is None:
            continue
        off, hw = spec
        if j == 0 and parent is None:
            continue
        J = cum[j] + off
        if abs(s - J) < hw:
            a = _smooth((s - J + hw) / (2 * hw))
            prev = parent if j == 0 else bones[j - 1]
            w = {prev: 1 - a, bones[j]: a}
            break
        if j == 0 and s < J - hw + 1e-9:
            w = {parent: 1.0}
    return w


def vertex_weights(p, bind):
    if bind in BONE_ORDER:
        return {bind: 1.0}
    if bind == "torso":
        w = chain_weights(p, "torso")
        if p.z < 0.93:  # crotch / seat follows the thighs a bit
            t = _smooth((0.93 - p.z) / 0.13) * 0.65
            sl = _smooth(0.5 - p.x / 0.14)
            w = {"hips": 1 - t, "upperleg_L": t * sl, "upperleg_R": t * (1 - sl)}
        return w
    if bind == "skirt":
        t = _smooth((0.95 - p.z) / 0.35) * 0.75
        sl = _smooth(0.5 - p.x / 0.16)
        return {"hips": 1 - t, "upperleg_L": t * sl, "upperleg_R": t * (1 - sl)}
    if bind in CHAINS:
        return chain_weights(p, bind)
    raise KeyError(bind)


class SkinModel(common.Model):
    def __init__(self, name):
        super().__init__(name)
        self.bind = "hips"
        self.vbind = []

    def add(self, bm, mat, matrix=None, smooth=False, group=None):
        grp = self._group(None)
        n0 = len(grp["bm"].verts)
        super().add(bm, mat, matrix, smooth, None)
        self.vbind.extend([self.bind] * (len(grp["bm"].verts) - n0))

    # ---------------------------------------------------------------- loft
    def loft(self, rings, mats, verts=8, ref=(1, 0, 0), smooth=True, caps=(True, True), spin=0.0):
        """Tube through rings [(center, rx, ry)]; mats = one name or one per segment
        (len(rings)-1). Consecutive segments sharing a material become one piece.
        Ring frame: x = ref projected off the tangent, y = tangent x x."""
        n = len(rings)
        if isinstance(mats, str):
            mats = [mats] * (n - 1)
        C = [Vector(r[0]) for r in rings]
        frames = []
        for i in range(n):
            if i == 0:
                t = C[1] - C[0]
            elif i == n - 1:
                t = C[-1] - C[-2]
            else:
                t = (C[i + 1] - C[i]).normalized() + (C[i] - C[i - 1]).normalized()
            if t.length < 1e-9:  # duplicated ring (a hem step): reuse neighbour tangent
                t = (C[min(i + 1, n - 1)] - C[max(i - 1, 0)])
            t.normalize()
            x = Vector(ref) - t * Vector(ref).dot(t)
            x.normalize()
            y = t.cross(x)
            frames.append((x, y))
        pts = []
        for i, r in enumerate(rings):
            rx, ry = r[1], r[2]
            x, y = frames[i]
            ring = []
            for k in range(verts):
                a = 2 * math.pi * k / verts + math.radians(spin)
                ring.append(C[i] + x * (math.cos(a) * rx) + y * (math.sin(a) * ry))
            pts.append(ring)
        # split into runs of equal material
        i = 0
        while i < n - 1:
            j = i
            while j + 1 < n - 1 and mats[j + 1] == mats[i]:
                j += 1
            bm = bmesh.new()
            vs = [[bm.verts.new(p) for p in pts[r]] for r in range(i, j + 2)]
            for r in range(len(vs) - 1):
                for k in range(verts):
                    k2 = (k + 1) % verts
                    try:
                        bm.faces.new((vs[r][k], vs[r][k2], vs[r + 1][k2], vs[r + 1][k]))
                    except ValueError:
                        pass
            if i == 0 and caps[0]:
                bm.faces.new(list(reversed(vs[0])))
            if j == n - 2 and caps[1]:
                bm.faces.new(vs[-1])
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            self.add(bm, mats[i], None, smooth)
            i = j + 1

    # ---------------------------------------------------------------- output
    def build_skinned(self, arm_ob):
        objs = self.build_objects()
        ob = objs[0]
        me = ob.data
        assert len(me.vertices) == len(self.vbind), (len(me.vertices), len(self.vbind))
        vgs = {b: ob.vertex_groups.new(name=b) for b in BONE_ORDER}
        for v, bind in zip(me.vertices, self.vbind):
            w = vertex_weights(v.co.copy(), bind)
            w = {b: x for b, x in w.items() if x > 0.02}
            tot = sum(w.values())
            for b, x in w.items():
                vgs[b].add([v.index], x / tot, "REPLACE")
        mod = ob.modifiers.new("Armature", "ARMATURE")
        mod.object = arm_ob
        ob.parent = arm_ob
        ob.matrix_parent_inverse = Matrix.Identity(4)
        return ob
