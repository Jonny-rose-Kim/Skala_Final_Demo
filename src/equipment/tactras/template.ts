/**
 * Tactras based rectangular-cluster etch template: tool -> PM-01 (active, representative oxide CCP-RIE)
 * and PM-02..PM-05 (geometry only) as scoped components of one instance (same decision as the Producer).
 * Single RF on the lower electrode (ESC), grounded upper electrode: the project's chosen configuration,
 * not a verified Tactras chamber option. No RF frequency, dual-frequency set-up or bias value is stated.
 */
import type { AssemblyDef, ComponentDef, ComponentKind, ComponentScope, ConnectionDef, EquipmentTemplate, JointDef, MaterialRef, PortDef, ReferenceNote, ToolModuleDef } from "../../domain/types";
import { stationAssemblies, stationComponents, stationConnections, stationJoints, stationPorts, stationWaferAssets } from "../handling/stationTemplate";
import type { TactrasLayout } from "./layout";
import { TACTRAS_PINS_JOINT } from "./parts";

export const TACTRAS_TEMPLATE_ID = "tactras_oxide_ccp_rie_300";
export const TACTRAS_TEMPLATE_REVISION = "1.0.0";

const mm = (label: string, valueM: number) => ({ label, valueM });
const UP = (d: number) => ({ dir: [0, 1, 0] as [number, number, number], distance: d });
const DOWN = (d: number) => ({ dir: [0, -1, 0] as [number, number, number], distance: d });
const RADIAL = (d: number) => ({ dir: "radial" as const, distance: d });
const NONE = { dir: [0, 0, 0] as [number, number, number], distance: 0 };

const TEL_PUBLIC: ReferenceNote = { basis: "official_public", scope: "platform", sourceUrls: ["https://www.tel.com/product/tactras.html"], dimensionBasis: "Proportions read from the public product image; no OEM drawing or measured dimension." };
const ASSUMED: ReferenceNote = { basis: "design_assumption", scope: "configuration", sourceUrls: [], dimensionBasis: "Repository design assumption (config/geometry/tactras-oxide-rie-v1.json)." };

const PM01: ComponentScope = { moduleId: "PM-01", chamberId: "CH-01", activity: "active" };
const FRONT: ComponentScope = { moduleId: "EFEM", activity: "active" };
const MAINFRAME: ComponentScope = { moduleId: "MAINFRAME", activity: "active" };

export const TACTRAS_MODULES: ToolModuleDef[] = [
  { moduleId: "EFEM", name: "Front end (3 load ports)", kind: "front_end", activity: "active", chambers: [], origin: [0, 0, 0], yawDeg: 0, noteKo: "LP1만 시연에 사용. LP2, LP3는 idle이며 station id가 없다." },
  { moduleId: "MAINFRAME", name: "Load lock + rectangular transfer chamber", kind: "transfer", activity: "active", chambers: [], origin: [0, 0, 0], yawDeg: 0, noteKo: "직사각형 cluster의 transfer chamber. Blade shuttle은 대표 설계이며 실제 vacuum robot 형식은 재현하지 않았다." },
  { moduleId: "PM-01", name: "Process module PM-01 (oxide CCP-RIE, representative)", kind: "process_module", activity: "active", chambers: [{ chamberId: "CH-01", name: "Oxide CCP-RIE chamber", activity: "active", noteKo: "시연 wafer를 식각하는 chamber." }], origin: [0, 0, 0], yawDeg: 0, noteKo: "Transfer chamber 끝의 대표 위치. 실제 장비의 module 위치와 chamber option은 확인하지 않았다." },
  ...["PM-02", "PM-03", "PM-04", "PM-05"].map((m): ToolModuleDef => ({ moduleId: m, name: `Process module ${m} (geometry only)`, kind: "process_module", activity: "geometry_only", chambers: [{ chamberId: "CH-01", name: "Chamber", activity: "geometry_only" }], origin: [0, 0, 0], yawDeg: 0, noteKo: "외형만 있는 module. 장착 공정을 정하지 않았다(공개 자료: 최대 6 chamber)." })),
];

