"""Build the NPC crowd: skinned variants + shared animation clips + previews.

    blender --background --factory-startup --python tools/blender/npc/build_npc.py
    blender ... --python tools/blender/npc/build_npc.py -- floral_guy bodyguard   (subset of variants)
    flags: --no-anims  --no-previews  --lineup-only  --anims-only

Outputs
    public/models/npc/<variant>.glb     skinned mesh + shared 17-bone skeleton (no clips)
    public/models/npc/npc_anims.glb     the same skeleton + every clip (no mesh)
    docs/models/npc/preview_*.png       lineup, per-variant pose sheets, clip contact sheet
    tools/blender/npc/build_report.json tri counts / sizes / clip durations (for NPC_ASSETS.md)
"""
import importlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import common  # noqa: E402
import npc_io  # noqa: E402
import skeleton  # noqa: E402
import skinmesh  # noqa: E402
import variants  # noqa: E402


def build_variant(name, suffix_mats=False):
    fn, palette = variants.VARIANTS[name]
    npc_io.set_palette(variants.FIXED)
    npc_io.set_palette(palette)
    arm = skeleton.build_armature("NPC_" + name)
    m = skinmesh.SkinModel(name)
    fn(m)
    ob = m.build_skinned(arm)
    phone = build_phone(arm)
    if suffix_mats:  # keep several variants in one preview scene without material clashes
        for mat in list(ob.data.materials) + list(phone.data.materials):
            if mat and "." not in mat.name and ":" not in mat.name:
                mat.name = mat.name + ":" + name
    return arm, ob, phone


def build_phone(arm):
    """PROP_PHONE: a phone parented to hand_R (hide it in-game unless the 'phone' clip plays)."""
    m = common.Model("PROP_PHONE")
    h, t = skeleton.seg("hand_R")
    c = h + (t - h) * 0.45 + Vector((-0.036, 0.006, 0.0))
    m.box((0.012, 0.072, 0.14), c, "BLACK", bevel=0.004)
    m.box((0.004, 0.062, 0.122), c + Vector((-0.007, 0, 0)), "SCREEN")
    ob = m.build_objects()[0]
    ob.parent = arm
    ob.parent_type = "BONE"
    ob.parent_bone = "hand_R"
    bpy.context.view_layer.update()
    ob.matrix_world = Matrix.Identity(4)
    return ob


PROP_PALETTE = {
    "CUP_RED": ("#d8283a", 0.5, 0.0, 0, 1),
    "CUP_RIM": ("#f4f2ee", 0.5, 0.0, 0, 1),
    "BOTTLE_GLASS": ("#2f7a3a", 0.15, 0.1, 0, 1),
    "LABEL_GOLD": ("#ffc23d", 0.4, 0.3, 0, 1),
    "FLAG_BLACK": ("#141416", 0.7, 0.0, 0, 1),
    "FLAG_WHITE": ("#f4f2ee", 0.7, 0.0, 0, 1),
}


def H(x, y, z):
    """hand_R bone-local coords (three.js: X = outward/back of hand, Y = toward the fingertips,
    Z = thumb/forward, palm faces -X) -> the Blender coords that export to them."""
    return (x, -z, y)


