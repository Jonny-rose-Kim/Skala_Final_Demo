/**
 * Compact declaration of a measurement seed (current-bay templates). One `SensorSpec` becomes the
 * instrument, its installation (mount body), its measurement point (target) and its channels with the
 * point bindings. Mount and target are separate on purpose: the body sits where it is bolted, the point is
 * what it measures, and each follows its own joint frame when the part moves.
 *
 * Nothing here binds data: sourceBindings stay empty (Data unbound). `candidateSourceKey` only records which
 * column of the team's synthetic dataset (db/JAVAS, v2.0 integration) would map onto the channel; it is a
 * documented crosswalk proposal, not a ChannelSourceBinding, and no value is ever read from it at runtime.
 */
import type { Vec3Tuple } from "../config/geometry";
import type { ChannelRole, DataShape, InstallationStatus, InstrumentDef, MeasurementChannelDefV2, MeasurementPointDefV2, MeasurementSeed, PointKind, Quantity } from "./measurement";

export interface ChannelSpec {
  /** Channel id suffix (full id: `${prefix}.ch.${sensorKey}.${suffix}`). */
  suffix: string;
  name: string;
  role: ChannelRole;
  quantity?: Quantity;
  unit: string;
  shape?: DataShape;
  /** Proposed crosswalk to a synthetic dataset column (documentation only, never read). */
  candidateSourceKey?: string;
  noteKo?: string;
  /** Derived / model channels: input channel ids (the channel then has no instrument of its own). */
  derivedFrom?: string[];
}

export interface SensorSpec {
  key: string;
  name: string;
  instrumentType: InstrumentDef["type"];
  principle: string;
  status: InstallationStatus;
  mount: { assetId: string; position: Vec3Tuple; jointId?: string };
  point: {
    name: string;
    targetAssetId: string;
    position: Vec3Tuple;
    jointId?: string;
    kind?: PointKind;
    quantity: Quantity;
    radius?: number;
    extent?: Vec3Tuple;
    pathTo?: Vec3Tuple;
    axis?: Vec3Tuple;
    reference?: MeasurementPointDefV2["reference"];
    coverageKo: string;
  };
  channels: ChannelSpec[];
  noteKo: string;
}

export function buildSeed(templateId: string, seedRevision: string, prefix: string, configurationRevision: string, sensors: SensorSpec[]): MeasurementSeed {
  const seed: MeasurementSeed = { templateId, seedRevision, instruments: [], installations: [], points: [], channels: [], pointBindings: [], sourceBindings: [], calibrations: [] };
  for (const s of sensors) {
    const instrumentId = `${prefix}.inst.${s.key}`;
    const pointId = `${prefix}.mp.${s.key}`;
    seed.instruments.push({ instrumentId, name: s.name, type: s.instrumentType, principle: s.principle, installationStatus: s.status, noteKo: s.noteKo });
    seed.installations.push({
      installationId: `${prefix}.install.${s.key}`,
      instrumentId,
      mountedOnAssetId: s.mount.assetId,
      mountFrameJointId: s.mount.jointId,
      mountPosition: s.mount.position,
      installationStatus: s.status,
      placementBasis: "design_assumption",
      revision: configurationRevision,
    });
    const pt = s.point;
    const kind: PointKind = pt.kind ?? "point";
    seed.points.push({
      pointId,
      name: pt.name,
      targetAssetId: pt.targetAssetId,
      frameJointId: pt.jointId,
      pointKind: kind,
      geometry: { position: pt.position, radius: pt.radius, extent: pt.extent, pathTo: pt.pathTo, axis: pt.axis },
      quantity: pt.quantity,
      reference: pt.reference ?? {},
      coverageKo: pt.coverageKo,
      noteKo: s.noteKo,
      candidate: s.status !== "installed",
    });
    for (const c of s.channels) {
      const channelId = `${prefix}.ch.${s.key}.${c.suffix}`;
      const quantity = c.quantity ?? pt.quantity;
      const ch: MeasurementChannelDefV2 = {
        channelId,
        instrumentId: c.derivedFrom ? null : instrumentId,
        derivedFrom: c.derivedFrom,
        name: c.name,
        quantity,
        canonicalUnit: c.unit,
        dataShape: c.shape ?? (quantity === "status_binary" || quantity === "presence" ? "boolean" : quantity === "status_enum" ? "enum" : quantity === "optical_spectrum" ? "spectrum" : "scalar"),
        channelRole: c.role,
        referenceNoteKo: [c.noteKo, c.candidateSourceKey ? `제안 crosswalk(합성 데이터셋, 미연결): ${c.candidateSourceKey}` : ""].filter(Boolean).join(" "),
      };
      seed.channels.push(ch);
      // a channel binds to the point only when it observes the point's quantity (setpoints / commands too)
      if (quantity === pt.quantity) seed.pointBindings.push({ bindingId: `${prefix}.bind.${s.key}.${c.suffix}`, channelId, pointId, role: "primary", configurationRevision });
    }
    seed.calibrations.push({ calibrationId: `${prefix}.cal.${s.key}`, instrumentId, status: "unknown" });
  }
  return seed;
}

/** Candidate crosswalk rows of a seed (for docs and tests): channel id -> proposed synthetic column. */
export function crosswalkRows(sensors: SensorSpec[], prefix: string): { channelId: string; role: ChannelRole; unit: string; candidateSourceKey: string | null; status: InstallationStatus }[] {
  return sensors.flatMap((s) => s.channels.map((c) => ({ channelId: `${prefix}.ch.${s.key}.${c.suffix}`, role: c.role, unit: c.unit, candidateSourceKey: c.candidateSourceKey ?? null, status: s.status })));
}
