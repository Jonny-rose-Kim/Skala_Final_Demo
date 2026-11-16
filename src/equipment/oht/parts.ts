/**
 * Procedural parts of the OHT: rail with hangers (fixed), bogies + body + hoist drive (travel joint),
 * stretchable belts (travel joint, scaled by the hoist extension), gripper plate (hoist joint) and
 * fingers (gripper_a / gripper_b joints). Rest pose: vehicle at rail start, hoist retracted, fingers open.
 */
import type { PartGeometry } from "../../geometry/chamberParts";
import { chamferedBox, mergeMeshData, revolveProfile, rotateYMeshData, translateMeshData, type MeshData, type Vec3 } from "../../geometry/meshlib";
import { PartSink, chamfRect } from "../../geometry/sharedParts";
import type { OhtLayout } from "./layout";

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
  const hangers: MeshData[] = [];
  const pads: MeshData[] = [];
  for (let z = r.z0 + 0.3; z <= r.z1 - 0.2; z += r.hanger_pitch) {
    for (const sx of [-1, 1]) {
      const rod = revolveProfile(chamfRect(0, r.hanger_radius, L.rail.topY, r.ceiling_y, 0.002), { segments: 12 });
      translateMeshData(rod, sx * (r.flange_width / 2 - 0.02), 0, z);
      hangers.push(rod);
    }
    pads.push(chamferedBox([r.ceiling_pad_size, 0.02, r.ceiling_pad_size], 0.003, [0, r.ceiling_y + 0.01, z]));
    hangers.push(chamferedBox([r.flange_width + 0.04, 0.02, 0.06], 0.002, [0, L.rail.topY + 0.01, z]));
  }
  sink.fixed("hangers", "ceiling_support", "dark_steel", mergeMeshData(hangers), { cutaway: "keep", castShadow: false });
  sink.fixed("ceiling_pads", "ceiling_support", "painted_housing", mergeMeshData(pads), { cutaway: "keep", castShadow: false });

  // ------------------------------------------------------------------ vehicle (travel joint; authored at the rail start)
  const v = cfg.vehicle;
  const z0 = r.z0;
  const bogieParts: MeshData[] = [];
  for (const dz of [-v.bogie_spacing / 2, v.bogie_spacing / 2]) {
    const frame = chamferedBox(v.bogie_size, 0.004, [0, L.vehicle.bogieY, z0 + dz]);
    bogieParts.push(frame);
    for (const sx of [-1, 1]) {
      bogieParts.push(wheel(v.wheel_radius, v.wheel_width, [sx * (r.flange_width / 2 + v.wheel_width / 2 + 0.004), L.rail.bottomY + r.flange_thickness + v.wheel_radius, z0 + dz]));
    }
  }
  sink.fixed("bogies", "bogies", "painted_dark", mergeMeshData(bogieParts), { cutaway: "keep", jointId: "travel" });
  const yoke = chamferedBox(v.yoke_size, 0.004, [0, L.vehicle.bodyY1 + v.body_top_gap / 2, z0]);
  const body = chamferedBox(v.body_size, 0.01, [0, (L.vehicle.bodyY0 + L.vehicle.bodyY1) / 2, z0]);
  const stripe = chamferedBox([v.body_size[0] + 0.004, 0.03, v.body_size[2] + 0.004], 0.002, [0, L.vehicle.bodyY0 + 0.06, z0]);
  sink.fixed("body", "vehicle_body", "painted_housing", mergeMeshData([body, yoke]), { cutaway: "keep", jointId: "travel" });
  sink.fixed("body_stripe", "vehicle_body", "safety_marking", stripe, { cutaway: "keep", jointId: "travel", pickable: false, castShadow: false });
  const fs = v.front_sensor_size;
  const sensor = chamferedBox(fs, 0.003, [0, L.vehicle.bodyY0 + 0.12, z0 + v.body_size[2] / 2 + fs[2] / 2]);
  const sensorDown = chamferedBox([fs[0], fs[2], fs[1]], 0.003, [v.body_size[0] / 2 - 0.06, L.vehicle.bodyY0 - fs[2] / 2, z0 + v.body_size[2] / 2 - 0.06]);
  sink.fixed("obstruction_sensor", "obstruction_sensor", "painted_dark", mergeMeshData([sensor, sensorDown]), { cutaway: "keep", jointId: "travel" });
  const h = cfg.hoist;
  const reels: MeshData[] = [];
  for (const [bx, bz] of h.belt_offsets) {
    const reel = wheel(0.035, 0.03, [bx, L.hoist.originY + 0.05, z0 + bz]);
    reels.push(reel);
  }
  const driveBox = chamferedBox([0.3, 0.1, 0.36], 0.004, [0, L.hoist.originY + 0.06, z0]);
  sink.fixed("hoist_drive", "hoist_drive", "dark_steel", mergeMeshData([driveBox, ...reels]), { cutaway: "keep", jointId: "travel" });
  // belts: authored from the hoist origin (body underside) down by the base length; stretched by the hoist joint
  for (let i = 0; i < h.belt_offsets.length; i++) {
    const [bx, bz] = h.belt_offsets[i];
    const belt = chamferedBox([h.belt_width, h.belt_base_length, h.belt_thickness], 0.0005, [bx, L.hoist.originY - h.belt_base_length / 2, z0 + bz]);
    sink.fixed(`belt_${i}`, "hoist_belts", "belt_fabric", belt, { cutaway: "keep", jointId: "travel", stretch: { baseLength: h.belt_base_length, jointId: "hoist" }, castShadow: false });
  }
  // gripper plate (hoist joint)
  const gp = h.gripper_plate_size;
  const plate = chamferedBox(gp, 0.004, [0, (L.hoist.plateTopY + L.hoist.plateBottomY) / 2, z0]);
  const presence = chamferedBox([0.05, 0.012, 0.05], 0.002, [0, L.hoist.plateBottomY - 0.006, z0]);
  const guides = mergeMeshData([chamferedBox([gp[0] - 0.04, 0.02, 0.04], 0.002, [0, L.hoist.plateBottomY - 0.01, z0 + 0.1]), chamferedBox([gp[0] - 0.04, 0.02, 0.04], 0.002, [0, L.hoist.plateBottomY - 0.01, z0 - 0.1])]);
  sink.fixed("gripper_plate", "gripper_plate", "painted_dark", mergeMeshData([plate, guides]), { cutaway: "keep", jointId: "hoist" });
  sink.fixed("presence_sensor", "gripper_plate", "painted_dark", presence, { cutaway: "keep", jointId: "hoist", pickable: false, castShadow: false });
  // fingers (open pose): L-shaped: vertical leg + inward lip at the bottom
  const f = h.finger_size;
  const mkFinger = (sign: number): MeshData => {
    const x = sign * L.gripper.openHalfGap;
    const leg = chamferedBox([f[0], f[1], f[2]], 0.002, [x + (sign * f[0]) / 2, L.hoist.plateBottomY - f[1] / 2, z0]);
    const lip = chamferedBox([h.finger_lip + f[0], 0.012, f[2]], 0.002, [x - sign * (h.finger_lip / 2) + (sign * f[0]) / 2, L.hoist.fingerBottomY + 0.006, z0]);
    return mergeMeshData([leg, lip]);
  };
  sink.fixed("finger_a", "gripper_finger_a", "stainless", mkFinger(1), { cutaway: "keep", jointId: "gripper_a" });
  sink.fixed("finger_b", "gripper_finger_b", "stainless", mkFinger(-1), { cutaway: "keep", jointId: "gripper_b" });
  void rotateYMeshData;
  return sink.parts;
}
