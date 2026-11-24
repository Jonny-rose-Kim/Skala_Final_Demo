"""
Shared Blender (bpy) helpers for the equipment exterior builders.

Frames
  Builders think in the app's *instance frame* (metres, +Y up, Babylon left-handed). Blender is right-handed
  and +Z up. The glTF exporter (export_yup=True) and Babylon's glTF loader (__root__ with a handedness flip)
  together map Blender (bx, by, bz) to Babylon (-bx, bz, -by) -- measured with a probe GLB on 2026-11-24.
  So an instance point (x, y, z) is authored at Blender (-x, -z, y). This is the only frame conversion; the
  runtime adapter bakes the loader's __root__ transform and does not add any other rotation or scale.

Semantics
  Every exported mesh object carries custom properties that the exporter writes as glTF `extras`:
    assetId, partKey, cutaway ("keep" | "hide-in-sector"), cover (0/1), lod ("" | "fine"), jointId (""),
    pickable (0/1), castShadow (0/1), isGlass (0/1), materialRef (fallback library material)
  The runtime adapter binds nodes to domain assets only through these extras and the manifest (never names).

Materials
  glTF metallic-roughness (Principled BSDF). Normal / roughness detail comes from CC0 ambientCG maps
  (Plastic010: powder-coated panels, Metal012: brushed stainless) with a constant base colour, so no grunge,
  rust or dirt is painted on clean-room equipment. Base colour maps are sRGB, normal / roughness are Non-Color.
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TEX = os.path.join(REPO, "assets", "source", "textures")


# --------------------------------------------------------------------------- frames
def B(x, y, z):
    """Instance frame point -> Blender coordinates."""
    return Vector((-x, -z, y))


def bsize(sx, sy, sz):
    """Instance frame box size (x, y, z) -> Blender object dimensions (x, y, z)."""
    return Vector((sx, sz, sy))


# --------------------------------------------------------------------------- scene
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    return scene


def empty(name, parent=None):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    if parent is not None:
        e.parent = parent
    return e


# --------------------------------------------------------------------------- materials
_mats = {}


TEX_SIZE = 512  # runtime texture size (source maps are 1K); detail maps tile, so 512 px is enough


def _img(path, colorspace):
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    if img.size[0] > TEX_SIZE:
        img.scale(TEX_SIZE, TEX_SIZE)
    return img


def _tex_node(nt, path, colorspace, scale):
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = _img(path, colorspace)
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (scale, scale, 1.0)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(coord.outputs["UV"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    return tex


def material(key, base, metallic=0.0, roughness=0.5, detail=None, normal_strength=0.3, emissive=None, alpha=1.0, tex_scale=1.0):
    """detail: None | "paint" | "brushed" (adds the CC0 normal + roughness maps)."""
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    m.use_backface_culling = True  # exported as doubleSided: false (closed solids only)
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if detail:
        stem = "Plastic010/Plastic010_1K-JPG" if detail == "paint" else "Metal012/Metal012_1K-JPG"
        # Only the normal map is used: the CC0 roughness maps are far glossier than painted / bead-blasted
        # equipment and made stainless read as a black mirror of the room. Roughness stays a constant.
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = normal_strength
        ntex = _tex_node(nt, os.path.join(TEX, f"{stem}_NormalGL.jpg"), "Non-Color", tex_scale)
        nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if emissive is not None:
        bsdf.inputs["Emission Color"].default_value = (*emissive, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 1.0
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        m.blend_method = "BLEND" if hasattr(m, "blend_method") else m.blend_method
        m.surface_render_method = "BLENDED" if hasattr(m, "surface_render_method") else None
    _mats[key] = m
    return m


def palette():
    """Material set of the exteriors (keys double as names in the GLB)."""
    return {
        "paint_offwhite": material("paint_offwhite", (0.80, 0.81, 0.80), 0.0, 0.42, detail="paint", normal_strength=0.12, tex_scale=2.0),
        "paint_lightgray": material("paint_lightgray", (0.62, 0.64, 0.65), 0.0, 0.45, detail="paint", normal_strength=0.12, tex_scale=2.0),
        "paint_graphite": material("paint_graphite", (0.11, 0.115, 0.125), 0.0, 0.5, detail="paint", normal_strength=0.1, tex_scale=2.0),
        "stainless": material("stainless", (0.72, 0.73, 0.75), 1.0, 0.36, detail="brushed", normal_strength=0.08, tex_scale=3.0),
        "aluminum": material("aluminum", (0.80, 0.81, 0.83), 1.0, 0.38, detail="brushed", normal_strength=0.05, tex_scale=3.0),
        "rubber": material("rubber", (0.04, 0.04, 0.045), 0.0, 0.85),
        "glass_smoke": material("glass_smoke", (0.18, 0.2, 0.22), 0.0, 0.08, alpha=0.35),
        "lamp_red": material("lamp_red", (0.55, 0.05, 0.04), 0.0, 0.3, emissive=(0.35, 0.02, 0.02)),
        "lamp_amber": material("lamp_amber", (0.65, 0.42, 0.05), 0.0, 0.3, emissive=(0.3, 0.18, 0.01)),
        "lamp_green": material("lamp_green", (0.06, 0.45, 0.12), 0.0, 0.3, emissive=(0.02, 0.25, 0.05)),
        "lamp_blue": material("lamp_blue", (0.05, 0.18, 0.55), 0.0, 0.3, emissive=(0.01, 0.06, 0.3)),
        "screen": material("screen", (0.02, 0.025, 0.03), 0.0, 0.15),
    }


# --------------------------------------------------------------------------- semantics
def tag(obj, assetId, partKey, materialRef, cutaway="keep", cover=False, lod="", jointId="", pickable=True, castShadow=True, isGlass=False):
    obj["assetId"] = assetId
    obj["partKey"] = partKey
    obj["materialRef"] = materialRef
    obj["cutaway"] = cutaway
    obj["cover"] = 1 if cover else 0
    obj["lod"] = lod
    obj["jointId"] = jointId
    obj["pickable"] = 1 if pickable else 0
    obj["castShadow"] = 1 if castShadow else 0
    obj["isGlass"] = 1 if isGlass else 0
    return obj


# --------------------------------------------------------------------------- mesh helpers
def _box_uv(bm, density=1.5):
    """Planar UVs per face along the face's dominant axis (one tile per 1/density m)."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        u_ax, v_ax = [(1, 2), (0, 2), (0, 1)][ax]
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = (co[u_ax] * density, co[v_ax] * density)