def build_npc_props():
    """npc_props.glb: Phone / Cup / Bottle / Flag. Each node's origin = the hand_R bone origin
    (wrist); geometry is pre-placed in the palm, so attach with an identity transform:
    handBone.add(prop)."""
    npc_io.set_palette(variants.FIXED)
    npc_io.set_palette(PROP_PALETTE)
    obs = []

    m = common.Model("Phone")
    c = Vector(H(-0.04, 0.05, 0.0))
    m.box((0.012, 0.072, 0.14), c, "BLACK", bevel=0.004)
    m.box((0.004, 0.062, 0.122), c + Vector((-0.007, 0, 0)), "SCREEN")
    obs += m.build_objects()

    # Cup / Bottle stand along the thumb axis (+Z): upright when the forearm points forward
    # with the palm inward (the Drink clip), tipping naturally toward the mouth on a sip.
    m = common.Model("Cup")
    c = Vector(H(-0.07, 0.055, 0.02))
    up = Vector(H(0, 0, 1))
    m.cyl(0.034, 0.12, c, "CUP_RED", r2=0.046, verts=10, rot=(90, 0, 0))
    m.cyl(0.048, 0.012, c + up * 0.058, "CUP_RIM", verts=10, rot=(90, 0, 0))
    m.limb(c + up * 0.04 + Vector((0.012, 0, 0)), c + up * 0.1 + Vector((0.03, 0, 0)), 0.005, "CUP_RIM", verts=4)
    obs += m.build_objects()

    m = common.Model("Bottle")
    c = Vector(H(-0.065, 0.055, -0.01))
    m.cyl(0.032, 0.17, c, "BOTTLE_GLASS", verts=10, rot=(90, 0, 0))
    m.cyl(0.032, 0.04, c + up * 0.105, "BOTTLE_GLASS", r2=0.013, verts=10, rot=(90, 0, 0))
    m.cyl(0.013, 0.06, c + up * 0.15, "BOTTLE_GLASS", verts=8, rot=(90, 0, 0))
    m.cyl(0.0335, 0.06, c + up * 0.01, "LABEL_GOLD", verts=10, rot=(90, 0, 0))
    obs += m.build_objects()

    m = common.Model("Flag")
    # pole runs along the hand (+Y) through the fist, ~0.9 m long; chequered cloth flies outward (+X)
    m.cyl(0.012, 0.9, Vector(H(-0.005, 0.33, 0.0)), "POLE", verts=6)
    m.sphere(0.022, Vector(H(-0.005, 0.79, 0.0)), "GOLD", seg=6, rings=4)
    nx, ny, w, h = 5, 4, 0.5, 0.36
    for i in range(nx):
        for j in range(ny):
            x0, x1 = 0.0 + w * i / nx, w * (i + 1) / nx
            y0, y1 = 0.76 - h * j / ny, 0.76 - h * (j + 1) / ny
            sag = lambda x: -0.05 * (x / w) ** 2
            quad = [H(x0, y0 - sag(x0), 0), H(x1, y0 - sag(x1), 0), H(x1, y1 - sag(x1), 0), H(x0, y1 - sag(x0), 0)]
            m.mesh(quad, [(0, 1, 2, 3)], "FLAG_BLACK" if (i + j) % 2 else "FLAG_WHITE", recalc=False)
    obs += m.build_objects()
    for ob in obs:
        for mat in ob.data.materials:
            mat.use_backface_culling = False
    return obs


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    flags = {a for a in argv if a.startswith("--")}
    names = [a for a in argv if not a.startswith("--")] or list(variants.VARIANTS)
    report = {"variants": {}, "clips": {}}
    rp = os.path.join(HERE, "build_report.json")
    if os.path.exists(rp):
        try:
            report = json.load(open(rp))
        except Exception:
            pass

    if "--lineup-only" not in flags and "--anims-only" not in flags:
        for name in names:
            common.reset()
            arm, ob, phone = build_variant(name)
            path = npc_io.export_glb([arm, ob, phone], os.path.join(npc_io.NPC_DIR, name + ".glb"))
            tris = npc_io.tri_count([ob])
            report["variants"][name] = {"tris": tris, "phone_tris": npc_io.tri_count([phone]),
                                        "bytes": os.path.getsize(path),
                                        "materials": [mm.name for mm in ob.data.materials]}
            print("BUILT npc %-12s tris=%5d size=%6.1f KB" % (name, tris, os.path.getsize(path) / 1024))

    if "--lineup-only" not in flags and "--anims-only" not in flags:
        common.reset()
        obs = build_npc_props()
        pp = npc_io.export_glb(obs, os.path.join(npc_io.NPC_DIR, "npc_props.glb"))
        report["props"] = {"bytes": os.path.getsize(pp), "tris": npc_io.tri_count(obs),
                           "nodes": [o.name for o in obs]}

    if "--no-anims" not in flags and "--lineup-only" not in flags:
        import anims
        importlib.reload(anims)
        common.reset()
        clips = anims.build_and_export(os.path.join(npc_io.NPC_DIR, "npc_anims.glb"))
        report["anim_meta"] = clips.pop("_meta")
        report["clips"] = clips
        report["anims_bytes"] = os.path.getsize(os.path.join(npc_io.NPC_DIR, "npc_anims.glb"))

    json.dump(report, open(rp, "w"), indent=1)

    if os.environ.get("NPC_STRIPS"):  # debug: NPC_STRIPS=<out_dir>[,variant[,clip,clip..]]
        import previews
        parts = os.environ["NPC_STRIPS"].split(",")
        import anims
        previews.PROP_BUILDER = build_npc_props
        previews.clip_strips(build_variant, parts[1] if len(parts) > 1 else "floral_guy",
                             parts[2:] or anims.CLIP_ORDER, parts[0])
        flags.add("--no-previews")

    if "--no-previews" not in flags:
        import previews
        previews.PROP_BUILDER = build_npc_props
        previews.render_all(build_variant, names if "--lineup-only" not in flags else list(variants.VARIANTS),
                            lineup_only="--lineup-only" in flags or "--no-anims" in flags)

    print("\n==== NPC build ====")
    for n, r in report["variants"].items():
        print("%-12s %5d tris  %6.1f KB" % (n, r["tris"], r["bytes"] / 1024.0))
    for c, r in report.get("clips", {}).items():
        print("clip %-12s %.2fs %s" % (c, r["duration"], "loop" if r["loop"] else "once"))


main()
