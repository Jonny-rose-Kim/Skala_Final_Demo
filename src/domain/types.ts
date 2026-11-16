import type { Vec3Tuple } from "../config/geometry";

/** Stable identity of a functional component inside an equipment template. */
export type AssetId = string;
export type InstanceId = string;

/** Equipment families in this project (template ids stay stable; families only group behaviour). */
export type EquipmentFamily = "CCP_PECVD" | "REMOTE_PECVD" | "STI_CMP_ROTARY" | "OHT" | "CARRIER";

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
  | "module";

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
  | "none";

/** How the cutaway sector treats a component. */
export type CutawayBehavior =
  /** Revolved around an axis (instance axis or `axisXZ`): real sector geometry with section caps. */
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
  /** Never made transparent: hides a simplified internal transfer path on purpose. */
  alwaysOpaque?: boolean;
  /** Method syntax on purpose: keeps ComponentDef<Layout> assignable to ComponentDef<unknown> in registries. */
  dimensions(layout: L): DimensionEntry[];
  /** Design assumption notes shown in the inspector (Korean). */
  assumptions?: string[];
  /** Structural basis (which reference structure this follows) shown separately from assumptions. */
  structuralBasis?: string;
  /** Short label for the labels overlay (priority > 0 shows it). */
  label?: { text: string; priority: number };
}

export interface AssemblyDef {
  id: AssemblyId;
  name: string;
  description: string;
  order: number;
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

/** Equipment-level facts shown in the inspector (e.g. Source coupling = ICP). */
export interface TemplateFact {
  label: string;
  value: string;
  note?: string;
}

/**
 * Representative external interface of a process tool for carrier transport: load-port deck and the
 * simplified internal transfer boundary (closed enclosure; no detailed robot in V1).
 */
export interface StationInterfaceDef {
  stationId: string;
  loadPortAssetId: AssetId;
  /** FOUP bottom seating frame origin in the instance frame (m). */
  seatLocal: Vec3Tuple;
  /** Direction the FOUP front door faces in the instance frame (unit vector, XZ plane). */
  doorFacingLocal: Vec3Tuple;
  /** Opaque enclosure representing the simplified internal transfer path. */
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
  /** User-facing name (lists, tree, inspector, scenario selector). */
  displayName: string;
  title: string;
  assemblies: AssemblyDef[];
  components: ComponentDef<L>[];
  ports: PortDef[];
  connections: ConnectionDef[];
  joints: JointDef[];
  facts: TemplateFact[];
  station?: StationInterfaceDef;
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

export type EquipmentRole = "deposition" | "cmp" | "transport" | "carrier";

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
