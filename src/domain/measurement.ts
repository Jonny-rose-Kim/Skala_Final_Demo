/**
 * Measurement data contract shared by the four equipment templates.
 *
 * Separate objects, deliberately not merged into one "sensor" record:
 *   Instrument              what physically measures (identity, principle, installation status)
 *   InstrumentInstallation  where the instrument body is mounted (component, frame, pose, basis)
 *   MeasurementPoint        what is observed, where and with what coverage (point/region/optical path/axis)
 *   MeasurementChannel      one output of an instrument (quantity, unit, data shape, role)
 *   ChannelPointBinding     channel <-> point (semantic link, revisioned)
 *   ChannelSourceBinding    channel <-> data provider (none in V1: every channel is "Data unbound")
 *   CalibrationRevision     calibration lineage (unknown in V1; never fabricated)
 *   Observation             a sample (type only; nothing in the frontend ever creates one)
 *
 * A point being linked to a channel does not mean data exists. Mount, point link and data binding are
 * three separate states and are never collapsed into one "connected" boolean.
 */
import type { Vec3Tuple } from "../config/geometry";
import type { AssetId, EquipmentTemplate } from "./types";

export type Quantity =
  | "pressure"
  | "temperature"
  | "flow_gas"
  | "flow_liquid"
  | "rf_power"
  | "valve_position"
  | "voltage"
  | "position_linear"
  | "position_angular"
  | "speed_rotational"
  | "status_binary"
  | "status_enum"
  | "optical_spectrum"
  | "motor_current"
  | "torque_estimate"
  | "presence"
  | "identity";

/** Canonical units accepted per quantity (validation refuses silent mismatches). */
export const QUANTITY_UNITS: Record<Quantity, string[]> = {
  pressure: ["Pa", "kPa", "Torr", "mTorr"],
  temperature: ["degC", "K"],
  flow_gas: ["sccm", "slm"],
  flow_liquid: ["mL/min", "L/min"],
  rf_power: ["W"],
  valve_position: ["%"],
  voltage: ["V"],
  position_linear: ["m", "mm"],
  position_angular: ["deg", "rad"],
  speed_rotational: ["rpm"],
  status_binary: ["bool"],
  status_enum: ["enum"],
  optical_spectrum: ["counts"],
  motor_current: ["A"],
  torque_estimate: ["N·m"],
  presence: ["bool"],
  identity: ["string"],
};

export type InstallationStatus = "installed" | "planned" | "not_installed" | "candidate";
export type PlacementBasis = "design_assumption" | "vendor_drawing" | "measured";

export interface InstrumentDef {
  instrumentId: string;
  name: string;
  /** Family of instrument; `integrated_instrument` = feedback integrated in a drive, no separate body. */
  type:
    | "pressure_gauge"
    | "thermocouple"
    | "mfc"
    | "liquid_flow_meter"
    | "directional_coupler"
    | "encoder"
    | "limit_switch"
    | "proximity_sensor"
    | "optical_spectrometer"
    | "pressure_transducer"
    | "integrated_instrument"
    | "id_reader"
    | "obstruction_sensor";
  principle: string;
  installationStatus: InstallationStatus;
  noteKo?: string;
}

export interface InstrumentInstallationDef {
  installationId: string;
  instrumentId: string;
  mountedOnAssetId: AssetId;
  /** Joint frame the mount follows (moving components); undefined = instance frame. */
  mountFrameJointId?: string;
  /** Body position in the instance frame at rest pose (m). */
  mountPosition: Vec3Tuple;
  installationStatus: InstallationStatus;
  placementBasis: PlacementBasis;
  revision: string;
  validFrom?: string;
  validTo?: string;
}

export type PointKind = "point" | "region" | "optical_path" | "line_reference" | "axis_reference";

export interface MeasurementPointGeometry {
  /** Reference position in the instance frame at rest pose (m). */
  position: Vec3Tuple;
  /** Region half extents (region) or path end (optical_path / line_reference). */
  extent?: Vec3Tuple;
  pathTo?: Vec3Tuple;
  /** Footprint radius (optical_path) or region radius. */
  radius?: number;
  /** Axis direction (axis_reference). */
  axis?: Vec3Tuple;
}

