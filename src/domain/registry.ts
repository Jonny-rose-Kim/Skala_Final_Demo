/**
 * Equipment template registry: one bundle per template id (template + layout + geometry builder + camera
 * presets + measurement seed). Scene-side effect factories are registered separately so this module stays
 * free of renderer imports. Bundles are registered by `src/equipment/index.ts`.
 */
import type { AngularInterval } from "../config/geometry";
import type { PartGeometry } from "../geometry/chamberParts";
import type { CameraPreset } from "../scene/cameraPresets";
import type { MeasurementSeed } from "./measurement";
import { MeasurementIndex, validateMeasurementSeed } from "./measurement";
import type { ComponentDef, EquipmentTemplate } from "./types";

export interface GeometrySourceInfo {
  geometryRevision: string;
  kind: "assumed" | "measured" | "vendor";
  note: string;
}

export interface EquipmentBundle<L = unknown> {
  template: EquipmentTemplate<L>;
  layout: L;
  geometry: GeometrySourceInfo;
  buildParts: (layout: L) => PartGeometry[];
  /** Angular keep-outs for cutaway sector snapping (instance axis). */
  cutawayKeepOuts: AngularInterval[];
  /** Default cutaway sector (deg) that reads well for this template. */
  cutawayDefault: { azimuthDeg: number; sweepDeg: number };
  cameraPresets: CameraPreset[];
  /** Camera preset id used as "overview" of this equipment. */
  overviewPresetId: string;
  measurement: MeasurementSeed;
  /** Validation of the geometry config (errors + warnings as strings). */
  validate: () => { errors: string[]; warnings: string[] };
  /** Assets lit by the plasma point-light approximation (deposition tools). */
  plasmaLitAssets?: string[];
  /** Local plasma glow center (for the point light) when the template has a discharge region. */
  plasmaCenter?: (layout: L) => [number, number, number];
  /** Path joints: pose along the rail for a path distance (OHT). */
  pathPose?: (layout: L, jointId: string, s: number) => { position: [number, number, number]; yawRad: number };
  /** Transport equipment: seat frame of a carried FOUP, authored in the instance frame at the rest pose and following `jointId`. */
  carrierAttach?: { jointId: string; seatLocal: [number, number, number] };
  /** Carrier templates: seat (origin) and top handling flange frames in the carrier frame. */
  carrierFrames?: { seatLocal: [number, number, number]; flangeLocal: [number, number, number]; doorFacingLocal: [number, number, number] };
}

const bundles = new Map<string, EquipmentBundle<unknown>>();
const indices = new Map<string, MeasurementIndex>();

export function registerBundle<L>(bundle: EquipmentBundle<L>): void {
  bundles.set(bundle.template.templateId, bundle as unknown as EquipmentBundle<unknown>);
  indices.set(bundle.template.templateId, new MeasurementIndex(bundle.measurement));
}

export function getBundle(templateId: string): EquipmentBundle<unknown> | undefined {
  return bundles.get(templateId);
}

export function requireBundle(templateId: string): EquipmentBundle<unknown> {
  const b = bundles.get(templateId);
  if (!b) throw new Error(`unknown equipment template ${templateId}`);
  return b;
}

export function listBundles(): EquipmentBundle<unknown>[] {
  return Array.from(bundles.values());
}

export function measurementIndex(templateId: string): MeasurementIndex | undefined {
  return indices.get(templateId);
}

export function componentOf(templateId: string, assetId: string): ComponentDef<unknown> | undefined {
  return bundles.get(templateId)?.template.components.find((c) => c.assetId === assetId);
}

