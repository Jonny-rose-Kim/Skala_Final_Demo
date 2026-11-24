/**
 * CELLESTA PM-01 handling and process tracks (pure in presentation time).
 *
 *   load:    dock, FOUP door open -> EFEM robot picks the reserved slot -> places on the pass station pins ->
 *            transfer robot picks -> PM-01 shutter opens (spindle stopped, nozzle parked, guard down) ->
 *            places on the spin chuck support pins -> retracts -> shutter closes
 *   process: guard up, spin, chemical / UPW / IPA dispense with the swing arm, atmosphere control, spin-down,
 *            arm park, guard down (see cellestaProcessAt)
 *   unload:  the reverse; the robot enters PM-01 only after the scripted dry-confirmed state.
 *
 * Every handoff happens inside a Z motion at the moment the moving support passes the other support, so the
 * wafer pose is continuous. Joint values are presentation (scripted), never encoder observations.
 */
import timing from "../../../config/visual/handling-sequence-v1.json";
import { evaluateTrack, trackDuration, type MotionStep, type TrackInitial } from "../../presentation/motionTrack";
import { scaraIK, scaraTaskOf } from "../handling/scara";
import { STATION_JOINTS } from "../handling/stationParts";
import type { StationTiming } from "../handling/stationSequence";
import { armAngle, type CellestaLayout, type RobotLayout } from "./layout";

export type CellestaHolder = "foup" | "atm" | "pass" | "tr" | "chuck";

export const CELLESTA_JOINTS = {
  shutter: "pm_shutter",
  guard: "cup_guard",
  spin: "spin",
  arm: "dispense_arm",
} as const;

const T: StationTiming = timing.station;

export interface CellestaPlan {
  L: CellestaLayout;
  slot: number;
  load: MotionStep<CellestaHolder>[];
  unload: MotionStep<CellestaHolder>[];
  loadInitial: TrackInitial<CellestaHolder>;
  unloadInitial: TrackInitial<CellestaHolder>;
  loadDuration: number;
  unloadDuration: number;
  /** Guard joint values (offset from the transfer level). */
  guard: { transfer: number; chemical: number; rinse: number };
}

function zFor(r: RobotLayout, planeY: number): number {
  return planeY - r.shoulderY0 - r.supportOffset;
}

