/**
 * FOUP carrier template (mobile entity). Origin = bottom seating reference (kinematic coupling center);
 * the top handling flange frame is a separate reference (never the same origin as the seat). The door
 * faces +X in the carrier frame. Slots are domain objects; the slot ribs are drawn inside the shell and
 * every slot has its own wafer part, shown only while the carrier's slot map says the slot is occupied.
 * The wafer stack is centered on the seat axis, so the section view cuts shell, ribs and wafers with the
 * same planes through that axis (shell boxes are clipped and capped, wafers are revolved sectors).
 *
 * The door has two scripted joints (pull, lower) that mirror the load-port door opener: the port door
 * holds the FOUP door, so both are driven by the same scenario value. The FOUP is closed during OHT
 * transport.
 */
import type { EquipmentBundle } from "../../domain/registry";
import type { AssemblyDef, ComponentDef, EquipmentTemplate, JointDef, PortDef } from "../../domain/types";
import type { PartGeometry } from "../../geometry/chamberParts";
import { boxSectionCaps, chamferedBox, mergeMeshData, revolveCaps, revolveProfile, rotateYMeshData, translateMeshData, type MeshData, type SectionBox } from "../../geometry/meshlib";
import { PartSink, chamfRect } from "../../geometry/sharedParts";
import { waferHalfProfiles } from "../../geometry/waferParts";
import type { CameraPreset } from "../../scene/cameraPresets";
import { DEG } from "../../config/geometry";
import { DEMO_WAFER } from "../../domain/materialFlow";
import { OHT_CONFIG, OHT_LAYOUT, type OhtLayout } from "../oht/layout";

export const FOUP_TEMPLATE_ID = "foup_carrier_300";

const mm = (label: string, valueM: number) => ({ label, valueM });

/** Slot index (1-based) of a slot id like "slot-13". */
export function slotIndex(slotId: string): number {
  const m = /(\d+)$/.exec(slotId);
  return m ? Number(m[1]) : 1;
}

/** Slot id of a 1-based slot index, in the format of the carrier slot map ("slot-13"). */
export function foupSlotId(index: number): string {
  return `slot-${index}`;
}

/** Wafer bottom height of a slot above the seat (carrier frame). */
export function foupSlotY(L: OhtLayout, slot: number): number {
  return L.cfg.foup.slot1_height + (slot - 1) * L.cfg.foup.slot_pitch;
}

const ASSEMBLIES: AssemblyDef[] = [{ id: "carrier", name: "FOUP (closed carrier)", description: "Shell, front door, top handling flange, bottom seating interface, internal slot ribs. Slot 점유는 carrier state이며 wafer는 door가 열렸을 때나 FOUP 단면 보기에서 보인다", order: 1 }];

const FOUP_JOINTS = (L: OhtLayout): JointDef[] => {
  const f = L.cfg.foup;
  const doorCenterY = f.opening_bottom_y + f.opening_size[1] / 2;
  return [
    { jointId: "foup_door_pull", name: "FOUP door pull (by the load-port opener)", kind: "prismatic", origin: [f.door_face_x, doorCenterY, 0], axis: [1, 0, 0], range: [0, 0.2], unit: "m", homeNote: "0 = 닫힘·latch, 양수 = load port door opener가 EFEM 쪽(+X)으로 당김. Opener 값과 같다" },
    { jointId: "foup_door_lower", name: "FOUP door lower (by the load-port opener)", parentJointId: "foup_door_pull", kind: "prismatic", origin: [0, 0, 0], axis: [0, -1, 0], range: [0, 0.5], unit: "m", homeNote: "0 = opening 높이, 양수 = 아래로 내림" },
  ];
};

