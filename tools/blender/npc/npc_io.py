"""Export + preview helpers for the NPC pipeline."""
import math
import os

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

import common
from common import srgb

NPC_DIR = os.path.join(common.ROOT, "public", "models", "npc")
NPC_PREVIEW_DIR = os.path.join(common.ROOT, "docs", "models", "npc")


def set_palette(extra):
    common.PALETTE.update(extra)


def export_glb(objs, path, animations=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for ob in bpy.context.scene.objects:
        ob.select_set(ob in objs)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=False,
              export_yup=True, export_cameras=False, export_lights=False,
              export_texcoords=False, export_normals=True, export_extras=False,
              export_skins=True, export_def_bones=True, export_leaf_bone=False,
              export_rest_position_armature=True, export_reset_pose_bones=True,
              export_animations=animations, export_vertex_color="NONE",
              export_morph=False)
    if animations:
        kw.update(export_extras=True, export_animation_mode="ACTIONS", export_force_sampling=True, export_frame_step=2,
                  export_optimize_animation_size=True, export_anim_single_armature=True,
                  export_anim_slide_to_zero=True, export_bake_animation=False,
                  export_optimize_animation_keep_anim_armature=False)
    valid = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in valid or k == "filepath"})
    return path


def tri_count(obs):
    return sum(len(p.vertices) - 2 for ob in obs if ob.type == "MESH" for p in ob.data.polygons)


# ----------------------------------------------------------------------------- preview
def setup_stage(night=False):
    scene = bpy.context.scene
    world = bpy.data.worlds.new("W")
    scene.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (*srgb("#2a2140" if night else "#8e7fa8"), 1)
    bg.inputs["Strength"].default_value = 0.9
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.0
    sun.color = srgb("#fff0dc")
    so = bpy.data.objects.new("sun", sun)
    so.rotation_euler = Euler((math.radians(40), math.radians(10), math.radians(160)))
    scene.collection.objects.link(so)
    fill = bpy.data.lights.new("fill", "SUN")
    fill.energy = 0.9
    fill.color = srgb("#b8d8ff")
    try:
        fill.use_shadow = False
    except Exception:
        pass
    fo = bpy.data.objects.new("fill", fill)
    fo.rotation_euler = Euler((math.radians(65), 0, math.radians(-50)))
    scene.collection.objects.link(fo)
    gme = bpy.data.meshes.new("ground")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=60)
    bm.to_mesh(gme)
    bm.free()
    gmat = bpy.data.materials.new("GROUND_PREVIEW")
    try:
        gmat.use_nodes = True
    except Exception:
        pass
    gmat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*srgb("#4a4550"), 1)
    gme.materials.append(gmat)
    g = bpy.data.objects.new("ground", gme)
    scene.collection.objects.link(g)
    r = scene.render
    r.engine = "BLENDER_EEVEE"
    r.image_settings.file_format = "PNG"
    try:
        scene.eevee.taa_render_samples = 24
    except Exception:
        pass
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
    except Exception:
        pass


def render(path, center, radius_w, radius_h, view=(0.35, 1.0, 0.25), res=(1024, 512), ortho=True):
    scene = bpy.context.scene
    cam = bpy.data.cameras.new("cam")
    co = bpy.data.objects.new("cam", cam)
    scene.collection.objects.link(co)
    d = Vector(view).normalized()
    c = Vector(center)
    if ortho:
        cam.type = "ORTHO"
        aspect = res[0] / res[1]
        cam.ortho_scale = max(radius_w * 2, radius_h * 2 * aspect) * 1.08
        co.location = c + d * 30
        cam.clip_end = 100
    else:
        cam.lens = 50
        fov = 2 * math.atan(18 / cam.lens)
        co.location = c + d * (max(radius_w, radius_h) / math.sin(fov / 2) * 1.05)
    co.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    scene.camera = co
    r = scene.render
    r.resolution_x, r.resolution_y = res
    r.resolution_percentage = 100
    os.makedirs(os.path.dirname(path), exist_ok=True)
    r.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(co)
    return path
