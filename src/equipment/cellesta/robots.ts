/**
 * Robot specs of the CELLESTA front end: the EFEM robot (backside fork, dry wafers) and the corridor
 * transfer robot (longer fork so only the end effector enters PM-01). Shared SCARA geometry and parts.
 */
import type { ScaraRobotSpec } from "../handling/robotParts";
import { STATION_IDS } from "../handling/stationParts";
import type { CellestaLayout, RobotLayout } from "./layout";

export const TR_IDS = { base: "tr_robot_base", column: "tr_robot_column", arm1: "tr_robot_link1", arm2: "tr_robot_link2", ee: "tr_robot_end_effector", wafer: "wafer_on_transfer_robot" } as const;

function spec(L: CellestaLayout, r: RobotLayout, prefix: string, ids: ScaraRobotSpec["ids"], assembly: string, nameKo: string): ScaraRobotSpec {
  const c = r.cfg;
  return {
    prefix,
    ids: { ...ids },
    assembly,
    nameKo,
    axisXZ: r.geom.axisXZ,
    d0: r.geom.d0,
    floorY: L.floorY + 0.02,
    baseTopY: r.baseTopY,
    shoulderY0: r.shoulderY0,
    baseRadius: c.base_radius,
    columnRadius: c.column_radius,
    zStroke: c.z_stroke,
    linkLength: c.link_length,
    linkWidth: c.link_width,
    link1T: c.link1_thickness,
    link2T: c.link2_thickness,
    hubRadius: c.hub_radius,
    eeReach: c.ee_reach,
    eeMountH: c.ee_mount_height,
    eeThickness: c.ee_thickness,
    padH: c.pad_height,
    tineQ: c.tine_q,
    tipBeyond: c.tip_beyond_center,
    ee: { kind: "fork" },
    waferRadius: L.rWafer,
    waferThickness: L.waferThickness,
  };
}

export const atmSpec = (L: CellestaLayout): ScaraRobotSpec => spec(L, L.atm, "atm", { ...STATION_IDS.robot }, "atm_robot", "EFEM robot");
export const trSpec = (L: CellestaLayout): ScaraRobotSpec => spec(L, L.tr, "tr", { ...TR_IDS }, "transfer_robot", "Transfer robot");
