/**
 * Producer SE based twin-module PECVD template (tool -> module -> chamber hierarchy as scoped components).
 *
 * Decision: one EquipmentInstance per tool. Modules and chambers are scoped components of the tool
 * template (ComponentDef.scope), not separate instances, so the tool keeps a single load-port station
 * (LP.<instanceId>), one preview entry and one cutaway / cover state. Plant-wide ids are
 * `${instanceId}.${moduleId}.${chamberId}` (e.g. PRODUCER-01.MOD-01.CELL-A).
 */
import { ASSEMBLIES as CCP_ASSEMBLIES, ccpChamberPieces } from "../../domain/ccpChamberTemplate";
import type { AssemblyDef, ComponentDef, ComponentScope, ConnectionDef, EquipmentTemplate, PortDef, ReferenceNote, ToolModuleDef } from "../../domain/types";
import { stationAssemblies, stationWaferAssets } from "../handling/stationTemplate";
import { CELL_B_ASSETS, cellBAssetId } from "./parts";
import type { ProducerLayout } from "./layout";

export const PRODUCER_TEMPLATE_ID = "producer_se_ccp_twin_300";
export const PRODUCER_TEMPLATE_REVISION = "1.0.0";

const mm = (label: string, valueM: number) => ({ label, valueM });
const UP = (d: number) => ({ dir: [0, 1, 0] as [number, number, number], distance: d });
const PZ = (d: number) => ({ dir: [0, 0, 1] as [number, number, number], distance: d });
const NONE = { dir: [0, 0, 0] as [number, number, number], distance: 0 };

const AMAT_PLATFORM: ReferenceNote = {
  basis: "public_secondary",
  scope: "platform",
  sourceUrls: ["https://ir.appliedmaterials.com/static-files/b5ac57a5-eaf0-4613-813b-73b45d8995ea"],
  dimensionBasis: "Representative proportions; no OEM drawing or measured dimension was used.",
};
const ASSUMED: ReferenceNote = { basis: "design_assumption", scope: "configuration", sourceUrls: [], dimensionBasis: "Repository design assumption (config/geometry/producer-se-twin-v1.json)." };

const CELL_A: ComponentScope = { moduleId: "MOD-01", chamberId: "CELL-A", activity: "active" };
const CELL_B: ComponentScope = { moduleId: "MOD-01", chamberId: "CELL-B", activity: "idle" };
const MOD01: ComponentScope = { moduleId: "MOD-01", activity: "active" };
const FRONT: ComponentScope = { moduleId: "EFEM", activity: "active" };
const MAINFRAME: ComponentScope = { moduleId: "MAINFRAME", activity: "active" };

const STATION_ASSEMBLIES = new Set(["station_interface", "atm_robot", "load_lock_module", "tool_enclosure"]);

export const PRODUCER_MODULES: ToolModuleDef[] = [
  { moduleId: "EFEM", name: "Equipment front end (3 load ports)", kind: "front_end", activity: "active", chambers: [], origin: [0, 0, 0], yawDeg: 0, noteKo: "LP1만 시연에 사용(active). LP2, LP3는 idle이며 station id가 없다." },
  { moduleId: "MAINFRAME", name: "Load lock + vacuum transfer chamber", kind: "transfer", activity: "active", chambers: [], origin: [0, 0, 0], yawDeg: 0, noteKo: "Load lock과 linear blade shuttle이 지나가는 transfer chamber. 실제 Producer의 중앙 vacuum robot 형식은 재현하지 않았다(대표 설계)." },
  {
    moduleId: "MOD-01",
    name: "Twin process module MOD-01",
    kind: "twin_process_module",
    activity: "active",
    chambers: [
      { chamberId: "CELL-A", name: "CCP process cell A", activity: "active", noteKo: "시연 wafer를 처리하는 cell. 내부 부품, joint, 센서 anchor가 인스턴스 좌표에 있다." },
      { chamberId: "CELL-B", name: "CCP process cell B", activity: "idle", noteKo: "같은 twin module의 두 번째 cell. 정적 형상만 있고 시연 wafer는 들어가지 않는다." },
    ],
    origin: [0, 0, 0],
    yawDeg: 0,
    noteKo: "Twin-Chamber module. 두 cell 사이 공유 부품(gas box, pump line)은 미확인이므로 cell A의 것만 표현하고 공유 여부는 가정으로 남긴다.",
  },
  { moduleId: "MOD-02", name: "Twin process module MOD-02", kind: "twin_process_module", activity: "geometry_only", chambers: [{ chamberId: "CELL-A", name: "Cell A", activity: "geometry_only" }, { chamberId: "CELL-B", name: "Cell B", activity: "geometry_only" }], origin: [-0.98, 0, -1.22], yawDeg: 0, noteKo: "외형만 있는 module. 장착 공정과 내부 구성은 정하지 않았다." },
  { moduleId: "MOD-03", name: "Twin process module MOD-03", kind: "twin_process_module", activity: "geometry_only", chambers: [{ chamberId: "CELL-A", name: "Cell A", activity: "geometry_only" }, { chamberId: "CELL-B", name: "Cell B", activity: "geometry_only" }], origin: [-0.98, 0, 1.22], yawDeg: 0, noteKo: "외형만 있는 module. 장착 공정과 내부 구성은 정하지 않았다." },
];

