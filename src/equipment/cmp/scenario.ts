/**
 * Rotary STI CMP demonstration sequence (`sti-cmp-cycle-v2`), FOUP to FOUP:
 *
 *   dock / door open -> dry robot picks slot-13 (dry, face up) -> flip station clamps and turns it face down
 *   -> wet robot clamps it and places it on the load cup -> head picks, pad wetting, polish, clearing,
 *   bounded overpolish, head lift, ex-situ conditioning, head returns it to the load cup
 *   -> wet robot clamps the dirty-wet wafer, turns it face up while clamped, places it in the brush cleaner
 *   -> wet robot end effector is rinsed (clean-ready) while the cleaner scrubs -> wet robot moves the
 *   clean-wet wafer into the spin dryer (wet side) -> spin dry -> dry robot takes it out (dry side) and
 *   returns it to the reserved slot -> door close, undock.
 *
 * Every joint, holder, slot, face orientation, wet state and IllustrativeFilmState is a pure function of
 * time (motion tracks + phase-relative polish profiles). Durations are presentation timing from config.
 * No endpoint detection, PASS/FAIL, dishing or removal-rate number is produced.
 */
import timing from "../../../config/visual/handling-sequence-v1.json";
import { DEMO_CARRIER, DEMO_RESERVED_SLOT, DEMO_WAFER, incomingFilmState } from "../../domain/materialFlow";
import { clamp01, emptyInstancePreview, lerp, smoothstep, type HolderKind, type IllustrativeFilmState, type PreviewState, type WaferHolder, type WaferWetState } from "../../presentation/preview";
import { evaluateTrack, stepStarts, trackDuration, type MotionStep, type TrackInitial } from "../../presentation/motionTrack";
import { buildPhases, phaseAt, type ScenarioContext, type ScenarioDefinition, type ScenarioPhase, type VisualScenario } from "../../presentation/scenario";
import { slotIndex } from "../foup/index";
import { scaraFK, scaraIK, scaraTaskOf } from "../handling/scara";
import { axisAngle, mulVec } from "../../domain/kinematics";
import type { Vec3Tuple } from "../../config/geometry";
import { phasesFromSteps } from "../handling/stationScenario";
import { STATION_JOINTS } from "../handling/stationParts";
import { CMP_FE, CMP_FE_JOINTS } from "./frontEnd";
import { CMP_LAYOUT, type CmpLayout } from "./layout";
import { CMP_TEMPLATE_ID } from "./template";

// ------------------------------------------------------------------------------------------- polish segment

const polishRows = buildPhases([
  { id: "load", label: "Head picks the wafer from the load cup", labelKo: "Head가 load cup에서 wafer pick (face-down)", duration: 4, equipment: "cmp" },
  { id: "wetting", label: "Pad wetting", labelKo: "Pad wetting", duration: 3, equipment: "cmp" },
  { id: "approach", label: "Head approach", labelKo: "Head 접근·접촉", duration: 2, equipment: "cmp" },
  { id: "bulk", label: "Bulk polish illustration", labelKo: "Bulk polish 연출", duration: 8, equipment: "cmp" },
  { id: "clearing", label: "Clearing illustration", labelKo: "Clearing 연출", duration: 5, equipment: "cmp" },
  { id: "overpolish", label: "Bounded overpolish illustration", labelKo: "제한된 overpolish 연출", duration: 3, equipment: "cmp" },
  { id: "lift", label: "Head lift", labelKo: "Head 이탈", duration: 2, equipment: "cmp" },
  { id: "conditioning", label: "Pad conditioning (head retracted)", labelKo: "Pad conditioning", duration: 6, equipment: "cmp" },
  { id: "unload", label: "Head returns the wafer to the load cup", labelKo: "Head가 wafer를 load cup에 반환", duration: 3, equipment: "cmp" },
]);

export const CMP_POLISH_SCENARIO: VisualScenario = { id: "sti-cmp-polish-segment", title: "Rotary STI CMP polish segment", durationSec: polishRows.durationSec, phases: polishRows.phases, renderSource: "illustrative" };

interface Ramp {
  t0: number;
  t1: number;
  v0: number;
  v1: number;
}

function speedAt(ramps: Ramp[], t: number): number {
  let v = 0;
  for (const r of ramps) {
    if (t >= r.t1) v = r.v1;
    else if (t >= r.t0) return lerp(r.v0, r.v1, (t - r.t0) / Math.max(r.t1 - r.t0, 1e-9));
  }
  return v;
}

/** Angle of a piecewise-constant / linear speed profile, integrated analytically (pure in t). */
function angleAt(ramps: Ramp[], t: number): number {
  let angle = 0;
  let prevT = 0;
  let prevV = 0;
  for (const r of ramps) {
    if (t <= r.t0) {
      angle += prevV * (t - prevT);
      return angle;
    }
    angle += prevV * (r.t0 - prevT);
    const tEnd = Math.min(t, r.t1);
    const frac = (tEnd - r.t0) / Math.max(r.t1 - r.t0, 1e-9);
    const vEnd = lerp(r.v0, r.v1, frac);
    angle += ((r.v0 + vEnd) / 2) * (tEnd - r.t0);
    if (t <= r.t1) return angle;
    prevT = r.t1;
    prevV = r.v1;
  }
  angle += prevV * (t - prevT);
  return angle;
}

const PLATEN_RPM = 60;
const HEAD_RPM = 55;
const COND_PLATEN_RPM = 30;
const DISC_RPM = 90;
const DRY_RPM = 900;
const BRUSH_RPM = 120;
const rpm = (v: number) => (v * 2 * Math.PI) / 60;

export interface CmpPolishState {
  joints: Record<string, number>;
  effects: Record<string, number>;
  flags: Record<string, boolean | string>;
  holder: "load_cup" | "head";
  film: { overcoat: number; surfaceOxide: number; sin: number; trenchFill: number; nitrideExposed: boolean; status: IllustrativeFilmState["status"] };
  /** Wafer frontside has touched the slurry-wet pad. */
  contacted: boolean;
}

