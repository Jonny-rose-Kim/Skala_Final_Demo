/**
 * Horizontal articulated (SCARA-type) wafer robot kinematics shared by the atmospheric EFEM robot, the
 * CMP dry robot and the CMP wet robot.
 *
 * Rest pose (all joints 0): link 1 points along the rest direction d0, link 2 folds back over it so the
 * wrist sits on the shoulder axis, and the end effector points along d0 with the wafer center at
 * `eeReach` from the wrist. Task space is (rho, theta, z): wafer center at distance rho from the
 * shoulder axis in direction R(theta) d0 with the end effector pointing radially outward. Rotations use
 * the Babylon convention about +Y: R(a)(x, z) = (x cos a + z sin a, -x sin a + z cos a).
 *
 * With equal link lengths L the inverse kinematics has a closed form; the elbow stays on one side and
 * the joint values are continuous for every reachable rho in [eeReach - 2L, eeReach + 2L]. rho = 0 puts
 * the wafer center over the shoulder axis (smallest swing radius for rotation).
 */

export interface ScaraGeom {
  /** Shoulder axis position in the instance frame (x, z). */
  axisXZ: [number, number];
  /** Rest direction (unit, instance XZ). */
  d0: [number, number];
  /** Link length (shoulder-elbow = elbow-wrist). */
  linkLength: number;
  /** Wrist axis to wafer center along the end effector. */
  eeReach: number;
}

export interface ScaraJoints {
  shoulder: number;
  elbow: number;
  wrist: number;
}

export function rotY(a: number, v: [number, number]): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c + v[1] * s, -v[0] * s + v[1] * c];
}

/** Inverse kinematics for a wafer center at (rho, theta). */
export function scaraIK(g: ScaraGeom, rho: number, theta: number): ScaraJoints {
  const rw = rho - g.eeReach;
  const c = Math.min(Math.max(rw / (2 * g.linkLength), -1), 1);
  const gamma = Math.acos(c);
  return { shoulder: theta + gamma, elbow: Math.PI - 2 * gamma, wrist: gamma - Math.PI };
}

export interface ScaraPose {
  elbow: [number, number];
  wrist: [number, number];
  eeDir: [number, number];
  wafer: [number, number];
}

/** Forward kinematics (instance XZ). */
export function scaraFK(g: ScaraGeom, j: ScaraJoints): ScaraPose {
  const [ax, az] = g.axisXZ;
  const L = g.linkLength;
  const e1 = rotY(j.shoulder, g.d0);
  const elbow: [number, number] = [ax + L * e1[0], az + L * e1[1]];
  const e2 = rotY(j.shoulder + j.elbow, g.d0);
  const wrist: [number, number] = [elbow[0] - L * e2[0], elbow[1] - L * e2[1]];
  const eeDir = rotY(j.shoulder + j.elbow + j.wrist, g.d0);
  return { elbow, wrist, eeDir, wafer: [wrist[0] + g.eeReach * eeDir[0], wrist[1] + g.eeReach * eeDir[1]] };
}

/** Task-space coordinates (rho, theta) of a point given in the instance frame (x, z). */
export function scaraTaskOf(g: ScaraGeom, x: number, z: number): { rho: number; theta: number } {
  const dx = x - g.axisXZ[0];
  const dz = z - g.axisXZ[1];
  const rho = Math.hypot(dx, dz);
  // theta such that R(theta) d0 = (dx, dz)/rho; R(a) d0 rotates d0 by -a in the azimuth sense
  const azTarget = Math.atan2(dz, dx);
  const az0 = Math.atan2(g.d0[1], g.d0[0]);
  return { rho, theta: az0 - azTarget };
}

/** Largest horizontal distance from the shoulder axis reached by the arm links for a folded rotation pose. */
export function scaraSwingRadius(g: ScaraGeom, hubRadius: number, waferRadius: number, eeTipBeyondCenter: number): number {
  return Math.max(g.linkLength + hubRadius, g.eeReach + hubRadius, waferRadius, eeTipBeyondCenter);
}
