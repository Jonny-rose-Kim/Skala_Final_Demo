/**
 * CELLESTA-i MD based single-wafer wet clean template: tool -> PM-01 (active, representative clean / rinse /
 * IPA-atmosphere drying module) and PM-02..PM-05 (geometry only) as scoped components of one instance.
 * The CMP polishing structures (platen, pad, carrier head, membrane zones, conditioner, slurry) are not
 * part of this template; only the generic SCARA, EFEM and load-port pieces are shared with the other tools.
 */
import type { AssemblyDef, ComponentDef, ComponentKind, ComponentScope, ConnectionDef, EquipmentTemplate, JointDef, MaterialRef, PortDef, ReferenceNote, ToolModuleDef } from "../../domain/types";
import { scaraRobotComponents, scaraRobotJoints } from "../handling/robotParts";
import { efemComponents, loadPortJoints } from "../handling/stationTemplate";
import { armAngle, type CellestaLayout } from "./layout";
import { atmSpec, trSpec } from "./robots";
import { CELLESTA_JOINTS as J } from "./sequence";

export const CELLESTA_TEMPLATE_ID = "cellesta_i_md_clean_300";
export const CELLESTA_TEMPLATE_REVISION = "1.0.0";

const mm = (label: string, valueM: number) => ({ label, valueM });
const UP = (d: number) => ({ dir: [0, 1, 0] as [number, number, number], distance: d });
const DOWN = (d: number) => ({ dir: [0, -1, 0] as [number, number, number], distance: d });
const PX = (d: number) => ({ dir: [1, 0, 0] as [number, number, number], distance: d });
const NONE = { dir: [0, 0, 0] as [number, number, number], distance: 0 };

const TEL_PUBLIC: ReferenceNote = { basis: "official_public", scope: "model", sourceUrls: ["https://www.tel.com/product/cellesta.html"], dimensionBasis: "Proportions read from the public product image; no OEM drawing or measured dimension." };
const ASSUMED: ReferenceNote = { basis: "design_assumption", scope: "configuration", sourceUrls: [], dimensionBasis: "Repository design assumption (config/geometry/cellesta-i-md-v1.json)." };

const PM01: ComponentScope = { moduleId: "PM-01", chamberId: "PM-01", activity: "active" };
const FRONT: ComponentScope = { moduleId: "EFEM", activity: "active" };
const CORRIDOR: ComponentScope = { moduleId: "TRANSFER", activity: "active" };

export const CELLESTA_MODULES: ToolModuleDef[] = [
  { moduleId: "EFEM", name: "Front end (4 load ports)", kind: "front_end", activity: "active", chambers: [], origin: [0, 0, 0], yawDeg: 0, noteKo: "LP2(두 번째 port)만 시연에 사용. 나머지 3개는 idle이며 station id가 없다." },
  { moduleId: "TRANSFER", name: "Pass station + transfer corridor", kind: "transfer", activity: "active", chambers: [], origin: [0, 0, 0], yawDeg: 0, noteKo: "EFEM robot과 transfer robot이 pass station에서 wafer를 주고받는다. Corridor robot의 주행축은 모델링하지 않았다(PM-01이 가장 가까운 module)." },
  { moduleId: "PM-01", name: "Process module PM-01 (single-wafer clean / rinse / dry)", kind: "process_module", activity: "active", chambers: [{ chamberId: "PM-01", name: "Cup / spin chamber", activity: "active", noteKo: "세정, rinse, IPA·분위기 제어 건조를 module 안에서 끝내고 dry wafer를 꺼낸다." }], origin: [0, 0, 0], yawDeg: 0, noteKo: "대표 configuration. 공개 자료의 module 수(최대 20 unit)를 그대로 옮기지 않았다." },
  ...["PM-02", "PM-03", "PM-04", "PM-05"].map((m): ToolModuleDef => ({ moduleId: m, name: `Process module stack ${m} (geometry only)`, kind: "process_module", activity: "geometry_only", chambers: [], origin: [0, 0, 0], yawDeg: 0, noteKo: "외형만 있는 module stack." })),
];