const COMPONENTS: ComponentDef<OhtLayout>[] = [
  {
    assetId: "foup_body",
    nodeKey: "carrier.body",
    name: "FOUP shell + slot ribs",
    kind: "carrier",
    assembly: "carrier",
    description: "25-slot 300 mm FOUP의 shell. 안쪽 양 벽에 slot rib(25쌍)이 있고 side handle이 붙어 있다. 운반 중에는 door가 닫혀 wafer를 노출하지 않는다. FOUP 단면 보기는 seat 축을 지나는 평면으로 shell을 잘라 slot과 wafer를 보여 주며, 몇 장이 들었는지는 carrier state의 slot map과 같다.",
    materialRef: "foup_polymer",
    materialNote: "Polycarbonate / PEEK shell (가정)",
    selectable: true,
    explode: { dir: [0, 0, 0], distance: 0 },
    cutaway: "sector",
    shell: true,
    dimensions: (L) => [mm("Depth (door to back)", L.cfg.foup.body_size[0]), mm("Height", L.cfg.foup.body_size[1]), mm("Width", L.cfg.foup.body_size[2]), mm("Slot pitch", L.cfg.foup.slot_pitch), { label: "Slots (count)", valueM: L.cfg.foup.slot_count }],
    assumptions: ["300 mm / 25 slot FOUP는 가상 설계의 시작값이며 특정 제품 규격이 아니다.", "Wafer stack 중심은 seat(kinematic coupling) 중심과 같은 수직선에 있다고 가정한다."],
    label: { text: "FOUP", priority: 9 },
  },
  {
    assetId: "foup_door",
    nodeKey: "carrier.door",
    name: "Front door",
    kind: "access",
    assembly: "carrier",
    parentAssetId: "foup_body",
    description: "Load port의 door opener가 latch key로 잡아 EFEM 안으로 당긴 뒤 내리는 전면 door(+X). Opener 동작과 같은 scripted 값으로 움직이며 OHT 반송 중에는 닫혀 있다.",
    materialRef: "polymer_white",
    materialNote: "Polymer door with latch keyholes (가정)",
    selectable: true,
    explode: { dir: [1, 0, 0], distance: 0.25 },
    cutaway: "sector",
    shell: true,
    jointId: "foup_door_lower",
    dimensions: (L) => [mm("Door thickness", L.cfg.foup.door_thickness), mm("Opening width", L.cfg.foup.opening_size[0]), mm("Opening height", L.cfg.foup.opening_size[1])],
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
    cutaway: "sector",
    dimensions: (L) => [mm("Flange width", L.cfg.foup.flange_size[0]), mm("Flange height above seat", L.foup.seatToFlangeTop)],
  },
  {
    assetId: "foup_coupling",
    nodeKey: "carrier.bottom_coupling",
    name: "Bottom seating interface (kinematic coupling)",
    kind: "carrier",
    assembly: "carrier",
    parentAssetId: "foup_body",
    description: "Load port dock plate의 3개 pin에 맞물리는 바닥 coupling groove pad. Carrier의 seat frame(origin)은 여기 있다.",
    materialRef: "polymer_white",
    materialNote: "Kinematic coupling pads (가정)",
    selectable: true,
    explode: { dir: [0, -1, 0], distance: 0.15 },
    cutaway: "sector",
    dimensions: (L) => [mm("Pad size", L.cfg.foup.coupling_pad_size)],
  },
  {
    assetId: "foup_wafer",
    nodeKey: "carrier.slot_wafer",
    name: "Wafers in slots",
    kind: "wafer",
    assembly: "carrier",
    parentAssetId: "foup_body",
    description: "Slot마다 wafer 표시가 하나씩 있고, carrier state의 slot map에서 점유된 slot의 wafer만 보인다. Demo wafer(W-01)는 holder가 carrier_slot일 때 reserved slot에 보인다. Slot rib이 wafer edge를 받친다. Door가 닫혀 있으면 FOUP 단면 보기나 x-ray로 안을 본다. Slot map은 scripted presentation이며 load port mapping sensor 값이 아니다.",
    materialRef: "silicon_wafer",
    materialNote: "Presentation of the slot wafers",
    selectable: true,
    explode: { dir: [1, 0, 0], distance: 0.15 },
    cutaway: "sector",
    dimensions: (L) => [mm("Slot 1 wafer height above seat", foupSlotY(L, 1)), mm("Slot pitch", L.cfg.foup.slot_pitch), { label: "Slots (count)", valueM: L.cfg.foup.slot_count }],
  },
];

