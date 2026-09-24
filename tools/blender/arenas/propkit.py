"""Shared helpers for the arena prop scripts (tools/blender/arenas/*.py).

Prop contract (docs/arenas/ARENAS_SPEC.md "Blender asset list"):
  glTF binary, metres, +Y up, FRONT FACES +Z (three.js), origin at base centre on the ground.
  In Blender that means: Z up, front toward -Y (the exporter maps Blender -Y -> glTF +Z).
  Materials: TINT_<Part> (neutral-ish default, recoloured by code), EMISSIVE_<Part> (emission strength 1,
  steady colour), GLASS, WATER; everything else fixed. Animated parts = separate named nodes with the
  pivot at the rotation centre.
"""
import math
import os

import bpy
from mathutils import Matrix, Vector

import common

PROPS_PREVIEW_DIR = os.path.join(common.ROOT, "docs", "models", "arenas")

# name -> (hex, roughness, metallic, emission_strength, alpha)
PROP_PALETTE = {
    "GLASS": ("#1c2a3c", 0.08, 0.3, 0, 1),
    "WATER": ("#3fb4c8", 0.05, 0.1, 0, 1),
    "TIRE": ("#18181a", 0.9, 0.0, 0, 1),
    "TRIM": ("#16151b", 0.55, 0.3, 0, 1),
    "RUBBER": ("#1d1d20", 0.9, 0.0, 0, 1),
    "STEEL": ("#8d949b", 0.45, 0.6, 0, 1),
    "DARK_STEEL": ("#3b3f46", 0.5, 0.5, 0, 1),
    "WOOD": ("#9a6d45", 0.85, 0.0, 0, 1),
    "WOOD_DARK": ("#6a4a2e", 0.85, 0.0, 0, 1),
    "WHITE": ("#f2f0ea", 0.6, 0.0, 0, 1),
    "CREAM": ("#efe4cc", 0.7, 0.0, 0, 1),
    "SAND_STONE": ("#d9ccb0", 0.9, 0.0, 0, 1),
    "SPEAKER_CONE": ("#202024", 0.8, 0.0, 0, 1),
    "GRILLE": ("#2a2a30", 0.7, 0.2, 0, 1),
    "LEAF": ("#3e8a3a", 0.7, 0.0, 0, 1),
    "LEAF_LIGHT": ("#6db04a", 0.7, 0.0, 0, 1),
    "SOIL": ("#3a2a1e", 1.0, 0.0, 0, 1),
    "ORANGE_FLOWER": ("#ff7a1a", 0.6, 0.0, 0, 1),
    "RUST": ("#7a3d22", 0.9, 0.2, 0, 1),
    "FELT_POCKET": ("#0c0b0e", 0.9, 0.0, 0, 1),
    "SCREEN_DARK": ("#101820", 0.2, 0.0, 0, 1),
}


def mat_def(name, hexc, rough=0.6, metal=0.0, emit=0.0, alpha=1):
    common.PALETTE[name] = (hexc, rough, metal, emit, alpha)


def tint(name, hexc, rough=0.6, metal=0.0):
    mat_def(name, hexc, rough, metal)


def emissive(name, hexc):
    mat_def(name, hexc, 0.4, 0.0, 1.0)


def begin(extra=None):
    common.reset()
    common.PALETTE.update(PROP_PALETTE)
    if extra:
        for k, v in extra.items():
            common.PALETTE[k] = v


def reparent(child, parent):
    """Keep world transform, parent child under parent (both built by Model.build_objects)."""
    bpy.context.view_layer.update()
    mw = child.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()
    bpy.context.view_layer.update()
    child.matrix_world = mw


def export(objs, relpath):
    path = os.path.join(common.ROOT, "public", "models", relpath + ".glb")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for ob in bpy.context.scene.objects:
        ob.select_set(ob in objs)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
              export_yup=True, export_cameras=False, export_lights=False,
              export_texcoords=False, export_normals=True, export_extras=False,
              export_animations=False, export_draco_mesh_compression_enable=False)
    valid = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in valid or k == "filepath"})
    return path


def finish(objs, relpath, view=(0.9, -1.0, 0.6), size=512):
    """objs: list of Blender objects (root first). Exports + previews; returns a stats dict."""
    bpy.context.view_layer.update()
    path = export(objs, relpath)
    tris = common.tri_count(objs)
    name = os.path.basename(relpath)
    if os.environ.get("PREVIEW_VIEW"):
        view = tuple(float(v) for v in os.environ["PREVIEW_VIEW"].split(","))
    old = common.PREVIEW_DIR
    common.PREVIEW_DIR = PROPS_PREVIEW_DIR
    try:
        common.render_preview(objs, name, view, size)
    finally:
        common.PREVIEW_DIR = old
    pts = [ob.matrix_world @ Vector(c) for ob in objs for c in ob.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    mats = sorted({m.name for ob in objs if ob.type == "MESH" for m in ob.data.materials if m})
    stats = {"name": name, "path": "public/models/" + relpath + ".glb", "tris": tris,
             "bytes": os.path.getsize(path),
             # three.js axes: X width, Z depth (front +Z), Y height
             "size_xzy": [round(hi.x - lo.x, 2), round(hi.y - lo.y, 2), round(hi.z - lo.z, 2)],
             "nodes": [o.name for o in objs], "materials": mats}
    print("BUILT prop %-18s tris=%5d size=%6.1f KB  dims(x,z,y)=%s" % (
        name, tris, stats["bytes"] / 1024, stats["size_xzy"]))
    return stats


def ring_pts(r, n, z=0.0, cx=0.0, cy=0.0, phase=0.0):
    return [(cx + r * math.cos(2 * math.pi * k / n + phase), cy + r * math.sin(2 * math.pi * k / n + phase), z)
            for k in range(n)]