function c(assetId: string, name: string, kind: ComponentKind, assembly: string, materialRef: MaterialRef, description: string, opts: Partial<ComponentDef<CellestaLayout>> = {}): ComponentDef<CellestaLayout> {
  return { assetId, nodeKey: `pm01.${assetId}`, name, kind, assembly, description, materialRef, materialNote: opts.materialNote ?? "대표 재질 (가정)", selectable: true, explode: opts.explode ?? NONE, cutaway: opts.cutaway ?? "keep", dimensions: opts.dimensions ?? (() => []), scope: PM01, ...opts };
}

function pmComponents(L: CellestaLayout): ComponentDef<CellestaLayout>[] {
  const pm = L.pm;
  return [
    c("cup", "Splash cup (inner / outer collection)", "cup", "pm_cup", "polymer_gray", "Wafer 둘레의 cup. 바닥 partition이 안쪽(rinse·dry)과 바깥쪽(chemical) 회수 channel을 나눈다. 단면에서 channel이 보인다.", { cutaway: "sector", explode: DOWN(0.1), dimensions: () => [mm("Cup inner radius", pm.cup.inner_radius), mm("Rim height above the wafer", pm.cup.rim_y)], assumptions: ["2개 회수 channel과 3단 guard는 대표 설계다. 실제 MD module의 cup 구조와 같다는 뜻이 아니다."] }),
    c("cup_guard", "Splash guard (3 levels)", "cup", "pm_cup", "polymer_white", "Transfer 때 wafer 면 아래로, chemical 단계에서 위(바깥 channel), rinse·dry 단계에서 중간(안쪽 channel)으로 움직이는 guard.", { cutaway: "sector", jointId: J.guard, explode: UP(0.12), dimensions: () => [mm("Guard travel (transfer -> chemical)", pm.guard.levels.chemical - pm.guard.levels.transfer)] }),
    c("spin_chuck", "Spin chuck (edge support)", "chuck", "pm_chuck", "polymer_gray", "Wafer 가장자리를 6개 support pin과 edge pin으로 받치는 spin chuck. 공정 중 회전하며, 회전 중에는 robot이 들어가지 않는다.", { cutaway: "sector", jointId: J.spin, explode: UP(0.06) }),
    c("spindle_drive", "Spindle and drive motor", "drive", "pm_chuck", "painted_dark", "Chuck를 돌리는 spindle과 cup 아래 motor. 속도 표시는 scripted이며 측정값이 아니다.", { cutaway: "sector", explode: DOWN(0.25) }),
    c("wafer", "Wafer (300 mm)", "wafer", "pm_chuck", "silicon_wafer", "Spin chuck 위 wafer의 표시. Chuck와 함께 회전한다.", { cutaway: "sector", jointId: J.spin, explode: UP(0.16) }),
    c("dispense_arm", "Dispense arm with chemical / UPW / IPA nozzles", "nozzle", "pm_dispense", "polymer_white", "Swing arm 끝의 nozzle 3개(약액, UPW, IPA 역할 구분). 공정 중 wafer 위를 sweep하고, transfer 전에는 park 위치로 간다.", { jointId: J.arm, explode: UP(0.2), dimensions: (T) => [mm("Arm length", T.pm.arm.length)] }),
    c("dispense_arm_drive", "Arm column and swing drive", "drive", "pm_dispense", "aluminum_machined", "Arm을 돌리는 column과 drive.", {}),
    c("nozzle_park", "Nozzle park cup", "cup", "pm_dispense", "polymer_gray", "Cup 밖 nozzle 대기 위치. Park 상태에서 떨어지는 액이 여기로 간다.", {}),
    c("pm_shutter", "PM-01 shutter", "valve", "pm_access", "polymer_white", "Corridor 쪽 wafer 반입구. Spindle 정지, nozzle park, guard 하강, (반출 시) dry-confirmed 상태에서만 열린다.", { jointId: J.shutter, explode: PX(-0.2) }),
    c("supply_manifold", "Supply manifold (valves)", "gas", "pm_supply", "polymer_white", "약액, UPW, IPA 공급 valve manifold. 약액 종류, 농도, 혼합 순서, 유량 recipe는 정하지 않았다.", {}),
    c("supply_filter", "Point-of-use filter", "gas", "pm_supply", "polymer_white", "공급 line의 filter housing(대표).", {}),
    c("supply_chemical", "Chemical supply line", "liquid", "pm_supply", "polymer_gray", "약액 nozzle로 가는 line. 색은 구분용이며 실제 액체 색이 아니다.", {}),
    c("supply_upw", "UPW supply line", "liquid", "pm_supply", "polymer_white", "Rinse용 초순수 line.", {}),
    c("supply_ipa", "IPA supply line", "liquid", "pm_supply", "stainless", "건조용 IPA line.", {}),
    c("drain_outer", "Outer channel drain (chemical)", "liquid", "pm_drain", "polymer_gray", "바깥 회수 channel drain. 약액 회수(recycle) 쪽으로 간다.", {}),
    c("drain_inner", "Inner channel drain (rinse / dry)", "liquid", "pm_drain", "polymer_gray", "안쪽 회수 channel drain.", {}),
    c("cup_exhaust", "Cup exhaust duct", "vacuum", "pm_drain", "polymer_white", "Cup 배기 duct. 배기 유량·압력은 후보 채널이다.", {}),
    c("leak_pan", "Leak pan", "frame", "pm_drain", "polymer_gray", "Module 아래 누액 받이. Leak sensor 후보 위치.", {}),
    c("chemical_recycle_interface", "Chemical recycle return (interface)", "liquid", "pm_drain", "polymer_gray", "공개 설명의 chemical recycle 개념에 대응하는 return line(대표). 회수 장치 내부는 만들지 않았다.", {}),
    c("pm01_enclosure", "PM-01 module enclosure", "enclosure", "pm_access", "painted_offwhite", "PM-01 외장(분위기 제어 chamber의 바깥 cover). 점검 모드에서 숨겨진다.", { shell: true, explode: UP(0.4) }),
    c("liquid_film", "Liquid film on the wafer (illustrative)", "effect", "visualization", "none", "Wafer 위 액막의 설명용 표시. 색은 약액·UPW·IPA를 구분하는 overlay이며 실제 색이나 두께가 아니다.", { selectable: false }),
    c("dispense_stream", "Dispense stream (illustrative)", "effect", "visualization", "none", "Nozzle에서 wafer로 떨어지는 액의 설명용 표시.", { selectable: false }),
    c("atmosphere_overlay", "Atmosphere control (illustrative)", "effect", "visualization", "none", "건조 중 chamber 분위기 제어를 나타내는 설명용 표시. 기체 조성이나 농도 측정이 아니다.", { selectable: false }),
  ];
}

