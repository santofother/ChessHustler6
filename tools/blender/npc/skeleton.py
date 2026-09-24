"""Shared NPC humanoid skeleton (17 deform bones), identical in every NPC GLB.

Blender space: Z up, character faces +Y (-> glTF/three.js faces -Z), right hand = +X,
left hand = -X. Origin = between the feet on the floor. Native height ~1.78 m.
Bone names avoid '.' so three.js PropertyBinding never has to sanitize them.
"""
import bpy
from mathutils import Vector

# name: (head, tail, parent)
BONES = {
    "hips":       ((0, 0.0, 0.94), (0, 0.0, 1.06), None),
    "spine":      ((0, 0.0, 1.06), (0, 0.0, 1.21), "hips"),
    "chest":      ((0, 0.0, 1.21), (0, 0.0, 1.42), "spine"),
    "neck":       ((0, 0.0, 1.42), (0, 0.01, 1.53), "chest"),
    "head":       ((0, 0.01, 1.53), (0, 0.01, 1.80), "neck"),
}
for side, sx in (("L", -1), ("R", 1)):
    BONES.update({
        "upperarm_" + side: ((sx * 0.19, 0.0, 1.39), (sx * 0.235, 0.0, 1.10), "chest"),
        "lowerarm_" + side: ((sx * 0.235, 0.0, 1.10), (sx * 0.262, 0.03, 0.855), "upperarm_" + side),
        "hand_" + side:     ((sx * 0.262, 0.03, 0.855), (sx * 0.27, 0.045, 0.75), "lowerarm_" + side),
        "upperleg_" + side: ((sx * 0.10, 0.0, 0.90), (sx * 0.105, 0.012, 0.50), "hips"),
        "lowerleg_" + side: ((sx * 0.105, 0.012, 0.50), (sx * 0.11, -0.01, 0.09), "upperleg_" + side),
        "foot_" + side:     ((sx * 0.11, -0.01, 0.09), (sx * 0.115, 0.15, 0.025), "lowerleg_" + side),
    })

BONE_ORDER = ["hips", "spine", "chest", "neck", "head",
              "upperarm_L", "lowerarm_L", "hand_L", "upperarm_R", "lowerarm_R", "hand_R",
              "upperleg_L", "lowerleg_L", "foot_L", "upperleg_R", "lowerleg_R", "foot_R"]

NATIVE_HEIGHT = 1.78  # top of hair on the tallest variants is ~1.80-1.86 (hats)


def seg(name):
    h, t, _ = BONES[name]
    return Vector(h), Vector(t)


def build_armature(name="NPC_Rig", ik_helpers=False):
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(ob)
    for o in bpy.context.scene.objects:
        if o is not None:
            o.select_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    for n in BONE_ORDER:
        h, t, p = BONES[n]
        b = eb.new(n)
        b.head, b.tail = h, t
        b.align_roll(Vector((0, 0, 1)) if n.startswith("foot") else Vector((0, 1, 0)))
        if p:
            b.parent = eb[p]
            b.use_connect = (Vector(BONES[p][1]) - Vector(h)).length < 1e-6
    if ik_helpers:
        for side, sx in (("L", -1), ("R", 1)):
            f = eb["foot_" + side]
            b = eb.new("IK_foot_" + side)
            b.head, b.tail, b.roll = f.head.copy(), f.tail.copy(), f.roll
            b.use_deform = False
            k = eb.new("IK_knee_" + side)
            k.head = (sx * 0.11, 0.6, 0.5)
            k.tail = (sx * 0.11, 0.6, 0.6)
            k.use_deform = False
            w = Vector(BONES["lowerarm_" + side][1])
            hb = eb.new("IK_hand_" + side)
            hb.head, hb.tail = w, w + Vector((0, 0, -0.1))
            hb.parent = eb["chest"]
            hb.use_deform = False
            e = eb.new("IK_elbow_" + side)
            e.head, e.tail = (sx * 0.55, -0.35, 1.05), (sx * 0.55, -0.35, 1.15)
            e.parent = eb["chest"]
            e.use_deform = False
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in ob.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return ob