/** Pure polish-segment state at local time t (head, platen, conditioner, hatch, slurry, film). */
export function cmpPolishState(L: CmpLayout, t: number, scenario: VisualScenario = CMP_POLISH_SCENARIO): CmpPolishState {
  const P: Record<string, { start: number; end: number }> = {};
  for (const ph of scenario.phases) P[ph.id] = { start: ph.start, end: ph.end };
  const p = phaseAt(scenario, Math.max(0, t));
  const prog = (id: string) => (t <= P[id].start ? 0 : t >= P[id].end ? 1 : (t - P[id].start) / (P[id].end - P[id].start));
  const at = (id: string, off: number) => P[id].start + off;
  const platenRamps: Ramp[] = [
    { t0: at("wetting", 0), t1: at("wetting", 2), v0: 0, v1: rpm(PLATEN_RPM) },
    { t0: at("lift", 0.5), t1: at("lift", 2), v0: rpm(PLATEN_RPM), v1: 0 },
    { t0: at("conditioning", 1), t1: at("conditioning", 2), v0: 0, v1: rpm(COND_PLATEN_RPM) },
    { t0: at("conditioning", 5), t1: at("conditioning", 6), v0: rpm(COND_PLATEN_RPM), v1: 0 },
  ];
  const headRamps: Ramp[] = [
    { t0: at("approach", 0.5), t1: at("approach", 2), v0: 0, v1: rpm(HEAD_RPM) },
    { t0: at("lift", 0), t1: at("lift", 1.5), v0: rpm(HEAD_RPM), v1: 0 },
  ];
  const discRamps: Ramp[] = [
    { t0: at("conditioning", 1.5), t1: at("conditioning", 2.2), v0: 0, v1: rpm(DISC_RPM) },
    { t0: at("conditioning", 5), t1: at("conditioning", 5.6), v0: rpm(DISC_RPM), v1: 0 },
  ];
  let hatch = 0;
  if (p.id === "load" && t >= P.load.start) {
    const pr = prog("load") * 4;
    hatch = pr < 1 ? smoothstep(0, 1, pr) : pr < 3.4 ? 1 : 1 - smoothstep(3.4, 4, pr);
  } else if (p.id === "unload") {
    const pr = prog("unload") * 3;
    hatch = pr < 0.8 ? smoothstep(0, 0.8, pr) : pr < 2.6 ? 1 : 1 - smoothstep(2.6, 3, pr);
  }
  let lateral = L.head.loadTravel;
  if (t >= at("wetting", 0.5) && t < at("conditioning", 0)) lateral = L.head.loadTravel * (1 - smoothstep(at("wetting", 0.5), at("wetting", 2.5), t));
  else if (t >= at("conditioning", 0)) lateral = L.head.loadTravel * smoothstep(at("conditioning", 0), at("conditioning", 1.5), t);
  let lift = 0;
  if (p.id === "load" && t >= P.load.start) {
    const pr = prog("load") * 4;
    lift = pr < 1 ? 0 : pr < 2.5 ? L.head.liftPick * smoothstep(1, 2.5, pr) : L.head.liftPick * (1 - smoothstep(2.5, 4, pr));
  } else if (t >= at("approach", 0) && t < at("lift", 0)) lift = L.head.liftContact * smoothstep(at("approach", 0), at("approach", 1.5), t);
  else if (p.id === "lift") lift = L.head.liftContact * (1 - smoothstep(at("lift", 0), at("lift", 1.2), t));
  else if (p.id === "unload") {
    const pr = prog("unload") * 3;
    lift = pr < 0.8 ? 0 : pr < 1.8 ? L.head.liftPick * smoothstep(0.8, 1.8, pr) : L.head.liftPick * (1 - smoothstep(1.8, 2.6, pr));
  }
  const c = L.conditioner;
  let sweep = c.parkAngle;
  let condLift = c.liftStroke;
  if (p.id === "conditioning") {
    const pr = prog("conditioning") * 6;
    if (pr < 1) sweep = c.parkAngle;
    else if (pr < 2) sweep = lerp(c.parkAngle, c.sweepMax, smoothstep(1, 2, pr));
    else if (pr < 5) sweep = c.sweepMin + (c.sweepMax - c.sweepMin) * (0.5 + 0.5 * Math.cos(((pr - 2) / 3) * Math.PI * 2));
    else sweep = lerp(c.sweepMax, c.parkAngle, smoothstep(5, 6, pr));
    condLift = pr < 1.5 ? c.liftStroke : pr < 2.2 ? c.liftStroke * (1 - smoothstep(1.5, 2.2, pr)) : pr < 5 ? 0 : c.liftStroke * smoothstep(5, 5.6, pr);
  }
  const slurryFlow = t < at("wetting", 1) ? 0 : t < at("lift", 0) ? smoothstep(at("wetting", 1), at("wetting", 2), t) : 1 - smoothstep(at("lift", 0), at("lift", 1), t);
  const padWet = t < at("wetting", 1) ? 0 : t < at("conditioning", 6) ? smoothstep(at("wetting", 1), at("wetting", 3), t) : 1;
  const joints: Record<string, number> = {
    platen_spin: angleAt(platenRamps, t),
    head_lateral: lateral,
    head_lift: lift,
    head_spin: angleAt(headRamps, t),
    conditioner_sweep: sweep,
    conditioner_lift: condLift,
    conditioner_spin: angleAt(discRamps, t),
    load_hatch: hatch * L.loadCup.alcove.hatch_travel,
  };
  const captureT = at("load", 2.5);
  const releaseT = at("unload", 1.8);
  const holder: CmpPolishState["holder"] = t >= captureT && t < releaseT ? "head" : "load_cup";
  const bulk = prog("bulk");
  const clear = prog("clearing");
  const over = prog("overpolish");
  const overcoat = t < at("bulk", 0) ? 1 : t < at("clearing", 0) ? 1 - 0.65 * bulk : clamp01(0.35 * (1 - smoothstep(0, 0.4, clear)));
  const surfaceOxide = t < at("clearing", 0) ? 1 : t < at("overpolish", 0) ? 1 - 0.85 * smoothstep(0.2, 1, clear) : 0.15 * (1 - over);
  const sin = t < at("overpolish", 0) ? 1 : 1 - 0.05 * over;
  const trenchFill = t < at("overpolish", 0) ? 1 : 1 - 0.03 * over;
  const nitrideExposed = clear >= 0.8;
  let status: IllustrativeFilmState["status"] = "deposited";
  if (t >= at("bulk", 0) && t < at("clearing", 0)) status = "polishing";
  else if (t >= at("clearing", 0) && t < at("overpolish", 0)) status = "cleared";
  else if (t >= at("overpolish", 0) && t < at("lift", 0)) status = "overpolish_illustration";
  else if (t >= at("lift", 0)) status = "complete";
  const w = L.pad.window;
  const a = joints.platen_spin;
  const wx = w.r * Math.cos(w.azimuth) * Math.cos(a) + w.r * Math.sin(w.azimuth) * Math.sin(a);
  const wz = -w.r * Math.cos(w.azimuth) * Math.sin(a) + w.r * Math.sin(w.azimuth) * Math.cos(a);
  const inView = Math.abs(lift - L.head.liftContact) < 0.004 && Math.hypot(wx - (L.head.polishX - lateral), wz) < L.rWafer - w.lenR / 2;
  return {
    joints,
    effects: { slurryFlow, padWet, platenSpeed: speedAt(platenRamps, t), headSpeed: speedAt(headRamps, t) },
    flags: { hatchOpen: hatch > 0.5, headContact: Math.abs(lift - L.head.liftContact) < 0.004, opticalInView: inView ? "In view" : "Out of view", conditioning: p.id === "conditioning" },
    holder,
    film: { overcoat, surfaceOxide, sin, trenchFill, nitrideExposed, status },
    contacted: t >= at("approach", 1.5),
  };
}

