"""
Tactras based rectangular-cluster etch tool: exterior GLB (representative, not OEM CAD).

Silhouette cues from the public product image: a tall white front end with three load ports, and a
rectangular cluster of tall process-module cabinets behind it with chamber tops, RF boxes and pipe bundles
above. Built parts (instance frame from assets/source/envelopes/tactras_oxide_ccp_rie_300.json):
  pm01_enclosure    PM-01 cabinet (cover): panels with seams, service doors, vents, top RF box, gas / pipe stack
  tool_enclosure    mainframe skin over the load lock and the transfer chamber (cover)
  pm02..pm05_enclosure   geometry-only module cabinets with chamber tops (never covers)
  idle_load_ports   LP2 / LP3
"""
from common import MATREF, Groups, idle_load_port, mainframe_skin, module_skin
from lib import box, cyl


def chamber_top(G, P, assetId, cx, cz, y, sem):
    """Visible chamber lid stack, RF box and vertical pipe bundle on top of a module (exterior only)."""
    G.add(assetId, "chamber_top", "aluminum", [cyl(f"{assetId}_lid", (cx, y + 0.04, cz), 0.3, 0.08, "y", P["aluminum"], segments=48, bevel=0.006)], **sem)
    G.add(assetId, "chamber_top", "aluminum", [cyl(f"{assetId}_lidcap", (cx, y + 0.1, cz), 0.16, 0.04, "y", P["aluminum"], segments=36, bevel=0.004)], **sem)
    G.add(assetId, "topboxes", "paint_lightgray", [box(f"{assetId}_rfbox", (cx + 0.18, y + 0.24, cz), (0.3, 0.22, 0.34), P["paint_lightgray"], bevel=0.008, segments=3)], **sem)
    pipes = []
    for k, (dx, dz) in enumerate(((-0.22, -0.18), (-0.22, -0.1), (-0.22, -0.02), (-0.16, 0.2))):
        pipes.append(cyl(f"{assetId}_pipe{k}", (cx + dx, y + 0.3, cz + dz), 0.018, 0.6, "y", P["stainless"], segments=16))
    G.add(assetId, "pipes", "stainless", pipes, **sem)


def build(env, P):
    G = Groups()
    st = env["station"]
    F = st["floorY"]
    pm = env["pm01"]
    tc = st["tc"]
    module_skin(G, P, "pm01_enclosure", pm["x0"], pm["x1"], pm["z0"], pm["z1"], F, pm["y1"], cover=True, tc_cut=(-tc["halfWidth"] - 0.012, tc["halfWidth"] + 0.012, tc["bottomY"] - 0.012, tc["topY"] + 0.012), top_boxes=False)
    chamber_top(G, P, "pm01_enclosure", (pm["x0"] + pm["x1"]) / 2 - 0.1, (pm["z0"] + pm["z1"]) / 2, pm["y1"], dict(cover=True))
    mainframe_skin(G, P, st["efem"]["x1"] + 0.004, pm["x0"] - 0.004, tc["halfWidth"] + 0.1, F, 0.62)
    for im in env["idleModules"]:
        cx, _, cz = im["center"]
        sx, sy, sz = im["size"]
        aid = f"{im['moduleId'].lower().replace('-', '')}_enclosure"
        outward = "-z" if im["facing"][2] > 0 else "+z"
        module_skin(G, P, aid, cx - sx / 2, cx + sx / 2, cz - sz / 2, cz + sz / 2, F, F + sy, cover=False, doors_on=(outward,), top_boxes=False)
        chamber_top(G, P, aid, cx, cz, F + sy, dict(cover=False))
    for k, z in enumerate(env["idleLoadPortsZ"]):
        idle_load_port(G, P, f"lp{k + 2}", z, st["loadPort"], st["efem"], F)
    return G.finalize(MATREF)