const PORTS: PortDef[] = [
  { portId: "seat", assetId: "foup_coupling", medium: "carrier", role: "bidirectional", name: "Seat (bottom reference)" },
  { portId: "flange", assetId: "foup_flange", medium: "carrier", role: "bidirectional", name: "Handling flange (top reference)" },
  { portId: "door", assetId: "foup_door", medium: "wafer", role: "bidirectional", name: "Door interface" },
  { portId: "slot", assetId: "foup_wafer", medium: "wafer", role: "bidirectional", name: "Slot support" },
];

export function buildFoupTemplate(L: OhtLayout = OHT_LAYOUT): EquipmentTemplate<OhtLayout> {
  return {
    templateId: FOUP_TEMPLATE_ID,
    templateRevision: "1.2.0",
    family: "CARRIER",
    displayName: "FOUP",
    title: "300 mm FOUP carrier (closed), 25 slots",
    assemblies: ASSEMBLIES,
    components: COMPONENTS,
    ports: PORTS,
    connections: [{ connectionId: "wafer.slot-door", kind: "wafer", from: { assetId: "foup_wafer", portId: "slot" }, to: { assetId: "foup_door", portId: "door" }, description: "Slot wafer passes the door opening only when the door is open" }],
    joints: FOUP_JOINTS(L),
    facts: [
      { label: "Carrier identity", value: "FOUP-01 (persistent)", note: "Holder(station / gripper)는 일시적 attachment이며 ID와 별개" },
      { label: "Door", value: "Closed during transport", note: "Load port에 dock된 뒤 door opener가 연다" },
      { label: "Slots", value: `${L.cfg.foup.slot_count} (pitch ${(L.cfg.foup.slot_pitch * 1000).toFixed(0)} mm)`, note: "Reserved slot과 현재 점유는 별도 정보. 점유는 FOUP 단면을 켰을 때 왼쪽 위 상자의 slot map에 나온다" },
    ],
    waferPresentationAssetIds: ["foup_wafer"],
  };
}

/** Chamfered box kept together with its extents, so the section view can cap it where a cut plane crosses it. */
interface SolidBox {
  md: MeshData;
  box: SectionBox;
}