def _link(name, bm, mat, parent):
    # n-gons (cylinder caps) -> triangles so the exporter can build the tangent space
    ngons = [f for f in bm.faces if len(f.verts) > 4]
    if ngons:
        bmesh.ops.triangulate(bm, faces=ngons)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    if parent is not None:
        ob.parent = parent
    return ob


def box(name, center, size, mat, parent=None, bevel=0.004, segments=2):
    """Bevelled box: center / size in the instance frame. Real geometry bevel (not a normal trick)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    s = bsize(*size)
    bmesh.ops.scale(bm, vec=s, verts=bm.verts)
    if bevel > 0:
        b = min(bevel, min(s) * 0.45)
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=b, segments=segments, affect="EDGES", profile=0.5)
    bmesh.ops.translate(bm, vec=B(*center), verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _box_uv(bm)
    return _link(name, bm, mat, parent)


def cyl(name, center, radius, length, axis, mat, parent=None, segments=24, bevel=0.0015):
    """Cylinder along an instance axis ("x" | "y" | "z")."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments, radius1=radius, radius2=radius, depth=length)
    # created along Blender Z (= instance Y)
    if axis == "x":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
    elif axis == "z":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "X"))
    if bevel > 0:
        rim = [e for e in bm.edges if not e.is_wire and len(e.link_faces) == 2 and abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.2]
        if rim:
            bmesh.ops.bevel(bm, geom=rim, offset=min(bevel, radius * 0.3), segments=2, affect="EDGES", profile=0.5)
    bmesh.ops.translate(bm, vec=B(*center), verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _box_uv(bm, 3.0)
    ob = _link(name, bm, mat, parent)
    # smooth the round surface only
    for p in ob.data.polygons:
        p.use_smooth = abs(p.normal.dot(Vector((0, 0, 1)) if axis == "y" else Vector((1, 0, 0)) if axis == "x" else Vector((0, 1, 0)))) < 0.9
    return ob


def join(objs, name):
    """Join several meshes into one object (same semantic part). Keeps materials as slots."""
    if len(objs) == 1:
        objs[0].name = name
        return objs[0]
    ctx = bpy.context
    for o in ctx.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    ctx.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = ctx.view_layer.objects.active
    ob.name = name
    return ob


# --------------------------------------------------------------------------- composite pieces
def panel_grid(prefix, x0, x1, y0, y1, z0, z1, normal, cols, rows, mat, parent=None, gap=0.004, thick=0.012):
    """Wall of separate panels (visible seams) on the box face given by `normal` ("+x","-x","+z","-z","+y")."""
    out = []
    if normal in ("+x", "-x"):
        x = x1 if normal == "+x" else x0
        for i in range(cols):
            for j in range(rows):
                za = z0 + (z1 - z0) * i / cols + gap / 2
                zb = z0 + (z1 - z0) * (i + 1) / cols - gap / 2
                ya = y0 + (y1 - y0) * j / rows + gap / 2
                yb = y0 + (y1 - y0) * (j + 1) / rows - gap / 2
                out.append(box(f"{prefix}_{i}{j}", (x - (thick / 2 if normal == "+x" else -thick / 2), (ya + yb) / 2, (za + zb) / 2), (thick, yb - ya, zb - za), mat, parent, bevel=0.003))
    elif normal in ("+z", "-z"):
        z = z1 if normal == "+z" else z0
        for i in range(cols):
            for j in range(rows):
                xa = x0 + (x1 - x0) * i / cols + gap / 2
                xb = x0 + (x1 - x0) * (i + 1) / cols - gap / 2
                ya = y0 + (y1 - y0) * j / rows + gap / 2
                yb = y0 + (y1 - y0) * (j + 1) / rows - gap / 2
                out.append(box(f"{prefix}_{i}{j}", ((xa + xb) / 2, (ya + yb) / 2, z - (thick / 2 if normal == "+z" else -thick / 2)), (xb - xa, yb - ya, thick), mat, parent, bevel=0.003))
    else:  # top
        for i in range(cols):
            for j in range(rows):
                xa = x0 + (x1 - x0) * i / cols + gap / 2
                xb = x0 + (x1 - x0) * (i + 1) / cols - gap / 2
                za = z0 + (z1 - z0) * j / rows + gap / 2
                zb = z0 + (z1 - z0) * (j + 1) / rows - gap / 2
                out.append(box(f"{prefix}_{i}{j}", ((xa + xb) / 2, y1 - thick / 2, (za + zb) / 2), (xb - xa, thick, zb - za), mat, parent, bevel=0.003))
    return out


def door(prefix, face, a0, a1, y0, y1, plane, mats, hinge="start", handle=True, window=None):
    """Hinged service door on a vertical face. face: "+x"/"-x" (a = z range) or "+z"/"-z" (a = x range).
    Returns [slab, hinges, handle, window?] objects (caller joins / tags)."""
    t = 0.022
    out = []
    sgn = 1 if face[0] == "+" else -1
    off = sgn * (t / 2 + 0.002)
    if face[1] == "x":
        c = (plane + off, (y0 + y1) / 2, (a0 + a1) / 2)
        s = (t, y1 - y0, a1 - a0)
    else:
        c = ((a0 + a1) / 2, (y0 + y1) / 2, plane + off)
        s = (a1 - a0, y1 - y0, t)
    out.append(box(f"{prefix}_slab", c, s, mats["panel"], bevel=0.005, segments=3))
    # hinge knuckles on one vertical edge
    ah = a0 + 0.012 if hinge == "start" else a1 - 0.012
    for k, frac in enumerate((0.12, 0.5, 0.88)):
        yk = y0 + (y1 - y0) * frac
        if face[1] == "x":
            out.append(cyl(f"{prefix}_hinge{k}", (plane + sgn * (t + 0.008), yk, ah), 0.008, 0.06, "y", mats["metal"], segments=14))
        else:
            out.append(cyl(f"{prefix}_hinge{k}", (ah, yk, plane + sgn * (t + 0.008)), 0.008, 0.06, "y", mats["metal"], segments=14))
    if handle:
        ahd = a1 - 0.05 if hinge == "start" else a0 + 0.05
        ym = (y0 + y1) / 2
        L = min(0.18, (y1 - y0) * 0.3)
        if face[1] == "x":
            out.append(box(f"{prefix}_handle", (plane + sgn * (t + 0.03), ym, ahd), (0.012, L, 0.016), mats["metal"], bevel=0.004))
            for dy in (-L / 2 + 0.01, L / 2 - 0.01):
                out.append(box(f"{prefix}_standoff{dy:+.2f}", (plane + sgn * (t + 0.014), ym + dy, ahd), (0.02, 0.012, 0.012), mats["metal"], bevel=0.002))
        else:
            out.append(box(f"{prefix}_handle", (ahd, ym, plane + sgn * (t + 0.03)), (0.016, L, 0.012), mats["metal"], bevel=0.004))
            for dy in (-L / 2 + 0.01, L / 2 - 0.01):
                out.append(box(f"{prefix}_standoff{dy:+.2f}", (ahd, ym + dy, plane + sgn * (t + 0.014)), (0.012, 0.012, 0.02), mats["metal"], bevel=0.002))
    if window:
        wa0, wa1, wy0, wy1 = window
        if face[1] == "x":
            out.append(box(f"{prefix}_window", (plane + sgn * (t + 0.003), (wy0 + wy1) / 2, (wa0 + wa1) / 2), (0.006, wy1 - wy0, wa1 - wa0), mats["glass"], bevel=0.002))
        else:
            out.append(box(f"{prefix}_window", ((wa0 + wa1) / 2, (wy0 + wy1) / 2, plane + sgn * (t + 0.003)), (wa1 - wa0, wy1 - wy0, 0.006), mats["glass"], bevel=0.002))
    return out


def louver(prefix, face, a0, a1, y0, y1, plane, mats, pitch=0.022):
    """Vent grille: frame + slats (geometry)."""
    out = []
    sgn = 1 if face[0] == "+" else -1
    depth = 0.02
    n = max(2, int((y1 - y0) / pitch))
    for k in range(n):
        yk = y0 + (k + 0.5) * (y1 - y0) / n
        if face[1] == "x":
            out.append(box(f"{prefix}_slat{k}", (plane + sgn * depth / 2, yk, (a0 + a1) / 2), (depth, 0.004, a1 - a0 - 0.02), mats["dark"], bevel=0.0012, segments=1))
        else:
            out.append(box(f"{prefix}_slat{k}", ((a0 + a1) / 2, yk, plane + sgn * depth / 2), (a1 - a0 - 0.02, 0.004, depth), mats["dark"], bevel=0.0012, segments=1))
    fr = 0.012
    if face[1] == "x":
        for (yy, hh) in ((y0 - fr / 2, fr), (y1 + fr / 2, fr)):
            out.append(box(f"{prefix}_frame{yy:.2f}", (plane + sgn * depth / 2, yy, (a0 + a1) / 2), (depth, hh, a1 - a0), mats["metal"], bevel=0.002))
    else:
        for (yy, hh) in ((y0 - fr / 2, fr), (y1 + fr / 2, fr)):
            out.append(box(f"{prefix}_frame{yy:.2f}", ((a0 + a1) / 2, yy, plane + sgn * depth / 2), (a1 - a0, hh, depth), mats["metal"], bevel=0.002))
    return out


def leveling_foot(prefix, x, z, floor_y, mats, h=0.06):
    """Leveling foot: threaded stem, hex nut, rubber pad (geometry)."""
    return [
        cyl(f"{prefix}_pad", (x, floor_y + 0.006, z), 0.035, 0.012, "y", mats["rubber"], segments=20),
        cyl(f"{prefix}_base", (x, floor_y + 0.018, z), 0.03, 0.012, "y", mats["metal"], segments=20),
        cyl(f"{prefix}_stem", (x, floor_y + 0.024 + h / 2, z), 0.009, h, "y", mats["metal"], segments=12),
        cyl(f"{prefix}_nut", (x, floor_y + 0.024 + h * 0.6, z), 0.016, 0.012, "y", mats["metal"], segments=6, bevel=0.0),
    ]


def export(path_blend, path_glb, root):
    bpy.ops.wm.save_as_mainfile(filepath=path_blend, compress=True)
    if os.path.exists(path_blend + "1"):
        os.remove(path_blend + "1")
    for o in bpy.context.scene.objects:
        o.select_set(False)
    bpy.ops.export_scene.gltf(
        filepath=path_glb,
        export_format="GLB",
        export_extras=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_jpeg_quality=88,
        use_selection=False,
        export_animations=False,
    )


def manifest_nodes():
    """Semantic node list of the scene (for the manifest)."""
    out = []
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or "assetId" not in o:
            continue
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
        mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
        # back to the instance frame: (x, y, z) = (-bx, bz, -by)
        inst_min = [-mx.x, mn.z, -mx.y]
        inst_max = [-mn.x, mx.z, -mn.y]
        out.append({
            "node": o.name,
            "parent": o.parent.name if o.parent else None,
            "assetId": o["assetId"],
            "partKey": o["partKey"],
            "materialRef": o["materialRef"],
            "cutaway": o["cutaway"],
            "cover": bool(o["cover"]),
            "lod": o["lod"],
            "jointId": o["jointId"],
            "pickable": bool(o["pickable"]),
            "castShadow": bool(o["castShadow"]),
            "isGlass": bool(o["isGlass"]),
            "materials": [s.material.name for s in o.material_slots if s.material],
            "triangles": sum(len(p.vertices) - 2 for p in o.data.polygons),
            "boundsInstance": {"min": [round(v, 4) for v in inst_min], "max": [round(v, 4) for v in inst_max]},
        })
    out.sort(key=lambda n: n["partKey"])
    return out
