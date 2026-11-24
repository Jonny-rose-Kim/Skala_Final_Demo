"""
Builds the exterior GLBs of the current-bay equipment from the envelope JSON (instance frame).

  blender --background --python scripts/blender/build_equipment.py -- [tool ...]
  (npm run assets:blender runs it with the pinned Blender; tools default to all)

Outputs per tool (templateId):
  assets/source/blender/<templateId>.blend            editable source scene
  assets/source/glb-raw/<templateId>.glb              raw export (input of the optimizer)
  assets/manifests/<templateId>.glb-manifest.json     node list with semantics, bounds, export settings
"""
import importlib
import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "tools"))
import lib  # noqa: E402

TOOLS = {
    "producer": "producer_se_ccp_twin_300",
    "tactras": "tactras_oxide_ccp_rie_300",
    "cellesta": "cellesta_i_md_clean_300",
}

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
selected = args or list(TOOLS)
REPO = lib.REPO
for name in selected:
    template_id = TOOLS[name]
    env = json.load(open(os.path.join(REPO, "assets", "source", "envelopes", f"{template_id}.json")))
    lib.reset_scene()
    lib._mats.clear()
    P = lib.palette()
    mod = importlib.import_module(name)
    objs = mod.build(env, P)
    root = lib.empty(f"{template_id}__root")
    for o in objs:
        o.parent = root
    for d in ("blender", "glb-raw"):
        os.makedirs(os.path.join(REPO, "assets", "source", d), exist_ok=True)
    blend = os.path.join(REPO, "assets", "source", "blender", f"{template_id}.blend")
    glb = os.path.join(REPO, "assets", "source", "glb-raw", f"{template_id}.glb")
    lib.export(blend, glb, root)
    manifest = {
        "$schema_id": "pecvd-twin.glb-manifest/1",
        "templateId": template_id,
        "generator": {"tool": f"Blender {bpy.app.version_string}", "script": f"scripts/blender/tools/{name}.py", "command": f"blender --background --python scripts/blender/build_equipment.py -- {name}"},
        "export": {"format": "GLB", "yUp": True, "extras": True, "applyModifiers": True, "imageFormat": "JPEG", "jpegQuality": 88, "units": "m"},
        "frame": "Blender (bx, by, bz) = instance (-x, -z, y); the glTF loader's __root__ maps it back (single conversion)",
        "rawFile": os.path.relpath(glb, REPO),
        "runtimeFile": f"public/models/{template_id}.glb",
        "nodes": lib.manifest_nodes(),
    }
    os.makedirs(os.path.join(REPO, "assets", "manifests"), exist_ok=True)
    with open(os.path.join(REPO, "assets", "manifests", f"{template_id}.glb-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"[build_equipment] {template_id}: {len(manifest['nodes'])} nodes, {sum(n['triangles'] for n in manifest['nodes'])} triangles")