const CHAMBER_ASSEMBLIES: AssemblyDef[] = [
  { id: "chamber_body", name: "PM-01: Chamber body", description: "진공 경계, liner, lid, 지지 frame", order: 1, reference: ASSUMED },
  { id: "upper_electrode", name: "PM-01: Upper electrode / gas distribution (grounded)", description: "전극판(gas hole), 냉각 distribution plate와 plenum, ceramic shield ring, gas inlet", order: 2, reference: ASSUMED },
  { id: "lower_electrode", name: "PM-01: Lower electrode / ESC (RF powered)", description: "ESC puck, 냉각 base plate, focus ring, 절연 ring, ground shield, column, lift pin, wafer", order: 3, reference: ASSUMED },
  { id: "rf_assembly", name: "PM-01: RF feed", description: "RF generator, 하부 matching network, 하부 전극 RF rod", order: 4, reference: ASSUMED },
  { id: "utilities", name: "PM-01: Backside He / cooling", description: "Backside He line, chiller supply / return", order: 5, reference: ASSUMED },
  { id: "gas_delivery", name: "PM-01: Gas box / MFC", description: "Gas box, MFC 3개, gas line", order: 6, reference: ASSUMED },
  { id: "vacuum_exhaust", name: "PM-01: Pump-out / exhaust", description: "Pumping baffle, exhaust port, throttle / isolation valve, foreline, pump", order: 7, reference: ASSUMED },
  { id: "access_inspection", name: "PM-01: Viewport / sensing", description: "Viewport와 OES mount(분광기 없음), pressure gauge", order: 8, reference: ASSUMED },
  { id: "visualization", name: "Visualization (illustrative)", description: "센서·물리 계산과 무관한 설명용 효과(plasma glow, ion 방향 표시)", order: 9 },
];

function c(assetId: string, name: string, kind: ComponentKind, assembly: string, materialRef: MaterialRef, description: string, opts: Partial<ComponentDef<TactrasLayout>> = {}): ComponentDef<TactrasLayout> {
  return { assetId, nodeKey: `pm01.${assetId}`, name, kind, assembly, description, materialRef, materialNote: opts.materialNote ?? "대표 재질 (가정)", selectable: true, explode: opts.explode ?? NONE, cutaway: opts.cutaway ?? "keep", dimensions: opts.dimensions ?? (() => []), scope: PM01, ...opts };
}

