/**
 * Scripted FOUP -> process chamber -> FOUP handling of the chamber-type tools (CCP / Remote), built as
 * two motion tracks (load and unload) around the process segment:
 *
 *   dock, FOUP door open -> robot picks from the reserved slot -> load-lock door opens -> robot places on
 *   the raised support pins -> door closes -> pump-down (scripted) -> slit gate opens -> pins lower the
 *   wafer onto the blade -> blade enters -> lift pins take the wafer -> blade retracts -> gate closes ->
 *   pins lower onto the stage -> stage to process ... and the reverse with cooldown readiness and vent.
 *
 * Every handoff happens inside a Z motion at the exact moment the moving support passes the other
 * support (inverse smoothstep), so the wafer pose is continuous. The atmospheric door and the slit
 * gate are never open at the same time. Joint values are presentation (scripted), never observations.
 */
import timing from "../../../config/visual/handling-sequence-v1.json";
import type { WaferHolder } from "../../presentation/preview";
import { evaluateTrack, trackDuration, type MotionStep, type TrackInitial, type TrackState } from "../../presentation/motionTrack";
import { scaraIK } from "./scara";
import { STATION_IDS, STATION_JOINTS as J } from "./stationParts";
import { foupWaferR, robotZForPlane, type HandlingStationLayout } from "./stationLayout";

export type StationHolder = "foup" | "robot" | "loadlock" | "blade" | "stage";

export interface StationTiming {
  dock: number;
  door_pull: number;
  door_lower: number;
  robot_z: number;
  robot_extend: number;
  robot_lift: number;
  robot_retract: number;
  robot_rotate: number;
  ll_door: number;
  pump_down: number;
  gate: number;
  ll_pins: number;
  blade: number;
  chamber_pins: number;
  stage_move: number;
  cooldown: number;
  vent: number;
  undock: number;
}

export const STATION_TIMING: StationTiming = timing.station;

/** Chamber kinematics the sequence needs (offsets of the stage lift and the lift pins). */
export interface ChamberKinematics {
  stageJoint: string;
  pinsJoint: string;
  /** Stage joint value at the transfer position (negative = down). */
  transferOffset: number;
  /** Lift pin value where the pin tops pass the blade plane at the transfer position. */
  pinsContact: number;
  /** Lift pin value with the wafer raised above the blade. */
  pinsUp: number;
  gateTravel: number;
}

export function chamberKinematics(S: HandlingStationLayout, stageJoint: string, processTopY: number, transferTopY: number, pinStroke: number, gateTravel: number): ChamberKinematics {
  const contact = S.planeY - transferTopY;
  return { stageJoint, pinsJoint: "lift_pins_z", transferOffset: transferTopY - processTopY, pinsContact: contact, pinsUp: Math.min(pinStroke, contact + 0.006), gateTravel };
}

export interface StationPlan {
  S: HandlingStationLayout;
  K: ChamberKinematics;
  slot: number;
  load: MotionStep<StationHolder>[];
  unload: MotionStep<StationHolder>[];
  loadInitial: TrackInitial<StationHolder>;
  unloadInitial: TrackInitial<StationHolder>;
  loadDuration: number;
  unloadDuration: number;
  zSlot: number;
  zLL: number;
}