function frontComponents(L: CellestaLayout): ComponentDef<CellestaLayout>[] {
  const out: [number, number, number] = [-1, 0, 0];
  const basis = "Generic EFEM / load port 구조와 SCARA robot(대표). 특정 제조사 배치를 복제하지 않았다.";
  const efem = efemComponents<CellestaLayout>((T) => ({ depth: T.cfg.front_end.efem.depth, width: T.efem.width, height: T.cfg.front_end.efem.height_above_floor, ffuHeight: T.cfg.front_end.efem.ffu_height, deckHeight: T.loadPort.deckTopY - T.floorY, deckDepth: T.cfg.front_end.load_port.deck_depth, openingW: T.loadPort.opening.width, openingH: T.loadPort.opening.y1 - T.loadPort.opening.y0, dockStroke: T.loadPort.dockStroke, doorPull: T.loadPort.doorPull, doorLower: T.loadPort.doorLower }), out, basis).map((x) => ({ ...x, scope: FRONT }));
  const atm = scaraRobotComponents<CellestaLayout>(atmSpec(L), mm, { basis }).map((x) => ({ ...x, scope: FRONT }));
  const tr = scaraRobotComponents<CellestaLayout>(trSpec(L), mm, { basis, assumptions: ["Corridor robot의 주행축은 모델링하지 않았다(PM-01이 가장 가까운 module).", "End effector를 길게 해 wrist가 PM-01 밖에 남는다(only the end effector enters)."] }).map((x) => ({ ...x, scope: CORRIDOR }));
  return [
    ...efem,
    ...atm,
    ...tr,
    { assetId: "pass_station", nodeKey: "transfer.pass_station", name: "Pass station (wafer buffer pins)", kind: "station", assembly: "transfer", description: "EFEM back wall을 가로지르는 buffer. 고정 pin 4개 위에서 EFEM robot과 transfer robot이 Z 방향으로 wafer를 주고받는다.", materialRef: "aluminum_anodized", materialNote: "Anodized housing, PEEK pins (가정)", selectable: true, explode: UP(0.2), cutaway: "keep", dimensions: () => [], scope: CORRIDOR },
    { assetId: "wafer_on_pass", nodeKey: "transfer.pass_station.wafer", name: "Wafer on the pass station", kind: "wafer", assembly: "transfer", parentAssetId: "pass_station", description: "Pass station pin 위 wafer 표시.", materialRef: "silicon_wafer", materialNote: "Presentation of the wafer", selectable: true, explode: UP(0.25), cutaway: "keep", dimensions: () => [], scope: CORRIDOR },
    { assetId: "transfer_corridor", nodeKey: "transfer.corridor", name: "Transfer corridor floor", kind: "frame", assembly: "transfer", description: "Transfer robot이 서 있는 corridor 바닥.", materialRef: "painted_dark", materialNote: "Painted base (가정)", selectable: true, explode: NONE, cutaway: "keep", dimensions: () => [], scope: CORRIDOR },
  ];
}

