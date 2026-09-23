"""Shared helpers for the Grand Theft Chess Blender build scripts.

Blender is Z-up; the glTF exporter converts (x, y, z) -> (x, z, -y), so a model that
faces Blender +Y ends up facing glTF -Z, as the model contract (SPEC.md) requires.
All geometry is built with bmesh directly in world space (no bpy.ops context needed),
merged into one mesh per node, then exported as GLB and rendered to a preview PNG.
"""
import math
import os

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
MODELS_DIR = os.path.join(ROOT, "public", "models")
PREVIEW_DIR = os.path.join(ROOT, "docs", "models")

BASE_TOP = 0.045  # height of the round piece base ("puck")


# --------------------------------------------------------------------------- colours
def srgb(hexstr):
    """'#rrggbb' -> linear RGB tuple."""
    h = hexstr.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


# name -> (hex, roughness, metallic, emission_strength, alpha)
PALETTE = {
    "TEAM_PRIMARY": ("#ececec", 0.45, 0.0, 0, 1),
    "TEAM_ACCENT": ("#ff5fa2", 0.4, 0.0, 0, 1),
    "SKIN": ("#c98a62", 0.7, 0.0, 0, 1),
    "HAIR": ("#241812", 0.6, 0.0, 0, 1),
    "DENIM": ("#33476f", 0.8, 0.0, 0, 1),
    "KHAKI": ("#d8c8a4", 0.8, 0.0, 0, 1),
    "SHOE_WHITE": ("#f2f2f2", 0.6, 0.0, 0, 1),
    "LEATHER": ("#5a321c", 0.5, 0.0, 0, 1),
    "BLACK": ("#141416", 0.5, 0.0, 0, 1),
    "DARK_GREY": ("#34343a", 0.6, 0.2, 0, 1),
    "TIRE": ("#18181a", 0.9, 0.0, 0, 1),
    "CHROME": ("#d6d8de", 0.25, 0.55, 0, 1),
    "GLASS": ("#1c2a3c", 0.08, 0.3, 0, 1),
    "GOLD": ("#ffc23d", 0.3, 0.55, 0, 1),
    "BASE": ("#26232c", 0.7, 0.0, 0, 1),
    "HEADLIGHT": ("#fff4d8", 0.3, 0.0, 3.0, 1),
    "TAILLIGHT": ("#ff2230", 0.3, 0.0, 3.0, 1),
    "SCREEN": ("#29e3d6", 0.3, 0.0, 3.0, 1),
    "SIREN_RED": ("#ff2a3a", 0.3, 0.0, 3.0, 1),
    "SIREN_BLUE": ("#2a6bff", 0.3, 0.0, 3.0, 1),
    "AMBER": ("#ffa31a", 0.3, 0.0, 3.0, 1),
    "EMBER": ("#ff6a1a", 0.3, 0.0, 4.0, 1),
    "CASH": ("#4f9a4a", 0.7, 0.0, 0, 1),
    "RUBY": ("#e0183c", 0.2, 0.0, 0.5, 1),
    # props
    "BARK": ("#7a5a3e", 0.9, 0.0, 0, 1),
    "BARK_DARK": ("#5a412c", 0.9, 0.0, 0, 1),
    "FROND": ("#3e8a3a", 0.7, 0.0, 0, 1),
    "FROND_LIGHT": ("#6db04a", 0.7, 0.0, 0, 1),
    "COCONUT": ("#5b3b1f", 0.8, 0.0, 0, 1),
    "GALV": ("#9da3a8", 0.45, 0.4, 0, 1),
    "CHAINLINK": ("#aab0b6", 0.5, 0.3, 0, 0.3),
    "CONCRETE": ("#b9b4aa", 0.9, 0.0, 0, 1),
    "KERB_RED": ("#d4232b", 0.6, 0.0, 0, 1),
    "KERB_WHITE": ("#f2f0ea", 0.6, 0.0, 0, 1),
    "POLE": ("#3b3f46", 0.5, 0.35, 0, 1),
    "LAMP_EMISSIVE": ("#ffd79a", 0.3, 0.0, 5.0, 1),
}


