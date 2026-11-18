/**
 * Procedural SCARA wafer robot shared by the atmospheric EFEM robot (CCP / Remote) and the CMP dry and
 * wet robots: base housing, Z column, link 1, link 2, wrist and end effector, each its own component
 * and joint so picking, the component tree and the motion hierarchy see them separately.
 *
 * Geometry is authored in the instance frame at the rest pose (all joints 0): link 1 along d0, link 2
 * folded back over it, wrist on the shoulder axis, end effector along d0 with the wafer center at
 * `eeReach`. Two end effectors exist: a backside-support fork (dry wafers, face up) and an edge-grip
 * fork with a roll axis (wet robot: clamps the wafer edge so the wafer may be turned over while held).
 *
 * Floor-mounted robots stack link 1 and link 2 above the column. An overhead-mounted robot (the CMP wet
 * robot) hangs from a roof beam: Z housing on the beam, column down to the shoulder, link 1 and link 2
 * below it, the edge-grip wrist dropping further down. Nothing of the robot is below the shoulder at the
 * axis, so the clamped wafer can be carried and turned over directly under the robot.
 */
import type { Vec3Tuple } from "../../config/geometry";
import type { ComponentDef, JointDef } from "../../domain/types";
import { chamferProfile, chamferedBox, mergeMeshData, prismY, rectProfile, revolveProfile, rotateYMeshData, translateMeshData, tubeAlongPath, type MeshData, type Vec2, type Vec3 } from "../../geometry/meshlib";
import { PartSink, chamfRect, type Mat } from "../../geometry/sharedParts";
import { waferHalfMeshes } from "../../geometry/waferParts";

export interface ScaraRobotSpec {
  /** Joint id prefix (e.g. "atm", "dry", "wet"). */
  prefix: string;
  /** Component asset ids. */
  ids: { base: string; column: string; arm1: string; arm2: string; ee: string; wafer: string; pusher?: string; wrist?: string };
  assembly: string;
  nameKo: string;
  axisXZ: [number, number];
  d0: [number, number];
  floorY: number;
  baseTopY: number;
  shoulderY0: number;
  baseRadius: number;
  columnRadius: number;
  zStroke: number;
  linkLength: number;
  linkWidth: number;
  link1T: number;
  link2T: number;
  hubRadius: number;
  eeReach: number;
  eeMountH: number;
  eeThickness: number;
  padH: number;
  /** Fork tine lateral band [inner, outer] (backside fork). */
  tineQ: [number, number];
  tipBeyond: number;
  ee: { kind: "fork" } | { kind: "edge_grip"; drop: number; gripStroke: number; tineQ: [number, number] };
  waferRadius: number;
  waferThickness: number;
  bodyMaterial?: Mat;
  /**
   * Overhead mount: the Z housing stands on a pair of roof beams (beam top `beamTopY`, housing top
   * `housingTopY`, beams along X between `beamX`, at axis z +- `beamGap`). Absent = floor mount on `floorY`.
   */
  overhead?: { beamTopY: number; housingTopY: number; beamX: [number, number]; beamGap: number };
}

const DEG = Math.PI / 180;

function at(spec: ScaraRobotSpec, along: number, y: number, lateral = 0): Vec3Tuple {
  // lateral axis = d0 rotated +90 deg in the azimuth sense (x -> z)
  const [dx, dz] = spec.d0;
  return [spec.axisXZ[0] + along * dx - lateral * dz, y, spec.axisXZ[1] + along * dz + lateral * dx];
}

/** Height of the bottom of link 2 / top of link 2 where the wrist hub sits, relative to the shoulder plane. */
function wristPlaneOffset(spec: ScaraRobotSpec): number {
  return spec.overhead ? -(spec.link1T + spec.link2T) : spec.link1T + spec.link2T;
}