function toolComponents(): ComponentDef<CellestaLayout>[] {
  const idle = ["PM-02", "PM-03", "PM-04", "PM-05"].map(
    (m): ComponentDef<CellestaLayout> => ({ assetId: `${m.toLowerCase().replace("-", "")}_enclosure`, nodeKey: `${m.toLowerCase().replace("-", "")}.enclosure`, name: `Module stack ${m} (geometry only)`, kind: "module", assembly: "idle_modules", parentAssetId: "tool_enclosure", description: "Corridor 양옆 module stack 외형(geometry only).", materialRef: "painted_offwhite", materialNote: "Painted panels (가정)", selectable: true, shell: true, explode: UP(0.4), cutaway: "keep", dimensions: () => [], scope: { moduleId: m, activity: "geometry_only" } }),
  );
  return [
    { assetId: "tool_enclosure", nodeKey: "tool.exterior", name: "Tool body and exterior panels", kind: "enclosure", assembly: "tool_exterior", description: "Corridor를 덮는 tool 외장과 operator tower. 점검 모드에서 corridor 외장이 숨겨진다.", materialRef: "painted_offwhite", materialNote: "Off-white panels (가정)", selectable: true, shell: true, explode: NONE, cutaway: "keep", dimensions: () => [], structuralBasis: "Tokyo Electron CELLESTA 공개 제품 이미지(4 load port, operator tower, 긴 공정부)", label: { text: "CELLESTA-i MD (representative)", priority: 3 }, scope: { activity: "active" } },
    ...idle,
    { assetId: "chemical_cabinet", nodeKey: "tool.chemical_cabinet", name: "Chemical supply / recycle cabinet (geometry only)", kind: "module", assembly: "tool_exterior", parentAssetId: "tool_enclosure", description: "후면 약액 공급·회수 cabinet 외형. 내부 탱크와 순환 구조는 만들지 않았다.", materialRef: "painted_offwhite", materialNote: "Painted panels (가정)", selectable: true, shell: true, explode: PX(0.4), cutaway: "keep", dimensions: () => [], scope: { moduleId: "CHEM", activity: "geometry_only" } },
    { assetId: "idle_load_ports", nodeKey: "efem.load_ports_idle", name: "Load ports LP1 / LP3 / LP4 (idle)", kind: "station", assembly: "tool_exterior", parentAssetId: "efem_enclosure", description: "시연에 쓰지 않는 load port 세 개(station id 없음).", materialRef: "painted_offwhite", materialNote: "Painted frame (가정)", selectable: true, explode: { dir: [-1, 0, 0], distance: 0.6 }, cutaway: "keep", dimensions: () => [], scope: { moduleId: "EFEM", activity: "idle" } },
    { assetId: "facility_interface", nodeKey: "tool.facility_interface", name: "Facility interface (chemical / UPW / exhaust / drain / power)", kind: "frame", assembly: "tool_exterior", parentAssetId: "chemical_cabinet", description: "후면 bulkhead.", materialRef: "stainless", materialNote: "Bulkhead fittings (가정)", selectable: true, explode: PX(0.3), cutaway: "keep", dimensions: () => [], scope: { moduleId: "CHEM", activity: "geometry_only" } },
  ];
}

