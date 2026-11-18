/**
 * Material flow domain: lots, carriers (FOUP), slots, wafers and the demonstration routes.
 * Carrier, slot and wafer are distinct objects. A CMP carrier head is NOT a carrier in this sense.
 * Slot ids are fixed physical positions; a wafer's current holder and its reserved return slot differ.
 */
import type { FilmLayerRole, IllustrativeFilmLayer, IllustrativeFilmState } from "../presentation/preview";

export interface CarrierDef {
  carrierId: string;
  kind: "FOUP";
  /** 300 mm FOUP with 25 slots (project starting assumption, not a vendor specification). */
  waferSize: 300;
  slotCount: 25;
  /** Slots occupied at scenario start: slotId -> waferId. */
  initialSlots: Record<string, string>;
  lotId: string;
}

export interface WaferDef {
  waferId: string;
  lotId: string;
  diameterM: number;
  thicknessM: number;
  /** Incoming (prepared) STI stack from external steps. */
  incomingStackId: string;
}

export type StackStepStatus = "external" | "incoming" | "demo";

export interface IncomingStackLayer {
  layerId: string;
  material: string;
  role: FilmLayerRole;
  /** Schematic thickness (nm), descriptive metadata only; never used for collision or clearance. */
  schematicThicknessNm: number;
  originStep: string;
  originStatus: StackStepStatus;
}

export interface IncomingStackDef {
  stackId: string;
  title: string;
  noteKo: string;
  /** Pattern geometry metadata (the mask is metadata, not a remaining photoresist layer). */
  pattern: { trenchWidthNm: number; trenchDepthNm: number; activeWidthNm: number; note: string };
  layers: IncomingStackLayer[];
  externalSteps: { stepId: string; name: string; status: "external"; noteKo: string }[];
}

/** Prepared STI wafer: lithography / etch / liner / trench fill already done outside this project. */
export const STI_INCOMING_STACK: IncomingStackDef = {
  stackId: "sti-prepared-v1",
  title: "Prepared STI wafer (incoming)",
  noteKo: "상류 Lithography/Etch/Liner/Trench-fill은 외부 공정(External step)으로 완료된 상태다. 층 두께는 설명용 schematic 값이며 실측이 아니다.",
  pattern: { trenchWidthNm: 120, trenchDepthNm: 300, activeWidthNm: 160, note: "Mask는 pattern geometry metadata다. 이미 제거된 photoresist를 잔존층으로 추가하지 않는다." },
  layers: [
    { layerId: "substrate", material: "Si substrate", role: "substrate", schematicThicknessNm: 400, originStep: "incoming", originStatus: "incoming" },
    { layerId: "pad_oxide", material: "Pad SiO2", role: "pad_oxide", schematicThicknessNm: 12, originStep: "ext.pad_oxidation", originStatus: "external" },
    { layerId: "sin_stop", material: "SiN stop layer", role: "stop_layer", schematicThicknessNm: 90, originStep: "ext.nitride_deposition", originStatus: "external" },
    { layerId: "trench_liner", material: "Liner SiO2", role: "liner", schematicThicknessNm: 10, originStep: "ext.liner_oxidation", originStatus: "external" },
    { layerId: "trench_fill", material: "Trench-fill SiO2", role: "trench_fill", schematicThicknessNm: 300, originStep: "ext.trench_fill", originStatus: "external" },
    { layerId: "surface_oxide", material: "Surface SiO2 (fill overburden)", role: "surface_oxide", schematicThicknessNm: 120, originStep: "ext.trench_fill", originStatus: "external" },
  ],
  externalSteps: [
    { stepId: "ext.pad_oxidation", name: "Pad oxidation", status: "external", noteKo: "외부 공정 (이 프로젝트에서 시연하지 않음)" },
    { stepId: "ext.nitride_deposition", name: "SiN stop-layer deposition", status: "external", noteKo: "외부 공정" },
    { stepId: "ext.litho_etch", name: "STI lithography + trench etch", status: "external", noteKo: "외부 공정; mask는 metadata로만 남는다" },
    { stepId: "ext.liner_oxidation", name: "Trench liner oxidation", status: "external", noteKo: "외부 공정" },
    { stepId: "ext.trench_fill", name: "Trench fill oxide (incoming)", status: "external", noteKo: "외부 공정. Fill mode = external (void-free fill을 이 프로젝트가 보증하지 않음)" },
  ],
};

/** Overcoat added by this project's deposition illustration (separate layer id and history). */
export const DEMO_OVERCOAT_LAYER = { layerId: "demo_overcoat", material: "Overcoat SiO2 (illustrated deposition)", role: "overcoat" as const, schematicThicknessNm: 80 };