export function buildFoupParts(L: OhtLayout): PartGeometry[] {
  const sink = new PartSink();
  const f = L.cfg.foup;
  const [, h, d] = f.body_size;
  const xb = f.door_face_x - f.body_size[0];
  const xr = f.door_face_x - f.frame_rim;
  const wt = f.wall_thickness;
  const hz = d / 2;
  const y0 = 0.012;
  const box = (x0: number, x1: number, yy0: number, yy1: number, z0: number, z1: number, c = 0.003): SolidBox => ({
    md: chamferedBox([x1 - x0, yy1 - yy0, z1 - z0], Math.min(c, (x1 - x0) / 4, (yy1 - yy0) / 4, (z1 - z0) / 4), [(x0 + x1) / 2, (yy0 + yy1) / 2, (z0 + z1) / 2]),
    box: { min: [x0, yy0, z0], max: [x1, yy1, z1] },
  });
  const solid = (list: SolidBox[]) => ({ md: mergeMeshData(list.map((b) => b.md)), boxes: list.map((b) => b.box) });
  // shell: back, sides, top, bottom (hollow so the slots read when the door is open), front rim around the opening
  const op = { y0: f.opening_bottom_y, y1: f.opening_bottom_y + f.opening_size[1], z: f.opening_size[0] / 2 };
  const shell = solid([
    box(xb, xb + wt, y0, h, -hz, hz, 0.012),
    box(xb, xr, y0, h, -hz, -hz + wt, 0.006),
    box(xb, xr, y0, h, hz - wt, hz, 0.006),
    box(xb, xr, h - wt, h, -hz, hz, 0.01),
    box(xb, xr, y0, y0 + wt, -hz, hz, 0.004),
    box(xr, f.door_face_x, y0, op.y0, -hz, hz, 0.004),
    box(xr, f.door_face_x, op.y1, h, -hz, hz, 0.004),
    box(xr, f.door_face_x, op.y0, op.y1, -hz, -op.z, 0.003),
    box(xr, f.door_face_x, op.y0, op.y1, op.z, hz, 0.003),
  ]);
  // side handles and stiffening ribs
  const [hl, hh, hd] = f.handle_size;
  const handles: SolidBox[] = [];
  for (const s of [-1, 1]) {
    handles.push(box(-hl / 2 - 0.02, hl / 2 - 0.02, h * 0.62, h * 0.62 + hh, s > 0 ? hz : -hz - hd, s > 0 ? hz + hd : -hz, 0.006));
    for (const x of [-hl / 2 - 0.02, hl / 2 - 0.02]) handles.push(box(x - 0.01, x + 0.01, h * 0.62 - 0.03, h * 0.62 + hh, s > 0 ? hz : -hz - hd * 0.6, s > 0 ? hz + hd * 0.6 : -hz, 0.003));
  }
  for (const x of [xb + 0.08, xb + 0.2, xb + 0.32]) handles.push(box(x - 0.006, x + 0.006, h - 0.002, h + 0.004, -hz + 0.03, hz - 0.03, 0.002));
  const handleSet = solid(handles);
  sink.clipped("shell", "foup_body", "foup_polymer", shell.md, shell.boxes);
  sink.clipped("handles", "foup_body", "foup_polymer", handleSet.md, handleSet.boxes);
  // slot ribs (25 pairs) on the inner side walls; the wafer edge rests on their top
  const ribs: SolidBox[] = [];
  const rib0 = hz - wt;
  const ribIn = rib0 - f.slot_rib_depth;
  for (let k = 1; k <= f.slot_count; k++) {
    const y = foupSlotY(L, k);
    for (const s of [-1, 1]) ribs.push(box(f.wafer_center_x - 0.13, f.wafer_center_x + 0.11, y - 0.0018, y, s > 0 ? ribIn : -rib0, s > 0 ? rib0 : -ribIn, 0.0006));
  }
  const ribSet = solid(ribs);
  // the ribs stay opaque in x-ray so the slots still read through the translucent shell
  sink.clipped("slot_ribs", "foup_body", "polymer_white", ribSet.md, ribSet.boxes, { castShadow: false, lod: "fine", alwaysOpaque: true });
  // door (follows the opener through its joints)
  const door = box(f.door_face_x - f.door_thickness, f.door_face_x, op.y0 + 0.004, op.y1 - 0.004, -op.z + 0.004, op.z - 0.004, 0.006);
  const keys: MeshData[] = [];
  for (const z of [-0.1, 0.1]) {
    const k = revolveProfile(chamfRect(0, 0.012, 0, 0.004, 0.001), { segments: 20 });
    for (let i = 0; i < k.positions.length; i += 3) {
      const x = k.positions[i];
      const yy = k.positions[i + 1];
      const zz = k.positions[i + 2];
      k.positions[i] = yy + f.door_face_x - 0.0005;
      k.positions[i + 1] = zz + (op.y0 + op.y1) / 2;
      k.positions[i + 2] = x + z;
      const nx = k.normals[i];
      const ny = k.normals[i + 1];
      const nz = k.normals[i + 2];
      k.normals[i] = ny;
      k.normals[i + 1] = nz;
      k.normals[i + 2] = nx;
    }
    keys.push(k);
  }
  sink.clipped("door", "foup_door", "polymer_white", door.md, [door.box], { jointId: "foup_door_lower" });
  sink.clipped("door_keys", "foup_door", "painted_dark", mergeMeshData(keys), null, { jointId: "foup_door_lower", castShadow: false, lod: "fine" });
  // top flange on a neck (the neck is coaxial with the seat, so its caps are the revolve profile)
  const neckProfile = chamfRect(0, f.flange_neck_radius, h, h + f.flange_neck_height, 0.002);
  const neck = revolveProfile(neckProfile, { segments: 24 });
  const fy = h + f.flange_neck_height;
  const flange = box(-f.flange_size[0] / 2, f.flange_size[0] / 2, fy, fy + f.flange_size[1], -f.flange_size[2] / 2, f.flange_size[2] / 2, 0.002);
  sink.clipped("flange", "foup_flange", "polymer_white", mergeMeshData([neck, flange.md]), (kept) => mergeMeshData([boxSectionCaps([flange.box], kept), revolveCaps(neckProfile, kept)]));
  // bottom coupling pads (grooves for the dock pins) and a base rim
  const pads: MeshData[] = [];
  for (const [px, pz] of f.coupling_pad_positions) {
    const pad = chamferedBox([f.coupling_pad_size, f.coupling_pad_height, f.coupling_pad_size * 0.6], 0.001, [0, f.coupling_pad_height / 2, 0]);
    rotateYMeshData(pad, Math.atan2(pz, px));
    pads.push(translateMeshData(pad, px, 0, pz));
  }
  const baseRim = box(xb + 0.03, xr - 0.02, 0.0005, y0, -hz + 0.03, hz - 0.03, 0.002);
  sink.clipped("coupling", "foup_coupling", "polymer_white", mergeMeshData([...pads, baseRim.md]), [baseRim.box], { castShadow: false });
  // one wafer per slot; the scene shows the ones the carrier slot map marks occupied
  const rWafer = DEMO_WAFER.diameterM / 2;
  for (let k = 1; k <= f.slot_count; k++) {
    const wh = waferHalfProfiles(rWafer, foupSlotY(L, k), DEMO_WAFER.thicknessM, false);
    const opts = { segments: 96, castShadow: false, axisXZ: [f.wafer_center_x, 0] as [number, number], presenceKey: foupSlotId(k) };
    sink.sector(`slot_wafer_${k}`, "foup_wafer", "silicon_wafer", wh.back, opts);
    sink.sector(`slot_wafer_${k}_front`, "foup_wafer", "wafer_front", wh.front, opts);
  }
  return sink.parts;
}

