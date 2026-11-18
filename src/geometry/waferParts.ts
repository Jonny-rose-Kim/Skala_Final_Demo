/**
 * Two-tone wafer presentation: the patterned frontside half uses `wafer_front`, the backside half
 * `silicon_wafer`, so face up / face down reads in the scene. The halves share an interior face only
 * (no coplanar visible faces, no z-fighting). Thickness and radius come from the tool config.
 */
import { rectProfile, revolveProfile, translateMeshData, type MeshData, type Vec2 } from "./meshlib";

/** Revolve profiles of the two halves for a wafer whose bottom is at y0. */
export function waferHalfProfiles(r: number, y0: number, t: number, faceDown: boolean): { back: Vec2[]; front: Vec2[] } {
  const mid = y0 + t / 2;
  const lower = rectProfile(0, r, y0, mid);
  const upper = rectProfile(0, r, mid, y0 + t);
  return faceDown ? { front: lower, back: upper } : { front: upper, back: lower };
}

/** Meshes of the two halves at (x, z). */
export function waferHalfMeshes(r: number, y0: number, t: number, faceDown: boolean, x: number, z: number, segments = 128): { back: MeshData; front: MeshData } {
  const p = waferHalfProfiles(r, y0, t, faceDown);
  return {
    back: translateMeshData(revolveProfile(p.back, { segments }), x, 0, z),
    front: translateMeshData(revolveProfile(p.front, { segments }), x, 0, z),
  };
}
