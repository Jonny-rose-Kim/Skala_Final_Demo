"""
Cleanway CLW-08v2 based OHT vehicle shell in an SK hynix fab livery (representative, not OEM CAD). Authored at
the rest pose (vehicle at the rail start, hoist retracted) in the instance frame; every node follows the
`travel` path joint.

Shape and layout follow a public photo of SK hynix fab OHT vehicles: tall white end shells with large plan-view
corner radii that wrap back along the sides, a black cap band on top, a light ledge at the bottom, and on each
end face (top to bottom) a sensor window, the operator logo, the vehicle number, a second sensor window with a
nameplate and a service-lid seam, a two-line LED status display with an emergency stop, and a lower sensor
window; warning labels sit at the left edge. Proportions are scaled to the vehicle envelope of the config, so
they are not measured from the photo. The display shows only the static vehicle identity (no operating values).

  vehicle_body           upper housing side panels, underside with the hoist window, black cap, yoke, side
                         number decals (cover: hidden in the inspection modes)
  carrier_bay_guard      front / rear end shells with bottom ledges and inner retention lips (outside the FOUP path)
  obstruction_sensor     forward sensor window (front face, top) and the descent sensor under the housing
  vehicle_face_fittings  other sensor windows, status display, emergency stop, nameplate, breaker, face decals
"""
import json
import os

from common import MATREF, Groups
from lib import TEX, box, cyl, decal, decal_material, emissive_map_material, material, prism, rounded_rect, u_shell

LIVERY = os.path.join(TEX, "livery")

MATREF_CLW = dict(MATREF, vehicle_white="painted_offwhite", vehicle_black="painted_dark", acrylic_black="painted_dark", estop_red="safety_marking", livery_decal="painted_offwhite", status_display="painted_dark")


def _materials():
    return {
        # glossy white body paint with a light clear coat (KHR_materials_clearcoat), faint orange-peel normal
        "vehicle_white": material("vehicle_white", (0.84, 0.85, 0.84), 0.0, 0.34, detail="paint", normal_strength=0.05, tex_scale=2.0, coat=0.5, coat_roughness=0.1),
        "vehicle_black": material("vehicle_black", (0.022, 0.022, 0.025), 0.0, 0.42),
        "acrylic_black": material("acrylic_black", (0.008, 0.009, 0.011), 0.0, 0.06, coat=1.0, coat_roughness=0.03),
        "estop_red": material("estop_red", (0.62, 0.04, 0.03), 0.0, 0.32, coat=0.6),
        "livery_decal": decal_material("livery_decal", os.path.join(LIVERY, "clw08v2_livery.png"), roughness=0.36),
        "status_display": emissive_map_material("status_display", os.path.join(LIVERY, "clw08v2_display.png"), strength=1.6),
    }