/** Wafer support plane above the shoulder plane (fork) or the roll-axis based plane (edge grip). */
export function robotSupportOffset(spec: ScaraRobotSpec): number {
  if (spec.ee.kind === "fork") return spec.link1T + spec.link2T + spec.eeMountH + spec.eeThickness + spec.padH;
  return robotRollAxisY(spec) - spec.shoulderY0 - spec.waferThickness / 2;
}

/** Height of the roll axis of the edge-grip end effector at z = 0 (wafer midplane). */
export function robotRollAxisY(spec: ScaraRobotSpec): number {
  if (spec.ee.kind !== "edge_grip") return spec.shoulderY0 + robotSupportOffset(spec) + spec.waferThickness / 2;
  // floor mount: the drop is measured from the top of link 1 (the wrist hub hangs under link 2's tip)
  return spec.overhead ? spec.shoulderY0 + wristPlaneOffset(spec) - spec.ee.drop : spec.shoulderY0 + spec.link1T - spec.ee.drop;
}

export function scaraRobotJoints(spec: ScaraRobotSpec): JointDef[] {
  const p = spec.prefix;
  const [dx, dz] = spec.d0;
  const L = spec.linkLength;
  const sgn = spec.overhead ? -1 : 1;
  const joints: JointDef[] = [
    { jointId: `${p}_z`, name: `${spec.nameKo} Z lift`, kind: "prismatic", origin: [spec.axisXZ[0], spec.shoulderY0, spec.axisXZ[1]], axis: [0, 1, 0], range: [0, spec.zStroke], unit: "m", homeNote: "0 = 최저 위치(shoulder plane 기준). 양수 = 위로 이동. Scripted 값이며 encoder 측정값이 아니다" },
    { jointId: `${p}_shoulder`, name: `${spec.nameKo} shoulder`, parentJointId: `${p}_z`, kind: "revolute", origin: [0, 0, 0], axis: [0, 1, 0], range: [-2 * Math.PI, 2 * Math.PI], unit: "rad", homeNote: "0 = link 1이 load port 방향(rest 방향)을 향함" },
    { jointId: `${p}_elbow`, name: `${spec.nameKo} elbow`, parentJointId: `${p}_shoulder`, kind: "revolute", origin: [L * dx, sgn * spec.link1T, L * dz], axis: [0, 1, 0], range: [-Math.PI, Math.PI], unit: "rad", homeNote: spec.overhead ? "0 = link 2가 link 1 아래로 완전히 접힘" : "0 = link 2가 link 1 위로 완전히 접힘" },
    { jointId: `${p}_wrist`, name: `${spec.nameKo} wrist`, parentJointId: `${p}_elbow`, kind: "revolute", origin: [-L * dx, sgn * spec.link2T, -L * dz], axis: [0, 1, 0], range: [-2 * Math.PI, 2 * Math.PI], unit: "rad", homeNote: "0 = end effector가 rest 방향" },
  ];
  if (spec.ee.kind === "edge_grip") {
    const rollOffset = spec.overhead ? -spec.ee.drop : -spec.link2T - spec.ee.drop;
    joints.push({ jointId: `${p}_roll`, name: `${spec.nameKo} end-effector roll (flip)`, parentJointId: `${p}_wrist`, kind: "revolute", origin: [0, rollOffset, 0], axis: [dx, 0, dz], range: [-Math.PI, Math.PI], unit: "rad", homeNote: "0 = fork가 wafer 아래(face-up 지지), pi = 뒤집힘. Wafer edge를 clamp한 상태에서만 회전" });
    joints.push({ jointId: `${p}_grip`, name: `${spec.nameKo} edge clamp`, parentJointId: `${p}_roll`, kind: "prismatic", origin: [0, 0, 0], axis: [dx, 0, dz], range: [0, spec.ee.gripStroke], unit: "m", homeNote: "0 = 열림, stroke = wafer edge clamp" });
  }
  return joints;
}

/** Joint the presented wafer follows. */
export function robotWaferJoint(spec: ScaraRobotSpec): string {
  return spec.ee.kind === "edge_grip" ? `${spec.prefix}_roll` : `${spec.prefix}_wrist`;
}

