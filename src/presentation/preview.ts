/**
 * PreviewState: everything the scripted demonstration says about the scene at one presentation time.
 * It is evaluated as a pure function f(presentation_time, scenario, seed) and applied to the scene each
 * frame. Nothing here is a sensor observation, a backend state or a command: joint poses are "Scripted",
 * holders are "presented_holder", and film changes exist only as IllustrativeFilmState.
 */
import type { Vec3Tuple } from "../config/geometry";

export type HolderKind =
  | "carrier_slot"
  /** Kept for backward compatibility; the detailed sequences no longer use an opaque transfer holder. */
  | "internal_transfer"
  | "process_stage"
  | "cmp_head"
  | "load_cup"
  | "clean_module"
  | "dry_module"
  /** Robot end effector (atmospheric / dry / wet robot); `attachment` names the robot. */
  | "end_effector"
  /** Load-lock wafer support pins. */
  | "loadlock_support"
  /** Vacuum-side transfer blade inside the load lock. */
  | "transfer_blade"
  /** CMP flip station jaws. */
  | "flip_station";

export interface WaferHolder {
  kind: HolderKind;
  /** Equipment instance presenting the wafer (undefined for carrier_slot). */
  instanceId?: string;
  carrierId?: string;
  slotId?: string;
  /** Attachment frame inside the holder (e.g. "atm_robot", "lift_pins", "pedestal", "wet_robot"). */
  attachment?: string;
  noteKo?: string;
}

/** Liquid state of the wafer surface during the CMP sequence (presentation flag, not a measurement). */
export type WaferWetState = "dry" | "wet_dirty" | "wet_clean";

export interface CarrierHolder {
  kind: "station" | "gripper";
  /** station: load-port station id; gripper: OHT instance id. */
  id: string;
}

export type FilmLayerRole = "substrate" | "active" | "pad_oxide" | "stop_layer" | "liner" | "trench_fill" | "surface_oxide" | "overcoat";

export interface IllustrativeFilmLayer {
  layerId: string;
  material: string;
  role: FilmLayerRole;
  /** Fraction of the layer's schematic thickness that is present (0..1 of its incoming/illustrated maximum). */
  presentFraction: number;
  /** Origin of the layer: external step, this demo's deposition, or incoming stack. */
  origin: "incoming_external" | "demo_deposition" | "incoming_surface";
  originStepId?: string;
}

export type FilmStatus = "incoming" | "depositing" | "deposited" | "polishing" | "cleared" | "overpolish_illustration" | "complete";

export interface IllustrativeFilmState {
  renderSource: "illustrative";
  waferId: string;
  layers: IllustrativeFilmLayer[];
  /** Nitride top exposed by the illustrated clearing (presentation flag, not an endpoint detection). */
  nitrideExposed: boolean;
  status: FilmStatus;
  /** Scale statement that goes with any display of this state. */
  scaleNote: "Schematic · Exaggerated scale · Illustrative";
}

export interface WaferPreview {
  waferId: string;
  holder: WaferHolder;
  /** Slot reserved for return (separate from the current holder). */
  reservedSlot: { carrierId: string; slotId: string };
  /** Frontside normal in the local frame of the presenting holder (-Y = face down). */
  frontsideNormalLocal: Vec3Tuple;
  film: IllustrativeFilmState;
  /** Surface liquid state (scripted; a wet wafer is never returned to a FOUP slot). */
  wetState?: WaferWetState;
}

export interface CarrierPreview {
  carrierId: string;
  holder: CarrierHolder;
  doorOpen: boolean;
  /** Slot occupancy: slotId -> waferId or null. */
  slots: Record<string, string | null>;
  /** Carrier docked to a load-port door interface (opened by the tool side). */
  docked: boolean;
  /** Station whose seating orientation the carrier keeps while carried (door keeps facing the tools). */
  yawFromStationId?: string;
  /** Docking stroke applied by the load port (m, along the station door-facing direction); 0 = undocked seat. */
  dockOffset?: number;
}

export interface InstancePreview {
  instanceId: string;
  /** Joint values (rad or m) keyed by jointId. Scripted display pose. */
  joints: Record<string, number>;
  /** Named effect scalars 0..1 (plasma intensity, slurry flow, glow ...). */
  effects: Record<string, number>;
  /** Named discrete states (door open, gripper closed, optical in view ...). */
  flags: Record<string, boolean | string>;
  /** Which wafer (if any) the equipment's wafer presentation asset shows. */
  presentedWaferId: string | null;
  /** Which presentation asset shows it (templates with several internal holders); default = station.waferPresentationAssetId. */
  presentedWaferAssetId?: string;
  /** Local phase label of this equipment in the current scenario (Korean). */
  phaseLabelKo: string;
}

export interface PreviewState {
  scenarioId: string;
  t: number;
  phaseId: string;
  phaseLabel: string;
  phaseLabelKo: string;
  /** Equipment family the current phase is about (for the UI to follow). */
  phaseFocusInstanceId: string | null;
  instances: Record<string, InstancePreview>;
  carriers: Record<string, CarrierPreview>;
  wafers: Record<string, WaferPreview>;
  /** CCP plasma sample (compatibility with the original ignition/stable/extinction sequence). */
  plasma: { intensity: number; flicker: number };
  /** Reason a scripted handoff is blocked (config validation), if any. */
  blockedReason: string | null;
}

export function emptyInstancePreview(instanceId: string): InstancePreview {
  return { instanceId, joints: {}, effects: {}, flags: {}, presentedWaferId: null, phaseLabelKo: "대기" };
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

export function clamp01(x: number): number {
  return Math.min(Math.max(x, 0), 1);
}

/** Linear interpolation helper with clamped progress. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/** Eased progress of t inside [t0, t1]. */
export function eased(t: number, t0: number, t1: number): number {
  return smoothstep(t0, t1, t);
}

/** Inverse of the cubic smoothstep on [0, 1]: returns u with 3u^2 - 2u^3 = f. */
export function smoothstepInverse(f: number): number {
  const ff = clamp01(f);
  return 0.5 - Math.sin(Math.asin(1 - 2 * ff) / 3);
}