export function planStation(S: HandlingStationLayout, K: ChamberKinematics, slot: number, T: StationTiming = STATION_TIMING): StationPlan {
  const ac = S.cfg.atm_robot.approach_clearance;
  const zSlot = robotZForPlane(S, S.slotY(slot));
  const zLL = robotZForPlane(S, S.ll.pinRaiseTop);
  const foupRho = foupWaferR(S, true) - S.robot.axisR;
  const llRho = S.robot.axisR - S.ll.centerR;
  const pinDrop = S.cfg.load_lock.support_pins.drop_below_plane;
  const lp = S.loadPort;
  const loadInitial: TrackInitial<StationHolder> = {
    values: { dock: 0, doorPull: 0, doorLower: 0, rho: 0, theta: 0, z: zLL + ac, llDoor: 0, llPins: S.ll.pinStroke, blade: 0, slitGate: 0, stage: K.transferOffset, pins: 0 },
    holder: "foup",
    flags: { llState: "atmosphere" },
  };
  const load: MotionStep<StationHolder>[] = [
    { id: "lp_dock", labelKo: "FOUP docking (dock plate)", duration: T.dock, to: { dock: lp.dockStroke } },
    { id: "foup_door_pull", labelKo: "FOUP door 해제·당김 (door opener)", duration: T.door_pull, to: { doorPull: lp.doorPull } },
    { id: "foup_door_lower", labelKo: "FOUP door 하강 (opening 개방)", duration: T.door_lower, to: { doorLower: lp.doorLower } },
    { id: "robot_to_slot", labelKo: `Robot: slot-${slot} 접근 높이`, duration: T.robot_z, to: { theta: 0, z: zSlot - ac } },
    { id: "robot_in_foup", labelKo: `Robot: fork를 slot-${slot} wafer 아래로`, duration: T.robot_extend, to: { rho: foupRho } },
    { id: "robot_pick_foup", labelKo: `Robot: slot-${slot}에서 pick (상승)`, duration: T.robot_lift, to: { z: zSlot + ac }, handoff: { holder: "robot", at: { channel: "z", value: zSlot } } },
    { id: "robot_out_foup", labelKo: "Robot: wafer와 함께 후퇴", duration: T.robot_retract, to: { rho: 0 } },
    { id: "robot_to_ll", labelKo: "Robot: load lock 방향으로 회전", duration: T.robot_rotate, to: { theta: Math.PI, z: zLL + ac } },
    { id: "ll_door_open", labelKo: "Load lock atmospheric door 열림", duration: T.ll_door, to: { llDoor: S.atmDoor.gateTravel } },
    { id: "robot_in_ll", labelKo: "Robot: load lock 안 pin 위로", duration: T.robot_extend, to: { rho: llRho } },
    { id: "robot_place_ll", labelKo: "Robot: support pin에 place (하강)", duration: T.robot_lift, to: { z: zLL - ac }, handoff: { holder: "loadlock", at: { channel: "z", value: zLL } } },
    { id: "robot_out_ll", labelKo: "Robot 후퇴", duration: T.robot_retract, to: { rho: 0 } },
    { id: "ll_door_close", labelKo: "Load lock atmospheric door 닫힘", duration: T.ll_door, to: { llDoor: 0 } },
    { id: "ll_pumpdown", labelKo: "Load lock pump-down (scripted, 압력 data 없음)", duration: T.pump_down, set: { llState: "pumping" } },
    { id: "slit_open", labelKo: "Slit valve gate 열림", duration: T.gate, to: { slitGate: K.gateTravel }, set: { llState: "vacuum" } },
    { id: "ll_pins_to_blade", labelKo: "Support pin 하강: wafer를 blade에 인계", duration: T.ll_pins, to: { llPins: 0 }, handoff: { holder: "blade", at: { channel: "llPins", value: pinDrop } } },
    { id: "blade_in", labelKo: "Vacuum blade: chamber로 반입", duration: T.blade, to: { blade: S.blade.stroke } },
    { id: "pins_take", labelKo: "Lift pin 상승: blade에서 wafer 인수", duration: T.chamber_pins, to: { pins: K.pinsUp }, handoff: { holder: "stage", at: { channel: "pins", value: K.pinsContact } } },
    { id: "blade_out", labelKo: "Vacuum blade 후퇴", duration: T.blade, to: { blade: 0 } },
    { id: "slit_close", labelKo: "Slit valve gate 닫힘", duration: T.gate, to: { slitGate: 0 } },
    { id: "pins_down", labelKo: "Lift pin 하강: wafer를 stage에 안착", duration: T.chamber_pins, to: { pins: 0 } },
    { id: "stage_up", labelKo: "Stage: process 위치로 상승", duration: T.stage_move, to: { stage: 0 } },
  ];
  const loadEnd = evaluateTrack(load, loadInitial, trackDuration(load) + 1);
  const unloadInitial: TrackInitial<StationHolder> = { values: { ...loadEnd.values }, holder: "stage", flags: { ...loadEnd.flags } };
  const unload: MotionStep<StationHolder>[] = [
    { id: "stage_down", labelKo: "Stage: transfer 위치로 하강", duration: T.stage_move, to: { stage: K.transferOffset } },
    { id: "pins_lift", labelKo: "Lift pin 상승: wafer를 blade 높이 위로", duration: T.chamber_pins, to: { pins: K.pinsUp } },
    { id: "slit_open_out", labelKo: "Slit valve gate 열림", duration: T.gate, to: { slitGate: K.gateTravel } },
    { id: "blade_in_out", labelKo: "Vacuum blade: wafer 아래로 진입", duration: T.blade, to: { blade: S.blade.stroke } },
    { id: "pins_give", labelKo: "Lift pin 하강: wafer를 blade에 인계", duration: T.chamber_pins, to: { pins: 0 }, handoff: { holder: "blade", at: { channel: "pins", value: K.pinsContact } } },
    { id: "blade_back", labelKo: "Vacuum blade: load lock으로 회수", duration: T.blade, to: { blade: 0 } },
    { id: "slit_close_out", labelKo: "Slit valve gate 닫힘", duration: T.gate, to: { slitGate: 0 } },
    { id: "ll_pins_up", labelKo: "Support pin 상승: blade에서 wafer 인수", duration: T.ll_pins, to: { llPins: S.ll.pinStroke }, handoff: { holder: "loadlock", at: { channel: "llPins", value: pinDrop } } },
    { id: "ll_cooldown", labelKo: "Cooldown readiness (설계 가정, 온도 data 없음)", duration: T.cooldown, set: { llState: "cooldown" } },
    { id: "ll_vent", labelKo: "Load lock vent·equalization (scripted)", duration: T.vent, set: { llState: "venting" } },
    { id: "ll_door_open_out", labelKo: "Load lock atmospheric door 열림", duration: T.ll_door, to: { llDoor: S.atmDoor.gateTravel }, set: { llState: "atmosphere" } },
    { id: "robot_under_ll", labelKo: "Robot: 올라간 wafer 아래 높이", duration: T.robot_z, to: { theta: Math.PI, z: zLL - ac } },
    { id: "robot_in_ll_out", labelKo: "Robot: fork를 wafer 아래로", duration: T.robot_extend, to: { rho: llRho } },
    { id: "robot_pick_ll", labelKo: "Robot: support pin에서 pick (상승)", duration: T.robot_lift, to: { z: zLL + ac }, handoff: { holder: "robot", at: { channel: "z", value: zLL } } },
    { id: "robot_out_ll_out", labelKo: "Robot: wafer와 함께 후퇴", duration: T.robot_retract, to: { rho: 0 } },
    { id: "ll_door_close_out", labelKo: "Load lock atmospheric door 닫힘", duration: T.ll_door, to: { llDoor: 0 } },
    { id: "robot_to_foup", labelKo: `Robot: FOUP 방향 회전, slot-${slot} 위 높이`, duration: T.robot_rotate, to: { theta: 0, z: zSlot + ac } },
    { id: "robot_in_foup_out", labelKo: `Robot: wafer를 slot-${slot} 위로`, duration: T.robot_extend, to: { rho: foupRho } },
    { id: "robot_place_foup", labelKo: `Robot: reserved slot-${slot}에 place (하강)`, duration: T.robot_lift, to: { z: zSlot - ac }, handoff: { holder: "foup", at: { channel: "z", value: zSlot } } },
    { id: "robot_home", labelKo: "Robot 후퇴·home", duration: T.robot_retract, to: { rho: 0, z: zLL + ac } },
    { id: "foup_door_raise", labelKo: "FOUP door 상승", duration: T.door_lower, to: { doorLower: 0 } },
    { id: "foup_door_close", labelKo: "FOUP door 닫힘·latch", duration: T.door_pull, to: { doorPull: 0 } },
    { id: "lp_undock", labelKo: "Undock (OHT 인계 준비)", duration: T.undock, to: { dock: 0 } },
  ];
  return { S, K, slot, load, unload, loadInitial, unloadInitial, loadDuration: trackDuration(load), unloadDuration: trackDuration(unload), zSlot, zLL };
}

