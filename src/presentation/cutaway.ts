/**
 * Cutaway sector resolution: converts the user's requested removed sector (azimuth, sweep) into the
 * kept angular ranges used by both the geometry generators and the plasma shader, snapping the
 * boundaries so they never pass through a wall port (which would leave a half-removed port).
 */
import { normalizeAngle, TAU, type AngularInterval } from "../config/geometry";

export interface CutawayRequest {
  enabled: boolean;
  /** Center azimuth of the removed sector (degrees). */
  azimuthDeg: number;
  /** Angular width of the removed sector (degrees). */
  sweepDeg: number;
}

export interface ResolvedCutaway {
  enabled: boolean;
  /** Removed sector (radians). */
  removed: AngularInterval | null;
  /** Kept ranges for geometry generators (radians). */
  kept: AngularInterval[];
  /** Effective values after snapping (degrees). */
  effectiveAzimuthDeg: number;
  effectiveSweepDeg: number;
  snapped: boolean;
}

export const FULL: AngularInterval[] = [{ start: 0, sweep: TAU }];

function inside(angle: number, iv: AngularInterval): boolean {
  const d = normalizeAngle(angle - iv.start);
  return d > 1e-9 && d < iv.sweep - 1e-9;
}

/** Snap a boundary angle out of any keep-out interval to its nearest edge. */
export function snapBoundary(angle: number, keepOuts: AngularInterval[]): { angle: number; snapped: boolean } {
  let a = normalizeAngle(angle);
  let snapped = false;
  for (let iter = 0; iter < 8; iter++) {
    const hit = keepOuts.find((k) => inside(a, k));
    if (!hit) break;
    const toStart = normalizeAngle(a - hit.start);
    const toEnd = hit.sweep - toStart;
    a = normalizeAngle(toStart <= toEnd ? hit.start : hit.start + hit.sweep);
    snapped = true;
  }
  return { angle: a, snapped };
}

/** Directional snap: move to the start edge (dir = -1) or the end edge (dir = +1) of any containing keep-out. */
function snapDirectional(angle: number, keepOuts: AngularInterval[], dir: -1 | 1): { angle: number; snapped: boolean } {
  let a = normalizeAngle(angle);
  let snapped = false;
  for (let iter = 0; iter < 8; iter++) {
    const hit = keepOuts.find((k) => inside(a, k));
    if (!hit) break;
    a = normalizeAngle(dir < 0 ? hit.start : hit.start + hit.sweep);
    snapped = true;
  }
  return { angle: a, snapped };
}

const MIN_SWEEP = 10 * (Math.PI / 180);
const MAX_SWEEP = 300 * (Math.PI / 180);
const HARD_MAX_SWEEP = 345 * (Math.PI / 180);

export function resolveCutaway(req: CutawayRequest, keepOuts: AngularInterval[]): ResolvedCutaway {
  if (!req.enabled || req.sweepDeg <= 0.5) {
    return { enabled: false, removed: null, kept: FULL, effectiveAzimuthDeg: req.azimuthDeg, effectiveSweepDeg: 0, snapped: false };
  }
  const sweep = Math.min(Math.max(req.sweepDeg, 10), 300) * (Math.PI / 180);
  const center = normalizeAngle(req.azimuthDeg * (Math.PI / 180));
  const rawStart = center - sweep / 2;
  const rawEnd = center + sweep / 2;
  // 1) Nearest-edge snapping keeps the sector close to the request; a port is either fully removed or kept.
  const sNear = snapBoundary(rawStart, keepOuts);
  const eNear = snapBoundary(rawEnd, keepOuts);
  let start = sNear.angle;
  let removedSweep = normalizeAngle(eNear.angle - start);
  let snapped = sNear.snapped || eNear.snapped;
  if (removedSweep < MIN_SWEEP || removedSweep > MAX_SWEEP) {
    // 2) The request collapsed inside a keep-out (or wrapped): grow outward instead.
    const sOut = snapDirectional(rawStart, keepOuts, -1);
    const eOut = snapDirectional(rawEnd, keepOuts, 1);
    start = sOut.angle;
    removedSweep = normalizeAngle(eOut.angle - start);
    snapped = sOut.snapped || eOut.snapped;
    if (removedSweep < 1e-9) removedSweep = HARD_MAX_SWEEP; // snapped all the way around
  }
  if (removedSweep > MAX_SWEEP) {
    // Too much removed: shrink inward instead when that leaves a usable sector.
    const sIn = snapDirectional(rawStart, keepOuts, 1);
    const eIn = snapDirectional(rawEnd, keepOuts, -1);
    const inner = normalizeAngle(eIn.angle - sIn.angle);
    if (inner >= MIN_SWEEP && inner <= MAX_SWEEP) {
      start = sIn.angle;
      removedSweep = inner;
      snapped = sIn.snapped || eIn.snapped;
    } else removedSweep = Math.min(removedSweep, HARD_MAX_SWEEP);
  }
  const removed: AngularInterval = { start, sweep: removedSweep };
  const kept: AngularInterval[] = [{ start: normalizeAngle(start + removedSweep), sweep: TAU - removedSweep }];
  return {
    enabled: true,
    removed,
    kept,
    effectiveAzimuthDeg: (normalizeAngle(start + removedSweep / 2) * 180) / Math.PI,
    effectiveSweepDeg: (removedSweep * 180) / Math.PI,
    snapped,
  };
}

/** True when an azimuth (radians) lies inside the removed sector. */
export function isAzimuthRemoved(azimuth: number, cut: ResolvedCutaway): boolean {
  if (!cut.enabled || !cut.removed) return false;
  return inside(azimuth, cut.removed) || Math.abs(normalizeAngle(azimuth - cut.removed.start)) < 1e-9;
}