// ------------------------------------------------------------------------------------------- handling tracks

export type CmpHolder = "foup" | "dry_robot" | "flip" | "wet_robot" | "load_cup" | "head" | "cleaner" | "dryer";

interface CmpTiming {
  dock: number;
  door_pull: number;
  door_lower: number;
  robot_z: number;
  robot_extend: number;
  robot_lift: number;
  robot_retract: number;
  robot_rotate: number;
  flip_grip: number;
  flip_turn: number;
  wet_clamp: number;
  wet_roll: number;
  shutter: number;
  cleaner_rollers: number;
  brushes: number;
  clean: number;
  rinse_ee: number;
  chuck_lift: number;
  dry: number;
  undock: number;
}

export const CMP_TIMING: CmpTiming = timing.cmp;

export interface CmpPlan {
  L: CmpLayout;
  slot: number;
  inSteps: MotionStep<CmpHolder>[];
  outSteps: MotionStep<CmpHolder>[];
  inInitial: TrackInitial<CmpHolder>;
  outInitial: TrackInitial<CmpHolder>;
  inDuration: number;
  outDuration: number;
  polishDuration: number;
  /** Local times (sequence start = 0) of the segment boundaries. */
  polishStart: number;
  outStart: number;
  total: number;
  /** Absolute-time ramps of the dryer spindle and the brushes inside the out track. */
  dryRamps: Ramp[];
  brushRamps: Ramp[];
  /** Target heights / reaches (for tests). */
  targets: Record<string, number>;
}