/** Joint values of the tool (station + chamber stage) for a track state. */
export function stationJointValues(plan: StationPlan, v: Record<string, number>): Record<string, number> {
  const S = plan.S;
  const ik = scaraIK(S.robot.scara, v.rho, v.theta);
  const b = Math.min(Math.max(v.blade, 0), S.blade.stroke);
  const k1 = S.blade.s1max / S.blade.stroke;
  return {
    [J.dock]: v.dock,
    [J.doorPull]: v.doorPull,
    [J.doorLower]: v.doorLower,
    atm_z: v.z,
    atm_shoulder: ik.shoulder,
    atm_elbow: ik.elbow,
    atm_wrist: ik.wrist,
    [J.llDoor]: v.llDoor,
    [J.llPins]: v.llPins,
    [J.bladeS1]: b * k1,
    [J.bladeS2]: b * (1 - k1),
    [J.slitGate]: v.slitGate,
    [plan.K.stageJoint]: v.stage,
    [plan.K.pinsJoint]: v.pins,
  };
}

/** FOUP door joints mirror the door opener (the port door holds the FOUP door). */
export function foupDoorJoints(v: Record<string, number>): Record<string, number> {
  return { foup_door_pull: v.doorPull, foup_door_lower: v.doorLower };
}

/** Rest pose of the station when no handling runs (robot folded facing the FOUP, doors closed, stage at process). */
export function stationHomeValues(plan: StationPlan): Record<string, number> {
  return { ...plan.loadInitial.values, llPins: plan.S.ll.pinStroke, stage: 0, pins: 0 };
}

