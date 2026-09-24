"""Preview renders for the NPC crowd (docs/models/npc/).

Cells are rendered one at a time (same character re-posed) and composited into sheets
with numpy, so poses never overlap each other.
"""
import os
import tempfile

import bpy
import numpy as np
from mathutils import Vector

import common
import npc_io

OUT = npc_io.NPC_PREVIEW_DIR
PROP_BUILDER = None               # set by build_npc: () -> [Phone, Cup, Bottle, Flag] objects
CLIP_PROP = {"Drink": "Cup", "WaveFlag": "Flag"}


def _props():
    if PROP_BUILDER is None:
        return {}
    have = {o.name: o for o in bpy.data.objects if o.name in ("Phone", "Cup", "Bottle", "Flag")}
    if len(have) < 4:
        have = {o.name: o for o in PROP_BUILDER()}
    for o in have.values():
        o.hide_render = True
    return have


def _hold(arm, prop):
    """Place a props-GLB node on hand_R the way three.js will (identity child of the bone)."""
    from mathutils import Matrix
    pb = arm.pose.bones["hand_R"]
    prop.matrix_world = arm.matrix_world @ pb.matrix @ Matrix.Rotation(-1.5707963, 4, "X")
    prop.hide_render = False
TMP = os.path.join(tempfile.gettempdir(), "gtc_npc_cells")


def freeze_pose(arm, action, frame):
    """Evaluate `action` at `frame` on `arm`, then keep that pose without an action."""
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = action
    try:
        if ad.action_slot is None and len(action.slots):
            ad.action_slot = action.slots[0]
    except AttributeError:
        pass
    bpy.context.scene.frame_set(int(frame))
    bpy.context.view_layer.update()
    pose = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
    ad.action = None
    for pb in arm.pose.bones:
        pb.matrix_basis = pose[pb.name]
    bpy.context.view_layer.update()


def _label(text):
    ob = bpy.data.objects.get("LBL")
    if ob is None:
        cu = bpy.data.curves.new("LBL", "FONT")
        cu.size = 0.17
        cu.align_x = "CENTER"
        ob = bpy.data.objects.new("LBL", cu)
        mat = bpy.data.materials.new("LABEL")
        b = mat.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (1, 0.85, 0.4, 1)
        b.inputs["Emission Color"].default_value = (1, 0.85, 0.4, 1)
        b.inputs["Emission Strength"].default_value = 1.5
        cu.materials.append(mat)
        bpy.context.scene.collection.objects.link(ob)
    ob.data.body = text
    return ob


def _cam(center, height, view, res):
    scene = bpy.context.scene
    co = bpy.data.objects.get("CELLCAM")
    if co is None:
        cam = bpy.data.cameras.new("CELLCAM")
        cam.type = "ORTHO"
        cam.clip_end = 100
        co = bpy.data.objects.new("CELLCAM", cam)
        scene.collection.objects.link(co)
    d = Vector(view).normalized()
    co.data.ortho_scale = height * max(1.0, res[0] / res[1])
    co.location = Vector(center) + d * 20
    co.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    scene.camera = co
    r = scene.render
    r.resolution_x, r.resolution_y = res
    r.resolution_percentage = 100
    return co


def render_cells(arm, cells, view=(0.55, 1.0, 0.32), res=(300, 380), phone=None, tag="c"):
    """cells: [(action_name, frame, label)] -> list of PNG paths."""
    os.makedirs(TMP, exist_ok=True)
    if os.environ.get("NPC_VIEW"):
        view = tuple(float(v) for v in os.environ["NPC_VIEW"].split(":"))
    lbl = None
    paths = []
    props = _props()
    for i, (act, frame, text) in enumerate(cells):
        freeze_pose(arm, bpy.data.actions[act], frame)
        if phone is not None:
            phone.hide_render = act != "Phone"
        for o in props.values():
            o.hide_render = True
        if act in CLIP_PROP and CLIP_PROP[act] in props:
            _hold(arm, props[CLIP_PROP[act]])
        if text:
            lbl = _label(text)
            d = Vector(view).normalized()
            lbl.location = Vector((0, 0, 0.02)) + Vector((d.x, d.y, 0)).normalized() * 0.55
            lbl.rotation_euler = (-Vector((d.x, d.y, d.z))).to_track_quat("-Z", "Y").to_euler()
            lbl.hide_render = False
        elif lbl:
            lbl.hide_render = True
        _cam((0, 0.05, 1.02), 2.5, view, res)
        p = os.path.join(TMP, "%s_%02d.png" % (tag, i))
        bpy.context.scene.render.filepath = p
        bpy.ops.render.render(write_still=True)
        paths.append(p)
    return paths