export function planCmp(L: CmpLayout, slot: number, T: CmpTiming = CMP_TIMING): CmpPlan {
  const F = L.front;
  const fe = L.cfg.front_end;
  const t = L.waferThickness;
  const acD = fe.dry_robot.approach_clearance;
  const acW = fe.wet_robot.approach_clearance;
  const slotY = F.slotY(slot);
  const dryG = F.dry.geom;
  const wetG = F.wet.geom;
  const foupX = -(F.loadPort.dockedR - F.foup.waferCenterX);
  const foupZ = -F.efem.qc;
  const dFoup = scaraTaskOf(dryG, foupX, foupZ);
  const dTower = scaraTaskOf(dryG, F.tower.x, F.tower.z);
  const wTower = scaraTaskOf(wetG, F.tower.x, F.tower.z);
  const wCup = scaraTaskOf(wetG, L.loadCup.x, L.loadCup.z);
  const wCl = scaraTaskOf(wetG, F.cleaner.x, F.cleaner.z);
  const wRinse = scaraTaskOf(wetG, F.rinse.x, F.rinse.z);
  // headings: each move takes the short way from the previous one (rotations carry the wafer under the
  // overhead robot's axis, so every direction is free); the cycle closes on the starting heading
  const near = (th: number, ref: number) => th - 2 * Math.PI * Math.round((th - ref) / (2 * Math.PI));
  const thTower = near(wTower.theta, 0);
  const thCup = near(wCup.theta, thTower);
  const thCl = near(wCl.theta, thCup);
  const thRinse = near(wRinse.theta, thCl);
  const thTower2 = near(wTower.theta, thCl);
  const rinseRho = Math.hypot(F.rinse.x - wetG.axisXZ[0], F.rinse.z - wetG.axisXZ[1]);
  const transit = F.wet.transitHeight;
  const rollY = F.wet.rollAxisHeight;
  const flipMid = F.tower.flipAxisY;
  const cupMid = F.cupPlaneY + t / 2;
  const clMid = F.cleaner.planeY + t / 2;
  const drMid = F.tower.dryerPlaneY + t / 2;
  const lp = F.loadPort;
  const tw = fe.tower;
  const cl = fe.cleaner;
  const gripS = fe.wet_robot.grip_stroke ?? 0.008;
  const inInitial: TrackInitial<CmpHolder> = {
    values: { dock: 0, doorPull: 0, doorLower: 0, dRho: 0, dTheta: 0, dY: slotY + acD, flipRoll: 0, flipJaw: 0, wRho: 0, wTheta: thTower, wY: transit, wRoll: 0, wGrip: 0, dryChuck: 0, shutterWet: 0, shutterDry: 0, cleanShutter: 0, brushUp: cl.brush_travel, brushLow: cl.brush_travel, rollers: 0 },
    holder: "foup",
    flags: { eeState: "clean_ready", cleaning: false, spinning: false },
  };
  const D = (id: string, labelKo: string, duration: number, to: Record<string, number>, extra: Partial<MotionStep<CmpHolder>> = {}): MotionStep<CmpHolder> => ({ id, labelKo, duration, to, ...extra });
  const inSteps: MotionStep<CmpHolder>[] = [
    D("lp_dock", "FOUP docking (dock plate)", T.dock, { dock: lp.dockStroke }),
    D("foup_door_pull", "FOUP door 해제·당김", T.door_pull, { doorPull: lp.doorPull }),
    D("foup_door_lower", "FOUP door 하강", T.door_lower, { doorLower: lp.doorLower }),
    D("dry_to_slot", `Dry robot: slot-${slot} 접근 높이`, T.robot_z, { dTheta: 0, dY: slotY - acD }),
    D("dry_in_foup", `Dry robot: fork를 slot-${slot} wafer 아래로`, T.robot_extend, { dRho: dFoup.rho }),
    D("dry_pick_foup", `Dry robot: slot-${slot}에서 pick (dry, face up)`, T.robot_lift, { dY: slotY + acD }, { handoff: { holder: "dry_robot", at: { channel: "dY", value: slotY } } }),
    D("dry_out_foup", "Dry robot 후퇴", T.robot_retract, { dRho: 0 }),
    D("dry_to_flip", "Dry robot: flip station 방향·높이", T.robot_rotate, { dTheta: Math.PI, dY: F.tower.flipPlaneY }),
    D("dry_in_flip", "Dry robot: wafer를 flip jaw 사이로", T.robot_extend, { dRho: dTower.rho }),
    D("flip_clamp", "Flip jaw가 wafer edge clamp", T.flip_grip, { flipJaw: tw.flip_jaw_travel }, { handoff: { holder: "flip", at: "end" } }),
    D("dry_off_flip", "Dry robot fork 하강 (wafer는 jaw에)", T.robot_lift, { dY: F.tower.flipPlaneY - acD }),
    D("dry_out_flip", "Dry robot 후퇴", T.robot_retract, { dRho: 0 }),
    D("flip_turn", "Flip: clamp한 채 180도 회전 (face down)", T.flip_turn, { flipRoll: Math.PI }),
    D("wet_to_flip", "Wet robot: flip station 방향, wafer 아래 높이", T.robot_rotate, { wTheta: thTower, wY: flipMid - acW }),
    D("wet_in_flip", "Wet robot: fork를 wafer 아래로", T.robot_extend, { wRho: wTower.rho }),
    D("wet_touch_flip", "Wet robot: pad가 wafer에 닿음", T.robot_lift * 0.6, { wY: flipMid }),
    D("wet_clamp_flip", "Wet robot: edge clamp", T.wet_clamp, { wGrip: gripS }, { handoff: { holder: "wet_robot", at: "end" } }),
    D("flip_release", "Flip jaw 열림", T.flip_grip, { flipJaw: 0 }),
    D("wet_lift_flip", "Wet robot 상승", T.robot_lift * 0.6, { wY: flipMid + acW }),
    D("wet_out_flip", "Wet robot 후퇴 (wafer를 robot 축 아래로)", T.robot_retract, { wRho: 0 }),
    D("wet_to_cup", "Wet robot: load cup 방향 회전, alcove opening 높이로", T.robot_rotate, { wTheta: thCup, wY: cupMid + acW }),
    D("wet_in_cup", "Wet robot: side opening으로 cup 위", T.robot_extend, { wRho: wCup.rho }),
    D("wet_set_cup", "Wet robot: wafer를 cup pin에 내려놓음", T.robot_lift * 0.6, { wY: cupMid }),
    D("wet_unclamp_cup", "Wet robot: clamp 해제 (face down on the cup)", T.wet_clamp, { wGrip: 0 }, { handoff: { holder: "load_cup", at: "end" } }),
    D("wet_off_cup", "Wet robot fork 하강", T.robot_lift * 0.6, { wY: cupMid - acW }),
    D("wet_out_cup", "Wet robot 후퇴", T.robot_retract, { wRho: 0 }),
    D("wet_park", "Wet robot transit 높이, flip station 복귀", T.robot_z, { wY: transit, flipRoll: 0 }),
  ];
  const inEnd = evaluateTrack(inSteps, inInitial, trackDuration(inSteps) + 1);
  const outInitial: TrackInitial<CmpHolder> = { values: { ...inEnd.values }, holder: "load_cup", flags: { ...inEnd.flags } };
  const outSteps: MotionStep<CmpHolder>[] = [
    D("wet_to_cup2", "Wet robot: alcove opening 높이 (wafer 아래)", T.robot_z, { wTheta: thCup, wY: cupMid - acW }),
    D("wet_in_cup2", "Wet robot: fork를 wafer 아래로", T.robot_extend, { wRho: wCup.rho }),
    D("wet_touch_cup", "Wet robot: pad가 wafer frontside edge에 닿음", T.robot_lift * 0.6, { wY: cupMid }),
    D("wet_clamp_cup", "Wet robot: dirty-wet wafer edge clamp", T.wet_clamp, { wGrip: gripS }, { handoff: { holder: "wet_robot", at: "end" }, set: { eeState: "dirty" } }),
    D("wet_lift_cup", "Wet robot 상승", T.robot_lift * 0.6, { wY: cupMid + acW }),
    D("wet_out_cup2", "Wet robot: alcove에서 후퇴 (robot 축 아래로)", T.robot_retract, { wRho: 0 }),
    D("wet_up_roll", "Wet robot: roll 높이로 상승", T.robot_z, { wY: rollY }),
    D("wet_roll", "Wet robot: clamp한 채 roll 180도 (face up)", T.wet_roll, { wRoll: Math.PI }),
    D("wet_to_cleaner", "Wet robot: cleaner 방향 회전, opening 높이로", T.robot_rotate, { wTheta: thCl, wY: clMid + acW }),
    D("cleaner_open", "Cleaner shutter 열림 (roller·brush 후퇴 상태)", T.shutter, { cleanShutter: cl.shutter_travel }),
    D("wet_in_cl", "Wet robot: wafer를 cleaner 안으로", T.robot_extend, { wRho: wCl.rho }),
    D("wet_set_cl", "Wet robot: wafer를 roller 높이에", T.robot_lift * 0.6, { wY: clMid }),
    D("rollers_close", "Edge roller가 wafer edge를 잡음", T.cleaner_rollers, { rollers: cl.edge_roller_travel }),
    D("wet_unclamp_cl", "Wet robot: clamp 해제 (wafer는 cleaner)", T.wet_clamp, { wGrip: 0 }, { handoff: { holder: "cleaner", at: "end" } }),
    D("wet_up_cl", "Wet robot 상승 (뒤집힌 fork가 wafer에서 떨어짐)", T.robot_lift * 0.6, { wY: clMid + acW }),
    D("wet_out_cl", "Wet robot 후퇴", T.robot_retract, { wRho: 0 }),
    D("cleaner_close", "Cleaner shutter 닫힘", T.shutter, { cleanShutter: 0, wY: transit }),
    D("brushes_close", "Brush pair가 wafer 양면에 닿음", T.brushes, { brushUp: 0, brushLow: 0 }),
    D("wet_to_rinse", "Wet robot: end effector를 rinse station 방향으로", T.robot_rotate, { wTheta: thRinse, wY: F.rinse.planeY }),
    D("wet_in_rinse", "Wet robot: end effector를 rinse box에", T.robot_extend, { wRho: rinseRho }),
    D("clean_and_rinse", "Brush 세정·rinse (illustrative), end effector rinse 중", Math.max(T.clean, T.rinse_ee), {}, { set: { eeState: "rinsing", cleaning: true } }),
    D("wet_out_rinse", "End effector clean-ready, 후퇴", T.robot_retract, { wRho: 0 }, { set: { eeState: "clean_ready", cleaning: false } }),
    D("brushes_open", "Brush pair 후퇴 (clean-wet)", T.brushes, { brushUp: cl.brush_travel, brushLow: cl.brush_travel, wTheta: thCl, wY: clMid + acW }),
    D("cleaner_open2", "Cleaner shutter 열림", T.shutter, { cleanShutter: cl.shutter_travel }),
    D("wet_in_cl2", "Wet robot: 뒤집힌 fork를 wafer 위로", T.robot_extend, { wRho: wCl.rho }),
    D("wet_touch_cl2", "Wet robot: pad가 wafer edge에 닿음", T.robot_lift * 0.6, { wY: clMid }),
    D("wet_clamp_cl2", "Wet robot: clean-wet wafer clamp (clean-ready end effector)", T.wet_clamp, { wGrip: gripS }, { handoff: { holder: "wet_robot", at: "end" } }),
    D("rollers_open", "Edge roller 열림", T.cleaner_rollers, { rollers: 0 }),
    D("wet_lift_cl2", "Wet robot 상승", T.robot_lift * 0.6, { wY: clMid + acW }),
    D("wet_out_cl2", "Wet robot 후퇴", T.robot_retract, { wRho: 0 }),
    D("wet_to_dryer", "Cleaner shutter 닫힘, wet robot은 dryer 방향·opening 높이로", T.robot_rotate, { cleanShutter: 0, wTheta: thTower2, wY: drMid + acW }),
    D("dryer_open_wet", "Dryer wet-side shutter 열림", T.shutter, { shutterWet: tw.shutter_travel }),
    D("wet_in_dr", "Wet robot: wafer를 spin chuck 위로", T.robot_extend, { wRho: wTower.rho }),
    D("wet_set_dr", "Wet robot: wafer를 chuck에 내려놓음", T.robot_lift * 0.6, { wY: drMid }),
    D("wet_unclamp_dr", "Wet robot: clamp 해제 (wet 반입 완료)", T.wet_clamp, { wGrip: 0 }, { handoff: { holder: "dryer", at: "end" } }),
    D("wet_up_dr", "Wet robot 상승", T.robot_lift * 0.6, { wY: drMid + acW }),
    D("wet_out_dr", "Wet robot 후퇴", T.robot_retract, { wRho: 0 }),
    D("dryer_close_wet", "Wet-side shutter 닫힘", T.shutter, { shutterWet: 0, wY: rollY }),
    D("chuck_down", "Chuck가 bowl 안으로 하강", T.chuck_lift, { dryChuck: -F.tower.spinDrop }),
    D("spin_dry", "Spin dry (illustrative), 빈 wet robot end effector는 원위치로 roll", T.dry, { wRoll: 0 }, { set: { spinning: true } }),
    D("chuck_up", "Chuck 상승 (dry)", T.chuck_lift, { dryChuck: 0, wY: transit }, { set: { spinning: false } }),
    D("dryer_open_dry", "Dryer dry-side shutter 열림 (EFEM 쪽)", T.shutter, { shutterDry: tw.shutter_travel }),
    D("dry_to_dryer", "Dry robot: dryer 방향·wafer 아래 높이", T.robot_rotate, { dTheta: Math.PI, dY: F.tower.dryerPlaneY - acD }),
    D("dry_in_dryer", "Dry robot: fork가 chuck 양옆으로", T.robot_extend, { dRho: dTower.rho }),
    D("dry_pick_dryer", "Dry robot: dryer에서 pick (dry 반출)", T.robot_lift, { dY: F.tower.dryerPlaneY + acD }, { handoff: { holder: "dry_robot", at: { channel: "dY", value: F.tower.dryerPlaneY } } }),
    D("dry_out_dryer", "Dry robot 후퇴", T.robot_retract, { dRho: 0 }),
    D("dryer_close_dry", "Dry-side shutter 닫힘", T.shutter, { shutterDry: 0 }),
    D("dry_to_foup", `Dry robot: FOUP 방향, slot-${slot} 위 높이`, T.robot_rotate, { dTheta: 0, dY: slotY + acD }),
    D("dry_in_foup2", `Dry robot: wafer를 slot-${slot} 위로`, T.robot_extend, { dRho: dFoup.rho }),
    D("dry_place_foup", `Dry robot: reserved slot-${slot}에 place (dry only)`, T.robot_lift, { dY: slotY - acD }, { handoff: { holder: "foup", at: { channel: "dY", value: slotY } } }),
    D("dry_out_foup2", "Dry robot 후퇴·home", T.robot_retract, { dRho: 0 }),
    D("foup_door_raise", "FOUP door 상승", T.door_lower, { doorLower: 0 }),
    D("foup_door_close", "FOUP door 닫힘·latch", T.door_pull, { doorPull: 0 }),
    D("lp_undock", "Undock (OHT 인계 준비)", T.undock, { dock: 0 }),
  ];
  const inDuration = trackDuration(inSteps);
  const outDuration = trackDuration(outSteps);
  const polishStart = inDuration;
  const outStart = polishStart + CMP_POLISH_SCENARIO.durationSec;
  const os = stepStarts(outSteps);
  const sd = os.spin_dry;
  const cr = os.clean_and_rinse;
  const dryRamps: Ramp[] = [
    { t0: outStart + sd.start + 0.3, t1: outStart + sd.start + 1.3, v0: 0, v1: rpm(DRY_RPM) },
    { t0: outStart + sd.end - 1.0, t1: outStart + sd.end, v0: rpm(DRY_RPM), v1: 0 },
  ];
  const brushRamps: Ramp[] = [
    { t0: outStart + cr.start, t1: outStart + cr.start + 0.6, v0: 0, v1: rpm(BRUSH_RPM) },
    { t0: outStart + cr.end - 0.6, t1: outStart + cr.end, v0: rpm(BRUSH_RPM), v1: 0 },
  ];
  return {
    L,
    slot,
    inSteps,
    outSteps,
    inInitial,
    outInitial,
    inDuration,
    outDuration,
    polishDuration: CMP_POLISH_SCENARIO.durationSec,
    polishStart,
    outStart,
    total: outStart + outDuration,
    dryRamps,
    brushRamps,
    targets: { slotY, flipMid, cupMid, clMid, drMid, transit, rollY, dFoupRho: dFoup.rho, dTowerRho: dTower.rho, wTowerRho: wTower.rho, wCupRho: wCup.rho, wClRho: wCl.rho, thTower, thCup, thCl, thRinse },
  };
}