export function planCellesta(L: CellestaLayout, slot: number): CellestaPlan {
  const ac = L.atm.cfg.approach_clearance;
  const tac = L.tr.cfg.approach_clearance;
  const lp = L.loadPort;
  const foupT = scaraTaskOf(L.atm.geom, L.foupWafer[0], L.foupWafer[1]);
  const passA = scaraTaskOf(L.atm.geom, L.pass.x, L.pass.z);
  const passT = scaraTaskOf(L.tr.geom, L.pass.x, L.pass.z);
  const chuckT = scaraTaskOf(L.tr.geom, 0, 0);
  const zSlot = zFor(L.atm, L.slotY(slot));
  const zPassA = zFor(L.atm, L.pass.planeY);
  const zPassT = zFor(L.tr, L.pass.planeY);
  const zChuck = zFor(L.tr, 0);
  const g = L.pm.guard.levels;
  const guard = { transfer: 0, chemical: g.chemical - g.transfer, rinse: g.rinse - g.transfer };
  const shut = L.pm.shutter.travel;
  const loadInitial: TrackInitial<CellestaHolder> = {
    values: { dock: 0, doorPull: 0, doorLower: 0, aRho: 0, aTheta: foupT.theta, aZ: zPassA + ac, tRho: 0, tTheta: passT.theta, tZ: zPassT + tac, shutter: 0, guard: guard.transfer },
    holder: "foup",
    flags: { pmState: "closed_idle" },
  };
  const load: MotionStep<CellestaHolder>[] = [
    { id: "lp_dock", labelKo: "FOUP docking (dock plate)", duration: T.dock, to: { dock: lp.dockStroke } },
    { id: "foup_door_pull", labelKo: "FOUP door 해제·당김", duration: T.door_pull, to: { doorPull: lp.doorPull } },
    { id: "foup_door_lower", labelKo: "FOUP door 하강 (opening 개방)", duration: T.door_lower, to: { doorLower: lp.doorLower } },
    { id: "atm_to_slot", labelKo: `EFEM robot: slot-${slot} 접근 높이`, duration: T.robot_z, to: { aTheta: foupT.theta, aZ: zSlot - ac } },
    { id: "atm_in_foup", labelKo: `EFEM robot: fork를 slot-${slot} wafer 아래로`, duration: T.robot_extend, to: { aRho: foupT.rho } },
    { id: "atm_pick_foup", labelKo: `EFEM robot: slot-${slot}에서 dry wafer pick`, duration: T.robot_lift, to: { aZ: zSlot + ac }, handoff: { holder: "atm", at: { channel: "aZ", value: zSlot } } },
    { id: "atm_out_foup", labelKo: "EFEM robot: 후퇴", duration: T.robot_retract, to: { aRho: 0 } },
    { id: "atm_to_pass", labelKo: "EFEM robot: pass station 방향 회전", duration: T.robot_rotate, to: { aTheta: passA.theta, aZ: zPassA + ac } },
    { id: "atm_in_pass", labelKo: "EFEM robot: pass station pin 위로", duration: T.robot_extend, to: { aRho: passA.rho } },
    { id: "atm_place_pass", labelKo: "EFEM robot: pass station pin에 place", duration: T.robot_lift, to: { aZ: zPassA - ac }, handoff: { holder: "pass", at: { channel: "aZ", value: zPassA } } },
    { id: "atm_out_pass", labelKo: "EFEM robot: 후퇴", duration: T.robot_retract, to: { aRho: 0 } },
    { id: "tr_to_pass", labelKo: "Transfer robot: pass station 아래 높이", duration: T.robot_z, to: { tTheta: passT.theta, tZ: zPassT - tac } },
    { id: "tr_in_pass", labelKo: "Transfer robot: fork를 wafer 아래로", duration: T.robot_extend, to: { tRho: passT.rho } },
    { id: "tr_pick_pass", labelKo: "Transfer robot: pass station에서 pick", duration: T.robot_lift, to: { tZ: zPassT + tac }, handoff: { holder: "tr", at: { channel: "tZ", value: zPassT } } },
    { id: "tr_out_pass", labelKo: "Transfer robot: 후퇴", duration: T.robot_retract, to: { tRho: 0 } },
    { id: "tr_to_pm", labelKo: "Transfer robot: PM-01 방향 회전", duration: T.robot_rotate, to: { tTheta: chuckT.theta, tZ: zChuck + tac } },
    { id: "pm_shutter_open", labelKo: "PM-01 shutter 열림 (spindle 정지, nozzle park, guard 하강 확인)", duration: T.gate, to: { shutter: shut }, set: { pmState: "transfer_open" } },
    { id: "tr_in_pm", labelKo: "Transfer robot: spin chuck 위로 반입", duration: T.robot_extend, to: { tRho: chuckT.rho } },
    { id: "tr_place_chuck", labelKo: "Transfer robot: chuck support pin에 place", duration: T.robot_lift, to: { tZ: zChuck - tac }, handoff: { holder: "chuck", at: { channel: "tZ", value: zChuck } } },
    { id: "tr_out_pm", labelKo: "Transfer robot: 후퇴", duration: T.robot_retract, to: { tRho: 0 } },
    { id: "pm_shutter_close", labelKo: "PM-01 shutter 닫힘 (close / ready)", duration: T.gate, to: { shutter: 0 }, set: { pmState: "closed_ready" } },
  ];
  const loadEnd = evaluateTrack(load, loadInitial, trackDuration(load) + 1);
  const unloadInitial: TrackInitial<CellestaHolder> = { values: { ...loadEnd.values }, holder: "chuck", flags: { pmState: "closed_dry_confirmed" } };
  const unload: MotionStep<CellestaHolder>[] = [
    { id: "tr_under_chuck", labelKo: "Transfer robot: chuck wafer 아래 높이", duration: T.robot_z, to: { tTheta: chuckT.theta, tZ: zChuck - tac } },
    { id: "pm_shutter_open_out", labelKo: "PM-01 shutter 열림 (dry-confirmed, spindle 정지, nozzle park)", duration: T.gate, to: { shutter: shut }, set: { pmState: "transfer_open" } },
    { id: "tr_in_pm_out", labelKo: "Transfer robot: fork를 wafer 아래로", duration: T.robot_extend, to: { tRho: chuckT.rho } },
    { id: "tr_pick_chuck", labelKo: "Transfer robot: dry wafer pick", duration: T.robot_lift, to: { tZ: zChuck + tac }, handoff: { holder: "tr", at: { channel: "tZ", value: zChuck } } },
    { id: "tr_out_pm_out", labelKo: "Transfer robot: 후퇴", duration: T.robot_retract, to: { tRho: 0 } },
    { id: "pm_shutter_close_out", labelKo: "PM-01 shutter 닫힘", duration: T.gate, to: { shutter: 0 }, set: { pmState: "closed_idle" } },
    { id: "tr_to_pass_out", labelKo: "Transfer robot: pass station 방향 회전", duration: T.robot_rotate, to: { tTheta: passT.theta, tZ: zPassT + tac } },
    { id: "tr_in_pass_out", labelKo: "Transfer robot: pass station pin 위로", duration: T.robot_extend, to: { tRho: passT.rho } },
    { id: "tr_place_pass", labelKo: "Transfer robot: pass station에 place", duration: T.robot_lift, to: { tZ: zPassT - tac }, handoff: { holder: "pass", at: { channel: "tZ", value: zPassT } } },
    { id: "tr_out_pass_out", labelKo: "Transfer robot: 후퇴·home", duration: T.robot_retract, to: { tRho: 0 } },
    { id: "atm_under_pass", labelKo: "EFEM robot: pass station wafer 아래 높이", duration: T.robot_rotate, to: { aTheta: passA.theta, aZ: zPassA - ac } },
    { id: "atm_in_pass_out", labelKo: "EFEM robot: fork를 wafer 아래로", duration: T.robot_extend, to: { aRho: passA.rho } },
    { id: "atm_pick_pass", labelKo: "EFEM robot: pass station에서 pick", duration: T.robot_lift, to: { aZ: zPassA + ac }, handoff: { holder: "atm", at: { channel: "aZ", value: zPassA } } },
    { id: "atm_out_pass_out", labelKo: "EFEM robot: 후퇴", duration: T.robot_retract, to: { aRho: 0 } },
    { id: "atm_to_foup", labelKo: `EFEM robot: FOUP 방향, slot-${slot} 위 높이`, duration: T.robot_rotate, to: { aTheta: foupT.theta, aZ: zSlot + ac } },
    { id: "atm_in_foup_out", labelKo: `EFEM robot: wafer를 slot-${slot} 위로`, duration: T.robot_extend, to: { aRho: foupT.rho } },
    { id: "atm_place_foup", labelKo: `EFEM robot: dry wafer를 reserved slot-${slot}에 place`, duration: T.robot_lift, to: { aZ: zSlot - ac }, handoff: { holder: "foup", at: { channel: "aZ", value: zSlot } } },
    { id: "atm_home", labelKo: "EFEM robot: 후퇴·home", duration: T.robot_retract, to: { aRho: 0, aZ: zPassA + ac } },
    { id: "foup_door_raise", labelKo: "FOUP door 상승", duration: T.door_lower, to: { doorLower: 0 } },
    { id: "foup_door_close", labelKo: "FOUP door 닫힘·latch", duration: T.door_pull, to: { doorPull: 0 } },
    { id: "lp_undock", labelKo: "Undock (OHT 인계 준비)", duration: T.undock, to: { dock: 0 } },
  ];
  return { L, slot, load, unload, loadInitial, unloadInitial, loadDuration: trackDuration(load), unloadDuration: trackDuration(unload), guard };
}

