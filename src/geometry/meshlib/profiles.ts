import type { Vec2 } from "./types";

export function signedArea2(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return -a / 2;
}

/** Return a copy ordered counter-clockwise (x right, y up). */
export function orientCCW(pts: Vec2[]): Vec2[] {
  return signedArea2(pts) < 0 ? pts.slice().reverse() : pts.slice();
}

/** Axis-aligned rectangle profile in (r, y). */
export function rectProfile(r0: number, r1: number, y0: number, y1: number): Vec2[] {
  return [
    [r0, y0],
    [r1, y0],
    [r1, y1],
    [r0, y1],
  ];
}

/** Replace each corner by two points `size` along both adjacent edges (45-degree chamfer). */
export function chamferProfile(pts: Vec2[], size: number, skip: (index: number, p: Vec2) => boolean = () => false): Vec2[] {
  const out: Vec2[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    if (skip(i, b)) {
      out.push(b);
      continue;
    }
    const lab = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const lbc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const t = Math.min(size, lab * 0.45, lbc * 0.45);
    if (t <= 1e-9) {
      out.push(b);
      continue;
    }
    out.push([b[0] + ((a[0] - b[0]) / lab) * t, b[1] + ((a[1] - b[1]) / lab) * t]);
    out.push([b[0] + ((c[0] - b[0]) / lbc) * t, b[1] + ((c[1] - b[1]) / lbc) * t]);
  }
  return out;
}

/** Round every corner with a circular arc of `radius` (clamped to the adjacent edge lengths). */
export function filletProfile(pts: Vec2[], radius: number, steps = 4, skip: (index: number, p: Vec2) => boolean = () => false): Vec2[] {
  const out: Vec2[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    if (skip(i, b)) {
      out.push(b);
      continue;
    }
    const lab = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const lbc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    if (lab < 1e-9 || lbc < 1e-9) {
      out.push(b);
      continue;
    }
    const u: Vec2 = [(a[0] - b[0]) / lab, (a[1] - b[1]) / lab];
    const v: Vec2 = [(c[0] - b[0]) / lbc, (c[1] - b[1]) / lbc];
    const cosTheta = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]));
    const theta = Math.acos(cosTheta);
    if (theta > Math.PI - 1e-4 || theta < 1e-4) {
      out.push(b);
      continue;
    }
    let r = radius;
    let t = r / Math.tan(theta / 2);
    const tMax = Math.min(lab, lbc) * 0.48;
    if (t > tMax) {
      t = tMax;
      r = t * Math.tan(theta / 2);
    }
    const p1: Vec2 = [b[0] + u[0] * t, b[1] + u[1] * t];
    const p2: Vec2 = [b[0] + v[0] * t, b[1] + v[1] * t];
    const bis: Vec2 = [u[0] + v[0], u[1] + v[1]];
    const lb = Math.hypot(bis[0], bis[1]) || 1;
    const d = r / Math.sin(theta / 2);
    const center: Vec2 = [b[0] + (bis[0] / lb) * d, b[1] + (bis[1] / lb) * d];
    const a1 = Math.atan2(p1[1] - center[1], p1[0] - center[0]);
    let a2 = Math.atan2(p2[1] - center[1], p2[0] - center[0]);
    // choose the short arc
    let delta = a2 - a1;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    a2 = a1 + delta;
    for (let k = 0; k <= steps; k++) {
      const ang = a1 + ((a2 - a1) * k) / steps;
      out.push([center[0] + r * Math.cos(ang), center[1] + r * Math.sin(ang)]);
    }
  }
  return out;
}

/** Thin-walled zig-zag bellows profile (solid polygon) between rIn and rOut. */
export function bellowsProfile(rIn: number, rOut: number, y0: number, y1: number, convolutions: number, wall: number): Vec2[] {
  const n = convolutions * 2;
  const outerPath: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n;
    const r = i % 2 === 0 ? rIn + wall : rOut;
    outerPath.push([r, y]);
  }
  const innerPath: Vec2[] = [];
  for (let i = n; i >= 0; i--) {
    const y = y0 + ((y1 - y0) * i) / n;
    const r = i % 2 === 0 ? rIn : rOut - wall;
    innerPath.push([r, y]);
  }
  // Close the ends with small flat flanges so the polygon is simple.
  return orientCCW([...outerPath, ...innerPath]);
}

/** Circle profile (for revolved torus-like rings), CCW. */
export function circleProfile(cr: number, cy: number, radius: number, segments = 16): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([cr + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  return pts;
}

/** Rounded rectangle in a 2D plane (used for extruded housings), CCW. */
export function roundedRect(w: number, h: number, r: number, steps = 4): Vec2[] {
  const base: Vec2[] = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ];
  return filletProfile(base, r, steps);
}

/** Resample a profile so that no edge is longer than maxLen (keeps corners). */
export function subdivideProfile(pts: Vec2[], maxLen: number): Vec2[] {
  const out: Vec2[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.ceil(len / maxLen));
    for (let s = 0; s < k; s++) out.push([a[0] + ((b[0] - a[0]) * s) / k, a[1] + ((b[1] - a[1]) * s) / k]);
  }
  return out;
}