export const CMP_PLAN: CmpPlan = planCmp(CMP_LAYOUT, slotIndex(DEMO_RESERVED_SLOT.slotId));

export interface CmpFullState {
  segment: "in" | "polish" | "out";
  values: Record<string, number>;
  holder: CmpHolder;
  flags: Record<string, boolean | string>;
  joints: Record<string, number>;
  effects: Record<string, number>;
  labelKo: string;
  stepId: string;
  polish: CmpPolishState;
  wetState: WaferWetState;
  /** Frontside normal of the wafer in the instance frame (+Y = face up). */
  frontside: Vec3Tuple;
}

/** Joint values of the front end for track values (robots via inverse kinematics). */
export function cmpFrontJointValues(plan: CmpPlan, v: Record<string, number>): Record<string, number> {
  const F = plan.L.front;
  const d = scaraIK(F.dry.geom, v.dRho, v.dTheta);
  const w = scaraIK(F.wet.geom, v.wRho, v.wTheta);
  const J = CMP_FE_JOINTS;
  return {
    [STATION_JOINTS.dock]: v.dock,
    [STATION_JOINTS.doorPull]: v.doorPull,
    [STATION_JOINTS.doorLower]: v.doorLower,
    dry_z: v.dY - F.dry.shoulderY0 - F.dry.supportOffset,
    dry_shoulder: d.shoulder,
    dry_elbow: d.elbow,
    dry_wrist: d.wrist,
    wet_z: v.wY - F.wet.rollAxisY0,
    wet_shoulder: w.shoulder,
    wet_elbow: w.elbow,
    wet_wrist: w.wrist,
    wet_roll: v.wRoll,
    wet_grip: v.wGrip,
    [J.flipRoll]: v.flipRoll,
    [J.flipJawA]: v.flipJaw,
    [J.flipJawB]: v.flipJaw,
    [J.dryChuckZ]: v.dryChuck,
    [J.dryerShutterWet]: v.shutterWet,
    [J.dryerShutterDry]: v.shutterDry,
    [J.cleanShutter]: v.cleanShutter,
    [J.brushUp]: v.brushUp,
    [J.brushLow]: v.brushLow,
    [J.rollersA]: v.rollers,
    [J.rollersB]: v.rollers,
  };
}

