/**
 * Producer SE based twin-module PECVD tool: layout in the instance frame.
 *
 * The instance origin is the axis of the active cell A at pedestal height; the handling station runs
 * toward -X (slit azimuth 180 deg) through a vacuum transfer chamber, the load lock and the EFEM to load
 * port LP1. Cell B sits beside cell A in the same twin module (+Z); two more twin modules (MOD-02, MOD-03)
 * flank the transfer chamber as geometry-only modules. Cell A's joints, wafer frames and sensor anchors
 * are therefore in the instance frame without any module transform; cell B and the idle modules carry no
 * joints. Everything is a representative configuration (see config/geometry/producer-se-twin-v1.json).
 */
import cfgJson from "../../../config/geometry/producer-se-twin-v1.json";
import { deriveChamberLayout, validateGeometryConfig, type ChamberLayout, type GeometryConfig, type ValidationReport, type Vec3Tuple } from "../../config/geometry";

export interface ProducerToolConfig {
  note: string;
  twin: { cell_b_offset_z: number; module_x0: number; module_x1: number; module_z0: number; module_z1: number; skin_top_y: number; skin_bottom_clear: number };
  idle_modules: { moduleId: string; center: Vec3Tuple; size: Vec3Tuple; facing: Vec3Tuple }[];
  idle_load_ports_q: number[];
  frame_feet_inset: number;
}

export interface ProducerToolLayout {
  cellB: [number, number];
  /** Twin module MOD-01 box (instance frame). */
  mod01: { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number };
  /** Idle twin modules: world-aligned box (center at half height), `facing` toward the transfer chamber. */
  idleModules: { moduleId: string; center: Vec3Tuple; size: Vec3Tuple; facing: Vec3Tuple }[];
  /** Idle load ports LP2 / LP3 (station lateral offsets; LP1 at q = 0 is the active port). */
  idleLoadPortsQ: number[];
  floorY: number;
}

export type ProducerLayout = ChamberLayout & { tool: ProducerToolLayout };

type ProducerConfigFile = GeometryConfig & { tool: ProducerToolConfig };

export const PRODUCER_CONFIG = cfgJson as unknown as ProducerConfigFile;

export function deriveProducerLayout(cfg: ProducerConfigFile): ProducerLayout {
  const L = deriveChamberLayout(cfg);
  const t = cfg.tool;
  const floorY = L.station.floorY;
  return {
    ...L,
    tool: {
      cellB: [0, t.twin.cell_b_offset_z],
      mod01: { x0: t.twin.module_x0, x1: t.twin.module_x1, z0: t.twin.module_z0, z1: t.twin.module_z1, y0: floorY, y1: t.twin.skin_top_y },
      idleModules: t.idle_modules.map((m) => ({ moduleId: m.moduleId, center: [m.center[0], floorY + m.size[1] / 2, m.center[2]] as Vec3Tuple, size: m.size, facing: m.facing })),
      idleLoadPortsQ: t.idle_load_ports_q,
      floorY,
    },
  };
}

export const PRODUCER_LAYOUT: ProducerLayout = deriveProducerLayout(PRODUCER_CONFIG);

/** Geometry validation: the reused cell + station checks and the whole-tool clearances. */
export function validateProducerConfig(cfg: ProducerConfigFile = PRODUCER_CONFIG): ValidationReport {
  const rep = validateGeometryConfig(cfg);
  const L = deriveProducerLayout(cfg);
  const T = L.tool;
  const S = L.station;
  const err = (ok: boolean, msg: string) => {
    if (!ok) rep.errors.push(`producer: ${msg}`);
  };
  const cellR = L.rOuter + 0.05;
  err(T.cellB[1] - cellR > cellR, "cell B must clear cell A");
  err(T.mod01.x0 < -cellR && T.mod01.x1 > cellR && T.mod01.z0 < -cellR && T.mod01.z1 > T.cellB[1] + cellR, "twin module MOD-01 must enclose both cells");
  err(S.tc !== null, "the Producer station needs the transfer chamber block");
  if (S.tc) {
    // idle modules flank the transfer chamber without touching it, MOD-01, the load lock or the EFEM
    const tcX0 = -S.tc.r1;
    const tcX1 = -S.tc.r0;
    for (const m of T.idleModules) {
      const x0 = m.center[0] - m.size[0] / 2;
      const x1 = m.center[0] + m.size[0] / 2;
      const z0 = m.center[2] - m.size[2] / 2;
      const z1 = m.center[2] + m.size[2] / 2;
      err(Math.min(Math.abs(z0), Math.abs(z1)) >= S.tc.width / 2 + 0.02, `${m.moduleId} must clear the transfer chamber`);
      err(x1 <= T.mod01.x0 - 0.01 || z1 <= T.mod01.z0 - 0.01 || z0 >= T.mod01.z1 + 0.01, `${m.moduleId} must clear MOD-01`);
      err(x0 >= -S.efem.r0 + 0.01, `${m.moduleId} must stay behind the EFEM`);
      err(x0 < tcX1 && x1 > tcX0, `${m.moduleId} must sit along the transfer chamber`);
    }
  }
  return rep;
}
