"""
CELLESTA-i MD based single-wafer wet clean tool: exterior GLB (representative, not OEM CAD).

Silhouette cues from the public product image: four load ports on a low front, a tall operator tower with
the HMI between the front end and a long, tall process body. No logo or product graphics are reproduced;
the dark accent band is a plain graphite panel.
  tool_enclosure      corridor skin (cover), upper tier over PM-01, operator tower with HMI (not covers)
  pm01_enclosure      PM-01 cabinet (cover) with the shutter opening, service doors, vents
  pm02..pm05_enclosure module stacks along the corridor (geometry only, never covers)
  chemical_cabinet    rear supply / recycle cabinet (geometry only)
  idle_load_ports     LP1 / LP3 / LP4
"""
from common import MATREF, Groups, idle_load_port, module_skin
from lib import box, panel_grid


def build(env, P):
    G = Groups()
    F = env["floorY"]
    efem = env["efem"]
    lp = env["loadPort"]
    pm = env["pm"]
    cor = env["corridor"]
    tool = env["tool"]
    top = F + 2.4
    # PM-01 cabinet with the shutter opening toward the corridor (cover)
    sh = env["shutter"]
    module_skin(G, P, "pm01_enclosure", pm["x0"], pm["x1"], pm["z0"], pm["z1"], F, pm["top"], cover=True, tc_cut=(-sh["width"] / 2 - 0.03, sh["width"] / 2 + 0.03, sh["y0"] - 0.03, sh["y1"] + 0.03), top_boxes=False)
    # upper tier over PM-01 up to the body height (stacked modules, geometry only)
    G.add("tool_enclosure", "upper_tier", "paint_offwhite", panel_grid("ut-z", pm["x0"], pm["x1"], pm["top"] + 0.01, top, pm["z0"], pm["z1"], "-z", 2, 2, P["paint_offwhite"]) + panel_grid("ut+z", pm["x0"], pm["x1"], pm["top"] + 0.01, top, pm["z0"], pm["z1"], "+z", 2, 2, P["paint_offwhite"]) + panel_grid("ut-x", pm["x0"], pm["x1"], pm["top"] + 0.01, top, pm["z0"], pm["z1"], "-x", 2, 2, P["paint_offwhite"]) + panel_grid("uttop", pm["x0"], pm["x1"], top - 0.012, top, pm["z0"], pm["z1"], "+y", 2, 2, P["paint_offwhite"]), cover=True)
    # corridor skin (cover): side walls and roof from the EFEM back wall to PM-01
    hz = cor["halfZ"]
    sem = dict(cover=True)
    for face in ("-z", "+z"):
        G.add("tool_enclosure", "corridor_panels", "paint_offwhite", panel_grid(f"cor{face}", cor["x0"], cor["x1"], F + 0.08, top, -hz, hz, face, 2, 3, P["paint_offwhite"]), **sem)
    G.add("tool_enclosure", "corridor_panels", "paint_offwhite", panel_grid("cortop", cor["x0"], cor["x1"], top - 0.012, top, -hz, hz, "+y", 2, 1, P["paint_offwhite"]), **sem)
    # operator tower with the HMI (between the front end and the body), dark accent band
    tw = tool["tower"]
    G.add("tool_enclosure", "tower", "paint_offwhite", [box("tower_body", ((tw["x0"] + tw["x1"]) / 2, F + tw["height"] / 2, (tw["z0"] + tw["z1"]) / 2), (tw["x1"] - tw["x0"], tw["height"], tw["z1"] - tw["z0"]), P["paint_offwhite"], bevel=0.008, segments=3)], cover=False)
    G.add("tool_enclosure", "tower_hmi", "screen", [box("tower_screen", (tw["x0"] - 0.006, F + 1.45, (tw["z0"] + tw["z1"]) / 2), (0.012, 0.3, 0.26), P["screen"], bevel=0.004)], cover=False, castShadow=False)
    G.add("tool_enclosure", "accent", "paint_graphite", [box("accent_band", (tw["x1"] + 0.006, F + tw["height"] / 2, (tw["z0"] + tw["z1"]) / 2 + 0.2), (0.012, tw["height"] - 0.1, 0.06), P["paint_graphite"], bevel=0.003)], cover=False)
    # idle module stacks and the rear chemical cabinet (geometry only)
    for im in tool["idle_modules"]:
        cx, _, cz = im["center"]
        sx, sy, sz = im["size"]
        aid = f"{im['moduleId'].lower().replace('-', '')}_enclosure"
        outward = "-z" if im["facing"][2] > 0 else "+z"
        module_skin(G, P, aid, cx - sx / 2, cx + sx / 2, cz - sz / 2, cz + sz / 2, F, F + sy, cover=True, doors_on=(outward,), top_boxes=False)
    cc = tool["chemical_cabinet"]
    module_skin(G, P, "chemical_cabinet", cc["x0"], cc["x1"], cc["z0"], cc["z1"], F, F + cc["height"], cover=False, doors_on=("-z", "+z"), top_boxes=False)
    for k, z in enumerate(env["idleLoadPortsZ"]):
        idle_load_port(G, P, f"lpi{k}", z, lp, efem, F)
    return G.finalize(MATREF)