function chamberComponents(L: TactrasLayout): ComponentDef<TactrasLayout>[] {
  const ue = L.cfg.upper_electrode;
  const le = L.cfg.lower_electrode;
  return [
    c("chamber_body", "Chamber body", "body", "chamber_body", "aluminum_machined", "진공 경계 몸체. Transfer slit, viewport, pressure tap, 배기 port 보어를 포함한다. 접지된 벽.", { cutaway: "sector", shell: true, dimensions: (T) => [mm("Inner diameter", T.rInner * 2), mm("Wall thickness", T.rOuter - T.rInner)], label: { text: "PM-01 chamber", priority: 2 } }),
    c("chamber_liner", "Chamber liner (replaceable)", "liner", "chamber_body", "aluminum_anodized", "벽 안쪽 교체형 liner.", { parentAssetId: "chamber_body", cutaway: "sector", shell: true }),
    c("lid", "Chamber lid", "lid", "chamber_body", "aluminum_machined", "접지된 상부 lid. 상부 전극 stack을 매단다.", { cutaway: "sector", shell: true, explode: UP(0.45) }),
    c("frame", "Support frame", "frame", "chamber_body", "painted_dark", "Chamber 지지 frame.", {}),
    c("upper_electrode_plate", "Upper electrode plate (gas holes)", "electrode", "upper_electrode", "silicon_wafer", "Gas hole이 뚫린 교체형 상부 전극판. 이 configuration에서 상부는 접지이며, 재질(Si / SiC 등)은 정하지 않았다.", { cutaway: "sector", explode: UP(0.32), dimensions: () => [mm("Gap to chuck", ue.gap_to_chuck), mm("Plate diameter", ue.plate_diameter)], assumptions: ["상부 전극 접지, 하부 전극 RF는 프로젝트가 선택한 single-RF 대표 구성이다."] }),
    c("gas_distribution_plate", "Gas distribution / cooling plate", "gas", "upper_electrode", "aluminum_anodized", "전극판 위 plenum과 냉각 판. 단면에서 plenum이 보인다.", { cutaway: "sector", explode: UP(0.38) }),
    c("upper_shield_ring", "Upper shield ring (ceramic)", "insulator", "upper_electrode", "ceramic", "상부 전극 둘레의 ceramic shield ring.", { cutaway: "sector", explode: UP(0.28) }),
    c("gas_inlet", "Gas inlet (lid feedthrough)", "gas", "upper_electrode", "stainless", "Lid 중앙 gas feedthrough.", { cutaway: "sector", explode: UP(0.55) }),
    c("esc_puck", "Electrostatic chuck (ESC) puck", "chuck", "lower_electrode", "ceramic", "Wafer를 정전기로 고정하는 ceramic puck. 이 configuration은 ESC를 사용한다. Clamp 전압과 chuck 상태는 측정·명령·derived를 구분한 후보 채널이다.", { cutaway: "sector", explode: UP(0.12), dimensions: () => [mm("ESC diameter", le.esc_diameter)] }),
    c("lower_electrode_base", "Lower electrode base (RF powered, cooled)", "electrode", "lower_electrode", "aluminum_machined", "RF가 걸리는 냉각 base plate. 단면에서 coolant channel이 보인다.", { cutaway: "sector", explode: DOWN(0.1) }),
    c("focus_ring", "Focus ring", "ring", "lower_electrode", "ceramic", "Wafer 가장자리 둘레의 focus ring. 재질은 정하지 않았다(대표).", { cutaway: "sector", explode: UP(0.18) }),
    c("lower_insulator_ring", "Lower insulator ring (ceramic)", "insulator", "lower_electrode", "ceramic", "하부 전극과 접지 사이의 ceramic 절연 ring.", { cutaway: "sector", explode: RADIAL(0.12) }),
    c("ground_shield", "Lower ground shield", "frame", "lower_electrode", "aluminum_machined", "하부 전극 둘레의 접지 shield.", { cutaway: "sector", explode: RADIAL(0.18) }),
    c("lower_electrode_column", "Lower electrode column", "support", "lower_electrode", "aluminum_machined", "하부 전극을 바닥에서 지지하는 column. RF rod, He line, coolant line이 지나간다.", { cutaway: "sector", explode: DOWN(0.2) }),
    c("wafer", "Wafer (300 mm)", "wafer", "lower_electrode", "silicon_wafer", "ESC 위 wafer의 표시. Lift pin과 함께 움직인다.", { cutaway: "sector", jointId: TACTRAS_PINS_JOINT, explode: UP(0.22) }),
    c("lift_pins", "Wafer lift pins", "support", "lower_electrode", "ceramic", "Base를 관통하는 3개 lift pin과 바닥 아래 lifter. 하부 전극은 고정이고 wafer 인계는 pin이 한다.", { cutaway: "hide-in-sector", jointId: TACTRAS_PINS_JOINT, explode: DOWN(0.25), dimensions: () => [mm("Pin stroke", le.lift_pin_stroke), mm("Pin circle", le.lift_pin_circle_diameter)] }),
    c("rf_generator", "RF generator", "rf", "rf_assembly", "painted_housing", "단일 RF generator(대표). 주파수와 출력값은 정하지 않았다.", {}),
    c("matching_network", "Matching network (bottom)", "rf", "rf_assembly", "painted_housing", "Chamber 아래 matching network.", {}),
    c("rf_feed_rod", "Lower electrode RF rod", "rf", "rf_assembly", "copper", "Matching network에서 하부 전극 base로 가는 RF rod.", {}),
    c("backside_he_line", "Backside He line", "gas", "utilities", "stainless", "Wafer 뒷면 열전달용 He 공급 line(이 configuration에 있음). 압력·유량은 후보 채널이다.", {}),
    c("coolant_lines", "Chiller supply / return", "gas", "utilities", "polymer_gray", "하부 전극 base의 냉각수 공급·회수 line.", {}),
    c("gas_box", "Gas box", "gas", "gas_delivery", "painted_housing", "MFC가 든 gas box. Gas 종류와 유량 recipe는 이 모델에 없다(합성 데이터셋 후보 채널만).", {}),
    c("mfc_cf4", "MFC 1 (CF4 candidate)", "gas", "gas_delivery", "stainless", "MFC block. 합성 데이터셋이 CF4 line으로 설계한 위치(후보).", { parentAssetId: "gas_box" }),
    c("mfc_o2", "MFC 2 (O2 candidate)", "gas", "gas_delivery", "stainless", "MFC block. 합성 데이터셋이 O2 line으로 설계한 위치(후보).", { parentAssetId: "gas_box" }),
    c("mfc_ar", "MFC 3 (Ar candidate)", "gas", "gas_delivery", "stainless", "MFC block. 합성 데이터셋이 Ar line으로 설계한 위치(후보).", { parentAssetId: "gas_box" }),
    c("gas_line", "Process gas line", "gas", "gas_delivery", "stainless", "Gas box에서 lid inlet까지.", {}),
    c("pumping_baffle", "Pumping baffle", "vacuum", "vacuum_exhaust", "aluminum_anodized", "하부 전극 둘레의 slot baffle.", { cutaway: "sector" }),
    c("exhaust_port", "Exhaust port", "vacuum", "vacuum_exhaust", "stainless", "배기 port.", { cutaway: "hide-in-sector", azimuthDeg: L.cfg.ports.exhaust.azimuth_deg }),
    c("throttle_valve", "Throttle valve (APC)", "valve", "vacuum_exhaust", "stainless", "압력 제어 throttle valve. 개도 feedback과 command를 구분한다.", { cutaway: "hide-in-sector", azimuthDeg: L.cfg.ports.exhaust.azimuth_deg }),
    c("isolation_valve", "Isolation valve", "valve", "vacuum_exhaust", "stainless", "Pump 쪽 isolation valve.", {}),
    c("foreline", "Foreline", "vacuum", "vacuum_exhaust", "stainless", "Pump까지의 배관.", {}),
    c("vacuum_pump", "Vacuum pump", "vacuum", "vacuum_exhaust", "painted_housing", "Pump(형식 미정).", {}),
    c("viewport", "Optical viewport", "access", "access_inspection", "stainless", "Plasma를 보는 quartz viewport.", { cutaway: "hide-in-sector", azimuthDeg: L.cfg.ports.viewport.azimuth_deg }),
    c("oes_mount", "OES fiber mount (no spectrometer installed)", "sensor", "access_inspection", "aluminum_anodized", "Viewport의 OES fiber 장착 bracket. 분광기는 설치되지 않았다(후보). Raw spectrum과 derived endpoint는 다른 채널이다.", { cutaway: "hide-in-sector", azimuthDeg: L.cfg.ports.viewport.azimuth_deg }),
    c("slit_valve", "PM-01 transfer gate valve", "valve", "access_inspection", "aluminum_machined", "Transfer chamber와 PM-01 사이 gate valve body와 actuator. Gate가 열린 동안에만 blade가 지나간다.", { cutaway: "hide-in-sector", azimuthDeg: L.cfg.ports.slit.azimuth_deg }),
    c("pressure_sensor", "Chamber pressure gauge", "sensor", "access_inspection", "stainless", "Pressure tap의 gauge body. 측정점은 chamber 내부.", { cutaway: "hide-in-sector", azimuthDeg: L.cfg.ports.pressure_tap.azimuth_deg }),
    c("plasma_volume", "Plasma glow (illustrative)", "effect", "visualization", "none", "전극 사이에 한정된 설명용 glow. 밀도나 이온 에너지 계산이 아니다.", { selectable: false }),
    c("ion_flux_overlay", "Ion direction (explanatory)", "effect", "visualization", "none", "Sheath를 지나 wafer로 향하는 이온 방향의 설명용 화살표. 정량 profile이 아니다.", { selectable: false }),
  ];
}

