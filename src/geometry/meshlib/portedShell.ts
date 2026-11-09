/**
 * Hollow cylinder wall (rIn..rOut, y0..y1) with circular or rectangular through-ports, generated
 * without booleans: the inner and outer cylindrical surfaces are tensor grids in (phi, y) whose
 * cells under a port are replaced by a ring patch between the port hole and the patch rectangle,
 * and the hole is closed by a bore surface through the wall thickness.
 */
import type { AngularInterval } from "../../config/geometry";
import { TAU } from "../../config/geometry";
import { isFullCircle, tangentAt } from "./revolve";
import { createMeshData, pushQuadFacing, pushTriangleFacing, pushVertex, type MeshData, type Vec3 } from "./types";

export type ShellHole = { kind: "circle"; radius: number } | { kind: "rect"; width: number; height: number };

export interface ShellPort {
  id: string;
  azimuth: number;
  centerY: number;
  hole: ShellHole;
}

export interface PortedShellOptions {
  rIn: number;
  rOut: number;
  y0: number;
  y1: number;
  ranges?: AngularInterval[];
  segments?: number;
  boreSegments?: number;
  ports: ShellPort[];
  uvScale?: number;
  /** Extra margin (m) between the hole and the patch rectangle. */
  patchMargin?: number;
  /** Generate section caps at range ends (default true). */
  caps?: boolean;
}

interface Patch {
  port: ShellPort;
  phiA: number;
  phiB: number;
  yA: number;
  yB: number;
  /** For rect holes the hole coincides with the patch. */
  isRect: boolean;
  halfAngleRect: number;
  halfHeightRect: number;
}

function wrapInto(phi: number, start: number): number {
  // bring phi into [start, start + 2pi)
  let a = phi - start;
  a = ((a % TAU) + TAU) % TAU;
  return start + a;
}

export function portPatchHalfExtents(hole: ShellHole, margin: number): { halfArc: number; halfHeight: number } {
  if (hole.kind === "circle") return { halfArc: hole.radius * 1.3 + margin, halfHeight: hole.radius * 1.3 + margin };
  return { halfArc: hole.width / 2, halfHeight: hole.height / 2 };
}