/** Presentation asset of the tool that shows the wafer for a holder (null = shown by the FOUP). */
export function stationPresentedAsset(holder: StationHolder, stageWaferAssetId: string): string | null {
  switch (holder) {
    case "robot":
      return STATION_IDS.robot.wafer;
    case "loadlock":
      return STATION_IDS.waferLL;
    case "blade":
      return STATION_IDS.waferBlade;
    case "stage":
      return stageWaferAssetId;
    default:
      return null;
  }
}

export function stationWaferHolder(holder: StationHolder, instanceId: string, carrierId: string, slotId: string, pins: number): WaferHolder {
  switch (holder) {
    case "foup":
      return { kind: "carrier_slot", carrierId, slotId };
    case "robot":
      return { kind: "end_effector", instanceId, attachment: "atm_robot", noteKo: "EFEM robot fork (backside support)" };
    case "loadlock":
      return { kind: "loadlock_support", instanceId, attachment: "load_lock_pins", noteKo: "Load lock support pins" };
    case "blade":
      return { kind: "transfer_blade", instanceId, attachment: "vacuum_blade", noteKo: "Vacuum transfer blade" };
    case "stage":
      return { kind: "process_stage", instanceId, attachment: pins > 0.0005 ? "lift_pins" : "stage_surface", noteKo: pins > 0.0005 ? "Lift pins" : "Stage surface" };
  }
}

export interface StationGates {
  atmDoorOpen: boolean;
  slitGateOpen: boolean;
  foupDoorOpen: boolean;
}

export function stationGates(v: Record<string, number>): StationGates {
  return { atmDoorOpen: v.llDoor > 0.0005, slitGateOpen: v.slitGate > 0.0005, foupDoorOpen: v.doorPull > 0.0005 || v.doorLower > 0.0005 };
}

export type { TrackState };