function scoped(cmp: ComponentDef<TactrasLayout>): ComponentDef<TactrasLayout> {
  if (cmp.assembly === "station_interface" || cmp.assembly === "atm_robot") return { ...cmp, scope: FRONT };
  if (cmp.assetId === "slit_valve" || cmp.assetId === "slit_valve_gate") return { ...cmp, name: cmp.assetId === "slit_valve" ? "PM-01 transfer gate valve" : "PM-01 transfer gate", scope: PM01 };
  return { ...cmp, scope: MAINFRAME };
}

function toolComponents(): ComponentDef<TactrasLayout>[] {
  const idle = ["PM-02", "PM-03", "PM-04", "PM-05"].map(
    (m): ComponentDef<TactrasLayout> => ({ assetId: `${m.toLowerCase().replace("-", "")}_enclosure`, nodeKey: `${m.toLowerCase().replace("-", "")}.enclosure`, name: `Process module ${m} (geometry only)`, kind: "module", assembly: "idle_modules", parentAssetId: "tool_enclosure", description: "Transfer chamber 옆 process module 외형(geometry only). 내부와 공정은 정하지 않았다.", materialRef: "painted_offwhite", materialNote: "Painted panels (가정)", selectable: true, shell: true, explode: UP(0.4), cutaway: "keep", dimensions: () => [], scope: { moduleId: m, activity: "geometry_only" } }),
  );
  return [
    { assetId: "tool_enclosure", nodeKey: "tool.exterior", name: "Tool frame and exterior panels", kind: "enclosure", assembly: "tool_exterior", description: "Transfer chamber와 load lock을 덮는 mainframe 외장. 점검 모드에서 숨겨진다(실제 door 상태 아님).", materialRef: "painted_offwhite", materialNote: "Off-white panels (가정)", selectable: true, shell: true, explode: NONE, cutaway: "keep", dimensions: () => [], structuralBasis: "Tokyo Electron Tactras 공개 제품 이미지의 직사각형 cluster 배치", label: { text: "Tactras (representative)", priority: 3 }, scope: { activity: "active" } },
    { assetId: "pm01_enclosure", nodeKey: "pm01.enclosure", name: "PM-01 enclosure (service panels, top gas box)", kind: "enclosure", assembly: "pm_module", parentAssetId: "tool_enclosure", description: "PM-01 외장, service door, 상부 gas box. 점검 모드에서 숨겨진다.", materialRef: "painted_offwhite", materialNote: "Painted panels (가정)", selectable: true, shell: true, explode: UP(0.5), cutaway: "keep", dimensions: () => [], scope: { moduleId: "PM-01", activity: "active" } },
    ...idle,
    { assetId: "idle_load_ports", nodeKey: "efem.load_ports_idle", name: "Load ports LP2 / LP3 (idle)", kind: "station", assembly: "tool_exterior", parentAssetId: "efem_enclosure", description: "시연에 쓰지 않는 load port 두 개(station id 없음).", materialRef: "painted_offwhite", materialNote: "Painted frame (가정)", selectable: true, explode: { dir: [-1, 0, 0], distance: 0.6 }, cutaway: "keep", dimensions: () => [], scope: { moduleId: "EFEM", activity: "idle" } },
    { assetId: "facility_interface", nodeKey: "pm01.facility_interface", name: "Facility interface (gas / RF power / exhaust / coolant / He)", kind: "frame", assembly: "tool_exterior", parentAssetId: "tool_enclosure", description: "PM-01 후면 bulkhead.", materialRef: "stainless", materialNote: "Bulkhead fittings (가정)", selectable: true, explode: { dir: [1, 0, 0], distance: 0.3 }, cutaway: "keep", dimensions: () => [], scope: { moduleId: "PM-01", activity: "active" } },
  ];
}