const PRODUCER_ASSEMBLIES: AssemblyDef[] = [
  ...CCP_ASSEMBLIES.filter((a) => !STATION_ASSEMBLIES.has(a.id)).map((a) => ({ ...a, name: `Cell A: ${a.name}`, reference: ASSUMED })),
  ...stationAssemblies(8)
    .filter((a) => a.id !== "tool_enclosure")
    .map((a) => ({ ...a, name: a.id === "load_lock_module" ? "Load lock / transfer chamber" : a.name, reference: ASSUMED })),
  { id: "twin_module", name: "Twin module MOD-01 (cell B idle)", description: "Cell A와 cell B가 한 module body 안에 나란히 있는 Twin-Chamber 구조. Cell B는 정적 형상(idle)", order: 20, reference: AMAT_PLATFORM },
  { id: "idle_modules", name: "Twin modules MOD-02 / MOD-03 (geometry only)", description: "Transfer chamber 양옆의 twin module 외형. 내부와 공정은 정하지 않았다", order: 21, reference: ASSUMED },
  { id: "tool_exterior", name: "Tool exterior / facility", description: "Tool frame, 외장 panel, idle load port, 후면 facility interface", order: 22, reference: AMAT_PLATFORM },
];

function scoped<L>(c: ComponentDef<L>): ComponentDef<L> {
  if (c.assembly === "station_interface" || c.assembly === "atm_robot") return { ...c, scope: FRONT };
  if (c.assembly === "load_lock_module") {
    // the slit valve and its gate belong to cell A; the load lock and transfer chamber to the mainframe
    if (c.assetId === "slit_valve" || c.assetId === "slit_valve_gate") return { ...c, scope: CELL_A };
    return { ...c, scope: MAINFRAME };
  }
  return { ...c, scope: CELL_A, nodeKey: `mod01.cell_a.${c.nodeKey}` };
}

function toolComponents(L: ProducerLayout): ComponentDef<ProducerLayout>[] {
  const cellB: ComponentDef<ProducerLayout>[] = Object.entries(CELL_B_ASSETS).map(([assetId, d]) => ({
    assetId: cellBAssetId(assetId),
    nodeKey: `mod01.cell_b.${assetId}`,
    name: `Cell B ${d.name}`,
    kind: d.kind,
    assembly: "twin_module",
    parentAssetId: "mod01_enclosure",
    description: "Twin module의 두 번째 cell(idle). Cell A와 같은 대표 형상을 정적으로 배치했고 joint, wafer, plasma가 없다.",
    materialRef: "aluminum_machined",
    materialNote: "Cell A와 같은 대표 재질",
    selectable: true,
    explode: PZ(0.35),
    cutaway: assetId === "matching_network" ? "keep" : "sector",
    axisXZ: L.tool.cellB,
    dimensions: () => [],
    scope: CELL_B,
  }));
  return [
    {
      assetId: "tool_enclosure",
      nodeKey: "tool.exterior",
      name: "Tool frame and exterior panels",
      kind: "enclosure",
      assembly: "tool_exterior",
      description: "Tool base frame, leveling foot, mainframe 외장 panel. Panel은 점검 모드에서 표시상 열리거나 숨겨진다(실제 door 상태가 아님).",
      materialRef: "painted_offwhite",
      materialNote: "Off-white powder-coated panels (가정)",
      selectable: true,
      shell: true,
      explode: NONE,
      cutaway: "keep",
      dimensions: (L) => [mm("Footprint X", L.tool.mod01.x1 + L.station.loadPort.deckR1), mm("Skin top above floor", L.tool.mod01.y1 - L.tool.floorY)],
      assumptions: ["전체 footprint와 높이는 공개 제품 사진 비례를 참고한 대표값이다. 실제 설치 장비의 치수가 아니다."],
      structuralBasis: "Applied Materials Producer platform (Twin-Chamber) 공개 설명. Producer SE의 특정 구성은 확인하지 않았다.",
      label: { text: "Producer SE (representative)", priority: 3 },
      scope: { activity: "active" },
    },
    { assetId: "mod01_enclosure", nodeKey: "mod01.enclosure", name: "Twin module MOD-01 enclosure", kind: "enclosure", assembly: "twin_module", parentAssetId: "tool_enclosure", description: "Cell A/B를 감싸는 module 외장과 상부 gas / RF box. 점검 모드에서 panel이 숨겨진다.", materialRef: "painted_offwhite", materialNote: "Painted panels (가정)", selectable: true, shell: true, explode: UP(0.5), cutaway: "keep", dimensions: (L) => [mm("Width (Z)", L.tool.mod01.z1 - L.tool.mod01.z0), mm("Depth (X)", L.tool.mod01.x1 - L.tool.mod01.x0)], scope: MOD01 },
    ...cellB,
    ...["MOD-02", "MOD-03"].map(
      (mid): ComponentDef<ProducerLayout> => ({
        assetId: `${mid.toLowerCase().replace("-", "")}_enclosure`,
        nodeKey: `${mid.toLowerCase().replace("-", "")}.enclosure`,
        name: `Twin module ${mid} (geometry only)`,
        kind: "module",
        assembly: "idle_modules",
        parentAssetId: "tool_enclosure",
        description: "Transfer chamber 옆 twin module의 외형. 내부 부품, joint, 센서를 두지 않는다(geometry only).",
        materialRef: "painted_offwhite",
        materialNote: "Painted panels (가정)",
        selectable: true,
        shell: true,
        explode: UP(0.4),
        cutaway: "keep",
        dimensions: () => [],
        scope: { moduleId: mid, activity: "geometry_only" },
      }),
    ),
    { assetId: "idle_load_ports", nodeKey: "efem.load_ports_idle", name: "Load ports LP2 / LP3 (idle)", kind: "station", assembly: "tool_exterior", parentAssetId: "efem_enclosure", description: "시연에 쓰지 않는 load port 두 개. Station id가 없고 OHT 인계 대상이 아니다.", materialRef: "painted_offwhite", materialNote: "Painted frame plate (가정)", selectable: true, explode: { dir: [-1, 0, 0], distance: 0.6 }, cutaway: "keep", dimensions: () => [], scope: { moduleId: "EFEM", activity: "idle" } },
    { assetId: "facility_interface", nodeKey: "tool.facility_interface", name: "Facility interface (gas / RF power / exhaust / coolant)", kind: "frame", assembly: "tool_exterior", parentAssetId: "tool_enclosure", description: "Twin module 후면 bulkhead. Fab utility가 들어오는 위치만 표현하며 배관 사양과 유량은 정하지 않았다.", materialRef: "stainless", materialNote: "Bulkhead fittings (가정)", selectable: true, explode: { dir: [1, 0, 0], distance: 0.3 }, cutaway: "keep", dimensions: () => [], scope: MOD01 },
  ];
}

