import type { Vec3Tuple } from "../config/geometry";

/** Stable identity of a functional component inside an equipment template. */
export type AssetId = string;
export type InstanceId = string;

/**
 * Equipment families in this project (template ids stay stable; families only group behaviour).
 * Legacy (V1 bay): CCP_PECVD, REMOTE_PECVD, STI_CMP_ROTARY. Current bay: PECVD_TWIN_CLUSTER (Producer SE
 * based), ETCH_CCP_RIE_CLUSTER (Tactras based), WET_CLEAN_SINGLE_WAFER (CELLESTA-i MD based), OHT, CARRIER.
 */
export type EquipmentFamily = "CCP_PECVD" | "REMOTE_PECVD" | "STI_CMP_ROTARY" | "PECVD_TWIN_CLUSTER" | "ETCH_CCP_RIE_CLUSTER" | "WET_CLEAN_SINGLE_WAFER" | "OHT" | "CARRIER";

/**
 * Assembly ids are template-specific strings. The CCP template keeps its original literal ids; the other
 * templates define their own. Validation checks that every component references an assembly of its template.
 */
export type AssemblyId = string;

export type ComponentKind =
  | "body"
  | "lid"
  | "liner"
  | "electrode"
  | "insulator"
  | "gas"
  | "rf"
  | "support"
  | "wafer"
  | "heater"
  | "vacuum"
  | "valve"
  | "access"
  | "sensor"
  | "frame"
  | "effect"
  // added for the remote source, CMP and OHT templates
  | "coil"
  | "tube"
  | "enclosure"
  | "station"
  | "drive"
  | "pad"
  | "head"
  | "membrane"
  | "ring"
  | "conditioner"
  | "liquid"
  | "optical"
  | "rail"
  | "vehicle"
  | "hoist"
  | "gripper"
  | "carrier"
  | "module"
  // added for the etch / wet-clean tools and whole-tool exteriors
  | "chuck"
  | "nozzle"
  | "cup"
  | "panel";

export type MaterialRef =
  | "aluminum_machined"
  | "aluminum_anodized"
  | "stainless"
  | "painted_housing"
  | "ceramic"
  | "quartz"
  | "silicon_wafer"
  | "copper"
  | "nichrome"
  | "dark_steel"
  // added for the new templates
  | "painted_dark"
  | "polymer_pad"
  | "polymer_white"
  | "rubber_membrane"
  | "foup_polymer"
  | "safety_marking"
  | "belt_fabric"
  // added for the detailed equipment shells, robots and wet zone
  | "painted_offwhite"
  | "polymer_gray"
  | "wafer_front"
  // added for the documentary-informed bay (2026-11-25): red position strips, FOUP shell and window plates
  | "marking_red"
  | "foup_shell"
  | "amber_polycarbonate"
  | "indicator_green"
  | "indicator_blue"
  | "none";

/** How the cutaway sector treats a component. */
export type CutawayBehavior =
  /** Revolved around an axis (instance axis or `axisXZ`), or clipped by the sector planes through the instance axis: real sector geometry with section caps. */
  | "sector"
  /** Attached at an azimuth: hidden when its azimuth lies inside the removed sector. */
  | "hide-in-sector"
  /** Never cut (peripheral equipment far from the chamber). */
  | "keep";

export interface ExplodeSpec {
  /** Direction in the instance frame; "radial" uses the component azimuth. */
  dir: Vec3Tuple | "radial";
  /** Display offset at explode amount 1.0 (meters). */
  distance: number;
}

export interface DimensionEntry {
  label: string;
  valueM: number;
}

/**
 * Kinematic joint of a template. Joint poses come from the preview evaluator (scripted) and are display
 * state; they never become motor feedback. Parts attached to a joint are authored in the instance frame
 * at the rest pose (all joint values 0) and re-based onto the joint origin by the scene instance.
 */
export interface JointDef {
  jointId: string;
  name: string;
  parentJointId?: string;
  kind: "revolute" | "prismatic" | "path";
  /** Joint origin in the parent joint frame (or instance frame). */
  origin: Vec3Tuple;
  /** Rotation axis (revolute) or translation direction (prismatic), unit vector in the parent frame. */
  axis: Vec3Tuple;
  /** Allowed value range (rad or m). Path joints use path distance (m). */
  range: [number, number];
  unit: "rad" | "m";
  /** Human description of the home / reference (Korean). */
  homeNote: string;
  /**
   * Spin joints of revolved parts: while the sector cutaway is active on this instance the displayed
   * rotation is held at 0 so the removed sector does not turn with the part (display rule, not a stop).
   */
  freezeInCutaway?: boolean;
}

