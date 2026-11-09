import type { ChamberLayout, Vec3Tuple } from "../config/geometry";

/** Stable identity of a functional component inside an equipment template. */
export type AssetId = string;
export type InstanceId = string;

export type AssemblyId =
  | "chamber_body"
  | "gas_distribution"
  | "rf_assembly"
  | "wafer_support"
  | "vacuum_exhaust"
  | "access_inspection"
  | "visualization";

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
  | "effect";

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
  | "none";

/** How the cutaway sector treats a component. */
export type CutawayBehavior =
  /** Revolved around the chamber axis: real sector geometry with section caps. */
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

export interface ComponentDef {
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
  dimensions: (layout: ChamberLayout) => DimensionEntry[];
  /** Design assumption notes shown in the inspector (Korean). */
  assumptions?: string[];
}

export interface AssemblyDef {
  id: AssemblyId;
  name: string;
  description: string;
  order: number;
}

export type PortMedium = "gas" | "vacuum" | "rf" | "electrical" | "thermal" | "mechanical" | "wafer";

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

export interface EquipmentTemplate {
  templateId: string;
  templateRevision: string;
  title: string;
  assemblies: AssemblyDef[];
  components: ComponentDef[];
  ports: PortDef[];
  connections: ConnectionDef[];
}

/** Instrument installed on the equipment. */
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

export interface EquipmentInstanceDef {
  instanceId: InstanceId;
  templateId: string;
  displayName: string;
  /** World placement of the instance frame. */
  position: Vec3Tuple;
  rotationYDeg: number;
  /** Whether the detailed chamber (full plasma volume etc.) is built for this instance. */
  detailLevel: "detailed" | "summary";
}
