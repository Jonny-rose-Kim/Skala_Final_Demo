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
  /**
   * deposition / etch / wet_clean (clean + rinse + dry in one module) / carrier_transport, and the two external
   * steps of the current route that no tool in the scene performs. Legacy V1: cmp / cleaning / drying.
   */
  operation: "deposition" | "etch" | "wet_clean" | "external_lithography" | "external_resist_strip" | "cmp" | "cleaning" | "drying" | "carrier_transport";
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

/** Legacy V1 route (CCP / Remote deposition -> OHT -> STI CMP); kept for the legacy-v1 fixture only. */
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

// ------------------------------------------------------------------------------------------------ current bay

/** One step of a versioned process route (current bay). Tool scope names the module / chamber that runs it. */
export interface ProcessRouteStep {
  stepId: string;
  kind: "process" | "transport" | "external";
  labelKo: string;
  instanceId?: string;
  moduleId?: string;
  chamberId?: string;
  recipeId?: string;
  fromStationId?: string;
  toStationId?: string;
  /** External steps happen outside the scene; the wafer state changes at an explicit demonstration transition. */
  externalKind?: "lithography" | "resist_strip";
}

export interface ProcessRouteDef {
  routeId: string;
  revision: string;
  title: string;
  titleKo: string;
  lotId: string;
  carrierId: string;
  waferId: string;
  slotId: string;
  maskKind: "photoresist" | "hard_mask";
  steps: ProcessRouteStep[];
  noteKo: string;
}

export const CURRENT_RECIPES: RecipeRevisionDef[] = [
  { recipeId: "rcp.producer.pecvd_oxide_demo", revision: "demo-1", operation: "deposition", equipmentTemplateId: "producer_se_ccp_twin_300", filmMaterial: "SiO2 (representative)", intendedRole: "target_oxide", configurationRevision: "producer-se-ccp-cell-1.0.0", validationStatus: "assumed_demo", preconditionsKo: ["Bare Si wafer in FOUP slot", "Cell A (MOD-01) 사용, cell B idle"], noteKo: "Illustrative / not process-qualified. Gas recipe, RF, 온도·압력 setpoint와 막 두께를 정하지 않는다." },
  { recipeId: "rcp.external.lithography_demo", revision: "demo-1", operation: "external_lithography", equipmentTemplateId: "(external)", configurationRevision: "-", validationStatus: "assumed_demo", preconditionsKo: ["증착 후 FOUP 복귀"], noteKo: "장면 밖 외부 공정. Photoresist mask가 생기는 시연 전환으로만 표현한다." },
  { recipeId: "rcp.tactras.oxide_etch_demo", revision: "demo-1", operation: "etch", equipmentTemplateId: "tactras_oxide_ccp_rie_300", filmMaterial: "SiO2 (exposed region)", intendedRole: "target_oxide", configurationRevision: "tactras-oxide-rie-1.0.0", validationStatus: "assumed_demo", preconditionsKo: ["Patterned mask retained", "PM-01 ESC clamp 후 process-ready"], noteKo: "Illustrative. Etch rate, profile, endpoint를 계산하지 않는다." },
  { recipeId: "rcp.external.resist_strip_demo", revision: "demo-1", operation: "external_resist_strip", equipmentTemplateId: "(external)", configurationRevision: "-", validationStatus: "assumed_demo", preconditionsKo: ["Photoresist mask (hard mask이면 이 단계가 mask를 지우지 않는다)"], noteKo: "Recipe-dependent 외부 strip. Integration 가정이며 장면 밖 공정이다." },
  { recipeId: "rcp.cellesta.post_etch_clean_demo", revision: "demo-1", operation: "wet_clean", equipmentTemplateId: "cellesta_i_md_clean_300", configurationRevision: "cellesta-i-md-clean-1.0.0", validationStatus: "assumed_demo", preconditionsKo: ["Dry wafer in", "Selected post-etch residue (schematic)"], noteKo: "약액 종류·농도·혼합 순서·유량을 정하지 않는다. CMP 평탄화가 아니며 mask / oxide를 지우지 않는다." },
  { recipeId: "rcp.clw.foup_transfer_demo", revision: "demo-1", operation: "carrier_transport", equipmentTemplateId: "clw08v2_oht", configurationRevision: "clw08v2-oht-1.0.0", validationStatus: "assumed_demo", preconditionsKo: ["FOUP door closed", "Destination load port empty"], noteKo: "Scripted presentation. E84 / E87 compliant 구현이 아니다." },
];

/** Default route of the current bay (versioned). Lot / carrier / wafer ids are demonstration ids. */
export const ROUTE_DEP_ETCH_CLEAN: ProcessRouteDef = {
  routeId: "RT-DEP-ETCH-CLEAN",
  revision: "v1",
  title: "Producer deposition -> external lithography -> Tactras oxide etch -> external resist strip -> CELLESTA post-etch clean",
  titleKo: "증착(Producer) → 외부 노광 → 산화막 식각(Tactras) → 외부 resist strip → 세정(CELLESTA)",
  lotId: "LOT-DEMO-01",
  carrierId: "FOUP-01",
  waferId: "W-01",
  slotId: "slot-13",
  maskKind: "photoresist",
  steps: [
    { stepId: "S10_PRODUCER_DEPOSITION", kind: "process", instanceId: "PRODUCER-01", moduleId: "MOD-01", chamberId: "CELL-A", recipeId: "rcp.producer.pecvd_oxide_demo", labelKo: "Producer SE cell A 증착" },
    { stepId: "S20_EXTERNAL_LITHOGRAPHY", kind: "external", externalKind: "lithography", recipeId: "rcp.external.lithography_demo", labelKo: "외부 노광 / mask 준비 (장면 밖)" },
    { stepId: "S30_OHT_LEG_1", kind: "transport", instanceId: "OHT-01", recipeId: "rcp.clw.foup_transfer_demo", fromStationId: "LP.PRODUCER-01", toStationId: "LP.ETCH-01", labelKo: "OHT: Producer → Tactras" },
    { stepId: "S40_TACTRAS_OXIDE_ETCH", kind: "process", instanceId: "ETCH-01", moduleId: "PM-01", chamberId: "CH-01", recipeId: "rcp.tactras.oxide_etch_demo", labelKo: "Tactras PM-01 산화막 식각" },
    { stepId: "S50_EXTERNAL_RESIST_STRIP", kind: "external", externalKind: "resist_strip", recipeId: "rcp.external.resist_strip_demo", labelKo: "외부 resist strip (장면 밖, recipe-dependent)" },
    { stepId: "S60_OHT_LEG_2", kind: "transport", instanceId: "OHT-01", recipeId: "rcp.clw.foup_transfer_demo", fromStationId: "LP.ETCH-01", toStationId: "LP.CLEAN-01", labelKo: "OHT: Tactras → CELLESTA" },
    { stepId: "S70_CELLESTA_POST_ETCH_CLEAN", kind: "process", instanceId: "CLEAN-01", moduleId: "PM-01", chamberId: "PM-01", recipeId: "rcp.cellesta.post_etch_clean_demo", labelKo: "CELLESTA PM-01 세정·rinse·건조" },
  ],
  noteKo: "시연 route다. 팀의 합성 데이터셋(v2.0)은 네 장비 사이 wafer / carrier 연결을 UNLINKED로 두므로, 이 연결은 데이터에서 온 것이 아니다. 외부 단계는 장면에 장비가 없고 시연 전환으로만 표시한다.",
};

export function currentRecipeById(id: string): RecipeRevisionDef | undefined {
  return CURRENT_RECIPES.find((r) => r.recipeId === id);
}
