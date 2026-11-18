/**
 * Procedural parts of the OHT: rail with hangers, feeder line, seams and end stops (fixed); bogies with
 * drive wheels on the lower flange, web guide rollers, drive motor and power pickup, body with covers,
 * bumpers, status lamp and hoist window, hoist drive with belt exit pulleys (travel joint); stretchable
 * belts (travel joint, scaled by the hoist extension); gripper plate with finger guide rails and actuator
 * (hoist joint); fingers (gripper_a / gripper_b joints). Rest pose: vehicle at rail start, hoist retracted,
 * fingers open. All dimensions are generic assumptions from the bay config.
 */
import type { PartGeometry } from "../../geometry/chamberParts";
import { chamferedBox, mergeMeshData, revolveProfile, rotateYMeshData, translateMeshData, type MeshData, type Vec3 } from "../../geometry/meshlib";
import { PartSink, chamfRect } from "../../geometry/sharedParts";
import { FINGER_LIP_THICKNESS, PRESENCE_SENSOR_HEIGHT, type OhtLayout } from "./layout";

/** Cylinder along Y at (x, z). */
function post(r: number, y0: number, y1: number, x: number, z: number, seg = 16): MeshData {
  return translateMeshData(revolveProfile(chamfRect(0, r, y0, y1, Math.min(0.002, (y1 - y0) / 3, r / 3)), { segments: seg }), x, 0, z);
}

/** Cylinder along Z from z0 to z1 at (x, y). */
function rodZ(r: number, x: number, y: number, z0: number, z1: number, seg = 10): MeshData {
  const md = revolveProfile(chamfRect(0, r, z0, z1, Math.min(0.001, r / 3)), { segments: seg });
  // revolve axis Y -> Z: (x, y, z) -> (x, z, y)
  for (let i = 0; i < md.positions.length; i += 3) {
    const yy = md.positions[i + 1];
    md.positions[i + 1] = md.positions[i + 2];
    md.positions[i + 2] = yy;
    const ny = md.normals[i + 1];
    md.normals[i + 1] = md.normals[i + 2];
    md.normals[i + 2] = ny;
  }
  // the y <-> z swap mirrors the winding; flip triangles back
  for (let i = 0; i < md.indices.length; i += 3) {
    const t = md.indices[i + 1];
    md.indices[i + 1] = md.indices[i + 2];
    md.indices[i + 2] = t;
  }
  return translateMeshData(md, x, y, 0);
}

/** Cylinder along +X (wheel) built by revolving around Y then rotating. */
function wheel(r: number, w: number, at: Vec3): MeshData {
  const md = revolveProfile(chamfRect(0, r, -w / 2, w / 2, 0.003), { segments: 32 });
  // rotate Y axis onto X: (x,y,z) -> (y, -x, z)
  for (let i = 0; i < md.positions.length; i += 3) {
    const x = md.positions[i];
    const y = md.positions[i + 1];
    md.positions[i] = y;
    md.positions[i + 1] = -x;
    const nx = md.normals[i];
    const ny = md.normals[i + 1];
    md.normals[i] = ny;
    md.normals[i + 1] = -nx;
  }
  translateMeshData(md, at[0], at[1], at[2]);
  return md;
}