/** Joint values of the tool for a track state (process joints are added by the process sample). */
export function cellestaJointValues(plan: CellestaPlan, v: Record<string, number>): Record<string, number> {
  const L = plan.L;
  const a = scaraIK(L.atm.geom, v.aRho, v.aTheta);
  const t = scaraIK(L.tr.geom, v.tRho, v.tTheta);
  return {
    [STATION_JOINTS.dock]: v.dock,
    [STATION_JOINTS.doorPull]: v.doorPull,
    [STATION_JOINTS.doorLower]: v.doorLower,
    atm_z: v.aZ,
    atm_shoulder: a.shoulder,
    atm_elbow: a.elbow,
    atm_wrist: a.wrist,
    tr_z: v.tZ,
    tr_shoulder: t.shoulder,
    tr_elbow: t.elbow,
    tr_wrist: t.wrist,
    [CELLESTA_JOINTS.shutter]: v.shutter,
    [CELLESTA_JOINTS.guard]: v.guard,
    [CELLESTA_JOINTS.spin]: 0,
    [CELLESTA_JOINTS.arm]: armAngle(L, "park"),
  };
}

// --------------------------------------------------------------------------------- process (PM-01)

export interface CellestaProcessPhase {
  id: string;
  label: string;
  labelKo: string;
  duration: number;
}