/** Full CMP state at local time t (sequence start = 0). */
export function cmpFullState(plan: CmpPlan, t: number): CmpFullState {
  const L = plan.L;
  let segment: CmpFullState["segment"];
  let tr: { values: Record<string, number>; holder: CmpHolder; flags: Record<string, boolean | string>; labelKo: string; stepId: string };
  let polish: CmpPolishState;
  if (t < plan.polishStart) {
    segment = "in";
    tr = evaluateTrack(plan.inSteps, plan.inInitial, Math.max(0, t));
    polish = cmpPolishState(L, -1);
  } else if (t < plan.outStart) {
    segment = "polish";
    polish = cmpPolishState(L, t - plan.polishStart);
    tr = { values: { ...plan.outInitial.values }, holder: polish.holder, flags: { ...(plan.outInitial.flags ?? {}) }, labelKo: phaseAt(CMP_POLISH_SCENARIO, t - plan.polishStart).labelKo, stepId: `polish:${phaseAt(CMP_POLISH_SCENARIO, t - plan.polishStart).id}` };
  } else {
    segment = "out";
    polish = cmpPolishState(L, plan.polishDuration + 1e-6);
    const st = evaluateTrack(plan.outSteps, plan.outInitial, Math.min(t - plan.outStart, plan.outDuration));
    tr = st;
  }
  const joints = { ...polish.joints, ...cmpFrontJointValues(plan, tr.values) };
  if (segment !== "polish") {
    // head parked raised at the load position outside the polish segment; platen / head angles hold
    joints.head_lateral = L.head.loadTravel;
    joints.head_lift = 0;
    joints.load_hatch = 0;
  }
  joints.dry_spin = angleAt(plan.dryRamps, t);
  joints.clean_brush_up_spin = angleAt(plan.brushRamps, t);
  joints.clean_brush_low_spin = -angleAt(plan.brushRamps, t);
  const os = stepStarts(plan.outSteps);
  const tOut = t - plan.outStart;
  const cleaning = segment === "out" && tOut >= os.clean_and_rinse.start && tOut < os.clean_and_rinse.end;
  const effects: Record<string, number> = { ...polish.effects, rinseFlow: cleaning ? smoothstep(os.clean_and_rinse.start, os.clean_and_rinse.start + 0.4, tOut) * (1 - smoothstep(os.clean_and_rinse.end - 0.4, os.clean_and_rinse.end, tOut)) : 0 };
  if (segment === "in") effects.slurryFlow = effects.padWet = 0;
  if (segment === "out") effects.slurryFlow = 0;
  // wet state of the wafer surface (presentation flag)
  let wetState: WaferWetState = "dry";
  if (segment === "polish" && polish.contacted) wetState = "wet_dirty";
  if (segment === "out") {
    if (tOut < os.clean_and_rinse.end) wetState = "wet_dirty";
    else if (tOut < os.spin_dry.end) wetState = "wet_clean";
    else wetState = "dry";
  }
  // frontside normal from the holder pose (same axis-angle convention as the joint evaluator)
  const v = tr.values;
  let frontside: Vec3Tuple = [0, 1, 0];
  switch (tr.holder) {
    case "flip":
      frontside = mulVec(axisAngle([0, 0, 1], v.flipRoll), [0, 1, 0]);
      break;
    case "wet_robot": {
      const fk = scaraFK(L.front.wet.geom, scaraIK(L.front.wet.geom, v.wRho, v.wTheta));
      frontside = mulVec(axisAngle([fk.eeDir[0], 0, fk.eeDir[1]], v.wRoll), [0, -1, 0]);
      break;
    }
    case "load_cup":
    case "head":
      frontside = [0, -1, 0];
      break;
  }
  const r6 = (x: number) => Math.round(x * 1e6) / 1e6 + 0;
  return { segment, values: tr.values, holder: tr.holder, flags: { ...tr.flags, ...polish.flags }, joints, effects, labelKo: tr.labelKo, stepId: tr.stepId, polish, wetState, frontside: [r6(frontside[0]), r6(frontside[1]), r6(frontside[2])] };
}