const PORTS: PortDef[] = [
  { portId: "gas_out", assetId: "gas_box", medium: "gas", role: "outlet", name: "Gas box outlet" },
  { portId: "in", assetId: "gas_line", medium: "gas", role: "inlet", name: "Line inlet" },
  { portId: "out", assetId: "gas_line", medium: "gas", role: "outlet", name: "Line outlet" },
  { portId: "in", assetId: "gas_inlet", medium: "gas", role: "inlet", name: "Lid feedthrough" },
  { portId: "out", assetId: "upper_electrode_plate", medium: "gas", role: "outlet", name: "Electrode gas holes" },
  { portId: "rf_out", assetId: "rf_generator", medium: "rf", role: "outlet", name: "RF output" },
  { portId: "rf_in", assetId: "matching_network", medium: "rf", role: "inlet", name: "Match input" },
  { portId: "rf_out", assetId: "matching_network", medium: "rf", role: "outlet", name: "Match output" },
  { portId: "rf_in", assetId: "lower_electrode_base", medium: "rf", role: "inlet", name: "RF rod contact" },
  { portId: "he_in", assetId: "esc_puck", medium: "gas", role: "inlet", name: "Backside He grooves" },
  { portId: "out", assetId: "backside_he_line", medium: "gas", role: "outlet", name: "He line outlet" },
  { portId: "out", assetId: "coolant_lines", medium: "coolant", role: "outlet", name: "Coolant supply" },
  { portId: "coolant", assetId: "lower_electrode_base", medium: "coolant", role: "bidirectional", name: "Coolant channel" },
  { portId: "in", assetId: "exhaust_port", medium: "vacuum", role: "inlet", name: "Chamber side" },
  { portId: "in", assetId: "vacuum_pump", medium: "vacuum", role: "inlet", name: "Pump inlet" },
  { portId: "transfer", assetId: "esc_puck", medium: "wafer", role: "bidirectional", name: "Wafer seat" },
  { portId: "transfer", assetId: "slit_valve", medium: "wafer", role: "bidirectional", name: "Transfer gate opening" },
];