export function portedShell(o: PortedShellOptions): MeshData {
  const md = createMeshData();
  const ranges = o.ranges ?? [{ start: 0, sweep: TAU }];
  const segments = o.segments ?? 128;
  const boreSegs = o.boreSegments ?? 28;
  const uvScale = o.uvScale ?? 1;
  const margin = o.patchMargin ?? 0.008;
  const { rIn, rOut, y0, y1 } = o;

  const vertexAt = (R: number, phi: number, y: number, sign: number) => {
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    return pushVertex(md, [R * c, y, R * s], [sign * c, 0, sign * s], [phi * R * uvScale, y * uvScale]);
  };

  for (const range of ranges) {
    const start = range.start;
    const end = range.start + range.sweep;
    const full = range.sweep >= TAU - 1e-6;

    // Patches inside this range
    const patches: Patch[] = [];
    for (const port of o.ports) {
      const az = wrapInto(port.azimuth, start);
      const he = portPatchHalfExtents(port.hole, margin);
      const halfAngle = Math.asin(Math.min(0.99, he.halfArc / rIn));
      const phiA = az - halfAngle;
      const phiB = az + halfAngle;
      const yA = port.centerY - he.halfHeight;
      const yB = port.centerY + he.halfHeight;
      if (yA <= y0 + 1e-6 || yB >= y1 - 1e-6) continue; // port outside this band
      const insideRange = full || (phiA >= start - 1e-9 && phiB <= end + 1e-9);
      if (!insideRange) continue;
      const isRect = port.hole.kind === "rect";
      patches.push({
        port: { ...port, azimuth: az },
        phiA,
        phiB,
        yA,
        yB,
        isRect,
        halfAngleRect: port.hole.kind === "rect" ? Math.asin(Math.min(0.99, port.hole.width / 2 / rIn)) : 0,
        halfHeightRect: port.hole.kind === "rect" ? port.hole.height / 2 : 0,
      });
    }

    // Breakpoints
    const nUniform = Math.max(8, Math.ceil((range.sweep / TAU) * segments));
    let phis: number[] = [];
    for (let j = 0; j <= nUniform; j++) phis.push(start + (range.sweep * j) / nUniform);
    for (const p of patches) {
      phis = phis.filter((v) => !(v > p.phiA + 1e-9 && v < p.phiB - 1e-9));
      phis.push(p.phiA, p.phiB);
    }
    if (full) phis = phis.filter((v) => v < end - 1e-9); // avoid duplicate seam; we close by wrapping
    phis.sort((a, b) => a - b);
    phis = phis.filter((v, i, arr) => i === 0 || v - arr[i - 1] > 1e-9);
    const phiCells = full ? [...phis, end] : phis;

    let ys: number[] = [y0, y1];
    for (const p of patches) ys.push(p.yA, p.yB);
    ys.sort((a, b) => a - b);
    ys = ys.filter((v, i, arr) => i === 0 || v - arr[i - 1] > 1e-9);

    const inPatch = (phi: number, y: number): Patch | null => {
      for (const p of patches) if (phi > p.phiA + 1e-9 && phi < p.phiB - 1e-9 && y > p.yA + 1e-9 && y < p.yB - 1e-9) return p;
      return null;
    };

    // Grid cells on both surfaces (vertices created per cell for simplicity; counts are small)
    for (let i = 0; i < phiCells.length - 1; i++) {
      const pa = phiCells[i];
      const pb = phiCells[i + 1];
      for (let k = 0; k < ys.length - 1; k++) {
        const ya = ys[k];
        const yb = ys[k + 1];
        if (inPatch((pa + pb) / 2, (ya + yb) / 2)) continue;
        for (const [R, sign] of [
          [rIn, -1],
          [rOut, 1],
        ] as const) {
          const v00 = vertexAt(R, pa, ya, sign);
          const v10 = vertexAt(R, pb, ya, sign);
          const v11 = vertexAt(R, pb, yb, sign);
          const v01 = vertexAt(R, pa, yb, sign);
          const mid = (pa + pb) / 2;
          pushQuadFacing(md, v00, v10, v11, v01, [sign * Math.cos(mid), 0, sign * Math.sin(mid)]);
        }
      }
    }

    // Patches: ring between hole loop and rectangle boundary; bore through the wall.
    for (const p of patches) {
      const az = p.port.azimuth;
      const cy = p.port.centerY;
      // Boundary loop points in local (s = arc, t = y - cy) on each surface, sorted by angle
      const boundaryPoints = (R: number) => {
        const pts: { phi: number; y: number }[] = [];
        const phisOn = phiCells.filter((v) => v >= p.phiA - 1e-9 && v <= p.phiB + 1e-9);
        const ysOn = ys.filter((v) => v >= p.yA - 1e-9 && v <= p.yB + 1e-9);
        for (const v of phisOn) {
          pts.push({ phi: v, y: p.yA });
          pts.push({ phi: v, y: p.yB });
        }
        for (const v of ysOn) {
          if (v > p.yA + 1e-9 && v < p.yB - 1e-9) {
            pts.push({ phi: p.phiA, y: v });
            pts.push({ phi: p.phiB, y: v });
          }
        }
        const uniq = pts.filter((q, i, arr) => arr.findIndex((w) => Math.abs(w.phi - q.phi) < 1e-9 && Math.abs(w.y - q.y) < 1e-9) === i);
        return uniq
          .map((q) => ({ ...q, ang: Math.atan2(q.y - cy, (q.phi - az) * R) }))
          .sort((a, b) => a.ang - b.ang);
      };
      const holeLoop = (R: number) => {
        const pts: { phi: number; y: number; ang: number; ux: number; uy: number }[] = [];
        if (p.isRect) {
          const ha = p.halfAngleRect;
          const hh = p.halfHeightRect;
          const corners: [number, number][] = [
            [az - ha, cy - hh],
            [az + ha, cy - hh],
            [az + ha, cy + hh],
            [az - ha, cy + hh],
          ];
          for (const [phi, y] of corners) pts.push({ phi, y, ang: Math.atan2(y - cy, (phi - az) * R), ux: 0, uy: 0 });
        } else {
          const a = (p.port.hole as { radius: number }).radius;
          for (let i = 0; i < boreSegs; i++) {
            const th = (i / boreSegs) * TAU;
            const u = a * Math.cos(th);
            const v = a * Math.sin(th);
            const phi = az + Math.asin(Math.max(-0.99, Math.min(0.99, u / R)));
            pts.push({ phi, y: cy + v, ang: Math.atan2(v, u), ux: Math.cos(th), uy: Math.sin(th) });
          }
        }
        return pts.sort((a, b) => a.ang - b.ang);
      };

      for (const [R, sign] of [
        [rIn, -1],
        [rOut, 1],
      ] as const) {
        const normalAt = (phi: number): Vec3 => [sign * Math.cos(phi), 0, sign * Math.sin(phi)];
        if (!p.isRect) {
          const A = holeLoop(R);
          const B = boundaryPoints(R);
          const ia = A.map((q) => vertexAt(R, q.phi, q.y, sign));
          const ib = B.map((q) => vertexAt(R, q.phi, q.y, sign));
          // zipper by angle
          let i = 0;
          let j = 0;
          const NA = A.length;
          const NB = B.length;
          const angA = (idx: number) => A[idx % NA].ang + (idx >= NA ? TAU : 0);
          const angB = (idx: number) => B[idx % NB].ang + (idx >= NB ? TAU : 0);
          while (i < NA || j < NB) {
            const nextA = i < NA ? angA(i + 1) : Infinity;
            const nextB = j < NB ? angB(j + 1) : Infinity;
            const n = normalAt(az);
            if (nextA <= nextB) {
              pushTriangleFacing(md, ia[i % NA], ia[(i + 1) % NA], ib[j % NB], n);
              i++;
            } else {
              pushTriangleFacing(md, ia[i % NA], ib[j % NB], ib[(j + 1) % NB], n);
              j++;
            }
          }
        } else {
          // rect hole == patch: nothing to fill on the surface; boundary cells already skipped.
        }
      }

      // Bore surface connecting inner and outer hole loops (normals pointing into the bore).
      const tan = tangentAt(az);
      if (!p.isRect) {
        const A = holeLoop(rIn);
        const B = holeLoop(rOut);
        const inner: number[] = [];
        const outer: number[] = [];
        for (let i = 0; i < A.length; i++) {
          const n: Vec3 = [-(A[i].ux * tan[0]), -A[i].uy, -(A[i].ux * tan[2])];
          const ci = Math.cos(A[i].phi);
          const si = Math.sin(A[i].phi);
          inner.push(pushVertex(md, [rIn * ci, A[i].y, rIn * si], n, [(i / A.length) * 0.1, 0]));
          const co = Math.cos(B[i].phi);
          const so = Math.sin(B[i].phi);
          outer.push(pushVertex(md, [rOut * co, B[i].y, rOut * so], n, [(i / A.length) * 0.1, (rOut - rIn) * uvScale]));
        }
        for (let i = 0; i < A.length; i++) {
          const j = (i + 1) % A.length;
          let d = A[j].ang - A[i].ang;
          while (d > Math.PI) d -= TAU;
          while (d < -Math.PI) d += TAU;
          const mid = A[i].ang + d / 2;
          const n: Vec3 = [-(Math.cos(mid) * tan[0]), -Math.sin(mid), -(Math.cos(mid) * tan[2])];
          pushQuadFacing(md, inner[i], outer[i], outer[j], inner[j], n);
        }
      } else {
        const ha = p.halfAngleRect;
        const hh = p.halfHeightRect;
        const faces: { phi0: number; phi1: number; ya: number; yb: number; n: Vec3 }[] = [
          { phi0: az - ha, phi1: az + ha, ya: cy - hh, yb: cy - hh, n: [0, 1, 0] }, // bottom face normal up
          { phi0: az - ha, phi1: az + ha, ya: cy + hh, yb: cy + hh, n: [0, -1, 0] }, // top face normal down
        ];
        for (const f of faces) {
          // arc strip from inner to outer radius across phi
          const n = 10;
          const row0: number[] = [];
          const row1: number[] = [];
          for (let j = 0; j <= n; j++) {
            const phi = f.phi0 + ((f.phi1 - f.phi0) * j) / n;
            const c = Math.cos(phi);
            const s = Math.sin(phi);
            row0.push(pushVertex(md, [rIn * c, f.ya, rIn * s], f.n, [phi * rIn * uvScale, 0]));
            row1.push(pushVertex(md, [rOut * c, f.ya, rOut * s], f.n, [phi * rOut * uvScale, (rOut - rIn) * uvScale]));
          }
          for (let j = 0; j < n; j++) pushQuadFacing(md, row0[j], row1[j], row1[j + 1], row0[j + 1], f.n);
        }
        for (const [phi, sgn] of [
          [az - ha, 1],
          [az + ha, -1],
        ] as const) {
          const t = tangentAt(phi);
          const n: Vec3 = [sgn * t[0], 0, sgn * t[2]];
          const c = Math.cos(phi);
          const s = Math.sin(phi);
          const v00 = pushVertex(md, [rIn * c, cy - hh, rIn * s], n, [0, 0]);
          const v10 = pushVertex(md, [rOut * c, cy - hh, rOut * s], n, [(rOut - rIn) * uvScale, 0]);
          const v11 = pushVertex(md, [rOut * c, cy + hh, rOut * s], n, [(rOut - rIn) * uvScale, 2 * hh * uvScale]);
          const v01 = pushVertex(md, [rIn * c, cy + hh, rIn * s], n, [0, 2 * hh * uvScale]);
          pushQuadFacing(md, v00, v10, v11, v01, n);
        }
      }
    }

    // Annular end faces
    const nAnn = Math.max(8, Math.ceil((range.sweep / TAU) * segments));
    for (const [y, ny] of [
      [y0, -1],
      [y1, 1],
    ] as const) {
      const n: Vec3 = [0, ny, 0];
      const inner: number[] = [];
      const outer: number[] = [];
      for (let j = 0; j <= nAnn; j++) {
        const phi = start + (range.sweep * j) / nAnn;
        const c = Math.cos(phi);
        const s = Math.sin(phi);
        inner.push(pushVertex(md, [rIn * c, y, rIn * s], n, [rIn * c * uvScale, rIn * s * uvScale]));
        outer.push(pushVertex(md, [rOut * c, y, rOut * s], n, [rOut * c * uvScale, rOut * s * uvScale]));
      }
      for (let j = 0; j < nAnn; j++) pushQuadFacing(md, inner[j], outer[j], outer[j + 1], inner[j + 1], n);
    }

    // Section caps at the range ends
    if ((o.caps ?? true) && !isFullCircle(ranges) && !full) {
      for (const [phi, sgn] of [
        [start, -1],
        [end, 1],
      ] as const) {
        const t = tangentAt(phi);
        const n: Vec3 = [sgn * t[0], 0, sgn * t[2]];
        const c = Math.cos(phi);
        const s = Math.sin(phi);
        const v00 = pushVertex(md, [rIn * c, y0, rIn * s], n, [rIn * uvScale, y0 * uvScale]);
        const v10 = pushVertex(md, [rOut * c, y0, rOut * s], n, [rOut * uvScale, y0 * uvScale]);
        const v11 = pushVertex(md, [rOut * c, y1, rOut * s], n, [rOut * uvScale, y1 * uvScale]);
        const v01 = pushVertex(md, [rIn * c, y1, rIn * s], n, [rIn * uvScale, y1 * uvScale]);
        pushQuadFacing(md, v00, v10, v11, v01, n);
      }
    }
  }
  return md;
}