/**
 * Representative sequence: chemical clean -> rinse -> IPA / atmosphere-related drying -> spin-down and
 * dry-confirmed. The step names follow the order of the team's synthetic wet-clean recipe (pre-wet, chemical
 * clean, reaction hold, DI rinse, spin dry) mapped onto the MD drying description; they are not a recipe.
 * "SMD" is not modeled. Speeds are presentation values (rpm), not setpoints.
 */
export const CELLESTA_PROCESS_PHASES: CellestaProcessPhase[] = [
  { id: "ready", label: "Close / ready (guard up, atmosphere control)", labelKo: "Close / ready: guard 상승, 분위기 제어 시작", duration: 2 },
  { id: "pre_wet", label: "Pre-wet (UPW)", labelKo: "Pre-wet (UPW)", duration: 2.5 },
  { id: "chemical", label: "Chemical clean (nozzle sweep)", labelKo: "Chemical clean: nozzle sweep (선택한 residue 처리)", duration: 8 },
  { id: "rinse", label: "UPW rinse", labelKo: "UPW rinse (guard rinse 위치)", duration: 5 },
  { id: "ipa_dry", label: "IPA dry with atmosphere control (representative)", labelKo: "IPA 건조 + chamber 분위기 제어 (대표 시각화)", duration: 5 },
  { id: "spin_down", label: "Spin-off / spin-down, arm park", labelKo: "Spin-off 후 정지, nozzle park", duration: 3.5 },
  { id: "dry_confirm", label: "Dry-confirmed (scripted), guard down", labelKo: "Dry-confirmed (scripted 상태), guard 하강", duration: 1.5 },
];

export const CELLESTA_PROCESS_DURATION = CELLESTA_PROCESS_PHASES.reduce((a, p) => a + p.duration, 0);

/** Presentation spin speed (rpm) at local process time (piecewise linear, continuous). */
const SPEED_KNOTS: [number, number][] = (() => {
  const st = (id: string) => {
    let t = 0;
    for (const p of CELLESTA_PROCESS_PHASES) {
      if (p.id === id) return [t, t + p.duration] as [number, number];
      t += p.duration;
    }
    return [0, 0] as [number, number];
  };
  const [r0, r1] = st("ready");
  const [, pw1] = st("pre_wet");
  const [, c1] = st("chemical");
  const [, ri1] = st("rinse");
  const [, ip1] = st("ipa_dry");
  const [sd0, sd1] = st("spin_down");
  return [
    [r0, 0],
    [r1, 300],
    [pw1, 300],
    [pw1 + 0.5, 500],
    [c1, 500],
    [c1 + 0.5, 800],
    [ri1, 800],
    [ri1 + 0.6, 400],
    [ip1, 400],
    [sd0 + 0.6, 1500],
    [sd1 - 1.0, 1500],
    [sd1, 0],
    [CELLESTA_PROCESS_DURATION, 0],
  ];
})();

function speedAt(t: number): number {
  const k = SPEED_KNOTS;
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return k[i - 1][1] + ((k[i][1] - k[i - 1][1]) * (t - k[i - 1][0])) / Math.max(1e-9, k[i][0] - k[i - 1][0]);
  return k[k.length - 1][1];
}

/** Revolutions done by local time t (exact integral of the piecewise linear speed), scaled so the chuck stops at a whole turn. */
function revolutions(t: number): number {
  const k = SPEED_KNOTS;
  let rev = 0;
  for (let i = 1; i < k.length; i++) {
    const [ta, va] = k[i - 1];
    const [tb, vb] = k[i];
    if (t <= ta) break;
    const te = Math.min(t, tb);
    const ve = va + ((vb - va) * (te - ta)) / Math.max(1e-9, tb - ta);
    rev += ((va + ve) / 2) * (te - ta) / 60;
  }
  return rev;
}
const TOTAL_REV = revolutions(CELLESTA_PROCESS_DURATION);
const REV_SCALE = Math.max(1, Math.round(TOTAL_REV)) / TOTAL_REV;

export interface CellestaProcessSample {
  phase: CellestaProcessPhase;
  phaseProgress: number;
  /** Presentation spin speed (rpm). */
  rpm: number;
  joints: Record<string, number>;
  /** Effect drivers 0..1: liquid film by kind, spray, drains, exhaust, atmosphere control. */
  effects: Record<string, number>;
  wetState: "dry" | "wet_chemical" | "wet_rinse" | "drying";
  /** Dispensed medium of the active nozzle ("" = none). */
  dispensing: "" | "chemical" | "upw" | "ipa";
  /** Transfer interlock of PM-01 (spindle stopped, nozzle parked, guard down, dry-confirmed). */
  transferReady: boolean;
}