def grid(paths, cols, out):
    imgs = []
    for p in paths:
        im = bpy.data.images.load(p)
        w, h = im.size
        a = np.empty(w * h * 4, dtype=np.float32)
        im.pixels.foreach_get(a)
        imgs.append(a.reshape(h, w, 4))
        bpy.data.images.remove(im)
    h, w = imgs[0].shape[:2]
    rows = (len(imgs) + cols - 1) // cols
    sheet = np.zeros((rows * h, cols * w, 4), dtype=np.float32)
    sheet[..., 3] = 1
    sheet[..., :3] = 0.16
    for i, a in enumerate(imgs):
        r, c = divmod(i, cols)
        y0 = (rows - 1 - r) * h  # blender images are bottom-up
        sheet[y0:y0 + h, c * w:(c + 1) * w] = a
    img = bpy.data.images.new("sheet", cols * w, rows * h, alpha=True)
    img.pixels.foreach_set(sheet.ravel())
    img.filepath_raw = out
    img.file_format = "PNG"
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save()
    bpy.data.images.remove(img)
    return out


def lineup(build_variant, names, path, pose=None):
    common.reset()
    npc_io.setup_stage()
    step = 0.78
    for i, n in enumerate(names):
        arm, ob, phone = build_variant(n, suffix_mats=True)
        arm.location.x = (i - (len(names) - 1) / 2) * step
        phone.hide_render = True
        if pose and pose[0] in bpy.data.actions:
            freeze_pose(arm, bpy.data.actions[pose[0]], pose[1])
    w = (len(names) - 1) * step / 2 + 0.45
    return npc_io.render(path, (0, 0, 0.92), w, 1.0, view=(0.25, 1.0, 0.22),
                         res=(max(512, 190 * len(names)), 460))


def _stage_with(build_variant, name):
    """Fresh scene (keeping the baked actions) with one variant."""
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)
    for a in list(bpy.data.armatures):
        bpy.data.armatures.remove(a)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)
    for c in list(bpy.data.curves):
        bpy.data.curves.remove(c)
    npc_io.setup_stage()
    return build_variant(name)


def render_all(build_variant, names, lineup_only=False):
    """Needs the clip actions (anims.build_and_export) in bpy.data unless lineup_only."""
    import anims
    have_clips = all(c in bpy.data.actions for c in anims.CLIP_ORDER)
    if lineup_only or not have_clips:
        lineup(build_variant, names, os.path.join(OUT, "preview_lineup.png"))
        return
    # keep the actions alive across the scene rebuilds
    for a in bpy.data.actions:
        a.use_fake_user = True
    # 1) clip contact sheet, cycling variants
    paths = []
    for i, c in enumerate(anims.CLIP_ORDER):
        n = names[i % len(names)]
        arm, ob, phone = _stage_with(build_variant, n)
        paths += render_cells(arm, [(c, anims.preview_frame(c), c)], phone=phone, tag="clip%02d" % i)
    grid(paths, 6, os.path.join(OUT, "preview_clips.png"))
    # 2) per-variant pose sheets
    for n in names:
        arm, ob, phone = _stage_with(build_variant, n)
        cells = [("Idle", anims.preview_frame("Idle"), n), ("Talk", anims.preview_frame("Talk"), "Talk"),
                 ("Dance", anims.preview_frame("Dance"), "Dance"), ("Sit", anims.preview_frame("Sit"), "Sit")]
        grid(render_cells(arm, cells, phone=phone, tag=n), 4, os.path.join(OUT, "preview_%s.png" % n))
    # 3) lineup in the idle pose
    lineup_scene = _stage_with  # noqa (lineup does its own reset-free build below)
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)
    npc_io.setup_stage()
    step = 0.78
    for i, n in enumerate(names):
        arm, ob, phone = build_variant(n, suffix_mats=True)
        arm.location.x = (i - (len(names) - 1) / 2) * step
        phone.hide_render = True
        freeze_pose(arm, bpy.data.actions["Idle"], anims.preview_frame("Idle"))
    w = (len(names) - 1) * step / 2 + 0.45
    npc_io.render(os.path.join(OUT, "preview_lineup.png"), (0, 0, 0.92), w, 1.0, view=(0.25, 1.0, 0.22),
                  res=(max(512, 190 * len(names)), 460))


def clip_strips(build_variant, name, clips, out_dir, n=6):
    """Debug: n frames across each clip -> out_dir/strip_<clip>.png."""
    import anims
    arm, ob, phone = _stage_with(build_variant, name)
    for c in clips:
        frames = round(anims.CLIPS[c][0] * anims.FPS)
        cells = [(c, round(frames * k / n), "%s %d" % (c, round(frames * k / n))) for k in range(n)]
        grid(render_cells(arm, cells, phone=phone, tag="s_" + c), n, os.path.join(out_dir, "strip_%s.png" % c))