export function scaraRobotComponents<L>(spec: ScaraRobotSpec, mm: (label: string, v: number) => { label: string; valueM: number }, extra?: { basis?: string; assumptions?: string[] }): ComponentDef<L>[] {
  const p = spec.prefix;
  const assumptions = extra?.assumptions ?? ["Generic SCARA wafer robot의 설계 가정이다. 특정 제조사 robot의 치수·속도가 아니다.", "Joint 값은 scripted presentation이며 encoder feedback이 아니다."];
  const NONE = { dir: [0, 0, 0] as [number, number, number], distance: 0 };
  const UP = (d: number) => ({ dir: [0, 1, 0] as [number, number, number], distance: d });
  const comps: ComponentDef<L>[] = [
    { assetId: spec.ids.base, nodeKey: `${p}_robot.base`, name: `${spec.nameKo} base`, kind: "drive", assembly: spec.assembly, description: spec.overhead ? `${spec.nameKo}의 고정 base. 지붕 beam 한 쌍 위에 놓인 밀봉 Z drive housing이며 column이 아래로 내려온다. Cable·hose는 위쪽으로 나간다.` : `${spec.nameKo}의 고정 base. Z lift drive와 controller cable 입구를 포함한다.`, materialRef: spec.bodyMaterial ?? "painted_offwhite", materialNote: "Painted aluminum housing (가정)", selectable: true, explode: NONE, cutaway: "keep", dimensions: () => [mm("Base radius", spec.baseRadius), mm("Z stroke", spec.zStroke)], assumptions, structuralBasis: extra?.basis },
    { assetId: spec.ids.column, nodeKey: `${p}_robot.z_column`, name: `${spec.nameKo} Z column`, kind: "drive", assembly: spec.assembly, parentAssetId: spec.ids.base, description: spec.overhead ? "Housing에서 아래로 내려오는 Z column. 아래 끝에 shoulder가 있고 arm 전체를 오르내린다." : "Base 안에서 오르내리는 Z column. Shoulder와 arm 전체를 들어 올린다.", materialRef: "stainless", materialNote: "Stainless column with bellows cover (가정)", selectable: true, explode: UP(0.12), cutaway: "keep", jointId: `${p}_z`, dimensions: () => [mm("Column radius", spec.columnRadius)] },
    { assetId: spec.ids.arm1, nodeKey: `${p}_robot.link1`, name: `${spec.nameKo} link 1 (shoulder)`, kind: "drive", assembly: spec.assembly, parentAssetId: spec.ids.column, description: "Shoulder joint에서 elbow까지의 첫 번째 link. 내부에 elbow 구동 belt가 있다고 가정한다.", materialRef: spec.bodyMaterial ?? "painted_offwhite", materialNote: "Painted aluminum link cover (가정)", selectable: true, explode: UP(0.2), cutaway: "keep", jointId: `${p}_shoulder`, dimensions: () => [mm("Link length", spec.linkLength), mm("Thickness", spec.link1T)] },
    { assetId: spec.ids.arm2, nodeKey: `${p}_robot.link2`, name: `${spec.nameKo} link 2 (elbow)`, kind: "drive", assembly: spec.assembly, parentAssetId: spec.ids.arm1, description: "Elbow에서 wrist까지의 두 번째 link. Link 1 위에 겹쳐 접힌다.", materialRef: spec.bodyMaterial ?? "painted_offwhite", materialNote: "Painted aluminum link cover (가정)", selectable: true, explode: UP(0.28), cutaway: "keep", jointId: `${p}_elbow`, dimensions: () => [mm("Link length", spec.linkLength), mm("Thickness", spec.link2T)] },
    ...(spec.ee.kind === "edge_grip" && spec.ids.wrist
      ? [
          {
            assetId: spec.ids.wrist,
            nodeKey: `${p}_robot.wrist`,
            name: `${spec.nameKo} wrist + roll actuator`,
            kind: "drive" as const,
            assembly: spec.assembly,
            parentAssetId: spec.ids.arm2,
            description: "Link 2 끝의 wrist hub, drop post, 밀봉된 roll actuator housing. End effector를 roll 축으로 돌린다.",
            materialRef: "stainless" as const,
            materialNote: "Stainless drop post, sealed polymer roll housing (가정)",
            selectable: true,
            explode: UP(0.33),
            cutaway: "keep" as const,
            jointId: `${p}_wrist`,
            dimensions: () => [mm("Drop to roll axis", (spec.ee as { drop: number }).drop)],
          },
        ]
      : []),
    {
      assetId: spec.ids.ee,
      nodeKey: `${p}_robot.end_effector`,
      name: spec.ee.kind === "fork" ? `${spec.nameKo} wrist + end effector (backside fork)` : `${spec.nameKo} edge-grip end effector`,
      kind: "drive",
      assembly: spec.assembly,
      parentAssetId: spec.ee.kind === "edge_grip" && spec.ids.wrist ? spec.ids.wrist : spec.ids.arm2,
      description:
        spec.ee.kind === "fork"
          ? "Wrist와 얇은 fork 형 end effector. Wafer backside를 4개 pad로 받친다(face-up dry wafer 전용). Tine은 slot rib, support pin, chuck을 피해 지나간다."
          : "Drop post 아래의 roll 축과 edge-grip fork. Tip stop과 pusher로 wafer edge를 clamp한 상태에서만 뒤집는다. 젖은 wafer를 다루며 세정 단계(rinse)를 거친 뒤 clean-ready 상태가 된다.",
      materialRef: "ceramic",
      materialNote: spec.ee.kind === "fork" ? "Alumina ceramic fork, PEEK pads (가정)" : "PEEK / ceramic edge-grip fork, sealed roll housing (가정)",
      selectable: true,
      explode: UP(0.36),
      cutaway: "keep",
      jointId: spec.ee.kind === "fork" ? `${p}_wrist` : `${p}_roll`,
      dimensions: () => [mm("Wrist to wafer center", spec.eeReach), mm("Plate thickness", spec.eeThickness)],
    },
  ];
  if (spec.ee.kind === "edge_grip" && spec.ids.pusher) {
    comps.push({ assetId: spec.ids.pusher, nodeKey: `${p}_robot.edge_clamp`, name: `${spec.nameKo} edge clamp pusher`, kind: "gripper", assembly: spec.assembly, parentAssetId: spec.ids.ee, description: "Wafer edge를 tip stop 쪽으로 미는 pusher. 열림/clamp는 scripted 값이다.", materialRef: "polymer_white", materialNote: "PEEK pusher (가정)", selectable: true, explode: UP(0.4), cutaway: "keep", jointId: `${p}_grip`, dimensions: () => [mm("Clamp stroke", (spec.ee as { gripStroke: number }).gripStroke)] });
  }
  comps.push({
    assetId: spec.ids.wafer,
    nodeKey: `${p}_robot.wafer`,
    name: `Wafer on ${spec.nameKo}`,
    kind: "wafer",
    assembly: spec.assembly,
    parentAssetId: spec.ids.ee,
    description: "Robot end effector가 들고 있는 wafer의 표시. Wafer identity(W-01)는 preview holder가 정하며 이 mesh는 그 holder일 때만 보인다.",
    materialRef: "silicon_wafer",
    materialNote: "Presentation of the carried wafer",
    selectable: true,
    explode: UP(0.42),
    cutaway: "keep",
    jointId: robotWaferJoint(spec),
    dimensions: () => [mm("Diameter", spec.waferRadius * 2)],
  });
  return comps;
}

