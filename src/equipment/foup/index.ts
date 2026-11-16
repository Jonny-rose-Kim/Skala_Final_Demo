/**
 * FOUP carrier template (mobile entity). Origin = bottom seating reference (center of the base); the top
 * handling flange frame is a separate reference (never the same origin as the seat). The door faces +X in
 * the carrier frame. Slots are domain objects (not meshes): the FOUP stays closed in every demonstration.
 */
import type { EquipmentBundle } from "../../domain/registry";
import type { AssemblyDef, ComponentDef, EquipmentTemplate, PortDef } from "../../domain/types";
import type { PartGeometry } from "../../geometry/chamberParts";
import { chamferedBox, mergeMeshData, revolveProfile, translateMeshData, type MeshData } from "../../geometry/meshlib";
import { PartSink, chamfRect } from "../../geometry/sharedParts";
import type { CameraPreset } from "../../scene/cameraPresets";
import { DEG } from "../../config/geometry";
import { OHT_CONFIG, OHT_LAYOUT, type OhtLayout } from "../oht/layout";

export const FOUP_TEMPLATE_ID = "foup_carrier_300";

const mm = (label: string, valueM: number) => ({ label, valueM });

const ASSEMBLIES: AssemblyDef[] = [{ id: "carrier", name: "FOUP (closed carrier)", description: "Body, front door, top handling flange, bottom seating interface. Slot은 domain 객체이며 wafer는 노출되지 않는다", order: 1 }];

const COMPONENTS: ComponentDef<OhtLayout>[] = [
  {
    assetId: "foup_body",
    nodeKey: "carrier.body",
    name: "FOUP body (shell)",
    kind: "carrier",
    assembly: "carrier",
    description: "25-slot 300 mm FOUP의 닫힌 shell. 운반 중 wafer를 노출하지 않는다. Slot 점유는 Inspector의 carrier state에서 확인한다.",
    materialRef: "foup_polymer",
    materialNote: "Polycarbonate / PEEK shell (가정)",
    selectable: true,
    explode: { dir: [0, 0, 0], distance: 0 },
    cutaway: "keep",
    dimensions: (L) => [mm("Width (door side)", L.cfg.foup.body_size[0]), mm("Height", L.cfg.foup.body_size[1]), mm("Depth", L.cfg.foup.body_size[2]), { label: "Slots (count)", valueM: L.cfg.foup.slot_count }],
    assumptions: ["300 mm / 25 slot FOUP는 가상 설계의 시작값이며 특정 제품 규격이 아니다."],
    label: { text: "FOUP", priority: 9 },
  },
  {
    assetId: "foup_door",
    nodeKey: "carrier.door",
    name: "Front door",
    kind: "access",
    assembly: "carrier",
    parentAssetId: "foup_body",
    description: "Load port의 door opener가 여는 전면 door(+X). 이 V1에서는 항상 닫힌 상태로 표시되며 열림은 simplified internal transfer 안에서 가정한다.",
    materialRef: "polymer_white",
    materialNote: "Polymer door with latch keys (가정)",
    selectable: true,
    explode: { dir: [1, 0, 0], distance: 0.25 },
    cutaway: "keep",
    dimensions: (L) => [mm("Door thickness", L.cfg.foup.door_thickness)],
  },
  {
    assetId: "foup_flange",
    nodeKey: "carrier.top_flange",
    name: "Top handling flange",
    kind: "carrier",
    assembly: "carrier",
    parentAssetId: "foup_body",
    description: "OHT gripper가 잡는 상부 handling flange (별도 reference frame). Bottom seating frame과 같은 origin을 쓰지 않는다.",
    materialRef: "polymer_white",
    materialNote: "Polymer flange (가정)",
    selectable: true,
    explode: { dir: [0, 1, 0], distance: 0.2 },
    cutaway: "keep",
    dimensions: (L) => [mm("Flange width", L.cfg.foup.flange_size[0]), mm("Flange height above seat", L.foup.seatToFlangeTop)],
  },
  {
    assetId: "foup_coupling",
    nodeKey: "carrier.bottom_coupling",
    name: "Bottom seating interface (kinematic coupling)",
    kind: "carrier",
    assembly: "carrier",
    parentAssetId: "foup_body",
    description: "Load port deck의 pin에 맞물리는 바닥 coupling pad. Carrier의 seat frame(origin)은 여기 있다.",
    materialRef: "polymer_white",
    materialNote: "Kinematic coupling pads (가정)",
    selectable: true,
    explode: { dir: [0, -1, 0], distance: 0.15 },
    cutaway: "keep",
    dimensions: (L) => [mm("Pad size", L.cfg.foup.coupling_pad_size)],
  },
];

const PORTS: PortDef[] = [
  { portId: "seat", assetId: "foup_coupling", medium: "carrier", role: "bidirectional", name: "Seat (bottom reference)" },
  { portId: "flange", assetId: "foup_flange", medium: "carrier", role: "bidirectional", name: "Handling flange (top reference)" },
  { portId: "door", assetId: "foup_door", medium: "wafer", role: "bidirectional", name: "Door interface" },
];