export interface MeasurementPointDefV2 {
  pointId: string;
  name: string;
  targetAssetId: AssetId;
  /** Joint frame the point follows (moving components); undefined = instance frame. */
  frameJointId?: string;
  pointKind: PointKind;
  geometry: MeasurementPointGeometry;
  quantity: Quantity;
  reference: {
    pressureReference?: "absolute" | "gauge";
    flowStandard?: string;
    positionHome?: string;
    frameNote?: string;
  };
  /** Coverage / resolution statement (Korean). */
  coverageKo: string;
  noteKo: string;
  /** Candidate points exist without an instrument (shown as 설치 후보 / Not installed). */
  candidate?: boolean;
  /** Resolver id for points whose coverage depends on two moving frames (e.g. optical footprint). */
  resolver?: string;
}

export type DataShape = "scalar" | "boolean" | "enum" | "vector" | "spectrum" | "waveform" | "image";
export type ChannelRole = "measurement" | "status" | "derived_estimate" | "model_output";

export interface MeasurementChannelDefV2 {
  channelId: string;
  /** Physical channels have an instrument; derived/model channels may not (they reference inputs instead). */
  instrumentId: string | null;
  name: string;
  quantity: Quantity;
  canonicalUnit: string;
  dataShape: DataShape;
  channelRole: ChannelRole;
  referenceNoteKo?: string;
  /** Input channels / model lineage for derived channels. */
  derivedFrom?: string[];
}

export interface ChannelPointBindingDef {
  bindingId: string;
  channelId: string;
  pointId: string;
  role: "primary" | "secondary";
  configurationRevision: string;
  validFrom?: string;
  validTo?: string;
}

export interface ChannelSourceBindingDef {
  bindingId: string;
  channelId: string;
  providerKind: "backend_snapshot" | "recorded_run" | "external_import" | "model_output";
  providerId: string;
  sourceKey: string;
  timeDomain: "simulation_time" | "replay_time" | "wall_clock";
  unitConversion?: string;
  adapterRevision: string;
}

export interface CalibrationRevisionDef {
  calibrationId: string;
  instrumentId: string;
  channelId?: string;
  status: "unknown" | "unconfigured" | "configured";
  reference?: string;
  validFrom?: string;
  validTo?: string;
}

/** Observation shape (documented boundary; the frontend never constructs one in V1). */
export interface Observation {
  channelId: string;
  pointBindingRevision: string;
  sampleTime: number;
  timeDomain: ChannelSourceBindingDef["timeDomain"];
  value: number | boolean | string | number[] | null;
  unit: string;
  quality: "good" | "uncertain" | "bad" | "missing";
  lineage: { origin: "measured" | "model" | "import_unverified"; providerId: string };
}

export interface MeasurementSeed {
  templateId: string;
  seedRevision: string;
  instruments: InstrumentDef[];
  installations: InstrumentInstallationDef[];
  points: MeasurementPointDefV2[];
  channels: MeasurementChannelDefV2[];
  pointBindings: ChannelPointBindingDef[];
  sourceBindings: ChannelSourceBindingDef[];
  calibrations: CalibrationRevisionDef[];
}

export type DataStatus = "unbound" | "bound";

/** Convenience lookups over one seed (pure functions, no caching across seeds). */
export class MeasurementIndex {
  readonly instrumentsById = new Map<string, InstrumentDef>();
  readonly pointsById = new Map<string, MeasurementPointDefV2>();
  readonly channelsById = new Map<string, MeasurementChannelDefV2>();
  readonly installationsByInstrument = new Map<string, InstrumentInstallationDef[]>();

  constructor(readonly seed: MeasurementSeed) {
    for (const i of seed.instruments) this.instrumentsById.set(i.instrumentId, i);
    for (const p of seed.points) this.pointsById.set(p.pointId, p);
    for (const c of seed.channels) this.channelsById.set(c.channelId, c);
    for (const ins of seed.installations) {
      const arr = this.installationsByInstrument.get(ins.instrumentId) ?? [];
      arr.push(ins);
      this.installationsByInstrument.set(ins.instrumentId, arr);
    }
  }