export const DEMO_WAFER: WaferDef = { waferId: "W-01", lotId: "LOT-DEMO-01", diameterM: 0.3, thicknessM: 0.000775, incomingStackId: STI_INCOMING_STACK.stackId };

export const DEMO_CARRIER: CarrierDef = { carrierId: "FOUP-01", kind: "FOUP", waferSize: 300, slotCount: 25, initialSlots: { "slot-13": "W-01" }, lotId: "LOT-DEMO-01" };

export const DEMO_RESERVED_SLOT = { carrierId: "FOUP-01", slotId: "slot-13" };

/** Incoming film state: every incoming layer present, no overcoat yet. */
export function incomingFilmState(waferId: string): IllustrativeFilmState {
  const layers: IllustrativeFilmLayer[] = STI_INCOMING_STACK.layers.map((l) => ({
    layerId: l.layerId,
    material: l.material,
    role: l.role,
    presentFraction: 1,
    origin: l.role === "surface_oxide" ? "incoming_surface" : "incoming_external",
    originStepId: l.originStep,
  }));
  layers.push({ layerId: DEMO_OVERCOAT_LAYER.layerId, material: DEMO_OVERCOAT_LAYER.material, role: "overcoat", presentFraction: 0, origin: "demo_deposition" });
  return { renderSource: "illustrative", waferId, layers, nitrideExposed: false, status: "incoming", scaleNote: "Schematic · Exaggerated scale · Illustrative" };
}

export type ValidationStatus = "not_qualified" | "assumed_demo" | "qualified";

export interface RecipeRevisionDef {
  recipeId: string;
  revision: string;
  operation: "deposition" | "cmp" | "cleaning" | "drying" | "carrier_transport";
  equipmentTemplateId: string;
  filmMaterial?: string;
  intendedRole?: FilmLayerRole;
  configurationRevision: string;
  incomingStackId?: string;
  validationStatus: ValidationStatus;
  preconditionsKo: string[];
  noteKo: string;
}

export interface RouteStep {
  stepId: string;
  kind: "external" | "process" | "transport" | "return";
  instanceId?: string;
  recipeId?: string;
  labelKo: string;
}

export interface RouteDef {
  routeId: "A" | "B";
  title: string;
  titleKo: string;
  depositionInstanceId: string;
  cmpInstanceId: string;
  ohtInstanceId: string;
  carrierId: string;
  waferId: string;
  sourceStationId: string;
  destinationStationId: string;
  steps: RouteStep[];
  noteKo: string;
}

export const RECIPES: RecipeRevisionDef[] = [
  {
    recipeId: "rcp.ccp.oxide_overcoat_demo",
    revision: "demo-1",
    operation: "deposition",
    equipmentTemplateId: "ccp_pecvd_single_wafer_300",
    filmMaterial: "SiO2",
    intendedRole: "overcoat",
    configurationRevision: "ccp-pecvd-300-v1.1.0",
    incomingStackId: STI_INCOMING_STACK.stackId,
    validationStatus: "assumed_demo",
    preconditionsKo: ["Prepared STI wafer (trench fill 완료)", "FOUP door 닫힘 후 반입"],
    noteKo: "Illustrative / Not process-qualified. 생산 Recipe가 아니며 막질·두께 보증 없음.",
  },
  {
    recipeId: "rcp.remote.oxide_overcoat_demo",
    revision: "demo-1",
    operation: "deposition",
    equipmentTemplateId: "remote_pecvd_upstream_icp",
    filmMaterial: "SiO2",
    intendedRole: "overcoat",
    configurationRevision: "remote-icp-pecvd-300-v1.0.0",
    incomingStackId: STI_INCOMING_STACK.stackId,
    validationStatus: "assumed_demo",
    preconditionsKo: ["Prepared STI wafer (trench fill 완료)", "Remote source 점화 후 precursor 투입"],
    noteKo: "Illustrative / Not process-qualified. Remote가 특정 trench를 void-free fill 한다는 근거로 쓰지 않는다.",
  },
  {
    recipeId: "rcp.cmp.sti_oxide_clearing_demo",
    revision: "demo-1",
    operation: "cmp",
    equipmentTemplateId: "sti_cmp_rotary_single_platen",
    filmMaterial: "SiO2",
    intendedRole: "overcoat",
    configurationRevision: "sti-cmp-rotary-300-v1.0.0",
    incomingStackId: STI_INCOMING_STACK.stackId,
    validationStatus: "assumed_demo",
    preconditionsKo: ["Oxide overburden이 있는 STI wafer", "Clean/Dry 완료 전 FOUP 반환 금지"],
    noteKo: "Illustrative. Endpoint detected / PASS / dishing nm 등의 결과를 생성하지 않는다.",
  },
  {
    recipeId: "rcp.oht.foup_transfer_demo",
    revision: "demo-1",
    operation: "carrier_transport",
    equipmentTemplateId: "oht_single_vehicle",
    configurationRevision: "oht-bay-v1.0.0",
    validationStatus: "assumed_demo",
    preconditionsKo: ["Wafer가 FOUP slot으로 복귀하고 door가 닫힌 뒤 pickup", "Destination load port 비어 있음"],
    noteKo: "Scripted presentation. E84/E87/E90 compliant 구현이 아니다.",
  },
];