/** Section through the seat axis that removes the back half (door kept): the view from the aisle looks into the slots. */
export const FOUP_SECTION = { azimuthDeg: 180, sweepDeg: 180 };

export const FOUP_PRESETS: CameraPreset[] = [
  { id: "overview", label: "FOUP close-up", labelKo: "FOUP 근접", alpha: 215 * DEG, beta: 62 * DEG, radius: 1.3, target: [0, 0.2, 0] },
  { id: "section", label: "FOUP section (wafer stack)", labelKo: "FOUP 단면 (slot과 wafer)", alpha: 196 * DEG, beta: 76 * DEG, radius: 0.85, target: [0, 0.19, 0], viewMode: "cutaway", cutaway: FOUP_SECTION },
];

export const FOUP_BUNDLE: EquipmentBundle<OhtLayout> = {
  template: buildFoupTemplate(),
  layout: OHT_LAYOUT,
  geometry: { geometryRevision: OHT_CONFIG.geometry_revision, kind: OHT_CONFIG.source.kind, note: "FOUP 치수는 OHT bay config의 foup 블록에서 온다 (가정값)." },
  buildParts: buildFoupParts,
  cutawayKeepOuts: [],
  cutawayDefault: FOUP_SECTION,
  cameraPresets: FOUP_PRESETS,
  overviewPresetId: "overview",
  measurement: { templateId: FOUP_TEMPLATE_ID, seedRevision: "foup-meas-seed-1", instruments: [], installations: [], points: [], channels: [], pointBindings: [], sourceBindings: [], calibrations: [] },
  validate: () => ({ errors: [], warnings: [] }),
  carrierFrames: { seatLocal: [0, 0, 0], flangeLocal: [0, OHT_LAYOUT.foup.seatToFlangeTop, 0], doorFacingLocal: [1, 0, 0] },
  carrierSlots: { count: OHT_CONFIG.foup.slot_count, slotId: foupSlotId },
};
