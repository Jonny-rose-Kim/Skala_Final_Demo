"""
Shared exterior pieces of the cluster tools (module cabinets, mainframe skins, idle load ports) and the
node grouping that joins pieces per (assetId, group, material) into one tagged GLB node.
"""
from lib import box, cyl, door, leveling_foot, louver, panel_grid, tag, join


class Groups:
    """Collects objects per (assetId, group, material) and joins them into one tagged node each."""

    def __init__(self):
        self.items = {}

    def add(self, assetId, group, matkey, objs, **sem):
        objs = objs if isinstance(objs, list) else [objs]
        if not objs:
            return
        key = (assetId, group, matkey)
        self.items.setdefault(key, {"objs": [], "sem": sem})["objs"].extend(objs if isinstance(objs, list) else [objs])

    def finalize(self, materialRefs):
        out = []
        for (assetId, group, matkey), v in sorted(self.items.items()):
            partKey = f"{assetId}.{group}.{matkey}"
            ob = join(v["objs"], partKey)
            tag(ob, assetId, partKey, materialRefs.get(matkey, "painted_offwhite"), **v["sem"])
            out.append(ob)
        return out


MATREF = {
    "paint_offwhite": "painted_offwhite",
    "paint_lightgray": "polymer_gray",
    "paint_graphite": "painted_dark",
    "stainless": "stainless",
    "aluminum": "aluminum_machined",
    "rubber": "rubber_membrane",
    "glass_smoke": "quartz",
    "lamp_green": "polymer_white",
    "lamp_amber": "polymer_white",
    "lamp_red": "polymer_white",
    "lamp_blue": "polymer_white",
    "screen": "painted_dark",
}