const CONNECTIONS: ConnectionDef[] = [
  { connectionId: "gas.box-line", kind: "gas", from: { assetId: "gas_box", portId: "gas_out" }, to: { assetId: "gas_line", portId: "in" }, description: "Gas box → line" },
  { connectionId: "gas.line-inlet", kind: "gas", from: { assetId: "gas_line", portId: "out" }, to: { assetId: "gas_inlet", portId: "in" }, description: "Line → lid inlet → distribution plate → electrode holes" },
  { connectionId: "rf.gen-match", kind: "rf", from: { assetId: "rf_generator", portId: "rf_out" }, to: { assetId: "matching_network", portId: "rf_in" }, description: "RF generator → bottom match" },
  { connectionId: "rf.match-lower", kind: "rf", from: { assetId: "matching_network", portId: "rf_out" }, to: { assetId: "lower_electrode_base", portId: "rf_in" }, description: "Match → RF rod → lower electrode" },
  { connectionId: "he.line-esc", kind: "gas", from: { assetId: "backside_he_line", portId: "out" }, to: { assetId: "esc_puck", portId: "he_in" }, description: "Backside He → ESC grooves" },
  { connectionId: "coolant.base", kind: "coolant", from: { assetId: "coolant_lines", portId: "out" }, to: { assetId: "lower_electrode_base", portId: "coolant" }, description: "Chiller → base plate channel" },
  { connectionId: "vac.chamber-pump", kind: "vacuum", from: { assetId: "exhaust_port", portId: "in" }, to: { assetId: "vacuum_pump", portId: "in" }, description: "Pump-out through the baffle, throttle and isolation valve" },
];