export function buildOhtParts(L: OhtLayout): PartGeometry[] {
  const sink = new PartSink();
  const cfg = L.cfg;
  const r = cfg.rail;
  const zc = (r.z0 + r.z1) / 2;
  // ------------------------------------------------------------------ rail + hangers
  const web = chamferedBox([r.width, r.height - 2 * r.flange_thickness, r.z1 - r.z0], 0.003, [0, (L.rail.bottomY + L.rail.topY) / 2, zc]);
  const flangeBottom = chamferedBox([r.flange_width, r.flange_thickness, r.z1 - r.z0], 0.002, [0, L.rail.bottomY + r.flange_thickness / 2, zc]);
  const flangeTop = chamferedBox([r.flange_width, r.flange_thickness, r.z1 - r.z0], 0.002, [0, L.rail.topY - r.flange_thickness / 2, zc]);
  sink.fixed("rail", "rail", "aluminum_anodized", mergeMeshData([web, flangeBottom, flangeTop]), { cutaway: "keep" });
  // rail joints (seam plates) every two hanger pitches, end stops with rubber buffers at both ends
  const railSeams: MeshData[] = [];
  for (let z = r.z0 + 2 * r.hanger_pitch; z < r.z1 - 0.2; z += 2 * r.hanger_pitch) {
    for (const sx of [-1, 1]) railSeams.push(chamferedBox([0.006, r.height - 2 * r.flange_thickness - 0.01, 0.12], 0.001, [sx * (r.width / 2 + 0.003), (L.rail.bottomY + L.rail.topY) / 2, z]));
  }
  sink.fixed("rail_seams", "rail", "dark_steel", mergeMeshData(railSeams), { cutaway: "keep", pickable: false, castShadow: false, lod: "fine" });
  const stops: MeshData[] = [];
  const buffers: MeshData[] = [];
  for (const [ze, dir] of [[r.z0, 1], [r.z1, -1]] as const) {
    stops.push(chamferedBox([r.flange_width + 0.06, r.height + 0.06, 0.03], 0.004, [0, (L.rail.bottomY + L.rail.topY) / 2 - 0.02, ze - dir * 0.015]));
    buffers.push(chamferedBox([0.1, 0.06, 0.04], 0.008, [0, L.rail.bottomY - 0.02, ze + dir * 0.02]));
  }
  sink.fixed("rail_end_stops", "rail", "painted_dark", mergeMeshData(stops), { cutaway: "keep", castShadow: false });
  sink.fixed("rail_end_buffers", "rail", "rubber_membrane", mergeMeshData(buffers), { cutaway: "keep", pickable: false, castShadow: false, lod: "fine" });
  // non-contact power feeder: two conductors on insulator brackets along the -X side of the rail
  const feederX = -(r.flange_width / 2 + 0.035);
  const feederY = [L.rail.bottomY + 0.035, L.rail.bottomY + 0.065];
  const feeder = mergeMeshData(feederY.map((y) => rodZ(0.005, feederX, y, r.z0 + 0.05, r.z1 - 0.05)));
  const insul: MeshData[] = [];
  for (let z = r.z0 + 0.3; z <= r.z1 - 0.2; z += r.hanger_pitch / 2) {
    insul.push(chamferedBox([0.04, 0.012, 0.03], 0.002, [-(r.flange_width / 2 + 0.018), L.rail.topY - 0.03, z]));
    insul.push(chamferedBox([0.014, 0.07, 0.024], 0.002, [feederX, L.rail.bottomY + 0.055, z]));
  }
  sink.fixed("rail_feeder", "rail", "polymer_gray", mergeMeshData([feeder, ...insul]), { cutaway: "keep", pickable: false, castShadow: false, lod: "fine" });
  const hangers: MeshData[] = [];
  const pads: MeshData[] = [];
  for (let z = r.z0 + 0.3; z <= r.z1 - 0.2; z += r.hanger_pitch) {
    for (const sx of [-1, 1]) {
      const rod = revolveProfile(chamfRect(0, r.hanger_radius, L.rail.topY, r.ceiling_y, 0.002), { segments: 12 });
      translateMeshData(rod, sx * (r.flange_width / 2 - 0.02), 0, z);
      hangers.push(rod);
    }
    for (const sx of [-1, 1]) hangers.push(post(r.hanger_radius * 1.9, (L.rail.topY + r.ceiling_y) / 2 - 0.04, (L.rail.topY + r.ceiling_y) / 2 + 0.04, sx * (r.flange_width / 2 - 0.02), z, 6));
    pads.push(chamferedBox([r.ceiling_pad_size, 0.02, r.ceiling_pad_size], 0.003, [0, r.ceiling_y + 0.01, z]));
    hangers.push(chamferedBox([r.flange_width + 0.04, 0.02, 0.06], 0.002, [0, L.rail.topY + 0.01, z]));
  }
  sink.fixed("hangers", "ceiling_support", "dark_steel", mergeMeshData(hangers), { cutaway: "keep", castShadow: false });
  sink.fixed("ceiling_pads", "ceiling_support", "painted_housing", mergeMeshData(pads), { cutaway: "keep", castShadow: false });

  // ------------------------------------------------------------------ vehicle (travel joint; authored at the rail start)
  const v = cfg.vehicle;
  const h = cfg.hoist;
  const z0 = r.z0;
  const bogieParts: MeshData[] = [];
  const wheels: MeshData[] = [];
  const flangeTopY = L.rail.bottomY + r.flange_thickness;
  // drive wheels ride on the lower flange on both sides of the web; side plates wrap around the flange edge
  const wheelX = r.width / 2 + (r.flange_width - r.width) / 4;
  const wheelW = Math.min(v.wheel_width, (r.flange_width - r.width) / 2 - 0.006);
  const plateX = r.flange_width / 2 + 0.01;
  const axleY = flangeTopY + v.wheel_radius;
  for (const dz of [-v.bogie_spacing / 2, v.bogie_spacing / 2]) {
    const zc = z0 + dz;
    bogieParts.push(chamferedBox([2 * plateX + 0.016, 0.03, v.bogie_size[2]], 0.004, [0, L.rail.bottomY - 0.03, zc]));
    for (const sx of [-1, 1]) {
      bogieParts.push(chamferedBox([0.008, axleY + 0.035 - (L.rail.bottomY - 0.045), v.bogie_size[2] * 0.9], 0.002, [sx * plateX, (axleY + 0.035 + L.rail.bottomY - 0.045) / 2, zc]));
      wheels.push(wheel(v.wheel_radius, wheelW, [sx * wheelX, axleY, zc]));
      // axle stub from the side plate to the wheel
      const stub = wheel(0.008, plateX - wheelX, [sx * (wheelX + plateX) / 2, axleY, zc]);
      bogieParts.push(stub);
      // guide rollers on the web (vertical axis), ahead of and behind the wheel
      for (const gz of [-0.075, 0.075]) wheels.push(post(0.012, flangeTopY + 0.012, flangeTopY + 0.03, sx * (r.width / 2 + 0.012), zc + gz, 16));
    }
  }
  // drive motor + gearbox on the front bogie (outside the +X side plate); power pickup on the -X side at the feeder
  const zf = z0 + v.bogie_spacing / 2;
  const motor = wheel(0.032, 0.09, [plateX + 0.05, axleY, zf]);
  const gearbox = chamferedBox([0.03, 0.08, 0.08], 0.003, [plateX + 0.012, axleY, zf]);
  const pickup = chamferedBox([0.03, 0.06, 0.14], 0.003, [-(r.flange_width / 2 + 0.035) + 0.022, L.rail.bottomY + 0.05, z0]);
  const pickupArm = chamferedBox([0.05, 0.012, 0.04], 0.002, [-(plateX + 0.02), L.rail.bottomY - 0.02, z0]);
  sink.fixed("bogie_wheels", "bogies", "polymer_gray", mergeMeshData(wheels), { cutaway: "keep", jointId: "travel", castShadow: false });
  sink.fixed("bogie_drive", "bogies", "dark_steel", mergeMeshData([motor, gearbox, pickup, pickupArm]), { cutaway: "keep", jointId: "travel", castShadow: false, lod: "fine" });
  sink.fixed("bogies", "bogies", "painted_dark", mergeMeshData(bogieParts), { cutaway: "keep", jointId: "travel" });
  const yoke = chamferedBox(v.yoke_size, 0.004, [0, L.vehicle.bodyY1 + v.body_top_gap / 2, z0]);
  const body = chamferedBox(v.body_size, 0.01, [0, (L.vehicle.bodyY0 + L.vehicle.bodyY1) / 2, z0]);
  const stripe = chamferedBox([v.body_size[0] + 0.004, 0.03, v.body_size[2] + 0.004], 0.002, [0, L.vehicle.bodyY0 + 0.06, z0]);
  sink.fixed("body", "vehicle_body", "painted_housing", mergeMeshData([body, yoke]), { cutaway: "keep", jointId: "travel" });
  sink.fixed("body_stripe", "vehicle_body", "safety_marking", stripe, { cutaway: "keep", jointId: "travel", pickable: false, castShadow: false });
  // end covers, bumpers, status lamp, hoist window frame on the underside, access panel seams
  const bs = v.body_size;
  const yMid = (L.vehicle.bodyY0 + L.vehicle.bodyY1) / 2;
  const covers = mergeMeshData([-1, 1].map((sd) => chamferedBox([bs[0] - 0.03, bs[1] - 0.05, 0.03], 0.012, [0, yMid, z0 + sd * (bs[2] / 2 + 0.012)])));
  const bumpers = mergeMeshData([-1, 1].map((sd) => chamferedBox([bs[0] - 0.08, 0.035, 0.03], 0.01, [0, L.vehicle.bodyY0 + 0.03, z0 + sd * (bs[2] / 2 + 0.035)])));
  const lamp = chamferedBox([0.06, 0.02, 0.012], 0.003, [-bs[0] / 2 + 0.07, L.vehicle.bodyY1 - 0.04, z0 + bs[2] / 2 + 0.03]);
  const win: MeshData[] = [];
  const wx = Math.max(...h.belt_offsets.map((o) => Math.abs(o[0]))) + 0.05;
  const wz = Math.max(...h.belt_offsets.map((o) => Math.abs(o[1]))) + 0.05;
  for (const sd of [-1, 1]) {
    win.push(chamferedBox([2 * wx + 0.02, 0.008, 0.02], 0.002, [0, L.vehicle.bodyY0 - 0.004, z0 + sd * wz]));
    win.push(chamferedBox([0.02, 0.008, 2 * wz], 0.002, [sd * wx, L.vehicle.bodyY0 - 0.004, z0]));
  }
  const seams = mergeMeshData([-1, 1].flatMap((sd) => [chamferedBox([0.002, bs[1] - 0.12, 0.004], 0.0005, [sd * (bs[0] / 2 + 0.001), yMid, z0 - 0.12]), chamferedBox([0.002, bs[1] - 0.12, 0.004], 0.0005, [sd * (bs[0] / 2 + 0.001), yMid, z0 + 0.2]), chamferedBox([0.002, 0.004, 0.32], 0.0005, [sd * (bs[0] / 2 + 0.001), yMid - (bs[1] - 0.12) / 2, z0 + 0.04])]));
  sink.fixed("body_covers", "vehicle_body", "painted_housing", covers, { cutaway: "keep", jointId: "travel" });
  sink.fixed("body_bumpers", "vehicle_body", "rubber_membrane", bumpers, { cutaway: "keep", jointId: "travel", castShadow: false });
  sink.fixed("body_lamp", "vehicle_body", "safety_marking", lamp, { cutaway: "keep", jointId: "travel", pickable: false, castShadow: false, lod: "fine" });
  sink.fixed("body_hoist_window", "vehicle_body", "painted_dark", mergeMeshData(win), { cutaway: "keep", jointId: "travel", pickable: false, castShadow: false });
  sink.fixed("body_seams", "vehicle_body", "dark_steel", seams, { cutaway: "keep", jointId: "travel", pickable: false, castShadow: false, lod: "fine" });
  const fs = v.front_sensor_size;
  const sensor = chamferedBox(fs, 0.003, [0, L.vehicle.bodyY0 + 0.12, z0 + v.body_size[2] / 2 + fs[2] / 2]);
  const sensorDown = chamferedBox([fs[0], fs[2], fs[1]], 0.003, [v.body_size[0] / 2 - 0.06, L.vehicle.bodyY0 - fs[2] / 2, z0 + v.body_size[2] / 2 - 0.06]);
  sink.fixed("obstruction_sensor", "obstruction_sensor", "painted_dark", mergeMeshData([sensor, sensorDown]), { cutaway: "keep", jointId: "travel" });
  const brk = mergeMeshData([
    chamferedBox([fs[0] + 0.02, 0.006, 0.05], 0.001, [0, L.vehicle.bodyY0 + 0.12 - fs[1] / 2 - 0.003, z0 + v.body_size[2] / 2 + 0.02]),
    chamferedBox([fs[0] + 0.02, 0.006, 0.05], 0.001, [v.body_size[0] / 2 - 0.06, L.vehicle.bodyY0 - 0.003, z0 + v.body_size[2] / 2 - 0.06]),
  ]);
  sink.fixed("sensor_brackets", "obstruction_sensor", "stainless", brk, { cutaway: "keep", jointId: "travel", pickable: false, castShadow: false, lod: "fine" });
  const reels: MeshData[] = [];
  for (const [bx, bz] of h.belt_offsets) {
    const reel = wheel(0.035, 0.03, [bx, L.hoist.originY + 0.05, z0 + bz]);
    reels.push(reel);
  }
  const driveBox = chamferedBox([0.3, 0.1, 0.36], 0.004, [0, L.hoist.originY + 0.06, z0]);
  sink.fixed("hoist_drive", "hoist_drive", "dark_steel", mergeMeshData([driveBox, ...reels]), { cutaway: "keep", jointId: "travel" });
  // belt exit guide pulleys just inside the hoist window
  const pulleys = mergeMeshData(h.belt_offsets.map(([bx, bz]) => wheel(0.012, h.belt_width + 0.012, [bx, L.hoist.originY + 0.014, z0 + bz + (bz > 0 ? 0.012 : -0.012)])));
  sink.fixed("hoist_pulleys", "hoist_drive", "stainless", pulleys, { cutaway: "keep", jointId: "travel", pickable: false, castShadow: false, lod: "fine" });
  // belts: authored from the hoist origin (body underside) down by the base length; stretched by the hoist joint
  for (let i = 0; i < h.belt_offsets.length; i++) {
    const [bx, bz] = h.belt_offsets[i];
    const belt = chamferedBox([h.belt_width, h.belt_base_length, h.belt_thickness], 0.0005, [bx, L.hoist.originY - h.belt_base_length / 2, z0 + bz]);
    sink.fixed(`belt_${i}`, "hoist_belts", "belt_fabric", belt, { cutaway: "keep", jointId: "travel", stretch: { baseLength: h.belt_base_length, jointId: "hoist" }, castShadow: false });
  }
  // gripper plate (hoist joint)
  const gp = h.gripper_plate_size;
  const plate = chamferedBox(gp, 0.004, [0, (L.hoist.plateTopY + L.hoist.plateBottomY) / 2, z0]);
  const presence = chamferedBox([0.05, PRESENCE_SENSOR_HEIGHT, 0.05], 0.002, [0, L.hoist.plateBottomY - PRESENCE_SENSOR_HEIGHT / 2, z0]);
  const guides = mergeMeshData([chamferedBox([gp[0] - 0.04, 0.02, 0.04], 0.002, [0, L.hoist.plateBottomY - 0.01, z0 + 0.1]), chamferedBox([gp[0] - 0.04, 0.02, 0.04], 0.002, [0, L.hoist.plateBottomY - 0.01, z0 - 0.1])]);
  sink.fixed("gripper_plate", "gripper_plate", "painted_dark", mergeMeshData([plate, guides]), { cutaway: "keep", jointId: "hoist" });
  sink.fixed("presence_sensor", "gripper_plate", "painted_dark", presence, { cutaway: "keep", jointId: "hoist", pickable: false, castShadow: false });
  // finger guide rails along X and the finger actuator on the plate top; belt clamp blocks at the belt ends
  const rails = mergeMeshData([-1, 1].map((sd) => chamferedBox([gp[0] - 0.02, 0.012, 0.014], 0.002, [0, L.hoist.plateTopY + 0.006, z0 + sd * 0.035])));
  const actuator = wheel(0.022, 0.16, [0, L.hoist.plateTopY + 0.024, z0]);
  const clamps = mergeMeshData(h.belt_offsets.map(([bx, bz]) => chamferedBox([h.belt_width + 0.016, 0.018, 0.02], 0.002, [bx, L.hoist.plateTopY + 0.009, z0 + bz])));
  sink.fixed("gripper_mechanism", "gripper_plate", "stainless", mergeMeshData([rails, actuator, clamps]), { cutaway: "keep", jointId: "hoist", castShadow: false, lod: "fine" });
  // fingers (open pose): L-shaped: vertical leg + inward lip at the bottom; the open / closed gaps are between the lips
  const f = h.finger_size;
  const mkFinger = (sign: number): MeshData => {
    const x = sign * (L.gripper.openHalfGap + h.finger_lip);
    const leg = chamferedBox([f[0], f[1], f[2]], 0.002, [x + (sign * f[0]) / 2, L.hoist.plateBottomY - f[1] / 2, z0]);
    const lip = chamferedBox([h.finger_lip + f[0], FINGER_LIP_THICKNESS, f[2]], 0.002, [x - sign * (h.finger_lip / 2) + (sign * f[0]) / 2, L.hoist.fingerBottomY + FINGER_LIP_THICKNESS / 2, z0]);
    return mergeMeshData([leg, lip]);
  };
  sink.fixed("finger_a", "gripper_finger_a", "stainless", mkFinger(1), { cutaway: "keep", jointId: "gripper_a" });
  sink.fixed("finger_b", "gripper_finger_b", "stainless", mkFinger(-1), { cutaway: "keep", jointId: "gripper_b" });
  void rotateYMeshData;
  return sink.parts;
}