def module_skin(G, P, assetId, x0, x1, z0, z1, y0, y1, cover, tc_cut=None, doors_on=("-z", "+z"), facing=None, top_boxes=True):
    """Twin-module style cabinet. tc_cut = (zmin, zmax, ymin, ymax) opening on the -x face for the transfer chamber."""
    F = y0
    kick = 0.08
    yb = F + kick
    sem = dict(cover=cover)
    pm = {"panel": P["paint_offwhite"], "metal": P["stainless"], "glass": P["glass_smoke"], "dark": P["paint_graphite"], "rubber": P["rubber"]}
    # recessed kick plate (graphite) and corner posts
    G.add(assetId, "kick", "paint_graphite", [box(f"{assetId}_kick", ((x0 + x1) / 2, F + kick / 2 + 0.01, (z0 + z1) / 2), (x1 - x0 - 0.06, kick - 0.02, z1 - z0 - 0.06), P["paint_graphite"], bevel=0.003)], **sem)
    posts = []
    for (px, pz) in ((x0, z0), (x0, z1), (x1, z0), (x1, z1)):
        posts.append(box(f"{assetId}_post{px:.2f}{pz:.2f}", (px, (yb + y1) / 2, pz), (0.04, y1 - yb, 0.04), P["paint_lightgray"], bevel=0.006))
    G.add(assetId, "frame", "paint_lightgray", posts, **sem)
    # side faces with service doors
    for face in ("-z", "+z"):
        plane = z0 if face == "-z" else z1
        if face in doors_on:
            nd = 2 if (x1 - x0) > 1.0 else 1
            w = (x1 - x0 - 0.06) / nd
            for k in range(nd):
                a0 = x0 + 0.03 + k * w + 0.004
                a1 = a0 + w - 0.008
                win = (a0 + 0.12, a1 - 0.12, yb + (y1 - yb) * 0.55, yb + (y1 - yb) * 0.82) if (k == 0 and face == "-z") else None
                parts = door(f"{assetId}{face}d{k}", face, a0, a1, yb + 0.01, yb + (y1 - yb) * 0.88, plane, pm, hinge="start" if k == 0 else "end", window=win)
                G.add(assetId, "doors", "paint_offwhite", [parts[0]], **sem)
                G.add(assetId, "hardware", "stainless", [p for p in parts[1:] if "window" not in p.name], **sem)
                G.add(assetId, "windows", "glass_smoke", [p for p in parts[1:] if "window" in p.name], **dict(sem, pickable=False, castShadow=False, isGlass=True))
            G.add(assetId, "panels", "paint_offwhite", panel_grid(f"{assetId}{face}top", x0 + 0.02, x1 - 0.02, yb + (y1 - yb) * 0.88 + 0.004, y1, z0, z1, face, max(1, int((x1 - x0) / 0.7)), 1, P["paint_offwhite"]), **sem)
        else:
            G.add(assetId, "panels", "paint_offwhite", panel_grid(f"{assetId}{face}", x0 + 0.02, x1 - 0.02, yb, y1, z0, z1, face, max(1, int((x1 - x0) / 0.6)), 2, P["paint_offwhite"]), **sem)
    # back (+x) with louvered vents high up
    G.add(assetId, "panels", "paint_offwhite", panel_grid(f"{assetId}+x", x0, x1, yb, y1, z0 + 0.02, z1 - 0.02, "+x", max(1, int((z1 - z0) / 0.6)), 2, P["paint_offwhite"]), **sem)
    pmv = {"metal": P["stainless"], "dark": P["paint_graphite"]}
    nv = max(1, int((z1 - z0) / 0.9))
    for k in range(nv):
        a0 = z0 + (z1 - z0) * k / nv + 0.12
        a1 = z0 + (z1 - z0) * (k + 1) / nv - 0.12
        vparts = louver(f"{assetId}vent{k}", "+x", a0, a1, y1 - 0.32, y1 - 0.12, x1 + 0.012, pmv)
        G.add(assetId, "vents", "paint_graphite", [p for p in vparts if "slat" in p.name], **sem)
        G.add(assetId, "hardware", "stainless", [p for p in vparts if "frame" in p.name], **sem)
    # front (-x): panels around the transfer-chamber opening
    if tc_cut:
        c0, c1, cy0, cy1 = tc_cut
        G.add(assetId, "panels", "paint_offwhite", panel_grid(f"{assetId}-xL", x0, x1, yb, y1, z0 + 0.02, c0, "-x", 1, 2, P["paint_offwhite"]), **sem)
        G.add(assetId, "panels", "paint_offwhite", panel_grid(f"{assetId}-xR", x0, x1, yb, y1, c1, z1 - 0.02, "-x", max(1, int((z1 - 0.02 - c1) / 0.6)), 2, P["paint_offwhite"]), **sem)
        G.add(assetId, "panels", "paint_offwhite", panel_grid(f"{assetId}-xB", x0, x1, yb, cy0, c0, c1, "-x", 1, 1, P["paint_offwhite"]), **sem)
        G.add(assetId, "panels", "paint_offwhite", panel_grid(f"{assetId}-xT", x0, x1, cy1, y1, c0, c1, "-x", 1, 1, P["paint_offwhite"]), **sem)
    else:
        G.add(assetId, "panels", "paint_offwhite", panel_grid(f"{assetId}-x", x0, x1, yb, y1, z0 + 0.02, z1 - 0.02, "-x", max(1, int((z1 - z0) / 0.6)), 2, P["paint_offwhite"]), **sem)
    # top skin
    G.add(assetId, "top", "paint_offwhite", panel_grid(f"{assetId}top", x0, x1, y1 - 0.012, y1, z0, z1, "+y", max(1, int((x1 - x0) / 0.7)), max(1, int((z1 - z0) / 0.7)), P["paint_offwhite"]), **sem)
    if top_boxes:
        # gas box (louvered cabinet) along the module, two RF / match boxes, exhaust duct stubs
        gx0, gx1 = x0 + 0.08, x0 + 0.08 + min(0.55, (x1 - x0) * 0.4)
        G.add(assetId, "topboxes", "paint_lightgray", [box(f"{assetId}gasbox", ((gx0 + gx1) / 2, y1 + 0.17, (z0 + z1) / 2), (gx1 - gx0, 0.34, (z1 - z0) * 0.7), P["paint_lightgray"], bevel=0.008, segments=3)], **sem)
        gparts = louver(f"{assetId}gasvent", "-x", (z0 + z1) / 2 - (z1 - z0) * 0.25, (z0 + z1) / 2 + (z1 - z0) * 0.25, y1 + 0.08, y1 + 0.28, gx0, pmv)
        G.add(assetId, "vents", "paint_graphite", [p for p in gparts if "slat" in p.name], **sem)
        G.add(assetId, "hardware", "stainless", [p for p in gparts if "frame" in p.name], **sem)
        rx0 = gx1 + 0.12
        rx1 = min(x1 - 0.08, rx0 + 0.42)
        for k, zc in enumerate((z0 + (z1 - z0) * 0.27, z0 + (z1 - z0) * 0.73)):
            G.add(assetId, "topboxes", "paint_lightgray", [box(f"{assetId}rf{k}", ((rx0 + rx1) / 2, y1 + 0.12, zc), (rx1 - rx0, 0.24, 0.42), P["paint_lightgray"], bevel=0.008, segments=3)], **sem)
            G.add(assetId, "hardware", "stainless", [cyl(f"{assetId}rfcon{k}", (rx1 + 0.02, y1 + 0.12, zc), 0.022, 0.04, "x", P["stainless"], segments=20)], **sem)
        for k, zc in enumerate((z0 + 0.15, z1 - 0.15)):
            G.add(assetId, "hardware", "stainless", [cyl(f"{assetId}duct{k}", (x1 - 0.12, y1 + 0.2, zc), 0.06, 0.4, "y", P["stainless"], segments=28)], **sem)
    # leveling feet
    feet = []
    for (px, pz) in ((x0 + 0.06, z0 + 0.06), (x0 + 0.06, z1 - 0.06), (x1 - 0.06, z0 + 0.06), (x1 - 0.06, z1 - 0.06)):
        feet += leveling_foot(f"{assetId}foot{px:.2f}{pz:.2f}", px, pz, F, pm, h=0.05)
    G.add(assetId, "feet", "stainless", [f for f in feet if "pad" not in f.name], **sem)
    G.add(assetId, "feet", "rubber", [f for f in feet if "pad" in f.name], **sem)