const PORTS: PortDef[] = [
  { portId: "out", assetId: "supply_manifold", medium: "liquid", role: "outlet", name: "Manifold outlet" },
  { portId: "in", assetId: "supply_chemical", medium: "liquid", role: "inlet", name: "Chemical line in" },
  { portId: "in", assetId: "supply_upw", medium: "liquid", role: "inlet", name: "UPW line in" },
  { portId: "in", assetId: "supply_ipa", medium: "liquid", role: "inlet", name: "IPA line in" },
  { portId: "nozzles", assetId: "dispense_arm", medium: "liquid", role: "outlet", name: "Nozzles" },
  { portId: "outer", assetId: "cup", medium: "liquid", role: "outlet", name: "Outer channel" },
  { portId: "inner", assetId: "cup", medium: "liquid", role: "outlet", name: "Inner channel" },
  { portId: "exhaust", assetId: "cup", medium: "vacuum", role: "outlet", name: "Cup exhaust" },
  { portId: "in", assetId: "drain_outer", medium: "liquid", role: "inlet", name: "Drain in" },
  { portId: "in", assetId: "drain_inner", medium: "liquid", role: "inlet", name: "Drain in" },
  { portId: "in", assetId: "cup_exhaust", medium: "vacuum", role: "inlet", name: "Duct in" },
  { portId: "in", assetId: "chemical_recycle_interface", medium: "liquid", role: "inlet", name: "Recycle return" },
  { portId: "out", assetId: "drain_outer", medium: "liquid", role: "outlet", name: "Drain out" },
  { portId: "wafer", assetId: "spin_chuck", medium: "wafer", role: "bidirectional", name: "Support pins" },
  { portId: "wafer", assetId: "pass_station", medium: "wafer", role: "bidirectional", name: "Buffer pins" },
  { portId: "wafer", assetId: "atm_robot_end_effector", medium: "wafer", role: "bidirectional", name: "EFEM fork" },
  { portId: "wafer", assetId: "tr_robot_end_effector", medium: "wafer", role: "bidirectional", name: "Transfer fork" },
  { portId: "transfer", assetId: "pm_shutter", medium: "wafer", role: "bidirectional", name: "Shutter opening" },
  { portId: "door", assetId: "load_port", medium: "wafer", role: "bidirectional", name: "FOUP door interface" },
];

const cn = (connectionId: string, kind: ConnectionDef["kind"], from: [string, string], to: [string, string], description: string): ConnectionDef => ({ connectionId, kind, from: { assetId: from[0], portId: from[1] }, to: { assetId: to[0], portId: to[1] }, description });