function stadium(len: number, halfW: number, n = 10): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / n;
    pts.push([len + halfW * Math.cos(a), halfW * Math.sin(a)]);
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / n;
    pts.push([halfW * Math.cos(a), halfW * Math.sin(a)]);
  }
  return pts;
}

/** Prism of a 2D profile authored along +x (lateral = z), oriented along d0 and placed at `origin`. */
function oriented(profile: Vec2[], y0: number, y1: number, d0: [number, number], origin: [number, number], reverse = false): MeshData {
  const md = prismY(profile, y0, y1);
  const a0 = Math.atan2(d0[1], d0[0]) + (reverse ? Math.PI : 0);
  rotateYMeshData(md, a0);
  translateMeshData(md, origin[0], 0, origin[1]);
  return md;
}

function cylinderAt(r: number, y0: number, y1: number, xz: [number, number], seg = 32, chamfer = 0.002): MeshData {
  const md = revolveProfile(chamfRect(0, r, y0, y1, Math.min(chamfer, (y1 - y0) / 3, r / 3)), { segments: seg });
  return translateMeshData(md, xz[0], 0, xz[1]);
}

/** Backside fork outline (x along the effector from the wrist axis, z lateral). */
export function forkOutline(reach: number, tineQ: [number, number], tipBeyond: number, rootHalf = 0.034): Vec2[] {
  const xb = reach - 0.17;
  const tip = reach + tipBeyond;
  const [q0, q1] = tineQ;
  const raw: Vec2[] = [
    [-0.02, -rootHalf],
    [xb, -rootHalf],
    [xb, -q1],
    [tip, -q1],
    [tip, -q0],
    [xb + 0.04, -q0],
    [xb + 0.04, q0],
    [tip, q0],
    [tip, q1],
    [xb, q1],
    [xb, rootHalf],
    [-0.02, rootHalf],
  ];
  return chamferProfile(raw, 0.004, (i) => i === 0 || i === raw.length - 1);
}