/** Validate referential integrity of a template (used by unit tests and the dev warning overlay). */
export function validateTemplateGeneric(t: EquipmentTemplate<unknown>): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const jointIds = new Set(t.joints.map((j) => j.jointId));
  for (const j of t.joints) {
    if (j.parentJointId && !jointIds.has(j.parentJointId)) errors.push(`joint ${j.jointId}: unknown parent ${j.parentJointId}`);
    if (j.range[0] > j.range[1]) errors.push(`joint ${j.jointId}: inverted range`);
  }
  for (const c of t.components) {
    if (ids.has(c.assetId)) errors.push(`duplicate assetId ${c.assetId}`);
    ids.add(c.assetId);
    if (c.parentAssetId && !t.components.some((p) => p.assetId === c.parentAssetId)) errors.push(`${c.assetId}: unknown parent ${c.parentAssetId}`);
    if (!t.assemblies.some((a) => a.id === c.assembly)) errors.push(`${c.assetId}: unknown assembly ${c.assembly}`);
    if (c.cutaway === "hide-in-sector" && c.azimuthDeg === undefined && c.assetId !== "lift_pins") errors.push(`${c.assetId}: hide-in-sector requires azimuthDeg`);
    if (c.jointId && !jointIds.has(c.jointId)) errors.push(`${c.assetId}: unknown joint ${c.jointId}`);
  }
  const keys = new Set<string>();
  for (const c of t.components) {
    if (keys.has(c.nodeKey)) errors.push(`duplicate nodeKey ${c.nodeKey}`);
    keys.add(c.nodeKey);
  }
  const portKey = (a: string, p: string) => `${a}#${p}`;
  const portSet = new Set(t.ports.map((p) => portKey(p.assetId, p.portId)));
  for (const p of t.ports) if (!ids.has(p.assetId)) errors.push(`port ${p.portId}: unknown asset ${p.assetId}`);
  const portById = new Map(t.ports.map((p) => [portKey(p.assetId, p.portId), p]));
  for (const c of t.connections) {
    if (!portSet.has(portKey(c.from.assetId, c.from.portId))) errors.push(`${c.connectionId}: unknown from port`);
    if (!portSet.has(portKey(c.to.assetId, c.to.portId))) errors.push(`${c.connectionId}: unknown to port`);
    const a = portById.get(portKey(c.from.assetId, c.from.portId));
    const b = portById.get(portKey(c.to.assetId, c.to.portId));
    if (a && b) {
      // a process volume is both a gas destination and a vacuum source; gas/vacuum ports may connect to each other
      const compatible = (m: string, k: string) => m === k || ((m === "gas" || m === "vacuum") && (k === "gas" || k === "vacuum"));
      if (!compatible(a.medium, c.kind) || !compatible(b.medium, c.kind)) errors.push(`${c.connectionId}: medium mismatch (${a.medium} -> ${b.medium} via ${c.kind})`);
      if (a.role === "inlet" && b.role === "outlet") errors.push(`${c.connectionId}: direction inverted (inlet -> outlet)`);
    }
  }
  if (t.station) {
    if (!ids.has(t.station.loadPortAssetId)) errors.push(`station: unknown load port asset ${t.station.loadPortAssetId}`);
    if (!ids.has(t.station.transferEnclosureAssetId)) errors.push(`station: unknown enclosure asset ${t.station.transferEnclosureAssetId}`);
    if (!ids.has(t.station.waferPresentationAssetId)) errors.push(`station: unknown wafer presentation asset ${t.station.waferPresentationAssetId}`);
  }
  return errors;
}

/** Validate every registered bundle (template, measurement seed, geometry). */
export function validateAllBundles(): { templateId: string; errors: string[]; warnings: string[] }[] {
  return listBundles().map((b) => {
    const geo = b.validate();
    return {
      templateId: b.template.templateId,
      errors: [...validateTemplateGeneric(b.template).map((e) => `template: ${e}`), ...validateMeasurementSeed(b.measurement, b.template).map((e) => `measurement: ${e}`), ...geo.errors.map((e) => `geometry: ${e}`)],
      warnings: geo.warnings.map((w) => `geometry (warning): ${w}`),
    };
  });
}
