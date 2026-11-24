/**
 * Writes the derived whole-tool dimensions (instance frame, metres) that the Blender builders need, so the
 * exterior GLBs follow the same config as the procedural interiors. Run: npm run assets:envelopes
 *   assets/source/envelopes/<templateId>.json
 * Instance frame: +Y up, left-handed (Babylon); the Blender builder maps it with inst_to_blender().
 */
import fs from "node:fs";
import path from "node:path";
import { PRODUCER_LAYOUT } from "../../src/equipment/producer/layout";
import { PRODUCER_TEMPLATE_ID } from "../../src/equipment/producer/template";
import type { HandlingStationLayout } from "../../src/equipment/handling/stationLayout";
import { TACTRAS_LAYOUT } from "../../src/equipment/tactras/layout";
import { CELLESTA_LAYOUT } from "../../src/equipment/cellesta/layout";
import { CELLESTA_TEMPLATE_ID } from "../../src/equipment/cellesta/template";
import { TACTRAS_TEMPLATE_ID } from "../../src/equipment/tactras/template";

const OUT = path.resolve("assets/source/envelopes");
fs.mkdirSync(OUT, { recursive: true });

/** Station pieces in the instance frame (station runs toward -X for these tools: x = -r, z = -q). */
function stationEnvelope(S: HandlingStationLayout) {
  if (Math.abs(S.az - Math.PI) > 1e-6) throw new Error("envelope export assumes a station toward -X (azimuth 180 deg)");
  return {
    floorY: S.floorY,
    efem: { x0: -S.efem.r1, x1: -S.efem.r0, halfWidth: S.efem.width / 2, topY: S.efem.topY, ffuTopY: S.efem.ffuTopY },
    loadPort: { x0: -S.loadPort.deckR1, x1: -S.loadPort.deckR0, deckTopY: S.loadPort.deckTopY, deckWidth: S.loadPort.deckWidth, openingY0: S.loadPort.opening.y0, openingY1: S.loadPort.opening.y1, openingWidth: S.loadPort.opening.width, seatX: S.seat[0] },
    loadLock: { x0: -S.ll.r1, x1: -S.ll.r0, halfWidth: S.ll.width / 2, bottomY: S.ll.bottomY, topY: S.ll.topY },
    tc: S.tc ? { x0: -S.tc.r1, x1: -S.tc.r0, halfWidth: S.tc.width / 2, bottomY: S.tc.bottomY, topY: S.tc.topY } : null,
    slit: { x0: -S.slit.valveR1, x1: -S.slit.valveR0, y0: S.slit.y0, y1: S.slit.y1, width: S.slit.width, valveBottomY: S.slit.centerY - S.slit.valveSize[1] / 2, valveTopY: S.slit.centerY + S.slit.valveSize[1] / 2 },
  };
}

function write(templateId: string, data: unknown) {
  const file = path.join(OUT, `${templateId}.json`);
  fs.writeFileSync(file, JSON.stringify({ templateId, generatedBy: "scripts/assets/export-envelopes.ts", units: "m", frame: "instance (+Y up, Babylon left-handed)", ...(data as object) }, null, 2));
  console.log("wrote", path.relative(process.cwd(), file));
}

{
  const L = PRODUCER_LAYOUT;
  write(PRODUCER_TEMPLATE_ID, {
    station: stationEnvelope(L.station),
    cell: { rOuter: L.rOuter, wallTopY: L.wallTopY, cellB: L.tool.cellB },
    mod01: L.tool.mod01,
    idleModules: L.tool.idleModules,
    idleLoadPortsZ: L.tool.idleLoadPortsQ.map((q) => -q),
  });
}

{
  const L = TACTRAS_LAYOUT;
  write(TACTRAS_TEMPLATE_ID, {
    station: stationEnvelope(L.station),
    chamber: { rOuter: L.rOuter, lidTopY: L.lidTopY },
    pm01: L.tool.pm01,
    idleModules: L.tool.idleModules,
    idleLoadPortsZ: L.tool.idleLoadPortsQ.map((q) => -q),
  });
}

{
  const L = CELLESTA_LAYOUT;
  const fe = L.cfg.front_end;
  const pm = L.pm;
  write(CELLESTA_TEMPLATE_ID, {
    floorY: L.floorY,
    efem: { x0: -L.efem.r1, x1: -L.efem.r0, centerZ: -L.efem.qc, halfWidth: L.efem.width / 2, topY: L.efem.topY, ffuTopY: L.efem.ffuTopY },
    loadPort: { x0: -L.loadPort.deckR1, x1: -L.loadPort.deckR0, deckTopY: L.loadPort.deckTopY, deckWidth: L.loadPort.deckWidth, openingY0: L.loadPort.opening.y0, openingY1: L.loadPort.opening.y1, openingWidth: L.loadPort.opening.width, seatX: L.seat[0] },
    idleLoadPortsZ: fe.load_ports_z.filter((_, i) => i !== fe.active_load_port_index),
    corridor: { x0: fe.corridor.x0, x1: fe.corridor.x1, halfZ: fe.corridor.half_z },
    pm: { x0: pm.box.x0, x1: pm.box.x1, z0: pm.box.z0, z1: pm.box.z1, top: pm.box.top_y },
    shutter: { width: pm.shutter.width, y0: pm.shutter.center_y - pm.shutter.height / 2, y1: pm.shutter.center_y + pm.shutter.height / 2 },
    tool: L.tool,
  });
}