export function buildScaraRobotParts(sink: PartSink, spec: ScaraRobotSpec): void {
  const p = spec.prefix;
  const [dx, dz] = spec.d0;
  const ax = spec.axisXZ;
  const L = spec.linkLength;
  const s0 = spec.shoulderY0;
  const body = spec.bodyMaterial ?? "painted_offwhite";
  // ---------------------------------------------------------------- base (fixed)
  if (spec.overhead) {
    const o = spec.overhead;
    const r = spec.baseRadius;
    // two roof beams along X on both sides of the axis, a mounting flange across them, the sealed Z housing on top
    const bw = 0.05;
    const beams = mergeMeshData([-1, 1].map((sd) => chamferedBox([o.beamX[1] - o.beamX[0], 0.08, bw], 0.004, [(o.beamX[0] + o.beamX[1]) / 2, o.beamTopY - 0.04, ax[1] + sd * o.beamGap])));
    const flange = chamferedBox([2 * r + 0.08, 0.016, 2 * o.beamGap + bw], 0.003, [ax[0], o.beamTopY + 0.008, ax[1]]);
    const shell = cylinderAt(r, o.beamTopY + 0.016, o.housingTopY - 0.014, ax, 48, 0.008);
    const cap = cylinderAt(r - 0.012, o.housingTopY - 0.016, o.housingTopY, ax, 48, 0.003);
    sink.fixed(`${p}_base_shell`, spec.ids.base, body, mergeMeshData([shell, cap, flange]), { cutaway: "keep" });
    sink.fixed(`${p}_base_beams`, spec.ids.base, "dark_steel", beams, { cutaway: "keep", castShadow: false });
    const top = at(spec, -r * 0.4, o.housingTopY);
    const port = chamferedBox([0.07, 0.05, 0.08], 0.006, [top[0], o.housingTopY + 0.02, top[2]]);
    const cable: Vec3[] = [[top[0], o.housingTopY + 0.04, top[2]], [top[0], o.housingTopY + 0.12, top[2]], at(spec, -r - 0.2, o.housingTopY + 0.12)];
    sink.fixed(`${p}_base_cable`, spec.ids.base, "rubber_membrane", mergeMeshData([port, tubeAlongPath(cable, 0.014, { segments: 10, cornerRadius: 0.05 })]), { cutaway: "keep", pickable: true, castShadow: false, lod: "fine" });
  } else {
    const r = spec.baseRadius;
    const shell = cylinderAt(r, spec.floorY + 0.02, spec.baseTopY - 0.012, ax, 48, 0.008);
    const cap = cylinderAt(r - 0.012, spec.baseTopY - 0.014, spec.baseTopY, ax, 48, 0.003);
    const plinth = cylinderAt(r + 0.03, spec.floorY, spec.floorY + 0.02, ax, 48, 0.003);
    sink.fixed(`${p}_base_shell`, spec.ids.base, body, mergeMeshData([shell, cap]), { cutaway: "keep" });
    sink.fixed(`${p}_base_plinth`, spec.ids.base, "dark_steel", plinth, { cutaway: "keep", castShadow: false });
    // cable / hose entry at the back of the base
    const back = at(spec, -r + 0.01, spec.floorY + 0.18);
    const port = chamferedBox([0.06, 0.12, 0.08], 0.006, [0, 0, 0]);
    rotateYMeshData(port, Math.atan2(dz, dx));
    translateMeshData(port, back[0], back[1], back[2]);
    const cable: Vec3[] = [at(spec, -r - 0.02, spec.floorY + 0.15), at(spec, -r - 0.08, spec.floorY + 0.06), at(spec, -r - 0.08, spec.floorY + 0.01)];
    sink.fixed(`${p}_base_cable`, spec.ids.base, "rubber_membrane", mergeMeshData([port, tubeAlongPath(cable, 0.012, { segments: 10, cornerRadius: 0.04 })]), { cutaway: "keep", pickable: true, castShadow: false, lod: "fine" });
  }
  // ---------------------------------------------------------------- Z column (z joint)
  if (spec.overhead) {
    // column from the shoulder up into the housing (stays inside it over the whole stroke)
    const yBot = s0 + 0.004;
    const yTop = spec.overhead.beamTopY + 0.06;
    const col = cylinderAt(spec.columnRadius, yBot, yTop, ax, 40, 0.004);
    const collar = cylinderAt(spec.columnRadius + 0.012, yBot, yBot + 0.03, ax, 40, 0.003);
    sink.fixed(`${p}_column`, spec.ids.column, "stainless", col, { cutaway: "keep", jointId: `${p}_z` });
    sink.fixed(`${p}_column_collar`, spec.ids.column, body, collar, { cutaway: "keep", jointId: `${p}_z` });
  } else {
    const yTop = s0 - 0.004;
    const yBot = s0 - spec.zStroke - 0.03;
    const col = cylinderAt(spec.columnRadius, yBot, yTop, ax, 40, 0.004);
    const collar = cylinderAt(spec.columnRadius + 0.012, yTop - 0.03, yTop, ax, 40, 0.003);
    sink.fixed(`${p}_column`, spec.ids.column, "stainless", col, { cutaway: "keep", jointId: `${p}_z` });
    sink.fixed(`${p}_column_collar`, spec.ids.column, body, collar, { cutaway: "keep", jointId: `${p}_z` });
  }
  // ---------------------------------------------------------------- link 1 (shoulder)
  {
    const w = spec.linkWidth / 2;
    const [ly0, ly1] = spec.overhead ? [s0 - spec.link1T, s0] : [s0, s0 + spec.link1T];
    const link = oriented(stadium(L, w), ly0, ly1, spec.d0, ax);
    const hub = spec.overhead ? cylinderAt(spec.hubRadius + 0.012, s0 - 0.002, s0 + 0.012, ax, 40, 0.003) : cylinderAt(spec.hubRadius + 0.012, s0 - 0.012, s0 + 0.002, ax, 40, 0.003);
    const seamA = oriented(stadium(L, w + 0.0015), ly0 + spec.link1T * 0.48, ly0 + spec.link1T * 0.52, spec.d0, ax);
    sink.fixed(`${p}_link1`, spec.ids.arm1, body, mergeMeshData([link, hub]), { cutaway: "keep", jointId: `${p}_shoulder` });
    sink.fixed(`${p}_link1_seam`, spec.ids.arm1, "dark_steel", seamA, { cutaway: "keep", jointId: `${p}_shoulder`, pickable: false, castShadow: false, lod: "fine" });
  }
  // ---------------------------------------------------------------- link 2 (elbow), folded back over (under) link 1
  {
    const w = spec.linkWidth * 0.42;
    const elbowXZ: [number, number] = [ax[0] + L * dx, ax[1] + L * dz];
    const y0 = spec.overhead ? s0 - spec.link1T - spec.link2T : s0 + spec.link1T;
    const link = oriented(stadium(L, w), y0, y0 + spec.link2T, spec.d0, elbowXZ, true);
    const elbowCap = spec.overhead ? cylinderAt(w + 0.004, y0 - 0.006, y0, elbowXZ, 32, 0.002) : cylinderAt(w + 0.004, y0 + spec.link2T, y0 + spec.link2T + 0.006, elbowXZ, 32, 0.002);
    sink.fixed(`${p}_link2`, spec.ids.arm2, body, mergeMeshData([link, elbowCap]), { cutaway: "keep", jointId: `${p}_elbow` });
  }
  // ---------------------------------------------------------------- wrist + end effector
  const yW = s0 + spec.link1T + spec.link2T;
  if (spec.ee.kind === "fork") {
    const hub = cylinderAt(spec.hubRadius, yW, yW + spec.eeMountH, ax, 32, 0.002);
    const plateY0 = yW + spec.eeMountH;
    const plate = oriented(forkOutline(spec.eeReach, spec.tineQ, spec.tipBeyond), plateY0, plateY0 + spec.eeThickness, spec.d0, ax);
    const pads: MeshData[] = [];
    const qm = (spec.tineQ[0] + spec.tineQ[1]) / 2;
    for (const da of [-0.09, 0.09]) for (const q of [-qm, qm]) {
      const c = at(spec, spec.eeReach + da, 0, q);
      pads.push(cylinderAt(0.007, plateY0 + spec.eeThickness - 0.0002, plateY0 + spec.eeThickness + spec.padH, [c[0], c[2]], 16, 0.0003));
    }
    sink.fixed(`${p}_wrist_hub`, spec.ids.ee, "stainless", hub, { cutaway: "keep", jointId: `${p}_wrist` });
    sink.fixed(`${p}_fork`, spec.ids.ee, "ceramic", plate, { cutaway: "keep", jointId: `${p}_wrist`, castShadow: true });
    sink.fixed(`${p}_fork_pads`, spec.ids.ee, "polymer_white", mergeMeshData(pads), { cutaway: "keep", jointId: `${p}_wrist`, pickable: false, castShadow: false, lod: "fine" });
    // wafer presentation on the fork
    const wc = at(spec, spec.eeReach, 0);
    const wy0 = plateY0 + spec.eeThickness + spec.padH;
    const wh = waferHalfMeshes(spec.waferRadius, wy0, spec.waferThickness, false, wc[0], wc[2]);
    sink.fixed(`${p}_wafer`, spec.ids.wafer, "silicon_wafer", wh.back, { cutaway: "keep", jointId: `${p}_wrist`, castShadow: false });
    sink.fixed(`${p}_wafer_front`, spec.ids.wafer, "wafer_front", wh.front, { cutaway: "keep", jointId: `${p}_wrist`, castShadow: false });
  } else {
    const ee = spec.ee;
    const yRoll = robotRollAxisY(spec);
    // wrist hub hangs under link 2's tip, the drop post goes down to the roll housing
    const yUnder = spec.overhead ? s0 + wristPlaneOffset(spec) : s0 + spec.link1T;
    const hub = cylinderAt(spec.hubRadius, yUnder - 0.01, yUnder + 0.002, ax, 32, 0.002);
    const post = cylinderAt(0.022, yRoll + 0.03, yUnder - 0.008, ax, 24, 0.002);
    const rollHouse = (() => {
      const md = chamferedBox([0.09, 0.05, 0.07], 0.006, [0, 0, 0]);
      rotateYMeshData(md, Math.atan2(dz, dx));
      const c = at(spec, 0.01, yRoll + 0.012);
      return translateMeshData(md, c[0], c[1], c[2]);
    })();
    const wristId = spec.ids.wrist ?? spec.ids.ee;
    sink.fixed(`${p}_wrist_drop`, wristId, "stainless", mergeMeshData([hub, post]), { cutaway: "keep", jointId: `${p}_wrist` });
    sink.fixed(`${p}_roll_housing`, wristId, body, rollHouse, { cutaway: "keep", jointId: `${p}_wrist` });
    // edge-grip fork on the roll axis: plate just below the wafer midplane
    const plateTop = yRoll - spec.waferThickness / 2 - spec.padH;
    const plate = oriented(forkOutline(spec.eeReach, ee.tineQ, 0.165, 0.03), plateTop - spec.eeThickness, plateTop, spec.d0, ax);
    const stops: MeshData[] = [];
    for (const q of [-(ee.tineQ[0] + ee.tineQ[1]) / 2, (ee.tineQ[0] + ee.tineQ[1]) / 2]) {
      const c = at(spec, spec.eeReach + spec.waferRadius + 0.006, 0, q);
      const st = chamferedBox([0.01, 0.009, 0.024], 0.002, [0, 0, 0]);
      rotateYMeshData(st, Math.atan2(dz, dx));
      stops.push(translateMeshData(st, c[0], plateTop + 0.0035, c[2]));
    }
    const pads: MeshData[] = [];
    const qm = (ee.tineQ[0] + ee.tineQ[1]) / 2;
    for (const da of [-0.145, 0.145]) for (const q of [-0.026, 0.026]) {
      const c = at(spec, spec.eeReach + da, 0, q);
      pads.push(cylinderAt(0.005, plateTop - 0.0002, plateTop + spec.padH, [c[0], c[2]], 14, 0.0003));
    }
    void qm;
    sink.fixed(`${p}_grip_fork`, spec.ids.ee, "polymer_white", mergeMeshData([plate, ...stops]), { cutaway: "keep", jointId: `${p}_roll` });
    sink.fixed(`${p}_grip_pads`, spec.ids.ee, "ceramic", mergeMeshData(pads), { cutaway: "keep", jointId: `${p}_roll`, pickable: false, castShadow: false, lod: "fine" });
    if (spec.ids.pusher) {
      const c = at(spec, spec.eeReach - spec.waferRadius - 0.006 - ee.gripStroke, 0, 0);
      const pusher = chamferedBox([0.014, 0.011, 0.05], 0.002, [0, 0, 0]);
      rotateYMeshData(pusher, Math.atan2(dz, dx));
      translateMeshData(pusher, c[0], plateTop + 0.004, c[2]);
      sink.fixed(`${p}_pusher`, spec.ids.pusher, "polymer_white", pusher, { cutaway: "keep", jointId: `${p}_grip` });
    }
    const wc = at(spec, spec.eeReach, 0);
    // authored face down at roll 0 (picked face down from the flip station / load cup); roll = pi turns it face up
    const wh = waferHalfMeshes(spec.waferRadius, yRoll - spec.waferThickness / 2, spec.waferThickness, true, wc[0], wc[2]);
    sink.fixed(`${p}_wafer`, spec.ids.wafer, "silicon_wafer", wh.back, { cutaway: "keep", jointId: `${p}_roll`, castShadow: false });
    sink.fixed(`${p}_wafer_front`, spec.ids.wafer, "wafer_front", wh.front, { cutaway: "keep", jointId: `${p}_roll`, castShadow: false });
  }
  void DEG;
  void rectProfile;
}