export function buildTactrasTemplate(L: TactrasLayout): EquipmentTemplate<TactrasLayout> {
  const station = stationComponents<TactrasLayout>((T) => T.station, L.station, null).map(scoped);
  const joints: JointDef[] = [
    { jointId: TACTRAS_PINS_JOINT, name: "Lift pins", kind: "prismatic", origin: [0, 0, 0], axis: [0, 1, 0], range: [0, L.cfg.lower_electrode.lift_pin_stroke], unit: "m", homeNote: "0 = pin top이 ESC 면과 같은 높이, 양수 = wafer를 들어 올림. 하부 전극은 고정" },
    ...stationJoints(L.station, L.cfg.ports.slit.gate_travel),
  ];
  return {
    templateId: TACTRAS_TEMPLATE_ID,
    templateRevision: TACTRAS_TEMPLATE_REVISION,
    family: "ETCH_CCP_RIE_CLUSTER",
    displayName: "Tactras Oxide Etch (representative)",
    title: "Tactras based rectangular-cluster etch tool, representative oxide CCP-RIE process module",
    assemblies: [
      ...CHAMBER_ASSEMBLIES,
      ...stationAssemblies(10).filter((a) => a.id !== "tool_enclosure").map((a) => ({ ...a, name: a.id === "load_lock_module" ? "Load lock / transfer chamber" : a.name, reference: ASSUMED })),
      { id: "pm_module", name: "PM-01 module enclosure", description: "PM-01 외장과 상부 gas box", order: 20, reference: TEL_PUBLIC },
      { id: "idle_modules", name: "PM-02..PM-05 (geometry only)", description: "Transfer chamber 양옆 module 외형", order: 21, reference: TEL_PUBLIC },
      { id: "tool_exterior", name: "Tool exterior / facility", description: "Mainframe 외장, idle load port, facility interface", order: 22, reference: TEL_PUBLIC },
    ],
    components: [...chamberComponents(L), ...station, ...toolComponents()],
    ports: [...PORTS, ...stationPorts(null)],
    connections: [...CONNECTIONS, ...stationConnections("esc_puck")],
    joints,
    modules: TACTRAS_MODULES,
    lifecycle: "current",
    reference: { ...TEL_PUBLIC, vendor: "Tokyo Electron", model: "Tactras", configurationKo: "프로젝트에서 선택한 oxide CCP-RIE chamber 구성(대표): 하부 전극 single RF + ESC, 상부 전극 접지, focus ring, backside He. 특정 Tactras chamber option이 아니다." },
    facts: [
      { label: "Platform", value: "Tactras (rectangular cluster)", note: "공개 제품 페이지: 300 mm, 최대 6 chamber, dielectric / conductor RIE" },
      { label: "Process module", value: "Representative oxide CCP-RIE (PM-01 active)", note: "Tactras 전체가 하나의 CCP chamber라는 뜻이 아니다" },
      { label: "RF configuration", value: "Single RF on the lower electrode (project choice)", note: "RF 주파수, dual-frequency 여부, bias 값은 정하지 않았다" },
      { label: "Chuck", value: "Electrostatic chuck + backside He", note: "Clamp 상태·전압은 후보 채널(측정, 명령, derived 구분)" },
      { label: "Wafer transfer", value: "Fixed lower electrode, lift pins", note: "Blade shuttle과 lift pin 사이 Z 인계" },
    ],
    station: {
      stationId: "LP.<instanceId>",
      loadPortAssetId: "load_port",
      seatLocal: L.station.seat,
      doorFacingLocal: L.station.doorFacing,
      transferEnclosureAssetId: "efem_enclosure",
      waferPresentationAssetId: "wafer",
      waferPresentationAssetIds: stationWaferAssets("wafer"),
      noteKo: "LP1 FOUP slot, EFEM robot, load-lock pin, blade shuttle, PM-01 lift pin, ESC 순서로 holder가 바뀐다.",
    },
  };
}