export function cellestaProcessAt(plan: CellestaPlan, tp: number): CellestaProcessSample {
  const L = plan.L;
  const t = Math.min(Math.max(tp, 0), CELLESTA_PROCESS_DURATION);
  let t0 = 0;
  let phase = CELLESTA_PROCESS_PHASES[0];
  for (const p of CELLESTA_PROCESS_PHASES) {
    phase = p;
    if (t < t0 + p.duration) break;
    t0 += p.duration;
  }
  const u = Math.min(1, Math.max(0, (t - t0) / phase.duration));
  const ease = (x: number) => x * x * (3 - 2 * x);
  const park = armAngle(L, "park");
  const center = armAngle(L, "center");
  const edge = armAngle(L, "edge");
  let arm = park;
  let guard = plan.guard.chemical;
  let dispensing: CellestaProcessSample["dispensing"] = "";
  let wetState: CellestaProcessSample["wetState"] = "wet_rinse";
  const fx: Record<string, number> = { liquidChem: 0, liquidRinse: 0, liquidIpa: 0, spray: 0, drainOuter: 0, drainInner: 0, exhaust: 1, atmosphere: 0 };
  switch (phase.id) {
    case "ready":
      arm = park + (center - park) * ease(u);
      guard = plan.guard.transfer + (plan.guard.chemical - plan.guard.transfer) * ease(u);
      wetState = "dry";
      fx.atmosphere = ease(u);
      break;
    case "pre_wet":
      arm = center;
      dispensing = "upw";
      fx.liquidRinse = ease(Math.min(1, u * 2));
      fx.spray = 1;
      fx.drainOuter = 1;
      fx.atmosphere = 1;
      wetState = "wet_rinse";
      break;
    case "chemical": {
      // sweep centre -> edge -> centre twice
      const s = 0.5 - 0.5 * Math.cos(u * Math.PI * 4);
      arm = center + (edge - center) * s;
      dispensing = "chemical";
      fx.liquidChem = 1;
      fx.liquidRinse = Math.max(0, 1 - u * 4);
      fx.spray = 1;
      fx.drainOuter = 1;
      fx.atmosphere = 1;
      wetState = "wet_chemical";
      break;
    }
    case "rinse":
      arm = center;
      guard = plan.guard.chemical + (plan.guard.rinse - plan.guard.chemical) * ease(Math.min(1, u * 3));
      dispensing = "upw";
      fx.liquidRinse = 1;
      fx.liquidChem = Math.max(0, 1 - u * 3);
      fx.spray = 1;
      fx.drainInner = 1;
      fx.atmosphere = 1;
      wetState = "wet_rinse";
      break;
    case "ipa_dry":
      // IPA displacement front: the nozzle moves from the centre to the edge while dispensing
      arm = center + (edge - center) * ease(u);
      guard = plan.guard.rinse;
      dispensing = "ipa";
      fx.liquidIpa = 1 - 0.6 * u;
      fx.liquidRinse = Math.max(0, 1 - u * 2.5);
      fx.spray = 1;
      fx.drainInner = 1;
      fx.atmosphere = 1;
      wetState = "drying";
      break;
    case "spin_down":
      arm = edge + (park - edge) * ease(Math.min(1, u * 1.6));
      guard = plan.guard.rinse;
      fx.liquidIpa = Math.max(0, 0.4 * (1 - u * 3));
      fx.drainInner = Math.max(0, 1 - u * 2);
      fx.atmosphere = 1 - 0.5 * u;
      wetState = "drying";
      break;
    case "dry_confirm":
      arm = park;
      guard = plan.guard.rinse + (plan.guard.transfer - plan.guard.rinse) * ease(u);
      fx.atmosphere = 0.5 * (1 - u);
      wetState = "dry";
      break;
  }
  const rpm = speedAt(t);
  const spin = 2 * Math.PI * revolutions(t) * REV_SCALE;
  const transferReady = phase.id === "dry_confirm" && u >= 1 - 1e-9;
  return { phase, phaseProgress: u, rpm, joints: { [CELLESTA_JOINTS.arm]: arm, [CELLESTA_JOINTS.guard]: guard, [CELLESTA_JOINTS.spin]: spin }, effects: fx, wetState, dispensing, transferReady };
}
