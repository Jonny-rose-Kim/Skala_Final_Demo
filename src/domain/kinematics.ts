/**
 * Pure forward kinematics over a template's JointDef tree, numerically identical to the Babylon node
 * hierarchy built by EquipmentInstance (revolute: rotate about the axis at the joint origin with the
 * standard quaternion rotation Babylon uses; prismatic: translate along the axis; instance root: yaw
 * about +Y then translation). Parts and attachment points are authored in the instance frame at the
 * rest pose, so a point P attached to joint J maps to T_J(values) * (P - restOrigin(J)).
 *
 * Used by tests and by evaluators that need world-consistent targets; never by the renderer.
 */
import type { Vec3Tuple } from "../config/geometry";
import type { JointDef } from "./types";

export type Mat3 = [number, number, number, number, number, number, number, number, number];

export interface Pose {
  /** Row-major rotation matrix (column-vector convention: p' = R p + t). */
  r: Mat3;
  t: Vec3Tuple;
}

export const IDENTITY_POSE: Pose = { r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };

/** Rotation matrix for `angle` about the unit `axis`, matching Babylon's Quaternion.RotationAxis. */
export function axisAngle(axis: Vec3Tuple, angle: number): Mat3 {
  const [x, y, z] = axis;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = 1 - c;
  return [c + x * x * k, x * y * k - z * s, x * z * k + y * s, y * x * k + z * s, c + y * y * k, y * z * k - x * s, z * x * k - y * s, z * y * k + x * s, c + z * z * k];
}

export function mulMat(a: Mat3, b: Mat3): Mat3 {
  const o = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return o;
}

export function mulVec(r: Mat3, v: Vec3Tuple): Vec3Tuple {
  return [r[0] * v[0] + r[1] * v[1] + r[2] * v[2], r[3] * v[0] + r[4] * v[1] + r[5] * v[2], r[6] * v[0] + r[7] * v[1] + r[8] * v[2]];
}

export function compose(parent: Pose, child: Pose): Pose {
  const t = mulVec(parent.r, child.t);
  return { r: mulMat(parent.r, child.r), t: [t[0] + parent.t[0], t[1] + parent.t[1], t[2] + parent.t[2]] };
}

export function applyPose(p: Pose, v: Vec3Tuple): Vec3Tuple {
  const w = mulVec(p.r, v);
  return [w[0] + p.t[0], w[1] + p.t[1], w[2] + p.t[2]];
}

/** Instance root pose from the instance definition (Babylon rotation.y then position). */
export function instancePose(position: Vec3Tuple, rotationYDeg: number): Pose {
  return { r: axisAngle([0, 1, 0], (rotationYDeg * Math.PI) / 180), t: [...position] as Vec3Tuple };
}

/** Cumulative rest origin of every joint (sum of origins along the parent chain). */
export function jointRestOrigins(joints: JointDef[]): Map<string, Vec3Tuple> {
  const byId = new Map(joints.map((j) => [j.jointId, j]));
  const out = new Map<string, Vec3Tuple>();
  const visit = (id: string, depth: number): Vec3Tuple => {
    const hit = out.get(id);
    if (hit) return hit;
    const j = byId.get(id);
    if (!j || depth > 64) return [0, 0, 0];
    const p = j.parentJointId ? visit(j.parentJointId, depth + 1) : ([0, 0, 0] as Vec3Tuple);
    const o: Vec3Tuple = [p[0] + j.origin[0], p[1] + j.origin[1], p[2] + j.origin[2]];
    out.set(id, o);
    return o;
  };
  for (const j of joints) visit(j.jointId, 0);
  return out;
}

/** Pose of a joint frame in the instance frame for the given joint values (path joints need `pathPose`). */
export function jointPose(joints: JointDef[], values: Record<string, number>, jointId: string, pathPose?: (jointId: string, s: number) => { position: Vec3Tuple; yawRad: number }): Pose {
  const byId = new Map(joints.map((j) => [j.jointId, j]));
  const chain: JointDef[] = [];
  let cur = byId.get(jointId);
  let guard = 0;
  while (cur && guard++ < 64) {
    chain.unshift(cur);
    cur = cur.parentJointId ? byId.get(cur.parentJointId) : undefined;
  }
  let pose = IDENTITY_POSE;
  for (const j of chain) {
    const v = values[j.jointId] ?? 0;
    let local: Pose;
    if (j.kind === "revolute") local = { r: axisAngle(j.axis, v), t: [...j.origin] as Vec3Tuple };
    else if (j.kind === "prismatic") local = { r: IDENTITY_POSE.r, t: [j.origin[0] + j.axis[0] * v, j.origin[1] + j.axis[1] * v, j.origin[2] + j.axis[2] * v] };
    else {
      const pp = pathPose ? pathPose(j.jointId, v) : { position: j.origin, yawRad: 0 };
      local = { r: axisAngle([0, 1, 0], pp.yawRad), t: [...pp.position] as Vec3Tuple };
    }
    pose = compose(pose, local);
  }
  return pose;
}

/** Instance-frame position of a point authored at rest in the instance frame and attached to `jointId`. */
export function attachedPoint(joints: JointDef[], values: Record<string, number>, jointId: string | undefined, restPoint: Vec3Tuple, pathPose?: (jointId: string, s: number) => { position: Vec3Tuple; yawRad: number }): Vec3Tuple {
  if (!jointId) return [...restPoint] as Vec3Tuple;
  const o = jointRestOrigins(joints).get(jointId) ?? [0, 0, 0];
  return applyPose(jointPose(joints, values, jointId, pathPose), [restPoint[0] - o[0], restPoint[1] - o[1], restPoint[2] - o[2]]);
}

/** Direction (unit vector) authored at rest, rotated by the joint chain. */
export function attachedDirection(joints: JointDef[], values: Record<string, number>, jointId: string | undefined, restDir: Vec3Tuple): Vec3Tuple {
  if (!jointId) return [...restDir] as Vec3Tuple;
  return mulVec(jointPose(joints, values, jointId).r, restDir);
}

/** Parent graph check: unknown parents and cycles (validation). */
export function jointGraphErrors(joints: JointDef[]): string[] {
  const errors: string[] = [];
  const byId = new Map(joints.map((j) => [j.jointId, j]));
  for (const j of joints) {
    if (j.parentJointId && !byId.has(j.parentJointId)) errors.push(`joint ${j.jointId}: unknown parent ${j.parentJointId}`);
    const seen = new Set<string>([j.jointId]);
    let p = j.parentJointId ? byId.get(j.parentJointId) : undefined;
    while (p) {
      if (seen.has(p.jointId)) {
        errors.push(`joint ${j.jointId}: parent cycle through ${p.jointId}`);
        break;
      }
      seen.add(p.jointId);
      p = p.parentJointId ? byId.get(p.parentJointId) : undefined;
    }
    const n = Math.hypot(j.axis[0], j.axis[1], j.axis[2]);
    if (j.kind !== "path" && Math.abs(n - 1) > 1e-6) errors.push(`joint ${j.jointId}: axis is not a unit vector`);
  }
  return errors;
}