export function cmpPresentedAsset(holder: CmpHolder): string | null {
  switch (holder) {
    case "dry_robot":
      return CMP_FE.dryRobot.wafer;
    case "flip":
      return CMP_FE.waferFlip;
    case "wet_robot":
      return CMP_FE.wetRobot.wafer;
    case "load_cup":
      return "wafer_on_cup";
    case "head":
      return "wafer";
    case "cleaner":
      return CMP_FE.waferClean;
    case "dryer":
      return CMP_FE.waferDry;
    default:
      return null;
  }
}

export function cmpWaferHolder(holder: CmpHolder, instanceId: string, carrierId: string, slotId: string): WaferHolder {
  const k: Record<CmpHolder, HolderKind> = { foup: "carrier_slot", dry_robot: "end_effector", flip: "flip_station", wet_robot: "end_effector", load_cup: "load_cup", head: "cmp_head", cleaner: "clean_module", dryer: "dry_module" };
  if (holder === "foup") return { kind: "carrier_slot", carrierId, slotId };
  const attachment: Record<CmpHolder, string> = { foup: "", dry_robot: "dry_robot", flip: "flip_jaws", wet_robot: "wet_robot", load_cup: "load_cup_pins", head: "carrier_head", cleaner: "edge_rollers", dryer: "spin_chuck" };
  return { kind: k[holder], instanceId, attachment: attachment[holder] };
}

export function applyCmpFilm(film: IllustrativeFilmState, s: CmpPolishState["film"]): IllustrativeFilmState {
  const layers = film.layers.map((l) => {
    switch (l.layerId) {
      case "demo_overcoat":
        return { ...l, presentFraction: Math.min(l.presentFraction, s.overcoat) };
      case "surface_oxide":
        return { ...l, presentFraction: s.surfaceOxide };
      case "sin_stop":
        return { ...l, presentFraction: s.sin };
      case "trench_fill":
        return { ...l, presentFraction: s.trenchFill };
      default:
        return l;
    }
  });
  return { ...film, layers, nitrideExposed: s.nitrideExposed, status: s.status };
}

/** Home pose of the CMP when it does not run (head raised at the load position, robots parked, doors closed). */
export function cmpIdleJoints(): Record<string, number> {
  const s = cmpFullState(CMP_PLAN, 0);
  return { ...s.joints };
}

// ------------------------------------------------------------------------------------------- phase table

export const CMP_IN_GROUPS = [
  { id: "c_dock_open", label: "FOUP dock / door open", labelKo: "FOUP dock·door open", lastStep: "foup_door_lower" },
  { id: "c_dry_in", label: "Dry robot: FOUP to flip station", labelKo: "Dry robot: FOUP → flip station", lastStep: "dry_out_flip" },
  { id: "c_flip", label: "Flip station: face up to face down", labelKo: "Flip: face up → face down", lastStep: "flip_turn" },
  { id: "c_wet_in", label: "Wet robot: flip station to load cup", labelKo: "Wet robot: flip → load cup", lastStep: "wet_park" },
];

export const CMP_OUT_GROUPS = [
  { id: "c_wet_out", label: "Wet robot: load cup to cleaner (turned face up)", labelKo: "Wet robot: load cup → cleaner (face up)", lastStep: "wet_out_cl" },
  { id: "c_clean", label: "Brush clean / end-effector rinse", labelKo: "Brush clean·end effector rinse", lastStep: "brushes_open" },
  { id: "c_to_dryer", label: "Wet robot: cleaner to spin dryer (clean-wet)", labelKo: "Wet robot: cleaner → spin dryer", lastStep: "dryer_close_wet" },
  { id: "c_spin_dry", label: "Spin dry", labelKo: "Spin dry", lastStep: "chuck_up" },
  { id: "c_dry_out", label: "Dry robot: dryer to FOUP (dry only)", labelKo: "Dry robot: dryer → FOUP", lastStep: "dry_out_foup2" },
  { id: "c_close", label: "FOUP door close / undock", labelKo: "FOUP door close·undock", lastStep: "lp_undock" },
];