const CONNECTIONS: ConnectionDef[] = [
  cn("liq.manifold-chem", "liquid", ["supply_manifold", "out"], ["supply_chemical", "in"], "Manifold → chemical line"),
  cn("liq.manifold-upw", "liquid", ["supply_manifold", "out"], ["supply_upw", "in"], "Manifold → UPW line"),
  cn("liq.manifold-ipa", "liquid", ["supply_manifold", "out"], ["supply_ipa", "in"], "Manifold → IPA line"),
  cn("liq.outer-drain", "liquid", ["cup", "outer"], ["drain_outer", "in"], "Outer channel → drain (chemical step)"),
  cn("liq.inner-drain", "liquid", ["cup", "inner"], ["drain_inner", "in"], "Inner channel → drain (rinse / dry)"),
  cn("liq.recycle", "liquid", ["drain_outer", "out"], ["chemical_recycle_interface", "in"], "Outer drain → recycle return (interface)"),
  cn("vac.cup-exhaust", "vacuum", ["cup", "exhaust"], ["cup_exhaust", "in"], "Cup exhaust"),
  cn("wafer.lp-efem", "wafer", ["load_port", "door"], ["atm_robot_end_effector", "wafer"], "FOUP slot → EFEM fork"),
  cn("wafer.efem-pass", "wafer", ["atm_robot_end_effector", "wafer"], ["pass_station", "wafer"], "EFEM fork → pass station pins"),
  cn("wafer.pass-tr", "wafer", ["pass_station", "wafer"], ["tr_robot_end_effector", "wafer"], "Pass station → transfer fork"),
  cn("wafer.tr-shutter", "wafer", ["tr_robot_end_effector", "wafer"], ["pm_shutter", "transfer"], "Transfer fork through the PM-01 shutter"),
  cn("wafer.shutter-chuck", "wafer", ["pm_shutter", "transfer"], ["spin_chuck", "wafer"], "Shutter → spin chuck support pins"),
];

