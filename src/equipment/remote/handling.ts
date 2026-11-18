/**
 * Remote ICP PECVD handling plan: the same station sequence as the CCP bound to the Remote stage lift,
 * lift pins and slit gate.
 */
import { DEMO_RESERVED_SLOT } from "../../domain/materialFlow";
import { slotIndex } from "../foup/index";
import { chamberKinematics, planStation, type StationPlan } from "../handling/stationSequence";
import { REMOTE_LAYOUT } from "./layout";

const cfg = REMOTE_LAYOUT.cfg;

export const REMOTE_STATION_PLAN: StationPlan = planStation(
  REMOTE_LAYOUT.station,
  chamberKinematics(REMOTE_LAYOUT.station, "stage_z", cfg.stage.top_y, cfg.stage.transfer_top_y, cfg.stage.lift_pin_stroke, cfg.ports.slit.gate_travel),
  slotIndex(DEMO_RESERVED_SLOT.slotId),
);