/** Phase table of the full CMP sequence starting at t0 (ids can be prefixed for routes). */
export function cmpPhases(plan: CmpPlan, t0: number, prefix = ""): ScenarioPhase[] {
  const inPh = phasesFromSteps(plan.inSteps, CMP_IN_GROUPS, t0, "cmp");
  const pol = CMP_POLISH_SCENARIO.phases.map((p) => ({ ...p, id: `${prefix}${p.id}`, start: t0 + plan.polishStart + p.start, end: t0 + plan.polishStart + p.end, equipment: "cmp" as const }));
  const outPh = phasesFromSteps(plan.outSteps, CMP_OUT_GROUPS, t0 + plan.outStart, "cmp");
  return [...inPh.map((p) => ({ ...p, id: `${prefix}${p.id}` })), ...pol, ...outPh.map((p) => ({ ...p, id: `${prefix}${p.id}` }))];
}

export const CMP_SCENARIO: VisualScenario = { id: "sti-cmp-cycle-v2", title: "Rotary STI CMP: FOUP to FOUP (dry robot, flip, wet robot, clean, dry)", durationSec: CMP_PLAN.total, phases: cmpPhases(CMP_PLAN, 0), renderSource: "illustrative" };

export interface CmpApplyArgs {
  out: PreviewState;
  plan: CmpPlan;
  state: CmpFullState;
  cmpInstanceId: string;
  foupInstanceId: string | null;
  stationId: string;
  carrierId: string;
  waferId: string;
  slotId: string;
  film: IllustrativeFilmState;
}

/** Write the CMP state into the preview (joints, effects, flags, FOUP door, carrier docking, wafer). */
export function applyCmpState(a: CmpApplyArgs): void {
  const ip = a.out.instances[a.cmpInstanceId];
  const s = a.state;
  ip.joints = { ...ip.joints, ...s.joints };
  ip.effects = { ...ip.effects, ...s.effects };
  ip.flags = { ...ip.flags, ...s.flags, wetRobotEndEffector: String(s.flags.eeState ?? "clean_ready"), handlingStep: s.stepId };
  const asset = cmpPresentedAsset(s.holder);
  if (asset) {
    ip.presentedWaferId = a.waferId;
    ip.presentedWaferAssetId = asset;
  }
  const v = s.values;
  if (a.foupInstanceId && a.out.instances[a.foupInstanceId]) {
    const fp = a.out.instances[a.foupInstanceId];
    fp.joints = { ...fp.joints, foup_door_pull: v.doorPull, foup_door_lower: v.doorLower };
    if (s.holder === "foup") {
      fp.presentedWaferId = a.waferId;
      fp.presentedWaferAssetId = "foup_wafer";
    }
  }
  a.out.carriers[a.carrierId] = {
    carrierId: a.carrierId,
    holder: { kind: "station", id: a.stationId },
    doorOpen: v.doorPull > 0.0005 || v.doorLower > 0.0005,
    slots: { [a.slotId]: s.holder === "foup" ? a.waferId : null },
    docked: v.dock > a.plan.L.front.loadPort.dockStroke - 1e-4,
    dockOffset: v.dock,
  };
  a.out.wafers[a.waferId] = { waferId: a.waferId, holder: cmpWaferHolder(s.holder, a.cmpInstanceId, a.carrierId, a.slotId), reservedSlot: DEMO_RESERVED_SLOT, frontsideNormalLocal: s.frontside, film: a.film, wetState: s.wetState };
}

export function cmpStandalonePreview(t: number, _seed: number, _animT: number, ctx: ScenarioContext): PreviewState {
  const phase = phaseAt(CMP_SCENARIO, t);
  const out: PreviewState = { scenarioId: CMP_SCENARIO.id, t, phaseId: phase.id, phaseLabel: phase.label, phaseLabelKo: phase.labelKo, phaseFocusInstanceId: null, instances: {}, carriers: {}, wafers: {}, plasma: { intensity: 0, flicker: 0 }, blockedReason: null };
  const cmps = ctx.instances.filter((i) => i.templateId === CMP_TEMPLATE_ID);
  const s = cmpFullState(CMP_PLAN, t);
  for (const inst of ctx.instances) {
    const p = emptyInstancePreview(inst.instanceId);
    if (inst.templateId === CMP_TEMPLATE_ID) {
      p.joints = { ...s.joints };
      p.effects = { ...s.effects };
      p.flags = { ...s.flags };
      p.phaseLabelKo = s.labelKo || phase.labelKo;
      if (inst.instanceId !== cmps[0]?.instanceId) {
        // duplicate fixture instances run the same motion and present their own wafer id
        const asset = cmpPresentedAsset(s.holder);
        if (asset) {
          p.presentedWaferId = `W-${inst.instanceId}`;
          p.presentedWaferAssetId = asset;
        }
      }
    }
    out.instances[inst.instanceId] = p;
  }
  const inst0 = cmps[0];
  if (inst0) {
    const station = Object.values(ctx.stations).find((st) => st.instanceId === inst0.instanceId);
    const foup = ctx.instances.find((i) => i.instanceId === DEMO_CARRIER.carrierId);
    // standalone CMP starts from a wafer that already carries the illustrated overcoat
    const incoming = incomingFilmState(DEMO_WAFER.waferId);
    incoming.layers = incoming.layers.map((l) => (l.layerId === "demo_overcoat" ? { ...l, presentFraction: 1 } : l));
    incoming.status = "deposited";
    const film = s.segment === "in" ? incoming : applyCmpFilm(incoming, s.polish.film);
    if (station) applyCmpState({ out, plan: CMP_PLAN, state: s, cmpInstanceId: inst0.instanceId, foupInstanceId: foup?.instanceId ?? null, stationId: station.stationId, carrierId: DEMO_CARRIER.carrierId, waferId: DEMO_WAFER.waferId, slotId: DEMO_RESERVED_SLOT.slotId, film });
    out.phaseFocusInstanceId = inst0.instanceId;
  }
  return out;
}

export const CMP_STANDALONE_SCENARIO: ScenarioDefinition = {
  id: CMP_SCENARIO.id,
  title: CMP_SCENARIO.title,
  titleKo: "Rotary STI CMP (단독): FOUP → dry robot → flip → wet robot → polish → clean → dry → FOUP",
  kind: "standalone",
  templateId: CMP_TEMPLATE_ID,
  scenario: CMP_SCENARIO,
  requiredInstanceIds: [],
  requiredTemplateIds: [CMP_TEMPLATE_ID],
  evaluate: cmpStandalonePreview,
};
