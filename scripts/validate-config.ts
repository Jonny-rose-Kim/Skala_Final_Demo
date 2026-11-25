/**
 * Validates every equipment bundle (geometry config, template references, measurement seed semantics)
 * and the demonstration layout without a browser.
 *   npm run validate:config
 */
import "../src/equipment/index.ts";
import { validateAllBundles, listBundles } from "../src/domain/registry.ts";
import { DEFAULT_INSTANCES, instanceFixture } from "../src/domain/instances.ts";
import type { OhtLayout } from "../src/equipment/oht/layout.ts";
import type { EquipmentInstanceDef } from "../src/domain/types.ts";
import { planTransfer } from "../src/equipment/oht/scenario.ts";
import type { StationWorldFrame } from "../src/presentation/scenario.ts";

let failed = false;
for (const r of validateAllBundles()) {
  const b = listBundles().find((x) => x.template.templateId === r.templateId)!;
  console.log(`${r.templateId} (${b.geometry.geometryRevision}, template rev ${b.template.templateRevision}): ${r.errors.length} error(s), ${r.warnings.length} warning(s)`);
  for (const e of r.errors) console.log(`  ERROR   ${e}`);
  for (const w of r.warnings) console.log(`  WARNING ${w}`);
  if (r.errors.length) failed = true;
}

// Bay layout: every load port must be reachable by the bay's OHT with its implemented degrees of freedom
function checkBay(name: string, defs: EquipmentInstanceDef[]) {
  const stations: Record<string, StationWorldFrame> = {};
  for (const def of defs) {
    const b = listBundles().find((x) => x.template.templateId === def.templateId);
    const st = b?.template.station;
    if (!st) continue;
    const yaw = (def.rotationYDeg * Math.PI) / 180;
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const [lx, ly, lz] = st.seatLocal;
    const id = `LP.${def.instanceId}`;
    stations[id] = { stationId: id, instanceId: def.instanceId, seatWorld: [def.position[0] + lx * cs + lz * sn, def.position[1] + ly, def.position[2] - lx * sn + lz * cs], yawRad: 0, doorFacing: [1, 0, 0] };
  }
  const oht = defs.find((d) => listBundles().find((x) => x.template.templateId === d.templateId)?.template.family === "OHT");
  if (!oht) return;
  const L = listBundles().find((x) => x.template.templateId === oht.templateId)!.layout as OhtLayout;
  console.log(`bay ${name} (${oht.templateId}):`);
  for (const id of Object.keys(stations)) {
    const p = planTransfer(L, oht, stations, id, id);
    console.log(`  station ${id}: s=${p.src.s.toFixed(3)} m, lateral=${(p.src.lateral * 1000).toFixed(1)} mm, hoist ext=${p.src.ext.toFixed(3)} m ${p.blockedReason ? `ERROR ${p.blockedReason}` : "ok"}`);
    if (p.blockedReason) failed = true;
  }
}
checkBay("default", DEFAULT_INSTANCES);
checkBay("legacy-v1", instanceFixture("legacy-v1") ?? []);
if (failed) process.exit(1);