def idle_load_port(G, P, name, z, lp, efem, F):
    """Idle load port: frame plate on the EFEM front, closed port door, deck, column, status lamps."""
    w = 0.48
    x_face = efem["x0"]
    sem = dict(cover=False)
    G.add("idle_load_ports", "frame", "paint_offwhite", [box(f"{name}_frame", (x_face - 0.015, (F + 0.12 + lp["openingY1"] + 0.18) / 2, z), (0.03, lp["openingY1"] + 0.18 - F - 0.12, w), P["paint_offwhite"], bevel=0.006, segments=3)], **sem)
    G.add("idle_load_ports", "door", "paint_lightgray", [box(f"{name}_portdoor", (x_face - 0.036, (lp["openingY0"] + lp["openingY1"]) / 2, z), (0.012, lp["openingY1"] - lp["openingY0"], lp["openingWidth"]), P["paint_lightgray"], bevel=0.004)], **sem)
    G.add("idle_load_ports", "deck", "stainless", [box(f"{name}_deck", ((lp["x0"] + lp["x1"]) / 2, lp["deckTopY"] - 0.015, z), (lp["x1"] - lp["x0"], 0.03, w - 0.04), P["stainless"], bevel=0.004)], **sem)
    for k, dz in enumerate((-0.12, 0.12)):
        G.add("idle_load_ports", "deck", "stainless", [cyl(f"{name}_pin{k}", ((lp["x0"] + lp["x1"]) / 2 + 0.05 * k, lp["deckTopY"] + 0.006, z + dz), 0.006, 0.012, "y", P["stainless"], segments=12)], **sem)
    G.add("idle_load_ports", "column", "paint_graphite", [box(f"{name}_column", ((lp["x0"] + lp["x1"]) / 2 + 0.08, (F + lp["deckTopY"] - 0.03) / 2, z), (0.14, lp["deckTopY"] - 0.03 - F, 0.3), P["paint_graphite"], bevel=0.005)], **sem)
    for k, mk in enumerate(("lamp_green", "lamp_amber", "lamp_blue")):
        G.add("idle_load_ports", "lamps", mk, [box(f"{name}_led{k}", (x_face - 0.032, lp["openingY1"] + 0.08, z - 0.06 + k * 0.06), (0.004, 0.014, 0.04), P[mk], bevel=0.001, segments=1)], **dict(sem, castShadow=False, lod="fine"))




def mainframe_skin(G, P, mx0, mx1, hz, F, my1):
    """Cabinet skin over the load lock and the transfer chamber (cover), from the EFEM back wall to the module."""
    yb = F + 0.08
    sem = dict(cover=True)
    for face in ("-z", "+z"):
        G.add("tool_enclosure", "mainframe_panels", "paint_offwhite", panel_grid(f"mf{face}", mx0, mx1, yb, my1, -hz, hz, face, max(2, int((mx1 - mx0) / 0.5)), 2, P["paint_offwhite"]), **sem)
    G.add("tool_enclosure", "mainframe_panels", "paint_offwhite", panel_grid("mftop", mx0, mx1, my1 - 0.012, my1, -hz, hz, "+y", max(2, int((mx1 - mx0) / 0.5)), 1, P["paint_offwhite"]), **sem)
    G.add("tool_enclosure", "mainframe_kick", "paint_graphite", [box("mf_kick", ((mx0 + mx1) / 2, F + 0.045, 0), (mx1 - mx0 - 0.04, 0.07, 2 * hz - 0.05), P["paint_graphite"], bevel=0.003)], **sem)