export function buildCellestaTemplate(L: CellestaLayout): EquipmentTemplate<CellestaLayout> {
  const pm = L.pm;
  const lp = L.loadPort;
  const joints: JointDef[] = [
    ...loadPortJoints(L.az, { seatR: lp.seatR, deckTopY: lp.deckTopY, r1: L.efem.r1, openingCenterY: lp.opening.centerY, qc: L.efem.lpQ, dockStroke: lp.dockStroke, doorPull: lp.doorPull, doorLower: lp.doorLower }),
    ...scaraRobotJoints(atmSpec(L)),
    ...scaraRobotJoints(trSpec(L)),
    { jointId: J.shutter, name: "PM-01 shutter", kind: "prismatic", origin: [pm.box.x0, pm.shutter.center_y, 0], axis: [0, -1, 0], range: [0, pm.shutter.travel], unit: "m", homeNote: "0 = 닫힘, travel = 아래로 열림" },
    { jointId: J.guard, name: "Splash guard lift", kind: "prismatic", origin: [0, pm.guard.levels.transfer, 0], axis: [0, 1, 0], range: [0, pm.guard.levels.chemical - pm.guard.levels.transfer], unit: "m", homeNote: "0 = transfer 위치(wafer 면 아래), 최대 = chemical 위치. 중간 = rinse·dry" },
    { jointId: J.spin, name: "Spin chuck rotation", kind: "revolute", origin: [0, 0, 0], axis: [0, 1, 0], range: [-1e6, 1e6], unit: "rad", homeNote: "회전각(연속). Cutaway 중에는 0에 고정. 속도 표시는 scripted", freezeInCutaway: true },
    { jointId: J.arm, name: "Dispense arm swing", kind: "revolute", origin: [pm.arm.pivot[0], 0, pm.arm.pivot[2]], axis: [0, 1, 0], range: [Math.min(armAngle(L, "park"), armAngle(L, "edge")), Math.max(armAngle(L, "park"), armAngle(L, "edge"))], unit: "rad", homeNote: "0 = nozzle이 회전축 위, park = cup 밖 대기 위치" },
  ];
  const assemblies: AssemblyDef[] = [
    { id: "pm_cup", name: "PM-01: Cup / splash guard", description: "Cup, 회수 channel partition, 3단 guard", order: 1, reference: ASSUMED },
    { id: "pm_chuck", name: "PM-01: Spin chuck / spindle / wafer", description: "Edge-support spin chuck, spindle, motor, wafer", order: 2, reference: ASSUMED },
    { id: "pm_dispense", name: "PM-01: Dispense arm / nozzles / park", description: "Swing arm, chemical·UPW·IPA nozzle, park cup", order: 3, reference: ASSUMED },
    { id: "pm_supply", name: "PM-01: Supply (chemical / UPW / IPA)", description: "Manifold, filter, supply line", order: 4, reference: ASSUMED },
    { id: "pm_drain", name: "PM-01: Drain / exhaust / recycle", description: "회수 drain, cup 배기, leak pan, recycle return", order: 5, reference: ASSUMED },
    { id: "pm_access", name: "PM-01: Shutter / enclosure", description: "반입 shutter와 module 외장", order: 6, reference: ASSUMED },
    { id: "visualization", name: "Visualization (illustrative)", description: "액막, 분사, 분위기 제어의 설명용 표시", order: 7 },
    { id: "station_interface", name: "Load port / EFEM", description: "FOUP load port, EFEM panel, FFU, HMI", order: 8, reference: ASSUMED },
    { id: "atm_robot", name: "EFEM robot", description: "FOUP와 pass station 사이 dry wafer robot", order: 9, reference: ASSUMED },
    { id: "transfer", name: "Pass station / corridor", description: "Pass station, corridor 바닥", order: 10, reference: ASSUMED },
    { id: "transfer_robot", name: "Transfer robot", description: "Pass station과 PM-01 사이 robot", order: 11, reference: ASSUMED },
    { id: "idle_modules", name: "PM-02..PM-05 (geometry only)", description: "Corridor 양옆 module stack 외형", order: 20, reference: TEL_PUBLIC },
    { id: "tool_exterior", name: "Tool exterior / facility", description: "Tool 외장, operator tower, 약액 cabinet, idle load port", order: 21, reference: TEL_PUBLIC },
  ];
  return {
    templateId: CELLESTA_TEMPLATE_ID,
    templateRevision: CELLESTA_TEMPLATE_REVISION,
    family: "WET_CLEAN_SINGLE_WAFER",
    displayName: "CELLESTA-i MD Wet Clean (representative)",
    title: "CELLESTA-i MD based single-wafer wet clean tool, representative clean / rinse / dry module",
    assemblies,
    components: [...pmComponents(L), ...frontComponents(L), ...toolComponents()],
    ports: PORTS,
    connections: CONNECTIONS,
    joints,
    modules: CELLESTA_MODULES,
    lifecycle: "current",
    reference: { ...TEL_PUBLIC, vendor: "Tokyo Electron", model: "CELLESTA-i MD", configurationKo: "Module 안에서 세정, rinse, IPA·분위기 제어 대표 건조를 끝내고 dry wafer를 꺼내는 대표 구성. SMD의 원리·기구는 추가하지 않았고, MS2의 brush / dual-fluid 구조를 넣지 않았다." },
    facts: [
      { label: "Model", value: "CELLESTA-i MD (representative configuration)", note: "공개 자료: single-wafer clean, chamber atmosphere control, IPA dispenser 개선, chemical recycle" },
      { label: "Drying", value: "IPA / atmosphere-related drying (one representative phase)", note: "공식 표기 New IPA dry / SMD를 두 공정의 연속 실행으로 해석하지 않는다. SMD는 모델링하지 않았다" },
      { label: "Clean scope", value: "Selected post-etch residue (schematic)", note: "CMP 평탄화가 아니며 mask나 oxide를 제거하지 않는다. 약액 종류·농도는 정하지 않았다" },
      { label: "Wafer state rule", value: "Dry in, dry out", note: "Wet wafer는 FOUP로 돌아가지 않는다. Dry-confirmed는 scripted 상태이며 센서 판정이 아니다" },
      { label: "Transfer interlock", value: "Spindle stopped, nozzle parked, guard down", note: "Robot은 회전 중인 chuck에 들어가지 않는다" },
    ],
    station: {
      stationId: "LP.<instanceId>",
      loadPortAssetId: "load_port",
      seatLocal: L.seat,
      doorFacingLocal: L.doorFacing,
      transferEnclosureAssetId: "efem_enclosure",
      waferPresentationAssetId: "wafer",
      waferPresentationAssetIds: ["wafer", "wafer_on_atm_robot", "wafer_on_pass", "wafer_on_transfer_robot"],
      noteKo: "LP2 FOUP slot, EFEM robot, pass station, transfer robot, spin chuck 순서로 holder가 바뀐다.",
    },
  };
}
