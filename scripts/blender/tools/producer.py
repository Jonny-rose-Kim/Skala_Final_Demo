"""
Producer SE based twin-module PECVD tool: exterior GLB (representative, not OEM CAD).

Built parts (instance frame from assets/source/envelopes/producer_se_ccp_twin_300.json):
  mod01_enclosure   twin module MOD-01 skin: separate side / back / front panels with seams, hinged service
                    doors (hinges, handles, viewing window), louvered vents, top gas box and twin RF boxes,
                    recessed kick plate, leveling feet. Cover (hidden in the inspection modes).
  tool_enclosure    mainframe skin around the load lock and the transfer chamber (cover) + base kick plate.
  mod02_enclosure / mod03_enclosure   geometry-only twin modules beside the transfer chamber (not covers).
  idle_load_ports   LP2 / LP3 frame plates, closed port doors, decks, columns, status lamps (idle).
"""
from common import MATREF, Groups, idle_load_port, mainframe_skin, module_skin


def build(env, P):
    G = Groups()
    st = env["station"]
    F = st["floorY"]
    m = env["mod01"]
    tc = st["tc"]
    # twin module MOD-01 around cells A / B, opening for the transfer chamber
    module_skin(G, P, "mod01_enclosure", m["x0"], m["x1"], m["z0"], m["z1"], F, m["y1"], cover=True, tc_cut=(-tc["halfWidth"] - 0.012, tc["halfWidth"] + 0.012, tc["bottomY"] - 0.012, tc["topY"] + 0.012))
    # mainframe skin over load lock + transfer chamber (cover), up to the EFEM back wall
    mainframe_skin(G, P, st["efem"]["x1"] + 0.004, m["x0"] - 0.004, 0.42, F, 0.56)
    # idle twin modules (geometry only, never covers)
    for im in env["idleModules"]:
        cx, _, cz = im["center"]
        sx, sy, sz = im["size"]
        aid = f"{im['moduleId'].lower().replace('-', '')}_enclosure"
        outward = "-z" if im["facing"][2] > 0 else "+z"
        module_skin(G, P, aid, cx - sx / 2, cx + sx / 2, cz - sz / 2, cz + sz / 2, F, F + sy, cover=False, doors_on=(outward,))
    # idle load ports LP2 / LP3
    for k, z in enumerate(env["idleLoadPortsZ"]):
        idle_load_port(G, P, f"lp{k + 2}", z, st["loadPort"], st["efem"], F)
    return G.finalize(MATREF)