export const ROUTES: RouteDef[] = [
  {
    routeId: "A",
    title: "Route A: CCP oxide overcoat → OHT → STI CMP → Clean/Dry",
    titleKo: "Route A: CCP 증착 → FOUP 복귀 → OHT 반송 → STI CMP → Clean/Dry → FOUP 복귀",
    depositionInstanceId: "PECVD-01.CH-A",
    cmpInstanceId: "CMP-01",
    ohtInstanceId: "OHT-01",
    carrierId: "FOUP-01",
    waferId: "W-01",
    sourceStationId: "LP.PECVD-01.CH-A",
    destinationStationId: "LP.CMP-01",
    steps: [
      { stepId: "a.ext", kind: "external", labelKo: "외부 준비 공정 (prepared STI input)" },
      { stepId: "a.dep", kind: "process", instanceId: "PECVD-01.CH-A", recipeId: "rcp.ccp.oxide_overcoat_demo", labelKo: "CCP oxide-overcoat illustration" },
      { stepId: "a.ret1", kind: "return", instanceId: "PECVD-01.CH-A", labelKo: "FOUP 복귀 (EFEM robot · load lock · vacuum blade)" },
      { stepId: "a.oht", kind: "transport", instanceId: "OHT-01", recipeId: "rcp.oht.foup_transfer_demo", labelKo: "OHT transfer" },
      { stepId: "a.cmp", kind: "process", instanceId: "CMP-01", recipeId: "rcp.cmp.sti_oxide_clearing_demo", labelKo: "STI CMP (dry robot, flip, wet robot) + Clean/Rinse/Dry" },
      { stepId: "a.ret2", kind: "return", instanceId: "CMP-01", labelKo: "FOUP 복귀" },
    ],
    noteKo: "독립 demonstration scenario. 시작 시 FOUP-01/W-01은 PECVD-01 load port에 있고 CMP-01 load port는 비어 있다. 모든 STI 공정에 추가 overcoat가 필요하다는 주장이 아니다.",
  },
  {
    routeId: "B",
    title: "Route B: Remote ICP PECVD oxide overcoat → OHT → STI CMP → Clean/Dry",
    titleKo: "Route B: Remote ICP PECVD 증착 → FOUP 복귀 → OHT 반송 → STI CMP → Clean/Dry → FOUP 복귀",
    depositionInstanceId: "REMOTE-01",
    cmpInstanceId: "CMP-01",
    ohtInstanceId: "OHT-01",
    carrierId: "FOUP-01",
    waferId: "W-01",
    sourceStationId: "LP.REMOTE-01",
    destinationStationId: "LP.CMP-01",
    steps: [
      { stepId: "b.ext", kind: "external", labelKo: "외부 준비 공정 (prepared STI input)" },
      { stepId: "b.dep", kind: "process", instanceId: "REMOTE-01", recipeId: "rcp.remote.oxide_overcoat_demo", labelKo: "Remote ICP PECVD oxide-overcoat illustration" },
      { stepId: "b.ret1", kind: "return", instanceId: "REMOTE-01", labelKo: "FOUP 복귀 (EFEM robot · load lock · vacuum blade)" },
      { stepId: "b.oht", kind: "transport", instanceId: "OHT-01", recipeId: "rcp.oht.foup_transfer_demo", labelKo: "OHT transfer" },
      { stepId: "b.cmp", kind: "process", instanceId: "CMP-01", recipeId: "rcp.cmp.sti_oxide_clearing_demo", labelKo: "STI CMP (dry robot, flip, wet robot) + Clean/Rinse/Dry" },
      { stepId: "b.ret2", kind: "return", instanceId: "CMP-01", labelKo: "FOUP 복귀" },
    ],
    noteKo: "Route A의 대안이며 한 wafer에 두 증착을 강제하지 않는다. Illustrative / Not process-qualified.",
  },
];

export function routeById(id: "A" | "B"): RouteDef {
  return ROUTES.find((r) => r.routeId === id)!;
}

export function recipeById(id: string): RecipeRevisionDef | undefined {
  return RECIPES.find((r) => r.recipeId === id);
}