def get_mat(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    hexc, rough, metal, emit, alpha = PALETTE[name]
    col = srgb(hexc)
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True  # no-op / deprecated in 5.x, required in older builds
    except Exception:
        pass
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*col, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*col, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit
    if alpha < 1:
        bsdf.inputs["Alpha"].default_value = alpha
        for attr, val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
            try:
                setattr(m, attr, val)
            except Exception:
                pass
        try:
            m.use_backface_culling = False
        except Exception:
            pass
    m.diffuse_color = (*col, alpha)
    return m


# --------------------------------------------------------------------------- scene
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _rot(rot):
    return Euler([math.radians(a) for a in rot], "XYZ").to_matrix().to_4x4()


def _scale(s):
    m = Matrix.Identity(4)
    m[0][0], m[1][1], m[2][2] = s
    return m


class Model:
    """Collects bmesh parts per node ('group'), each part tagged with a material."""

    def __init__(self, name):
        self.name = name
        self.groups = {}   # group -> {"bm": BMesh, "mats": [names]}
        self.pivots = {}   # group -> Vector (node origin, world space)

    # -- plumbing -----------------------------------------------------------
    def _group(self, g):
        g = g or self.name
        if g not in self.groups:
            self.groups[g] = {"bm": bmesh.new(), "mats": []}
            self.pivots.setdefault(g, Vector((0, 0, 0)))
        return self.groups[g]

    def add(self, bm, mat, matrix=None, smooth=False, group=None):
        if matrix is not None:
            bm.transform(matrix)
        grp = self._group(group)
        if mat not in grp["mats"]:
            grp["mats"].append(mat)
        mi = grp["mats"].index(mat)
        dst = grp["bm"]
        bm.verts.index_update()
        vmap = [dst.verts.new(v.co) for v in bm.verts]
        for f in bm.faces:
            try:
                nf = dst.faces.new([vmap[v.index] for v in f.verts])
            except ValueError:
                continue
            nf.material_index = mi
            # n-gon caps stay flat so smooth cylinders don't get smeared cap normals
            nf.smooth = smooth and len(f.verts) <= 4
        bm.free()

    def set_pivot(self, group, p):
        self.pivots[group] = Vector(p)

    def transform_all(self, matrix):
        for g, grp in self.groups.items():
            grp["bm"].transform(matrix)
            self.pivots[g] = matrix @ self.pivots[g]

    # -- primitives (all positions world-space, rotations in degrees XYZ) -----
    def box(self, size, loc, mat, rot=(0, 0, 0), bevel=0.0, group=None, smooth=False):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bm.transform(_scale(size))
        if bevel > 0:
            bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=bevel,
                            offset_type="OFFSET", segments=1, profile=0.5, affect="EDGES")
        self.add(bm, mat, Matrix.Translation(loc) @ _rot(rot), smooth, group)

    def cyl(self, r, h, loc, mat, rot=(0, 0, 0), r2=None, verts=12, scale=(1, 1, 1),
            smooth=False, group=None):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts,
                              radius1=r, radius2=r if r2 is None else r2, depth=h)
        self.add(bm, mat, Matrix.Translation(loc) @ _rot(rot) @ _scale(scale), smooth, group)

    def sphere(self, r, loc, mat, scale=(1, 1, 1), rot=(0, 0, 0), seg=10, rings=7,
               smooth=True, group=None):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
        self.add(bm, mat, Matrix.Translation(loc) @ _rot(rot) @ _scale(scale), smooth, group)

    def limb(self, a, b, r1, mat, r2=None, verts=8, smooth=True, group=None):
        a, b = Vector(a), Vector(b)
        d = b - a
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts,
                              radius1=r1, radius2=r1 if r2 is None else r2, depth=d.length)
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        self.add(bm, mat, Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4(), smooth, group)

    def disc(self, center, normal, r, t, mat, verts=5, spin=0.0, group=None):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts,
                              radius1=r, radius2=r, depth=t)
        q = Vector((0, 0, 1)).rotation_difference(Vector(normal).normalized())
        m = Matrix.Translation(center) @ q.to_matrix().to_4x4() @ Matrix.Rotation(math.radians(spin), 4, "Z")
        self.add(bm, mat, m, False, group)

    def torus(self, R, r, loc, mat, rot=(0, 0, 0), seg=16, sides=6, scale=(1, 1, 1),
              smooth=True, group=None):
        bm = bmesh.new()
        rings = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            ring = []
            for j in range(sides):
                b = 2 * math.pi * j / sides
                rr = R + r * math.cos(b)
                ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), r * math.sin(b))))
            rings.append(ring)
        for i in range(seg):
            for j in range(sides):
                i2, j2 = (i + 1) % seg, (j + 1) % sides
                bm.faces.new((rings[i][j], rings[i2][j], rings[i2][j2], rings[i][j2]))
        self.add(bm, mat, Matrix.Translation(loc) @ _rot(rot) @ _scale(scale), smooth, group)

    def prism(self, pts_yz, x0, x1, mat, bevel=0.0, group=None, smooth=False):
        """Extrude a (y, z) side-profile polygon along X from x0 to x1."""
        bm = bmesh.new()
        a = [bm.verts.new((x0, y, z)) for y, z in pts_yz]
        b = [bm.verts.new((x1, y, z)) for y, z in pts_yz]
        n = len(pts_yz)
        bm.faces.new(list(reversed(a)))
        bm.faces.new(b)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if bevel > 0:
            bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=bevel,
                            offset_type="OFFSET", segments=1, profile=0.5, affect="EDGES",
                            clamp_overlap=True)
        self.add(bm, mat, None, smooth, group)

    def prism_x(self, pts_xz, y0, y1, mat, group=None):
        """Extrude an (x, z) front-profile polygon along Y."""
        bm = bmesh.new()
        a = [bm.verts.new((x, y0, z)) for x, z in pts_xz]
        b = [bm.verts.new((x, y1, z)) for x, z in pts_xz]
        n = len(pts_xz)
        bm.faces.new(list(reversed(a)))
        bm.faces.new(b)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        self.add(bm, mat, None, False, group)

    def mesh(self, verts, faces, mat, smooth=False, group=None, recalc=True):
        bm = bmesh.new()
        vs = [bm.verts.new(v) for v in verts]
        for f in faces:
            bm.faces.new([vs[i] for i in f])
        if recalc:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        self.add(bm, mat, None, smooth, group)

    def strip(self, p, q, t, x0, x1, mat, group=None):
        """Thin slab lying on the (y, z) segment p->q (e.g. a livery stripe on a hood),
        thickness t pushed along the segment's left normal, extruded x0..x1."""
        p, q = Vector(p), Vector(q)
        d = (q - p).normalized()
        n = Vector((-d.y, d.x)) * t
        self.prism([tuple(p), tuple(q), tuple(q + n), tuple(p + n)], x0, x1, mat, group=group)

    def wheel(self, name, center, r, width, rim="CHROME", hub="TEAM_ACCENT", verts=14):
        """Wheel spinning around X; separate node `name` with pivot at its hub."""
        c = Vector(center)
        self.cyl(r, width, c, "TIRE", rot=(0, 90, 0), verts=verts, group=name)
        self.cyl(r * 0.62, width + 0.006, c, rim, rot=(0, 90, 0), verts=verts, group=name)
        self.cyl(r * 0.25, width + 0.014, c, hub, rot=(0, 90, 0), verts=6, group=name)
        self.set_pivot(name, c)

    def bounds(self):
        pts = [v.co for g in self.groups.values() for v in g["bm"].verts]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        return lo, hi

    def base(self, r=0.33):
        """Round chess 'puck' base with a team-coloured band."""
        self.cyl(r, BASE_TOP, (0, 0, BASE_TOP / 2), "BASE", verts=24)
        self.cyl(r + 0.012, 0.016, (0, 0, BASE_TOP - 0.014), "TEAM_ACCENT", verts=24)

    # -- output -----------------------------------------------------------
    def build_objects(self):
        objs = []
        body = None
        for g, grp in self.groups.items():
            me = bpy.data.meshes.new(g)
            piv = Vector((0, 0, 0)) if g == self.name else self.pivots[g]  # root stays at base centre
            grp["bm"].transform(Matrix.Translation(-piv))
            grp["bm"].normal_update()
            grp["bm"].to_mesh(me)
            grp["bm"].free()
            for mname in grp["mats"]:
                me.materials.append(get_mat(mname))
            ob = bpy.data.objects.new(g, me)
            ob.location = piv
            bpy.context.scene.collection.objects.link(ob)
            objs.append(ob)
            if g == self.name:
                body = ob
        for ob in objs:
            if ob is not body and body is not None:
                ob.parent = body
                ob.matrix_parent_inverse = Matrix.Identity(4)
        self.groups = {}
        return objs