export function buildFoupTemplate(): EquipmentTemplate<OhtLayout> {
  return {
    templateId: FOUP_TEMPLATE_ID,
    templateRevision: "1.0.0",
    family: "CARRIER",
    displayName: "FOUP",
    title: "300 mm FOUP carrier (closed), 25 slots",
    assemblies: ASSEMBLIES,
    components: COMPONENTS,
    ports: PORTS,
    connections: [],
    joints: [],
    facts: [
      { label: "Carrier identity", value: "FOUP-01 (persistent)", note: "Holder(station / gripper)는 일시적 attachment이며 ID와 별개" },
      { label: "Door", value: "Closed during transport", note: "열림은 load port 측 simplified transfer 안에서만 가정" },
    ],
  };
}

export function buildFoupParts(L: OhtLayout): PartGeometry[] {
  const sink = new PartSink();
  const f = L.cfg.foup;
  const [w, h, d] = f.body_size;
  const body = chamferedBox([w - f.door_thickness - f.door_inset, h, d], 0.012, [-(f.door_thickness + f.door_inset) / 2, h / 2, 0]);
  const ribs: MeshData[] = [];
  for (const dz of [-d / 2 + 0.06, 0, d / 2 - 0.06]) ribs.push(chamferedBox([w - f.door_thickness - f.door_inset + 0.006, 0.03, 0.02], 0.002, [-(f.door_thickness + f.door_inset) / 2, h - 0.05, dz]));
  sink.fixed("body", "foup_body", "foup_polymer", mergeMeshData([body, ...ribs]), { cutaway: "keep" });
  const door = chamferedBox([f.door_thickness, h - 0.04, d - 0.04], 0.004, [w / 2 - f.door_inset - f.door_thickness / 2, h / 2, 0]);
  const latches = mergeMeshData([chamferedBox([0.004, 0.03, 0.03], 0.001, [w / 2 - f.door_inset + 0.002, h / 2 + 0.08, 0.1]), chamferedBox([0.004, 0.03, 0.03], 0.001, [w / 2 - f.door_inset + 0.002, h / 2 - 0.08, -0.1])]);
  sink.fixed("door", "foup_door", "polymer_white", mergeMeshData([door, latches]), { cutaway: "keep" });
  const neck = revolveProfile(chamfRect(0, f.flange_neck_radius, h, h + f.flange_neck_height, 0.002), { segments: 24 });
  const flange = chamferedBox(f.flange_size, 0.002, [0, h + f.flange_neck_height + f.flange_size[1] / 2, 0]);
  sink.fixed("flange", "foup_flange", "polymer_white", mergeMeshData([neck, flange]), { cutaway: "keep" });
  const pads: MeshData[] = [];
  for (const [px, pz] of f.coupling_pad_positions) {
    const pad = chamferedBox([f.coupling_pad_size, f.coupling_pad_height, f.coupling_pad_size], 0.001, [px, f.coupling_pad_height / 2, pz]);
    pads.push(pad);
  }
  const baseRim = chamferedBox([w - 0.06, f.coupling_pad_height, d - 0.06], 0.002, [-(f.door_thickness + f.door_inset) / 2, f.coupling_pad_height / 2 + 0.0005, 0]);
  translateMeshData(baseRim, 0, 0, 0);
  sink.fixed("coupling", "foup_coupling", "polymer_white", mergeMeshData([...pads, baseRim]), { cutaway: "keep", castShadow: false });
  return sink.parts;
}

export const FOUP_PRESETS: CameraPreset[] = [{ id: "overview", label: "FOUP close-up", labelKo: "FOUP 근접", alpha: 215 * DEG, beta: 62 * DEG, radius: 1.3, target: [0, 0.2, 0] }];

export const FOUP_BUNDLE: EquipmentBundle<OhtLayout> = {
  template: buildFoupTemplate(),
  layout: OHT_LAYOUT,
  geometry: { geometryRevision: OHT_CONFIG.geometry_revision, kind: OHT_CONFIG.source.kind, note: "FOUP 치수는 OHT bay config의 foup 블록에서 온다 (가정값)." },
  buildParts: buildFoupParts,
  cutawayKeepOuts: [],
  cutawayDefault: { azimuthDeg: 270, sweepDeg: 90 },
  cameraPresets: FOUP_PRESETS,
  overviewPresetId: "overview",
  measurement: { templateId: FOUP_TEMPLATE_ID, seedRevision: "foup-meas-seed-1", instruments: [], installations: [], points: [], channels: [], pointBindings: [], sourceBindings: [], calibrations: [] },
  validate: () => ({ errors: [], warnings: [] }),
  carrierFrames: { seatLocal: [0, 0, 0], flangeLocal: [0, OHT_LAYOUT.foup.seatToFlangeTop, 0], doorFacingLocal: [1, 0, 0] },
};