  installationsOn(assetId: AssetId): InstrumentInstallationDef[] {
    return this.seed.installations.filter((i) => i.mountedOnAssetId === assetId);
  }
  instrumentsOn(assetId: AssetId): InstrumentDef[] {
    return this.installationsOn(assetId)
      .map((i) => this.instrumentsById.get(i.instrumentId))
      .filter((x): x is InstrumentDef => !!x);
  }
  pointsOn(assetId: AssetId): MeasurementPointDefV2[] {
    return this.seed.points.filter((p) => p.targetAssetId === assetId);
  }
  channelsOf(instrumentId: string): MeasurementChannelDefV2[] {
    return this.seed.channels.filter((c) => c.instrumentId === instrumentId);
  }
  pointBindingsOf(channelId: string): ChannelPointBindingDef[] {
    return this.seed.pointBindings.filter((b) => b.channelId === channelId);
  }
  pointsOfChannel(channelId: string): MeasurementPointDefV2[] {
    return this.pointBindingsOf(channelId)
      .map((b) => this.pointsById.get(b.pointId))
      .filter((x): x is MeasurementPointDefV2 => !!x);
  }
  channelsObserving(pointId: string): MeasurementChannelDefV2[] {
    return this.seed.pointBindings
      .filter((b) => b.pointId === pointId)
      .map((b) => this.channelsById.get(b.channelId))
      .filter((x): x is MeasurementChannelDefV2 => !!x);
  }
  dataStatus(channelId: string): DataStatus {
    return this.seed.sourceBindings.some((b) => b.channelId === channelId) ? "bound" : "unbound";
  }
  /** True when a point is a candidate without any installed instrument channel observing it. */
  isNotInstalled(pointId: string): boolean {
    const chans = this.channelsObserving(pointId);
    if (!chans.length) return true;
    return chans.every((c) => {
      const inst = c.instrumentId ? this.instrumentsById.get(c.instrumentId) : undefined;
      return !inst || inst.installationStatus !== "installed";
    });
  }
  installationOf(instrumentId: string): InstrumentInstallationDef | undefined {
    return this.installationsByInstrument.get(instrumentId)?.[0];
  }
}