def tri_count(objs):
    return sum(len(p.vertices) - 2 for ob in objs for p in ob.data.polygons)


def export_glb(objs, name):
    os.makedirs(MODELS_DIR, exist_ok=True)
    path = os.path.join(MODELS_DIR, name + ".glb")
    for ob in bpy.context.scene.objects:
        ob.select_set(ob in objs)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
              export_yup=True, export_cameras=False, export_lights=False,
              export_texcoords=False, export_normals=True, export_extras=False,
              export_animations=False)
    valid = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in valid or k == "filepath"})
    return path


def render_preview(objs, name, view=(0.8, 1.0, 0.7), size=512):
    scene = bpy.context.scene
    # bounds of the model
    pts = [ob.matrix_world @ Vector(c) for ob in objs for c in ob.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (lo + hi) / 2
    radius = (hi - lo).length / 2

    # ground
    gme = bpy.data.meshes.new("ground")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=radius * 12)
    bm.to_mesh(gme)
    bm.free()
    gmat = bpy.data.materials.new("GROUND_PREVIEW")
    try:
        gmat.use_nodes = True
    except Exception:
        pass
    gmat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*srgb("#4a4550"), 1)
    gme.materials.append(gmat)
    ground = bpy.data.objects.new("ground", gme)
    scene.collection.objects.link(ground)

    # world
    world = bpy.data.worlds.new("W")
    scene.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (*srgb("#8e7fa8"), 1)
    bg.inputs["Strength"].default_value = 0.9

    # lights
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.2
    sun.color = srgb("#fff0dc")
    so = bpy.data.objects.new("sun", sun)
    so.rotation_euler = Euler((math.radians(40), math.radians(15), math.radians(150)))
    scene.collection.objects.link(so)
    fill = bpy.data.lights.new("fill", "SUN")
    fill.energy = 0.8
    fill.color = srgb("#b8d8ff")
    try:
        fill.use_shadow = False
    except Exception:
        pass
    fo = bpy.data.objects.new("fill", fill)
    fo.rotation_euler = Euler((math.radians(60), 0, math.radians(-60)))
    scene.collection.objects.link(fo)

    # camera: 3/4 front view (model faces +Y in Blender)
    cam = bpy.data.cameras.new("cam")
    cam.lens = 50
    co = bpy.data.objects.new("cam", cam)
    scene.collection.objects.link(co)
    d = Vector(view).normalized()
    fov = 2 * math.atan(18 / cam.lens)
    dist = radius / math.sin(fov / 2) * 1.02
    co.location = c + d * dist
    co.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    scene.camera = co

    r = scene.render
    r.engine = "BLENDER_EEVEE"
    r.resolution_x = r.resolution_y = size
    r.resolution_percentage = 100
    r.image_settings.file_format = "PNG"
    try:
        scene.eevee.taa_render_samples = 32
    except Exception:
        pass
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
    except Exception:
        pass
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    r.filepath = os.path.join(PREVIEW_DIR, "preview_%s.png" % name)
    bpy.ops.render.render(write_still=True)
    return r.filepath


def finish(model, view=(0.8, 1.0, 0.7)):
    if os.environ.get("PREVIEW_VIEW"):  # debug override, e.g. PREVIEW_VIEW=1,0,0.2
        view = tuple(float(v) for v in os.environ["PREVIEW_VIEW"].split(","))
    objs = model.build_objects()
    path = export_glb(objs, model.name)
    tris = tri_count(objs)
    render_preview(objs, model.name, view)
    size = os.path.getsize(path)
    print("BUILT %-12s tris=%5d size=%6.1f KB nodes=%s" % (
        model.name, tris, size / 1024.0, [o.name for o in objs]))
    return {"name": model.name, "tris": tris, "bytes": size, "path": path}