def build(env, P):
    G = Groups()
    M = _materials()
    P = dict(P, **M)
    atlas = json.load(open(os.path.join(LIVERY, "clw08v2_livery.json")))
    A = (atlas["size"][0], atlas["size"][1])
    R = atlas["rects"]
    z0 = env["z0"]
    bx, by, bz = env["bodySize"]
    y0, y1 = env["bodyY0"], env["bodyY1"]
    seat = env["seatY"]
    hx = bx / 2 + 0.02
    hz = bz / 2 + 0.02
    rc = 0.085  # plan-view corner radius of the shell
    t = 0.02  # shell wall
    wrap = 0.16  # end shell returns along the sides
    yb = seat - 0.05  # bottom of the end shells (below the hoisted FOUP bottom)
    cap_h = 0.035
    ledge_h = 0.022
    yt = y1 - cap_h
    sem = dict(jointId="travel")
    deco = dict(jointId="travel", pickable=False, castShadow=False)

    def shift(outline):
        return [(x, z + z0) for x, z in outline]

    # ------------------------------------------------------------------ end shells, ledges, lips
    for s in (1, -1):
        zf = s * hz
        G.add("carrier_bay_guard", "shell", "vehicle_white", [prism(f"cb_shell{s}", shift(u_shell(hx, zf, wrap, rc, t)), yb + ledge_h, yt, P["vehicle_white"])], **sem)
        G.add("carrier_bay_guard", "ledge", "paint_lightgray", [prism(f"cb_ledge{s}", shift(u_shell(hx + 0.005, s * (hz + 0.005), wrap, rc + 0.005, t + 0.01)), yb, yb + ledge_h, P["paint_lightgray"])], **sem)
        G.add("carrier_bay_guard", "lips", "paint_lightgray", [box(f"cb_lip{s}", (0, yb + ledge_h + 0.012, z0 + s * (hz - t - 0.02)), (2 * hx - 0.08, 0.024, 0.04), P["paint_lightgray"], bevel=0.006)], **sem)

    # ------------------------------------------------------------------ upper housing (cover)
    G.add("vehicle_body", "cap", "vehicle_black", [prism("vb_cap", shift(rounded_rect(hx + 0.004, hz + 0.004, rc + 0.004)), yt, y1, P["vehicle_black"])], cover=True, **sem)
    G.add("vehicle_body", "yoke", "paint_graphite", [box("vb_yoke", (0, y1 + 0.02, z0), (0.06, 0.04, 0.6), P["paint_graphite"], bevel=0.004)], cover=True, **sem)
    zs = hz - wrap + 0.002  # side panels run between the end-shell returns
    sides = []
    for sx in (1, -1):
        sides.append(box(f"vb_side{sx}", (sx * (hx - t / 2), (y0 + yt) / 2, z0), (t, yt - y0, 2 * zs), P["vehicle_white"], bevel=0.004))
    G.add("vehicle_body", "side_panels", "vehicle_white", sides, cover=True, **sem)
    # underside plate with the hoist window around the belt exits
    wx = max(abs(o[0]) for o in env["beltOffsets"]) + 0.05
    wz = max(abs(o[1]) for o in env["beltOffsets"]) + 0.05
    ix, iz = hx - t, hz - rc  # stays inside the rounded shell corners (square plate corners would poke out)
    pt = 0.015
    under = [
        box("vb_under_f", (0, y0 + pt / 2, z0 + (wz + iz) / 2), (2 * ix, pt, iz - wz), P["paint_graphite"], bevel=0.002),
        box("vb_under_r", (0, y0 + pt / 2, z0 - (wz + iz) / 2), (2 * ix, pt, iz - wz), P["paint_graphite"], bevel=0.002),
        box("vb_under_l", ((wx + ix) / 2, y0 + pt / 2, z0), (ix - wx, pt, 2 * wz), P["paint_graphite"], bevel=0.002),
        box("vb_under_rt", (-(wx + ix) / 2, y0 + pt / 2, z0), (ix - wx, pt, 2 * wz), P["paint_graphite"], bevel=0.002),
    ]
    G.add("vehicle_body", "underside", "paint_graphite", under, cover=True, **sem)
    # side livery: vehicle number near the front and a service-lid seam
    num = R["number"]
    num_tight = (260, num[1], 764, num[3])
    side_decals, side_labels = [], []
    for sx in (1, -1):
        xo = sx * (hx + 0.0015)
        side_decals.append(decal(f"vb_num{sx}", (xo, y1 - 0.15, z0 + 0.14), (sx, 0), (0.13, 0.041), num_tight, A, P["livery_decal"]))
        side_labels.append(decal(f"vb_lid{sx}", (xo, (y0 + yt) / 2 - 0.01, z0 - 0.08), (sx, 0), (0.2, 0.146), R["panel_outline"], A, P["livery_decal"]))
    G.add("vehicle_body", "livery", "livery_decal", side_decals, cover=True, **deco)
    G.add("vehicle_body", "labels", "livery_decal", side_labels, cover=True, lod="fine", **deco)

    # ------------------------------------------------------------------ end faces
    def at(s, u, y, d=0.0):
        """Face-local (u to the viewer's right, height y, d out of the face) -> instance point."""
        return (-s * u, y, z0 + s * (hz + d))

    fs = env["frontSensorSize"]
    H = y1 - yb

    def fy(f):
        """Height on the face as a fraction of the shell height from the top (layout read off the photo)."""
        return y1 - f * H

    for s in (1, -1):
        n = (0, s)
        win = lambda name, u, y, w, h: box(name, at(s, u, y, 0.006), (w, h, 0.012), P["acrylic_black"], bevel=0.004, segments=2)
        top = win(f"ff_win_top{s}", 0.0, fy(0.095), 0.075, 0.085)
        if s == 1:
            G.add("obstruction_sensor", "window", "acrylic_black", [top], **sem)
        else:
            G.add("vehicle_face_fittings", "windows", "acrylic_black", [top], **sem)
        G.add("vehicle_face_fittings", "windows", "acrylic_black", [win(f"ff_win_mid{s}", 0.0, fy(0.583), 0.07, 0.075), win(f"ff_win_low{s}", 0.0, fy(0.93), 0.07, 0.07)], **sem)
        # status display: graphite bezel + emissive LED face
        G.add("vehicle_face_fittings", "bezel", "paint_graphite", [box(f"ff_bezel{s}", at(s, -0.03, fy(0.79), 0.004), (0.15, 0.066, 0.008), P["paint_graphite"], bevel=0.003)], **sem)
        G.add("vehicle_face_fittings", "display", "status_display", [decal(f"ff_display{s}", at(s, -0.03, fy(0.79), 0.0085), n, (0.13, 0.0488), (0, 0, 512, 192), (512, 192), P["status_display"])], **dict(sem, castShadow=False))
        # emergency stop: light collar + red mushroom cap
        G.add("vehicle_face_fittings", "estop_base", "paint_lightgray", [cyl(f"ff_estop_base{s}", at(s, 0.075, fy(0.79), 0.004), 0.022, 0.008, "z", P["paint_lightgray"], segments=28)], **sem)
        G.add("vehicle_face_fittings", "estop", "estop_red", [cyl(f"ff_estop{s}", at(s, 0.075, fy(0.79), 0.014), 0.015, 0.014, "z", P["estop_red"], segments=28, bevel=0.004)], **sem)
        # nameplate (stainless) inside a service-lid seam, breaker switch at the right edge
        G.add("vehicle_face_fittings", "nameplate", "stainless", [box(f"ff_plate{s}", at(s, 0.09, fy(0.565), 0.001), (0.052, 0.024, 0.002), P["stainless"], bevel=0.0008, segments=1)], **sem)
        G.add("vehicle_face_fittings", "breaker", "paint_graphite", [box(f"ff_breaker{s}", at(s, 0.168, fy(0.54), 0.0075), (0.026, 0.05, 0.015), P["paint_graphite"], bevel=0.003)], **sem)
        G.add("vehicle_face_fittings", "breaker_lever", "paint_offwhite", [box(f"ff_lever{s}", at(s, 0.168, fy(0.54) + 0.008, 0.017), (0.01, 0.016, 0.006), P["paint_offwhite"], bevel=0.0015, segments=1)], **dict(sem, lod="fine"))
        # decals: logo and number (always), small labels (fine LOD)
        dz = 0.0015
        G.add("vehicle_face_fittings", "livery", "livery_decal", [
            decal(f"ff_logo{s}", at(s, 0.0, fy(0.28), dz), n, (0.28, 0.153), R["logo"], A, P["livery_decal"]),
            decal(f"ff_num{s}", at(s, 0.0, fy(0.447), dz), n, (0.2, 0.0635), num_tight, A, P["livery_decal"]),
        ], **deco)
        G.add("vehicle_face_fittings", "labels", "livery_decal", [
            decal(f"ff_caution{s}", at(s, -0.155, fy(0.44), dz), n, (0.05, 0.096), R["label_caution"], A, P["livery_decal"]),
            decal(f"ff_electric{s}", at(s, -0.155, fy(0.615), dz), n, (0.05, 0.096), R["label_electric"], A, P["livery_decal"]),
            decal(f"ff_rating{s}", at(s, -0.13, fy(0.955), dz), n, (0.06, 0.0115), R["label_rating"], A, P["livery_decal"]),
            decal(f"ff_lid{s}", at(s, 0.09, fy(0.6), dz), n, (0.12, 0.088), R["panel_outline"], A, P["livery_decal"]),
            decal(f"ff_plate_txt{s}", at(s, 0.09, fy(0.565), 0.0025), n, (0.05, 0.02), R["nameplate"], A, P["livery_decal"]),
        ], lod="fine", **deco)

    # descent sensor under the housing, front-right (same place as the shared OHT mechanism)
    G.add("obstruction_sensor", "window", "acrylic_black", [box("os_down", (bx / 2 - 0.06, y0 - fs[2] / 2, z0 + bz / 2 - 0.06), (fs[0], fs[2], fs[1]), P["acrylic_black"], bevel=0.003)], **sem)
    return G.finalize(MATREF_CLW)
