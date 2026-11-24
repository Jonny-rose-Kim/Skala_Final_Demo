"""
Cleanway CLW-08v2 based OHT vehicle shell (representative, not OEM CAD). Authored at the rest pose (vehicle
at the rail start, hoist retracted) in the instance frame; every node follows the `travel` path joint.
Silhouette cue from the public photo: a white shell whose lower part forms an open-sided carrier bay
around the hoisted FOUP. No numbers, logos or labels are reproduced.
  vehicle_body        upper drive / hoist housing (cover: hidden in the inspection modes), bumpers, lamp
  carrier_bay_guard   front / rear end walls of the carrier bay with retention lips (outside the FOUP path)
"""
from common import MATREF, Groups
from lib import box


def build(env, P):
    G = Groups()
    z0 = env["z0"]
    bx, by, bz = env["bodySize"]
    y0, y1 = env["bodyY0"], env["bodyY1"]
    seat = env["seatY"]
    fx, fy, fz = env["foupSize"]
    hx = bx / 2 + 0.02
    hz = bz / 2 + 0.02
    sem = dict(jointId="travel")
    # upper housing: two shell halves with a seam, top cover, side access panels
    G.add("vehicle_body", "housing", "paint_offwhite", [box("vb_lower", (0, y0 + (y1 - y0) * 0.35, z0), (2 * hx, (y1 - y0) * 0.7, 2 * hz), P["paint_offwhite"], bevel=0.018, segments=4), box("vb_upper", (0, y0 + (y1 - y0) * 0.85, z0), (2 * hx - 0.02, (y1 - y0) * 0.29, 2 * hz - 0.02), P["paint_offwhite"], bevel=0.02, segments=4)], cover=True, **sem)
    G.add("vehicle_body", "bumpers", "paint_graphite", [box(f"vb_bumper{s}", (0, y0 + 0.06, z0 + s * (hz + 0.012)), (2 * hx - 0.04, 0.05, 0.024), P["paint_graphite"], bevel=0.008) for s in (-1, 1)], cover=True, **sem)
    G.add("vehicle_body", "lamp", "lamp_green", [box("vb_lamp", (hx + 0.002, y1 - 0.05, z0 + hz * 0.6), (0.006, 0.03, 0.12), P["lamp_green"], bevel=0.002, segments=1)], cover=True, castShadow=False, lod="fine", **sem)
    # carrier bay: front / rear end walls down past the hoisted FOUP bottom, inward retention lips
    wall_y0 = seat - 0.05
    wall_t = 0.03
    walls = []
    lips = []
    for s in (-1, 1):
        zc = z0 + s * (hz - wall_t / 2)
        walls.append(box(f"cb_wall{s}", (0, (wall_y0 + y0) / 2, zc), (2 * hx, y0 - wall_y0, wall_t), P["paint_offwhite"], bevel=0.012, segments=3))
        lips.append(box(f"cb_lip{s}", (0, wall_y0 + 0.012, zc - s * 0.03), (2 * hx - 0.06, 0.024, 0.04), P["paint_lightgray"], bevel=0.006))
        for k, x in enumerate((-hx + 0.05, hx - 0.05)):
            lips.append(box(f"cb_handle{s}{k}", (x, (wall_y0 + y0) / 2, zc + s * 0.022), (0.02, 0.16, 0.014), P["stainless"], bevel=0.004))
    G.add("carrier_bay_guard", "walls", "paint_offwhite", walls, **sem)
    G.add("carrier_bay_guard", "lips", "paint_lightgray", [l for l in lips if "lip" in l.name], **sem)
    G.add("carrier_bay_guard", "handles", "stainless", [l for l in lips if "handle" in l.name], lod="fine", **sem)
    return G.finalize(MATREF)