/** Referential and semantic validation of a seed against its equipment template. */
export function validateMeasurementSeed(seed: MeasurementSeed, template: EquipmentTemplate<unknown>): string[] {
  const errors: string[] = [];
  const assets = new Set(template.components.map((c) => c.assetId));
  const joints = new Set(template.joints.map((j) => j.jointId));
  const unique = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`${label}: duplicate id ${id}`);
      seen.add(id);
    }
  };
  unique("instrument", seed.instruments.map((i) => i.instrumentId));
  unique("installation", seed.installations.map((i) => i.installationId));
  unique("point", seed.points.map((p) => p.pointId));
  unique("channel", seed.channels.map((c) => c.channelId));
  unique("pointBinding", seed.pointBindings.map((b) => b.bindingId));
  const instrumentIds = new Set(seed.instruments.map((i) => i.instrumentId));
  const pointIds = new Set(seed.points.map((p) => p.pointId));
  const channelIds = new Set(seed.channels.map((c) => c.channelId));
  for (const ins of seed.installations) {
    if (!instrumentIds.has(ins.instrumentId)) errors.push(`installation ${ins.installationId}: unknown instrument ${ins.instrumentId}`);
    if (!assets.has(ins.mountedOnAssetId)) errors.push(`installation ${ins.installationId}: unknown mount asset ${ins.mountedOnAssetId}`);
    if (ins.mountFrameJointId && !joints.has(ins.mountFrameJointId)) errors.push(`installation ${ins.installationId}: unknown joint ${ins.mountFrameJointId}`);
  }
  for (const i of seed.instruments) {
    const installs = seed.installations.filter((x) => x.instrumentId === i.instrumentId);
    if (i.installationStatus === "installed" && installs.length === 0) errors.push(`instrument ${i.instrumentId}: installed but has no installation (mount)`);
    if (i.installationStatus !== "installed" && installs.some((x) => x.installationStatus === "installed")) errors.push(`instrument ${i.instrumentId}: installation status mismatch`);
  }
  for (const p of seed.points) {
    if (!assets.has(p.targetAssetId)) errors.push(`point ${p.pointId}: unknown target asset ${p.targetAssetId}`);
    if (p.frameJointId && !joints.has(p.frameJointId)) errors.push(`point ${p.pointId}: unknown joint ${p.frameJointId}`);
    if (p.quantity === "pressure" && !p.reference.pressureReference) errors.push(`point ${p.pointId}: pressure point needs absolute/gauge reference`);
    if (p.quantity === "flow_gas" && !p.reference.flowStandard) errors.push(`point ${p.pointId}: gas flow point needs its standard reference conditions`);
    if ((p.quantity === "position_linear" || p.quantity === "position_angular") && !p.reference.positionHome) errors.push(`point ${p.pointId}: position point needs a home/reference statement`);
    if (p.pointKind === "optical_path" && !p.geometry.pathTo) errors.push(`point ${p.pointId}: optical path needs pathTo`);
    if (p.pointKind === "region" && !p.geometry.extent && !p.geometry.radius) errors.push(`point ${p.pointId}: region needs extent or radius`);
  }
  for (const c of seed.channels) {
    if (c.instrumentId !== null && !instrumentIds.has(c.instrumentId)) errors.push(`channel ${c.channelId}: unknown instrument ${c.instrumentId}`);
    if (c.instrumentId === null && (c.channelRole === "measurement" || c.channelRole === "status")) errors.push(`channel ${c.channelId}: physical channel must reference an instrument`);
    if (c.instrumentId === null && !(c.derivedFrom && c.derivedFrom.length)) errors.push(`channel ${c.channelId}: derived channel must list its input lineage`);
    const units = QUANTITY_UNITS[c.quantity];
    if (!units || !units.includes(c.canonicalUnit)) errors.push(`channel ${c.channelId}: unit ${c.canonicalUnit} not valid for ${c.quantity}`);
    for (const d of c.derivedFrom ?? []) if (!channelIds.has(d)) errors.push(`channel ${c.channelId}: unknown input channel ${d}`);
    if (c.dataShape === "spectrum" && c.quantity !== "optical_spectrum") errors.push(`channel ${c.channelId}: spectrum shape requires optical_spectrum quantity`);
  }
  const primaryPerChannel = new Map<string, number>();
  for (const b of seed.pointBindings) {
    if (!channelIds.has(b.channelId)) errors.push(`binding ${b.bindingId}: unknown channel ${b.channelId}`);
    if (!pointIds.has(b.pointId)) errors.push(`binding ${b.bindingId}: unknown point ${b.pointId}`);
    const ch = seed.channels.find((c) => c.channelId === b.channelId);
    const pt = seed.points.find((p) => p.pointId === b.pointId);
    if (ch && pt && ch.quantity !== pt.quantity) errors.push(`binding ${b.bindingId}: quantity mismatch (${ch.quantity} vs ${pt.quantity})`);
    if (b.role === "primary") primaryPerChannel.set(b.channelId, (primaryPerChannel.get(b.channelId) ?? 0) + 1);
  }
  for (const [ch, n] of primaryPerChannel) if (n > 1) errors.push(`channel ${ch}: more than one active primary point binding`);
  for (const c of seed.channels) {
    if ((c.channelRole === "measurement" || c.channelRole === "status") && !seed.pointBindings.some((b) => b.channelId === c.channelId)) errors.push(`channel ${c.channelId}: no measurement point binding`);
  }
  for (const b of seed.sourceBindings) if (!channelIds.has(b.channelId)) errors.push(`source binding ${b.bindingId}: unknown channel ${b.channelId}`);
  for (const cal of seed.calibrations) {
    if (!instrumentIds.has(cal.instrumentId)) errors.push(`calibration ${cal.calibrationId}: unknown instrument`);
    if (cal.status === "configured" && !cal.reference) errors.push(`calibration ${cal.calibrationId}: configured calibration needs a reference`);
  }
  return errors;
}