export function buildProducerTemplate(L: ProducerLayout): EquipmentTemplate<ProducerLayout> {
  const pieces = ccpChamberPieces(L, { enclosure: "tool_enclosure", facility: "facility_interface" });
  const components: ComponentDef<ProducerLayout>[] = [...pieces.components.map((c) => scoped(c as ComponentDef<ProducerLayout>)), ...toolComponents(L)];
  const ports: PortDef[] = pieces.ports;
  const connections: ConnectionDef[] = pieces.connections;
  return {
    templateId: PRODUCER_TEMPLATE_ID,
    templateRevision: PRODUCER_TEMPLATE_REVISION,
    family: "PECVD_TWIN_CLUSTER",
    displayName: "Producer SE PECVD (representative)",
    title: "Producer SE based twin-module PECVD tool, representative CCP process cell configuration",
    assemblies: PRODUCER_ASSEMBLIES,
    components,
    ports,
    connections,
    joints: pieces.joints,
    modules: PRODUCER_MODULES,
    lifecycle: "current",
    reference: { ...AMAT_PLATFORM, vendor: "Applied Materials", model: "Producer SE", configurationKo: "프로젝트에서 선택한 CCP PECVD cell 구성(대표). Twin-Chamber 구조는 platform 공개 설명을 따르고, SE 설치 장비의 옵션과 치수는 확인하지 않았다." },
    facts: [
      { label: "Platform", value: "Producer (Twin-Chamber)", note: "Platform 공개 설명 기준. Producer family의 최신 옵션을 SE 사양으로 승계하지 않는다" },
      { label: "Process cell", value: "Representative CCP PECVD (cell A active)", note: "RF-powered showerhead, grounded heated pedestal. RF 주파수, gas recipe, 온도·압력 setpoint는 정하지 않았다" },
      { label: "Twin module", value: "Cell A active, cell B idle", note: "Cell 사이 shared pump / valve topology는 미확인(가정 없음)" },
      { label: "Wafer handling", value: "EFEM SCARA + load lock + linear blade shuttle", note: "대표 설계. 실제 중앙 vacuum robot 형식은 재현하지 않았다" },
      { label: "Remote clean source", value: "Not modeled", note: "Producer의 maintenance용 remote chamber-clean source는 이 configuration에 없다. 기존 standalone Remote PECVD 장비와 다른 개념이다" },
    ],
    station: {
      stationId: "LP.<instanceId>",
      loadPortAssetId: "load_port",
      seatLocal: L.station.seat,
      doorFacingLocal: L.station.doorFacing,
      transferEnclosureAssetId: "efem_enclosure",
      waferPresentationAssetId: "wafer",
      waferPresentationAssetIds: stationWaferAssets("wafer"),
      noteKo: "LP1 FOUP slot, EFEM robot, load-lock pin, blade shuttle, cell A lift pin, pedestal 순서로 wafer holder가 바뀐다.",
    },
  };
}