export interface ComponentDef<L = unknown> {
  assetId: AssetId;
  /** Semantic key used by the scene mapping and by GLB manifests (never parsed from mesh names). */
  nodeKey: string;
  name: string;
  kind: ComponentKind;
  assembly: AssemblyId;
  parentAssetId?: AssetId;
  description: string;
  materialRef: MaterialRef;
  materialNote: string;
  selectable: boolean;
  explode: ExplodeSpec;
  cutaway: CutawayBehavior;
  /** Azimuth (deg) for azimuth-attached parts. */
  azimuthDeg?: number;
  /** Kinematic joint this component follows (display pose from the preview evaluator). */
  jointId?: string;
  /** Local (x, z) of the revolve axis for sector parts that are not coaxial with the instance axis. */
  axisXZ?: [number, number];
  /** Included in the x-ray "shell" set (made transparent). */
  shell?: boolean;
  /** Never made transparent in the x-ray view (kept opaque on purpose). */
  alwaysOpaque?: boolean;
  /** Method syntax on purpose: keeps ComponentDef<Layout> assignable to ComponentDef<unknown> in registries. */
  dimensions(layout: L): DimensionEntry[];
  /** Design assumption notes (Korean). */
  assumptions?: string[];
  /** Structural basis (which reference structure this follows) shown separately from assumptions. */
  structuralBasis?: string;
  /** Short label for the labels overlay (priority > 0 shows it). */
  label?: { text: string; priority: number };
  /** Tool-internal scope (module / chamber) for whole-tool templates; absent = tool level. */
  scope?: ComponentScope;
}

/**
 * Where a component sits inside a whole tool. `moduleId` / `chamberId` are template-scoped ids (e.g.
 * "MOD-01", "CELL-A"); the plant-wide id is `${instanceId}.${moduleId}.${chamberId}`.
 * `activity`: active = runs in the demonstration; idle = present and complete but not used by the
 * demonstration; geometry_only = exterior / silhouette only (no internal parts, joints or sensors).
 */
export interface ComponentScope {
  moduleId?: string;
  chamberId?: string;
  activity: "active" | "idle" | "geometry_only";
}

/** What a geometry or fact is based on. `official_public` = OEM public page / report; never OEM CAD. */
export type ReferenceBasis = "official_public" | "public_secondary" | "design_assumption" | "measured";

/** Scope of a reference: the product family, the platform, the exact model, or the chosen configuration. */
export type ReferenceScope = "family" | "platform" | "model" | "configuration";

export interface ReferenceNote {
  basis: ReferenceBasis;
  scope: ReferenceScope;
  /** Public URLs consulted (structure / outline only). Empty for pure design assumptions. */
  sourceUrls: string[];
  /** How the dimensions were chosen (e.g. "representative, scaled from the public product image"). */
  dimensionBasis: string;
}

export interface AssemblyDef {
  id: AssemblyId;
  name: string;
  description: string;
  order: number;
  /** Reference basis of this assembly's geometry (whole-tool templates). */
  reference?: ReferenceNote;
}

/** Module / chamber hierarchy of a whole tool (mainframe -> module -> chamber). */
export interface ToolModuleDef {
  moduleId: string;
  name: string;
  kind: "process_module" | "twin_process_module" | "load_lock" | "transfer" | "front_end" | "load_port";
  activity: ComponentScope["activity"];
  chambers: { chamberId: string; name: string; activity: ComponentScope["activity"]; noteKo?: string }[];
  /** Module placement in the instance frame (rest pose); joints and anchors of the module use the same frame. */
  origin: Vec3Tuple;
  yawDeg: number;
  noteKo: string;
}

export type PortMedium = "gas" | "vacuum" | "rf" | "electrical" | "thermal" | "mechanical" | "wafer" | "liquid" | "pneumatic" | "optical" | "carrier" | "coolant";

