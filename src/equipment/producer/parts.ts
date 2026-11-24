/**
 * Procedural parts of the Producer SE based tool: cell A (the reused CCP cell with its handling station
 * and transfer chamber), cell B of the same twin module (idle, static copy of the cell's vacuum body,
 * electrode stack and pedestal around its own axis) and the rear facility interface. The tool skins, idle
 * modules, idle load ports and the frame come from the Blender-built GLB (see producer/glb.ts).
 */
import { buildChamberParts, type PartGeometry } from "../../geometry/chamberParts";
import { chamferedBox, mergeMeshData, translateMeshData, type MeshData } from "../../geometry/meshlib/index";
import type { ProducerLayout } from "./layout";

/** Cell assets copied to the idle cell B (static: no joints, no wafer, no plasma). */
export const CELL_B_ASSETS: Record<string, { name: string; kind: "body" | "liner" | "lid" | "electrode" | "insulator" | "support" | "rf" | "gas" | "vacuum" | "frame" }> = {
  chamber_body: { name: "Chamber body", kind: "body" },
  chamber_liner: { name: "Chamber liner", kind: "liner" },
  pumping_baffle: { name: "Pumping baffle", kind: "vacuum" },
  lid: { name: "Lid", kind: "lid" },
  showerhead_backing_plate: { name: "Showerhead backing plate", kind: "electrode" },
  showerhead_faceplate: { name: "Showerhead faceplate", kind: "electrode" },
  showerhead_isolator: { name: "Showerhead isolator ring", kind: "insulator" },
  edge_insulator_ring: { name: "Edge insulator ring", kind: "insulator" },
  pedestal: { name: "Heated pedestal", kind: "support" },
  edge_ring: { name: "Edge ring", kind: "support" },
  pedestal_shaft: { name: "Pedestal shaft", kind: "support" },
  bellows: { name: "Bellows", kind: "support" },
  gas_inlet: { name: "Gas inlet", kind: "gas" },
  rf_stem: { name: "RF stem", kind: "rf" },
  matching_network: { name: "Matching network", kind: "rf" },
};

export const cellBAssetId = (assetId: string) => `cellb_${assetId}`;

function copyMesh(md: MeshData): MeshData {
  return { positions: [...md.positions], normals: [...md.normals], uvs: [...md.uvs], indices: [...md.indices] };
}

/** Static copy of a cell part around the cell B axis (sector parts keep their own section cut). */
function cellBPart(p: PartGeometry, axis: [number, number]): PartGeometry | null {
  if (!(p.assetId in CELL_B_ASSETS)) return null;
  const base = { ...p, key: `cellb_${p.key}`, assetId: cellBAssetId(p.assetId), jointId: undefined, stretch: undefined, presenceKey: undefined, castShadow: p.castShadow, lod: p.lod };
  if (p.cutaway === "sector") return { ...base, axisXZ: axis };
  // azimuth-attached and fixed parts: authored in the instance frame around cell A's axis -> move them over
  const md = p.build([]);
  const moved = translateMeshData(copyMesh(md), axis[0], 0, axis[1]);
  return { ...base, cutaway: "keep", azimuth: undefined, sectorDependent: false, capBuild: undefined, capProfile: undefined, build: () => moved };
}

export function buildProducerParts(L: ProducerLayout): PartGeometry[] {
  const parts = buildChamberParts(L, { enclosure: false });
  const cellB: PartGeometry[] = [];
  for (const p of parts) {
    const q = cellBPart(p, L.tool.cellB);
    if (q) cellB.push(q);
  }
  // rear facility interface of the twin module (gas / RF power / exhaust / coolant bulkhead)
  const m = L.tool.mod01;
  const fy = L.tool.floorY;
  const zc = (m.z0 + m.z1) / 2;
  const plate = chamferedBox([0.04, 0.7, 0.9], 0.004, [m.x1 + 0.02, fy + 0.75, zc]);
  const fittings: MeshData[] = [];
  for (let i = 0; i < 5; i++) {
    fittings.push(chamferedBox([0.06, 0.06, 0.06], 0.004, [m.x1 + 0.07, fy + 0.55 + i * 0.1, zc - 0.25 + (i % 2) * 0.5]));
  }
  const facility: PartGeometry[] = [
    { key: "facility_plate", assetId: "facility_interface", materialRef: "stainless", pickable: true, cutaway: "keep", castShadow: true, sectorDependent: false, build: () => plate },
    { key: "facility_fittings", assetId: "facility_interface", materialRef: "stainless", pickable: true, cutaway: "keep", castShadow: false, sectorDependent: false, lod: "fine", build: () => mergeMeshData(fittings) },
  ];
  return [...parts, ...cellB, ...facility];
}