export interface PortDef {
  portId: string;
  assetId: AssetId;
  medium: PortMedium;
  role: "inlet" | "outlet" | "bidirectional" | "signal";
  name: string;
}

export interface ConnectionDef {
  connectionId: string;
  kind: PortMedium;
  from: { assetId: AssetId; portId: string };
  to: { assetId: AssetId; portId: string };
  description: string;
}

/** Equipment-level facts (e.g. Source coupling = ICP). */
export interface TemplateFact {
  label: string;
  value: string;
  note?: string;
}

/**
 * Representative external interface of a process tool for carrier transport: load-port deck, the FOUP
 * seat frame and the presentation assets the wafer is shown on while the tool handles it.
 */
export interface StationInterfaceDef {
  stationId: string;
  loadPortAssetId: AssetId;
  /** FOUP bottom seating frame origin in the instance frame (m). */
  seatLocal: Vec3Tuple;
  /** Direction the FOUP front door faces in the instance frame (unit vector, XZ plane). */
  doorFacingLocal: Vec3Tuple;
  /** EFEM / front-end enclosure of the station (its panels are removable inspection covers). */
  transferEnclosureAssetId: AssetId;
  /** Asset that presents the wafer while it is on the process stage / head. */
  waferPresentationAssetId: AssetId;
  /** All wafer presentation assets of the template (one per internal holder); defaults to the one above. */
  waferPresentationAssetIds?: AssetId[];
  noteKo: string;
}

export interface EquipmentTemplate<L = unknown> {
  templateId: string;
  templateRevision: string;
  family: EquipmentFamily;
  /** User-facing name (lists, tree, scenario selector). */
  displayName: string;
  title: string;
  assemblies: AssemblyDef[];
  components: ComponentDef<L>[];
  ports: PortDef[];
  connections: ConnectionDef[];
  joints: JointDef[];
  facts: TemplateFact[];
  station?: StationInterfaceDef;
  /** Wafer presentation assets of templates without a station (e.g. the FOUP slot wafer). */
  waferPresentationAssetIds?: AssetId[];
  /** Whole-tool hierarchy (mainframe -> modules -> chambers). Absent on single-chamber legacy templates. */
  modules?: ToolModuleDef[];
  /** Model / platform reference of the whole template (what is public, what is assumed). */
  reference?: ReferenceNote & { vendor: string; model: string; configurationKo: string };
  /** Legacy templates stay registered for fixtures and old routes but are not offered in the default bay. */
  lifecycle?: "current" | "legacy";
}

/** Instrument installed on the equipment (legacy V1 shape; kept for the CCP compatibility mapping). */
export interface SensorInstanceDef {
  sensorId: string;
  name: string;
  principle: string;
  /** Component the body is mounted on (local frame of the equipment). */
  mountAssetId: AssetId;
  channels: MeasurementChannelDef[];
}

export interface MeasurementChannelDef {
  channelId: string;
  name: string;
  quantity: "pressure" | "temperature" | "flow" | "rf_power" | "valve_position" | "voltage";
  unit: string;
  payloadType: "scalar" | "vector" | "spectrum" | "waveform" | "image";
  /** Measurement point this channel observes (what is measured, not where the body sits). */
  measurementPointId: string;
}

export interface MeasurementPointDef {
  pointId: string;
  name: string;
  /** Component or region being measured. */
  targetAssetId: AssetId;
  quantity: MeasurementChannelDef["quantity"];
  /** Position in the instance frame (meters). */
  position: Vec3Tuple;
  note: string;
}

export interface ChannelBinding {
  channelId: string;
  /** V1 keeps every channel unbound: no data source, no fabricated observations. */
  source: "unbound";
  installationRevision: string;
}

export type EquipmentRole = "deposition" | "etch" | "wet_clean" | "cmp" | "transport" | "carrier";

export interface EquipmentInstanceDef {
  instanceId: InstanceId;
  templateId: string;
  displayName: string;
  /** World placement of the instance frame. */
  position: Vec3Tuple;
  rotationYDeg: number;
  /** Whether the detailed chamber (full plasma volume etc.) is built for this instance. */
  detailLevel: "detailed" | "summary";
  /** Role in the demonstration routes (derived from the template family when omitted). */
  role?: EquipmentRole;
  /** Mobile entities (carriers) take their pose from the preview evaluator instead of `position`. */
  mobile?: boolean;
}
