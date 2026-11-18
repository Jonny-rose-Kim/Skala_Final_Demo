/**
 * CMP dry-in / dry-out front end and wet zone (generic design assumption):
 *
 *   load port + dry EFEM with a backside-fork SCARA robot (dry, face-up wafers only)
 *   transfer tower at the EFEM back wall: spin dryer below (wet in from the wet side, dry out to the EFEM),
 *     flip station above (edge jaws on a horizontal axis: face up -> face down while clamped)
 *   wet robot with a dropped edge-grip end effector on a roll axis (clamps the wafer edge, may turn it over)
 *   brush cleaner (roller pair, edge drive rollers, spray bars, drain) and an end-effector rinse station
 *
 * Identity keeps the existing asset ids where the function stays (load_port, efem_enclosure, wet_transfer,
 * clean_module, brush_rollers, wafer_in_clean, dry_module, dry_chuck, wafer_in_dry) and adds the new
 * functional components. Geometry is authored in the instance frame at the rest pose.
 */
import type { ComponentDef, ConnectionDef, JointDef, PortDef } from "../../domain/types";
import { chamferedBox, mergeMeshData, rectProfile, revolveProfile, rotateYMeshData, translateMeshData, tubeAlongPath, type MeshData } from "../../geometry/meshlib";
import { PartSink, chamfRect } from "../../geometry/sharedParts";
import { waferHalfMeshes } from "../../geometry/waferParts";
import { buildScaraRobotParts, scaraRobotComponents, scaraRobotJoints, type ScaraRobotSpec } from "../handling/robotParts";
import { EFEM_FLOOR_RAISE, STATION_IDS, StationGeom, buildEfemParts, buildProcessEnclosureParts, type ProcessEnclosureSpec } from "../handling/stationParts";
import { efemComponents, loadPortJoints } from "../handling/stationTemplate";
import type { CmpLayout } from "./layout";

const mm = (label: string, valueM: number) => ({ label, valueM });

export const CMP_FE = {
  dryRobot: { base: "dry_robot_base", column: "dry_robot_column", arm1: "dry_robot_link1", arm2: "dry_robot_link2", ee: "dry_robot_end_effector", wafer: "wafer_on_dry_robot" },
  wetRobot: { base: "wet_robot_base", column: "wet_robot_column", arm1: "wet_robot_link1", arm2: "wet_robot_link2", wrist: "wet_robot_wrist", ee: "wet_robot_end_effector", wafer: "wafer_on_wet_robot", pusher: "wet_robot_clamp" },
  flipStation: "flip_station",
  flipRotor: "flip_rotor",
  flipJawA: "flip_jaw_a",
  flipJawB: "flip_jaw_b",
  waferFlip: "wafer_on_flip",
  dryer: "dry_module",
  dryChuck: "dry_chuck",
  dryerShutterWet: "dryer_shutter_wet",
  dryerShutterDry: "dryer_shutter_dry",
  waferDry: "wafer_in_dry",
  cleaner: "clean_module",
  cleanerShutter: "cleaner_shutter",
  brushUpper: "brush_rollers",
  brushLower: "brush_roller_lower",
  edgeRollersA: "cleaner_edge_rollers_a",
  edgeRollersB: "cleaner_edge_rollers_b",
  waferClean: "wafer_in_clean",
  rinse: "ee_rinse_station",
  wetZone: "wet_transfer",
  enclosure: "process_enclosure",
  facility: "facility_interface",
} as const;

export const CMP_FE_JOINTS = {
  flipRoll: "flip_roll",
  flipJawA: "flip_jaw_a",
  flipJawB: "flip_jaw_b",
  dryChuckZ: "dry_chuck_z",
  drySpin: "dry_spin",
  dryerShutterWet: "dryer_shutter_wet",
  dryerShutterDry: "dryer_shutter_dry",
  cleanShutter: "clean_shutter",
  brushUp: "clean_brush_up",
  brushUpSpin: "clean_brush_up_spin",
  brushLow: "clean_brush_low",
  brushLowSpin: "clean_brush_low_spin",
  rollersA: "clean_rollers_a",
  rollersB: "clean_rollers_b",
} as const;

const F = CMP_FE;
const FJ = CMP_FE_JOINTS;

export function dryRobotSpec(L: CmpLayout): ScaraRobotSpec {
  const r = L.cfg.front_end.dry_robot;
  return {
    prefix: "dry",
    ids: { ...F.dryRobot },
    assembly: "dry_robot",
    nameKo: "Dry robot",
    axisXZ: L.front.dry.geom.axisXZ,
    d0: L.front.dry.geom.d0,
    floorY: L.front.dry.floorY,
    baseTopY: L.front.dry.baseTopY,
    shoulderY0: L.front.dry.shoulderY0,
    baseRadius: r.base_radius,
    columnRadius: r.column_radius,
    zStroke: r.z_stroke,
    linkLength: r.link_length,
    linkWidth: r.link_width,
    link1T: r.link1_thickness,
    link2T: r.link2_thickness,
    hubRadius: r.hub_radius,
    eeReach: r.ee_reach,
    eeMountH: r.ee_mount_height ?? 0.008,
    eeThickness: r.ee_thickness,
    padH: r.pad_height,
    tineQ: r.tine_q,
    tipBeyond: r.tip_beyond_center ?? 0.12,
    ee: { kind: "fork" },
    waferRadius: L.rWafer,
    waferThickness: L.waferThickness,
  };
}

export function wetRobotSpec(L: CmpLayout): ScaraRobotSpec {
  const r = L.cfg.front_end.wet_robot;
  return {
    prefix: "wet",
    ids: { ...F.wetRobot },
    assembly: "wet_robot",
    nameKo: "Wet robot",
    axisXZ: L.front.wet.geom.axisXZ,
    d0: L.front.wet.geom.d0,
    floorY: L.front.wet.floorY,
    baseTopY: L.front.wet.baseTopY,
    shoulderY0: L.front.wet.shoulderY0,
    baseRadius: r.base_radius,
    columnRadius: r.column_radius,
    zStroke: r.z_stroke,
    linkLength: r.link_length,
    linkWidth: r.link_width,
    link1T: r.link1_thickness,
    link2T: r.link2_thickness,
    hubRadius: r.hub_radius,
    eeReach: r.ee_reach,
    eeMountH: 0,
    eeThickness: r.ee_thickness,
    padH: r.pad_height,
    tineQ: r.tine_q,
    tipBeyond: 0.165,
    ee: { kind: "edge_grip", drop: r.drop ?? 0.18, gripStroke: r.grip_stroke ?? 0.008, tineQ: r.tine_q },
    waferRadius: L.rWafer,
    waferThickness: L.waferThickness,
    bodyMaterial: "polymer_white",
    overhead: L.front.wet.overhead,
  };
}

export function cmpFrontJoints(L: CmpLayout): JointDef[] {
  const Fl = L.front;
  const tw = Fl.tower;
  const fe = L.cfg.front_end;
  const cl = Fl.cleaner;
  const t = L.waferThickness;
  return [
    ...loadPortJoints(Fl.az, { seatR: Fl.loadPort.seatR, deckTopY: Fl.loadPort.deckTopY, r1: Fl.efem.r1, openingCenterY: Fl.loadPort.opening.centerY, qc: Fl.efem.qc, dockStroke: Fl.loadPort.dockStroke, doorPull: Fl.loadPort.doorPull, doorLower: Fl.loadPort.doorLower }),
    ...scaraRobotJoints(dryRobotSpec(L)),
    ...scaraRobotJoints(wetRobotSpec(L)),
    { jointId: FJ.flipRoll, name: "Flip station roll", kind: "revolute", origin: [tw.x, tw.flipAxisY, tw.z], axis: [0, 0, 1], range: [0, Math.PI], unit: "rad", homeNote: "0 = face-up 수취 자세, pi = 뒤집어 face-down. Jaw가 wafer edge를 clamp한 상태에서만 회전" },
    { jointId: FJ.flipJawA, name: "Flip jaw A", parentJointId: FJ.flipRoll, kind: "prismatic", origin: [0, 0, 0], axis: [0, 0, -1], range: [0, fe.tower.flip_jaw_travel], unit: "m", homeNote: "0 = 열림, travel = wafer edge clamp" },
    { jointId: FJ.flipJawB, name: "Flip jaw B", parentJointId: FJ.flipRoll, kind: "prismatic", origin: [0, 0, 0], axis: [0, 0, 1], range: [0, fe.tower.flip_jaw_travel], unit: "m", homeNote: "0 = 열림, travel = wafer edge clamp" },
    { jointId: FJ.dryChuckZ, name: "Dryer chuck lift", kind: "prismatic", origin: [tw.x, tw.dryerPlaneY, tw.z], axis: [0, 1, 0], range: [-tw.spinDrop, 0], unit: "m", homeNote: "0 = bowl 위 교환 높이, 음수 = bowl 안 spin 위치" },
    { jointId: FJ.drySpin, name: "Dry spindle rotation", parentJointId: FJ.dryChuckZ, kind: "revolute", origin: [0, 0, 0], axis: [0, 1, 0], range: [-1e6, 1e6], unit: "rad", homeNote: "Spindle index = 0 rad (scripted)", freezeInCutaway: true },
    { jointId: FJ.dryerShutterWet, name: "Dryer wet-side shutter", kind: "prismatic", origin: [tw.x + tw.half, tw.dryerPlaneY, tw.z], axis: [0, -1, 0], range: [0, fe.tower.shutter_travel], unit: "m", homeNote: "0 = 닫힘, travel = wet robot 반입 opening 개방" },
    { jointId: FJ.dryerShutterDry, name: "Dryer dry-side shutter", kind: "prismatic", origin: [tw.x - tw.half, tw.dryerPlaneY, tw.z], axis: [0, -1, 0], range: [0, fe.tower.shutter_travel], unit: "m", homeNote: "0 = 닫힘, travel = dry robot 반출 opening 개방" },
    { jointId: FJ.cleanShutter, name: "Cleaner shutter", kind: "prismatic", origin: [cl.x, cl.planeY, cl.z - cl.size[2] / 2], axis: [0, -1, 0], range: [0, fe.cleaner.shutter_travel], unit: "m", homeNote: "0 = 닫힘, travel = opening 개방" },
    { jointId: FJ.brushUp, name: "Upper brush lift", kind: "prismatic", origin: [cl.x, cl.planeY + t + fe.cleaner.roller_radius, cl.z], axis: [0, 1, 0], range: [0, fe.cleaner.brush_travel], unit: "m", homeNote: "0 = wafer 윗면 접촉, travel = 위로 후퇴" },
    { jointId: FJ.brushUpSpin, name: "Upper brush rotation", parentJointId: FJ.brushUp, kind: "revolute", origin: [0, 0, 0], axis: [1, 0, 0], range: [-1e6, 1e6], unit: "rad", homeNote: "Scripted spin (no speed data)" },
    { jointId: FJ.brushLow, name: "Lower brush lift", kind: "prismatic", origin: [cl.x, cl.planeY - fe.cleaner.roller_radius, cl.z], axis: [0, -1, 0], range: [0, fe.cleaner.brush_travel], unit: "m", homeNote: "0 = wafer 아랫면 접촉, travel = 아래로 후퇴" },
    { jointId: FJ.brushLowSpin, name: "Lower brush rotation", parentJointId: FJ.brushLow, kind: "revolute", origin: [0, 0, 0], axis: [1, 0, 0], range: [-1e6, 1e6], unit: "rad", homeNote: "Scripted spin (no speed data)" },
    { jointId: FJ.rollersA, name: "Edge rollers (+X arm)", kind: "prismatic", origin: [cl.x, cl.planeY, cl.z], axis: [-1, 0, 0], range: [0, fe.cleaner.edge_roller_travel], unit: "m", homeNote: "0 = 열림, travel = wafer edge에 닿아 회전 구동" },
    { jointId: FJ.rollersB, name: "Edge rollers (-X arm)", kind: "prismatic", origin: [cl.x, cl.planeY, cl.z], axis: [1, 0, 0], range: [0, fe.cleaner.edge_roller_travel], unit: "m", homeNote: "0 = 열림, travel = wafer edge에 닿아 회전 구동" },
  ];
}

export function cmpFrontComponents(L: CmpLayout): ComponentDef<CmpLayout>[] {
  const out: [number, number, number] = [-1, 0, 0];
  const UP = (d: number) => ({ dir: [0, 1, 0] as [number, number, number], distance: d });
  const Z = (d: number) => ({ dir: [0, 0, 1] as [number, number, number], distance: d });
  const X = (d: number) => ({ dir: [1, 0, 0] as [number, number, number], distance: d });
  const basis = "Generic CMP dry-in / dry-out 구조(대기측 robot, wet robot, flip, brush clean, spin dry). 특정 제조사 배치를 복제하지 않았다.";
  return [
    ...efemComponents<CmpLayout>((L) => {
      const fe = L.cfg.front_end;
      const lp = L.front.loadPort;
      return { depth: fe.efem.depth, width: fe.efem.width, height: fe.efem.height_above_floor, ffuHeight: fe.efem.ffu_height, deckHeight: lp.deckTopY, deckDepth: fe.load_port.deck_depth, openingW: lp.opening.width, openingH: lp.opening.y1 - lp.opening.y0, dockStroke: lp.dockStroke, doorPull: lp.doorPull, doorLower: lp.doorLower };
    }, out, basis),
    ...scaraRobotComponents<CmpLayout>(dryRobotSpec(L), mm, { basis, assumptions: ["Dry robot은 dry, face-up wafer만 다룬다(FOUP, flip station 수취, dryer 반출).", "Joint 값은 scripted presentation이며 encoder feedback이 아니다."] }),
    ...scaraRobotComponents<CmpLayout>(wetRobotSpec(L), mm, { basis, assumptions: ["Wet robot은 edge를 clamp한 상태에서만 roll 축으로 wafer를 뒤집는다.", "Dirty-wet wafer(load cup → cleaner)를 옮긴 뒤 end effector rinse 단계를 거쳐 clean-ready 상태가 된 다음에만 clean-wet wafer(cleaner → dryer)를 잡는다.", "Joint 값은 scripted presentation이다."] }),
    { assetId: F.flipStation, nodeKey: "front.flip.station", name: "Flip station frame + rotary actuator", kind: "station", assembly: "transfer_tower", description: "Dryer 위에 있는 pass-through flip station. Dry robot이 face-up wafer를 넣으면 jaw가 edge를 clamp하고 수평 축으로 180도 돌려 face-down으로 wet robot에 넘긴다.", materialRef: "aluminum_anodized", materialNote: "Frame, rotary actuator (가정)", selectable: true, explode: UP(0.35), cutaway: "keep", dimensions: (L) => [mm("Flip plane height", L.front.tower.flipPlaneY)], structuralBasis: basis },
    { assetId: F.flipRotor, nodeKey: "front.flip.rotor", name: "Flip rotor (jaw yoke)", kind: "station", assembly: "transfer_tower", parentAssetId: F.flipStation, description: "Jaw 두 개를 지지하며 roll 축으로 도는 yoke.", materialRef: "stainless", materialNote: "Stainless yoke (가정)", selectable: true, explode: UP(0.4), cutaway: "keep", jointId: FJ.flipRoll, dimensions: () => [] },
    { assetId: F.flipJawA, nodeKey: "front.flip.jaw_a", name: "Flip jaw A", kind: "gripper", assembly: "transfer_tower", parentAssetId: F.flipRotor, description: "Wafer edge를 V-notch로 잡는 jaw.", materialRef: "polymer_white", materialNote: "PEEK V-notch jaw (가정)", selectable: true, explode: Z(0.15), cutaway: "keep", jointId: FJ.flipJawA, dimensions: (L) => [mm("Jaw travel", L.cfg.front_end.tower.flip_jaw_travel)] },
    { assetId: F.flipJawB, nodeKey: "front.flip.jaw_b", name: "Flip jaw B", kind: "gripper", assembly: "transfer_tower", parentAssetId: F.flipRotor, description: "Wafer edge를 V-notch로 잡는 jaw.", materialRef: "polymer_white", materialNote: "PEEK V-notch jaw (가정)", selectable: true, explode: Z(-0.15), cutaway: "keep", jointId: FJ.flipJawB, dimensions: (L) => [mm("Jaw travel", L.cfg.front_end.tower.flip_jaw_travel)] },
    { assetId: F.waferFlip, nodeKey: "front.flip.wafer", name: "Wafer in the flip station", kind: "wafer", assembly: "transfer_tower", parentAssetId: F.flipRotor, description: "Flip jaw에 clamp된 wafer 표시. 파란 쪽이 frontside다.", materialRef: "silicon_wafer", materialNote: "Presentation (frontside tinted)", selectable: true, explode: UP(0.45), cutaway: "keep", jointId: FJ.flipRoll, dimensions: (L) => [mm("Diameter", L.rWafer * 2)] },
    {
      assetId: F.dryer,
      nodeKey: "post.dry_module",
      name: "Spin dryer (housing, bowl, shutters frame, drain)",
      kind: "module",
      assembly: "post_cmp",
      description: "Transfer tower 아래층의 spin dryer. Wet 쪽 opening으로 clean-wet wafer가 들어오고, spin dry 후 EFEM 쪽 opening으로 dry robot이 꺼낸다(반입과 반출 attachment frame이 다르다). Bowl과 drain을 포함하며 lid는 점검용 cover다.",
      materialRef: "polymer_gray",
      materialNote: "PP / PVC housing, PVDF bowl (가정)",
      selectable: true,
      explode: X(-0.2),
      cutaway: "keep",
      dimensions: (L) => [mm("Exchange plane", L.front.tower.dryerPlaneY), mm("Bowl diameter", L.cfg.front_end.tower.bowl_radius * 2), mm("Spin drop", L.front.tower.spinDrop)],
      structuralBasis: basis,
      label: { text: "Spin dryer", priority: 2 },
    },
    { assetId: F.dryChuck, nodeKey: "post.dry_chuck", name: "Spin chuck", kind: "drive", assembly: "post_cmp", parentAssetId: F.dryer, description: "교환 높이와 bowl 안 spin 위치 사이를 오르내리고 회전하는 vacuum chuck. Dry robot fork는 chuck 양옆으로 들어온다.", materialRef: "stainless", materialNote: "Stainless chuck (가정)", selectable: true, explode: UP(0.25), cutaway: "keep", jointId: FJ.drySpin, dimensions: (L) => [mm("Chuck diameter", L.dry.rChuck * 2)] },
    { assetId: F.dryerShutterWet, nodeKey: "post.dry_shutter_wet", name: "Dryer wet-side shutter", kind: "access", assembly: "post_cmp", parentAssetId: F.dryer, description: "Wet robot 반입 opening의 shutter.", materialRef: "polymer_gray", materialNote: "PVC shutter (가정)", selectable: true, explode: X(0.15), cutaway: "keep", jointId: FJ.dryerShutterWet, dimensions: () => [] },
    { assetId: F.dryerShutterDry, nodeKey: "post.dry_shutter_dry", name: "Dryer dry-side shutter", kind: "access", assembly: "post_cmp", parentAssetId: F.dryer, description: "Dry robot 반출 opening(EFEM 쪽)의 shutter.", materialRef: "polymer_gray", materialNote: "PVC shutter (가정)", selectable: true, explode: X(-0.15), cutaway: "keep", jointId: FJ.dryerShutterDry, dimensions: () => [] },
    { assetId: F.waferDry, nodeKey: "post.dry_wafer", name: "Wafer on the spin chuck", kind: "wafer", assembly: "post_cmp", parentAssetId: F.dryChuck, description: "Spin chuck 위 wafer 표시 (holder = dry_module).", materialRef: "silicon_wafer", materialNote: "Presentation (frontside tinted)", selectable: true, explode: UP(0.3), cutaway: "keep", jointId: FJ.drySpin, dimensions: (L) => [mm("Diameter", L.rWafer * 2)] },
    {
      assetId: F.cleaner,
      nodeKey: "post.clean_module",
      name: "Brush cleaner (housing, spray bars, drain)",
      kind: "module",
      assembly: "post_cmp",
      description: "연마 후 wafer의 양면을 brush roller pair로 문지르고 rinse하는 cleaner. Edge roller가 wafer를 돌린다. 접근 opening은 wet robot 쪽에 있고 lid는 점검용 cover다. 세정 성능 수치는 없다.",
      materialRef: "polymer_gray",
      materialNote: "PP / PVC housing (가정)",
      selectable: true,
      explode: Z(0.2),
      cutaway: "keep",
      dimensions: (L) => [mm("Width", L.clean.size[0]), mm("Height", L.clean.size[1]), mm("Depth", L.clean.size[2]), mm("Wafer plane", L.front.cleaner.planeY)],
      structuralBasis: basis,
      label: { text: "Brush cleaner", priority: 2 },
    },
    { assetId: F.cleanerShutter, nodeKey: "post.clean_shutter", name: "Cleaner shutter", kind: "access", assembly: "post_cmp", parentAssetId: F.cleaner, description: "Cleaner 접근 opening의 shutter.", materialRef: "polymer_gray", materialNote: "PVC shutter (가정)", selectable: true, explode: Z(-0.12), cutaway: "keep", jointId: FJ.cleanShutter, dimensions: () => [] },
    { assetId: F.brushUpper, nodeKey: "post.brush_rollers", name: "Brush roller (upper)", kind: "module", assembly: "post_cmp", parentAssetId: F.cleaner, description: "Wafer 윗면(frontside)을 문지르는 PVA brush roller. 세정 때 내려와 닿고 회전한다.", materialRef: "polymer_white", materialNote: "PVA sponge roller on a core (가정)", selectable: true, explode: UP(0.12), cutaway: "keep", jointId: FJ.brushUpSpin, dimensions: (L) => [mm("Roller diameter", L.clean.rRoller * 2), mm("Roller length", L.clean.rollerLen)] },
    { assetId: F.brushLower, nodeKey: "post.brush_roller_lower", name: "Brush roller (lower)", kind: "module", assembly: "post_cmp", parentAssetId: F.cleaner, description: "Wafer 아랫면(backside)을 문지르는 PVA brush roller.", materialRef: "polymer_white", materialNote: "PVA sponge roller on a core (가정)", selectable: true, explode: UP(-0.12), cutaway: "keep", jointId: FJ.brushLowSpin, dimensions: (L) => [mm("Roller diameter", L.clean.rRoller * 2)] },
    { assetId: F.edgeRollersA, nodeKey: "post.edge_rollers_a", name: "Edge drive rollers (+X arm)", kind: "drive", assembly: "post_cmp", parentAssetId: F.cleaner, description: "Wafer edge를 홈으로 잡고 돌리는 roller 두 개.", materialRef: "polymer_white", materialNote: "Grooved PEEK rollers (가정)", selectable: true, explode: X(0.1), cutaway: "keep", jointId: FJ.rollersA, dimensions: (L) => [mm("Roller travel", L.cfg.front_end.cleaner.edge_roller_travel)] },
    { assetId: F.edgeRollersB, nodeKey: "post.edge_rollers_b", name: "Edge drive rollers (-X arm)", kind: "drive", assembly: "post_cmp", parentAssetId: F.cleaner, description: "Wafer edge를 홈으로 잡고 돌리는 roller 두 개.", materialRef: "polymer_white", materialNote: "Grooved PEEK rollers (가정)", selectable: true, explode: X(-0.1), cutaway: "keep", jointId: FJ.rollersB, dimensions: (L) => [mm("Roller travel", L.cfg.front_end.cleaner.edge_roller_travel)] },
    { assetId: F.waferClean, nodeKey: "post.clean_wafer", name: "Wafer in the cleaner", kind: "wafer", assembly: "post_cmp", parentAssetId: F.cleaner, description: "Cleaner edge roller 사이의 wafer 표시 (holder = clean_module).", materialRef: "silicon_wafer", materialNote: "Presentation (frontside tinted)", selectable: true, explode: UP(0.2), cutaway: "keep", dimensions: (L) => [mm("Diameter", L.rWafer * 2)] },
    { assetId: F.rinse, nodeKey: "wet.ee_rinse", name: "End-effector rinse station", kind: "module", assembly: "wet_robot", description: "Dirty-wet wafer를 옮긴 wet robot end effector를 DIW로 rinse하는 box. 이 단계 뒤 end effector는 clean-ready 상태가 된다(표시용 상태, 측정 아님).", materialRef: "polymer_gray", materialNote: "PVC box with spray nozzles (가정)", selectable: true, explode: UP(0.2), cutaway: "keep", dimensions: (L) => [mm("Rinse plane", L.front.rinse.planeY)] },
    { assetId: F.wetZone, nodeKey: "station.wet_transfer", name: "Wet zone frame (deck, splash shields, drip tray)", kind: "enclosure", assembly: "wet_robot", description: "Wet robot, cleaner, rinse station이 놓인 deck와 낮은 splash shield, wet robot 아래 drip tray와 drain. v1.0의 불투명 wet transfer tunnel을 대체했다.", materialRef: "polymer_gray", materialNote: "PVC shields on a painted frame (가정)", selectable: true, explode: UP(-0.1), cutaway: "keep", dimensions: (L) => [mm("Deck length", L.cfg.front_end.wet_deck.x1 - L.cfg.front_end.wet_deck.x0), mm("Deck width", L.cfg.front_end.wet_deck.z1 - L.cfg.front_end.wet_deck.z0)] },
    {
      assetId: F.enclosure,
      nodeKey: "enclosure.process",
      name: "Wet process enclosure (frame + service panels)",
      kind: "enclosure",
      assembly: "tool_enclosure",
      description: "Polishing, wet robot, cleaner, dryer를 둘러싼 panel assembly. -Z에 viewing window, +Z에 maintenance panel, 후면에 facility cut-out. 점검 모드에서 cover를 표시상 제거한다.",
      materialRef: "painted_offwhite",
      materialNote: "Off-white powder-coated panels on an anodized frame (가정)",
      selectable: true,
      shell: true,
      explode: UP(0.0),
      cutaway: "keep",
      dimensions: () => [],
      label: { text: "Wet process enclosure", priority: 1 },
    },
    { assetId: F.facility, nodeKey: "enclosure.facility_interface", name: "Facility interface (slurry / DIW / drain / exhaust / power)", kind: "frame", assembly: "tool_enclosure", parentAssetId: F.enclosure, description: "후면 bulkhead. Slurry 공급, DIW, drain, exhaust, 전원이 들어오는 위치. 유량과 사양은 정하지 않았다.", materialRef: "stainless", materialNote: "Bulkhead fittings (가정)", selectable: true, explode: X(0.2), cutaway: "keep", dimensions: () => [] },
  ];
}

export function cmpFrontPorts(): PortDef[] {
  return [
    { portId: "seat", assetId: STATION_IDS.loadPort, medium: "carrier", role: "bidirectional", name: "FOUP seating" },
    { portId: "door", assetId: STATION_IDS.loadPort, medium: "wafer", role: "bidirectional", name: "FOUP door interface" },
    { portId: "pins", assetId: STATION_IDS.dock, medium: "carrier", role: "bidirectional", name: "Kinematic coupling pins" },
    { portId: "door", assetId: STATION_IDS.opener, medium: "carrier", role: "bidirectional", name: "Latch keys" },
    { portId: "atm", assetId: STATION_IDS.efem, medium: "wafer", role: "bidirectional", name: "FOUP side" },
    { portId: "tower", assetId: STATION_IDS.efem, medium: "wafer", role: "bidirectional", name: "Transfer tower side" },
    { portId: "wafer", assetId: F.dryRobot.ee, medium: "wafer", role: "bidirectional", name: "Fork (backside support, dry only)" },
    { portId: "wafer", assetId: F.wetRobot.ee, medium: "wafer", role: "bidirectional", name: "Edge-grip fork" },
    { portId: "wafer", assetId: F.flipRotor, medium: "wafer", role: "bidirectional", name: "Flip jaws" },
    { portId: "in", assetId: F.dryer, medium: "wafer", role: "bidirectional", name: "Wet-side opening (in)" },
    { portId: "out", assetId: F.dryer, medium: "wafer", role: "bidirectional", name: "Dry-side opening (out)" },
    { portId: "chuck", assetId: F.dryChuck, medium: "wafer", role: "bidirectional", name: "Chuck face" },
    { portId: "in", assetId: F.cleaner, medium: "wafer", role: "bidirectional", name: "Access opening" },
    { portId: "drain", assetId: F.cleaner, medium: "liquid", role: "outlet", name: "Drain" },
    { portId: "drain", assetId: F.dryer, medium: "liquid", role: "outlet", name: "Bowl drain" },
    { portId: "rinse", assetId: F.rinse, medium: "liquid", role: "bidirectional", name: "Rinse spray" },
    { portId: "drain", assetId: F.wetZone, medium: "liquid", role: "inlet", name: "Drip tray drain" },
    { portId: "diw", assetId: F.facility, medium: "liquid", role: "outlet", name: "DIW supply" },
    { portId: "drain", assetId: F.facility, medium: "liquid", role: "inlet", name: "Facility drain" },
    { portId: "slurry", assetId: F.facility, medium: "liquid", role: "outlet", name: "Slurry supply" },
  ];
}

const c = (connectionId: string, kind: ConnectionDef["kind"], from: [string, string], to: [string, string], description: string): ConnectionDef => ({ connectionId, kind, from: { assetId: from[0], portId: from[1] }, to: { assetId: to[0], portId: to[1] }, description });

export function cmpFrontConnections(): ConnectionDef[] {
  return [
    c("wafer.loadport-efem", "wafer", [STATION_IDS.loadPort, "door"], [STATION_IDS.efem, "atm"], "FOUP door into the dry EFEM"),
    c("carrier.dock-pins", "carrier", [STATION_IDS.loadPort, "seat"], [STATION_IDS.dock, "pins"], "Seat on the dock plate pins"),
    c("wafer.loadport-dryrobot", "wafer", [STATION_IDS.loadPort, "door"], [F.dryRobot.ee, "wafer"], "FOUP slot to dry robot fork (dry, face up)"),
    c("wafer.dryrobot-flip", "wafer", [F.dryRobot.ee, "wafer"], [F.flipRotor, "wafer"], "Dry robot to flip jaws (face up)"),
    c("wafer.flip-wetrobot", "wafer", [F.flipRotor, "wafer"], [F.wetRobot.ee, "wafer"], "Flip jaws to wet robot clamp (face down)"),
    c("wafer.wetrobot-cup", "wafer", [F.wetRobot.ee, "wafer"], ["load_cup", "transfer"], "Wet robot to load cup (face down)"),
    c("wafer.cup-wetrobot", "wafer", ["load_cup", "transfer"], [F.wetRobot.ee, "wafer"], "Load cup to wet robot after polish (dirty-wet)"),
    c("wafer.wetrobot-cleaner", "wafer", [F.wetRobot.ee, "wafer"], [F.cleaner, "in"], "Wet robot to cleaner (turned face up while clamped)"),
    c("wafer.cleaner-wetrobot", "wafer", [F.cleaner, "in"], [F.wetRobot.ee, "wafer"], "Cleaner to wet robot (clean-wet, after the end-effector rinse)"),
    c("wafer.wetrobot-dryer", "wafer", [F.wetRobot.ee, "wafer"], [F.dryer, "in"], "Wet robot into the dryer (wet side)"),
    c("wafer.dryer-chuck", "wafer", [F.dryer, "in"], [F.dryChuck, "chuck"], "Dryer opening to spin chuck"),
    c("wafer.dryer-dryrobot", "wafer", [F.dryer, "out"], [F.dryRobot.ee, "wafer"], "Dryer dry side to dry robot (dry only)"),
    c("wafer.efem-tower", "wafer", [STATION_IDS.efem, "tower"], [F.dryer, "out"], "EFEM back wall pass-through to the tower"),
    c("liq.cleaner-drain", "liquid", [F.cleaner, "drain"], [F.wetZone, "drain"], "Cleaner drain to the wet zone drain"),
    c("liq.dryer-drain", "liquid", [F.dryer, "drain"], [F.wetZone, "drain"], "Dryer bowl drain"),
    c("liq.diw-rinse", "liquid", [F.facility, "diw"], [F.rinse, "rinse"], "DIW supply to the end-effector rinse"),
  ];
}

export function cmpWaferAssets(): string[] {
  return ["wafer", "wafer_on_cup", F.waferClean, F.waferDry, F.dryRobot.wafer, F.waferFlip, F.wetRobot.wafer];
}

export function cmpEnclosureSpec(L: CmpLayout): ProcessEnclosureSpec {
  const e = L.cfg.front_end.enclosure;
  const fe = L.cfg.front_end;
  return {
    x0: e.x0 + 0.02,
    x1: e.x1,
    z0: e.z0,
    z1: e.z1,
    topY: e.top_y,
    stationOpening: { halfQ: fe.efem.width / 2 + 0.01, y0: 0, y1: e.top_y + 1, centerZ: fe.efem.center_z },
    // the overhead wet robot housing passes through the top panel
    topCut: { x: L.front.wet.geom.axisXZ[0], z: L.front.wet.geom.axisXZ[1], half: fe.wet_robot.base_radius + 0.05 },
    window: e.window,
    facility: e.facility,
  };
}

/** Front end + wet zone geometry. */
export function buildCmpFrontParts(sink: PartSink, L: CmpLayout): void {
  const Fl = L.front;
  const fe = L.cfg.front_end;
  const t = L.waferThickness;
  const R = L.rWafer;
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c = 0.003) => chamferedBox([Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0)], Math.min(c, Math.abs(x1 - x0) / 4, (y1 - y0) / 4, Math.abs(z1 - z0) / 4), [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]);
  const cyl = (r: number, y0: number, y1: number, x: number, z: number, seg = 32, c = 0.002, rIn = 0) => translateMeshData(revolveProfile(chamfRect(rIn, r, y0, y1, Math.min(c, (y1 - y0) / 3, (r - rIn) / 3)), { segments: seg }), x, 0, z);
  // ---------------------------------------------------------------- dry EFEM + load port (station frame az = pi)
  const g = new StationGeom(Fl.az, sink);
  const tw = Fl.tower;
  buildEfemParts(g, {
    qc: Fl.efem.qc,
    r0: Fl.efem.r0,
    r1: Fl.efem.r1,
    width: Fl.efem.width,
    floorY: 0,
    topY: Fl.efem.topY,
    ffuTopY: Fl.efem.ffuTopY,
    panelT: fe.efem.panel_thickness,
    frameSize: fe.efem.frame_size,
    backHoles: [{ y0: L.deckTopY, y1: tw.flipTopY + 0.01, q0: -tw.half - 0.005, q1: tw.half + 0.005 }],
    windowY: [Fl.dry.shoulderY0 + 0.1, Fl.dry.shoulderY0 + 0.75],
    loadPort: { ...Fl.loadPort, couplingPads: Fl.foup.couplingPads },
  });
  buildScaraRobotParts(sink, dryRobotSpec(L));
  buildScaraRobotParts(sink, wetRobotSpec(L));
  // ---------------------------------------------------------------- wet deck, splash shields, drip tray under the wet robot
  {
    const wd = fe.wet_deck;
    const top = L.deckTopY;
    const dt = L.cfg.base.deck_thickness;
    const deck = mergeMeshData([box(wd.x0, wd.x1, top - dt, top, wd.z0, wd.z1, 0.004), box(wd.x0, wd.strip_x1, top - dt, top, wd.strip_z0, wd.z0, 0.004)]);
    const frame = mergeMeshData([box(wd.x0 + 0.06, wd.x1 - 0.06, 0.04, top - dt, wd.z0 + 0.06, wd.z1 - 0.06, 0.008), box(wd.x0 + 0.04, wd.strip_x1 - 0.04, 0.04, top - dt, wd.strip_z0 + 0.04, wd.z0, 0.006)]);
    const shields: MeshData[] = [];
    const sh = 0.22;
    shields.push(box(wd.x0 + 0.47, wd.x1, top, top + sh, wd.z1 - 0.01, wd.z1, 0.002));
    shields.push(box(wd.x1 - 0.01, wd.x1, top, top + sh, wd.z0, wd.z1, 0.002));
    sink.fixed("wet_deck", F.wetZone, "painted_offwhite", deck, { cutaway: "keep" });
    sink.fixed("wet_frame", F.wetZone, "painted_offwhite", frame, { cutaway: "keep" });
    sink.fixed("wet_shields", F.wetZone, "polymer_gray", mergeMeshData(shields), { cutaway: "keep", castShadow: false });
    const [wx, wz] = Fl.wet.geom.axisXZ;
    // drip tray on the wet deck under the overhead wet robot (the wafer is carried and turned over above it)
    const tray = revolveProfile([[0, top], [0.24, top], [0.24, top + 0.03], [0.235, top + 0.03], [0.235, top + 0.006], [0, top + 0.006]], { segments: 64 });
    translateMeshData(tray, wx, 0, wz);
    const drain = tubeAlongPath([[wx + 0.2, top + 0.002, wz + 0.12], [wx + 0.2, top - 0.1, wz + 0.12], [wx + 0.45, top - 0.1, wz + 0.12], [wx + 0.45, 0.06, wz + 0.12]], 0.012, { segments: 12, cornerRadius: 0.04 });
    sink.fixed("wet_drip_tray", F.wetZone, "polymer_gray", mergeMeshData([tray, drain]), { cutaway: "keep", castShadow: false });
    // wet robot: sealed bellows boot where the column leaves the housing flange (part of the base)
    const by = Fl.wet.overhead.beamTopY;
    const bell = revolveProfile([[0.072, by - 0.05], [0.082, by - 0.044], [0.076, by - 0.036], [0.086, by - 0.028], [0.08, by - 0.02], [0.09, by - 0.012], [0.09, by], [0.072, by]], { segments: 40 });
    translateMeshData(bell, wx, 0, wz);
    sink.fixed("wet_robot_seal", F.wetRobot.base, "rubber_membrane", bell, { cutaway: "keep", castShadow: false });
  }
  // ---------------------------------------------------------------- transfer tower: spin dryer (lower) + flip station (upper)
  {
    const x0 = tw.x - tw.half;
    const x1 = tw.x + tw.half;
    const z0 = tw.z - tw.half;
    const z1 = tw.z + tw.half;
    const yb = L.deckTopY;
    const yt = tw.dryerTopY;
    const op = { y0: tw.dryerPlaneY - fe.tower.shutter_height / 2 - 0.004, y1: tw.dryerPlaneY + fe.tower.shutter_height / 2 - 0.004 };
    const wt = 0.012;
    // housing walls with the two openings (+X wet side, -X dry side)
    const wallX = (xa: number, xb: number) => mergeMeshData([box(xa, xb, yb, op.y0, z0, z1), box(xa, xb, op.y1, yt, z0, z1), box(xa, xb, op.y0, op.y1, z0, tw.z - 0.17), box(xa, xb, op.y0, op.y1, tw.z + 0.17, z1)]);
    const housing = mergeMeshData([wallX(x0, x0 + wt), wallX(x1 - wt, x1), box(x0, x1, yb, yt, z0, z0 + wt), box(x0, x1, yb, yt, z1 - wt, z1)]);
    sink.fixed("dryer_housing", F.dryer, "polymer_gray", housing, { cutaway: "keep" });
    sink.fixed("dryer_lid", F.dryer, "polymer_gray", box(x0, x1, yt - wt, yt, z0, z1, 0.004), { cutaway: "keep", cover: true });
    const bowl = revolveProfile(
      [
        [fe.tower.bowl_radius - 0.03, yb + 0.02],
        [fe.tower.bowl_radius, yb + 0.02],
        [fe.tower.bowl_radius, fe.tower.bowl_rim_y - 0.02],
        [fe.tower.bowl_radius - 0.035, fe.tower.bowl_rim_y],
        [fe.tower.bowl_radius - 0.04, fe.tower.bowl_rim_y - 0.004],
        [fe.tower.bowl_radius - 0.006, fe.tower.bowl_rim_y - 0.022],
        [fe.tower.bowl_radius - 0.006, yb + 0.028],
        [fe.tower.bowl_radius - 0.03, yb + 0.028],
      ],
      { segments: 96 },
    );
    translateMeshData(bowl, tw.x, 0, tw.z);
    const motor = cyl(0.045, yb + 0.02, yb + 0.07, tw.x, tw.z, 32, 0.004);
    const drain = tubeAlongPath([[tw.x + 0.12, yb + 0.022, tw.z - 0.12], [tw.x + 0.12, yb - 0.12, tw.z - 0.12], [tw.x + 0.12, yb - 0.12, tw.z - 0.3], [tw.x + 0.12, 0.06, tw.z - 0.3]], 0.012, { segments: 12, cornerRadius: 0.04 });
    sink.fixed("dryer_bowl", F.dryer, "polymer_white", bowl, { cutaway: "keep", castShadow: false });
    sink.fixed("dryer_motor_drain", F.dryer, "polymer_gray", mergeMeshData([motor, drain]), { cutaway: "keep", castShadow: false });
    // spin chuck (dry_spin, child of the chuck lift), authored at the raised exchange position
    const chuckTop = tw.dryerPlaneY;
    const chuck = cyl(fe.tower.chuck_radius, chuckTop - 0.012, chuckTop, tw.x, tw.z, 48, 0.002);
    const shaft = cyl(0.015, yb + 0.07, chuckTop - 0.012, tw.x, tw.z, 24, 0.001);
    const grooves: MeshData[] = [];
    for (let k = 0; k < 4; k++) {
      const gm = chamferedBox([0.14, 0.0008, 0.004], 0.0002, [0, chuckTop + 0.0002, 0]);
      rotateYMeshData(gm, (k * Math.PI) / 4);
      grooves.push(translateMeshData(gm, tw.x, 0, tw.z));
    }
    sink.fixed("dry_chuck", F.dryChuck, "stainless", mergeMeshData([chuck, shaft]), { cutaway: "keep", jointId: CMP_FE_JOINTS.drySpin });
    sink.fixed("dry_chuck_grooves", F.dryChuck, "dark_steel", mergeMeshData(grooves), { cutaway: "keep", jointId: CMP_FE_JOINTS.drySpin, pickable: false, castShadow: false });
    const wd = waferHalfMeshes(R, chuckTop, t, false, tw.x, tw.z);
    sink.fixed("wafer_in_dry", F.waferDry, "silicon_wafer", wd.back, { cutaway: "keep", jointId: CMP_FE_JOINTS.drySpin, castShadow: false });
    sink.fixed("wafer_in_dry_front", F.waferDry, "wafer_front", wd.front, { cutaway: "keep", jointId: CMP_FE_JOINTS.drySpin, castShadow: false });
    // shutters on the outside of the openings
    const shZ = (xa: number, xb: number) => box(xa, xb, op.y0 - 0.008, op.y1 + 0.008, tw.z - 0.18, tw.z + 0.18, 0.003);
    sink.fixed("dryer_shutter_wet", F.dryerShutterWet, "polymer_gray", shZ(x1, x1 + 0.01), { cutaway: "keep", jointId: CMP_FE_JOINTS.dryerShutterWet });
    sink.fixed("dryer_shutter_dry", F.dryerShutterDry, "polymer_gray", shZ(x0 - 0.01, x0), { cutaway: "keep", jointId: CMP_FE_JOINTS.dryerShutterDry });
    // flip station frame (posts, top plate, rotary actuator on +Z) above the dryer
    const fy0 = yt;
    const fy1 = tw.flipTopY;
    const posts: MeshData[] = [];
    for (const x of [x0 + 0.02, x1 - 0.02]) for (const z of [z0 + 0.02, z1 - 0.02]) posts.push(box(x - 0.015, x + 0.015, fy0, fy1, z - 0.015, z + 0.015, 0.003));
    posts.push(box(x0, x1, fy1 - 0.012, fy1, z0, z1, 0.003));
    const act = box(tw.x - 0.06, tw.x + 0.06, tw.flipAxisY - 0.06, tw.flipAxisY + 0.06, z1 - 0.01, z1 + 0.08, 0.008);
    sink.fixed("flip_frame", F.flipStation, "aluminum_anodized", mergeMeshData(posts), { cutaway: "keep" });
    sink.fixed("flip_actuator", F.flipStation, "painted_offwhite", act, { cutaway: "keep" });
    // rotor yoke (flip_roll) authored at roll 0: a bar along Z through the axis with end blocks carrying the jaw guides
    const ya = tw.flipAxisY;
    const jt = fe.tower.flip_jaw_travel;
    const yoke = mergeMeshData([box(tw.x - 0.012, tw.x + 0.012, ya - 0.008, ya + 0.008, z0 + 0.03, z1 - 0.01, 0.002), box(tw.x - 0.03, tw.x + 0.03, ya - 0.025, ya + 0.025, z0 + 0.03, z0 + 0.05, 0.003), box(tw.x - 0.03, tw.x + 0.03, ya - 0.025, ya + 0.025, z1 - 0.05, z1 - 0.03, 0.003)]);
    sink.fixed("flip_rotor", F.flipRotor, "stainless", yoke, { cutaway: "keep", jointId: CMP_FE_JOINTS.flipRoll });
    // jaws authored open (travel outward); V-notch blocks gripping the edge at z = +-R when closed
    const jaw = (sgn: number) => mergeMeshData([box(tw.x - 0.025, tw.x + 0.025, ya - 0.012, ya - 0.0035, tw.z + sgn * (R + jt), tw.z + sgn * (R + jt + 0.03), 0.002), box(tw.x - 0.025, tw.x + 0.025, ya + 0.0035, ya + 0.012, tw.z + sgn * (R + jt), tw.z + sgn * (R + jt + 0.03), 0.002), box(tw.x - 0.025, tw.x + 0.025, ya - 0.012, ya + 0.012, tw.z + sgn * (R + jt + 0.004), tw.z + sgn * (R + jt + 0.03), 0.002)]);
    sink.fixed("flip_jaw_a", F.flipJawA, "polymer_white", jaw(1), { cutaway: "keep", jointId: CMP_FE_JOINTS.flipJawA });
    sink.fixed("flip_jaw_b", F.flipJawB, "polymer_white", jaw(-1), { cutaway: "keep", jointId: CMP_FE_JOINTS.flipJawB });
    const wf = waferHalfMeshes(R, tw.flipPlaneY, t, false, tw.x, tw.z);
    sink.fixed("wafer_on_flip", F.waferFlip, "silicon_wafer", wf.back, { cutaway: "keep", jointId: CMP_FE_JOINTS.flipRoll, castShadow: false });
    sink.fixed("wafer_on_flip_front", F.waferFlip, "wafer_front", wf.front, { cutaway: "keep", jointId: CMP_FE_JOINTS.flipRoll, castShadow: false });
  }
  // ---------------------------------------------------------------- brush cleaner
  {
    const cl = Fl.cleaner;
    const cf = fe.cleaner;
    const [sx, sy, sz] = cl.size;
    const x0 = cl.x - sx / 2;
    const x1 = cl.x + sx / 2;
    const z0 = cl.z - sz / 2;
    const z1 = cl.z + sz / 2;
    const yb = cl.baseY;
    const yt = yb + sy;
    const wt = 0.012;
    const op = { y0: cl.planeY - cf.shutter_height / 2 + 0.006, y1: cl.planeY + cf.shutter_height / 2 + 0.006 };
    const front = mergeMeshData([box(x0, x1, yb, op.y0, z0, z0 + wt), box(x0, x1, op.y1, yt, z0, z0 + wt), box(x0, cl.x - 0.18, op.y0, op.y1, z0, z0 + wt), box(cl.x + 0.18, x1, op.y0, op.y1, z0, z0 + wt)]);
    const walls = mergeMeshData([front, box(x0, x1, yb, yt, z1 - wt, z1), box(x0, x0 + wt, yb, yt, z0, z1), box(x1 - wt, x1, yb, yt, z0, z1), box(x0, x1, yb, yb + 0.03, z0, z1, 0.004)]);
    sink.fixed("cleaner_housing", F.cleaner, "polymer_gray", walls, { cutaway: "keep" });
    sink.fixed("cleaner_lid", F.cleaner, "polymer_gray", box(x0, x1, yt - wt, yt, z0, z1, 0.004), { cutaway: "keep", cover: true });
    // spray bars above / below the wafer plane, rinse supply line with the flow meter body, drain
    const sprays: MeshData[] = [];
    for (const yy of [cl.planeY + 0.11, cl.planeY - 0.09]) {
      sprays.push(tubeAlongPath([[x0 + 0.03, yy, cl.z + 0.12], [x1 - 0.03, yy, cl.z + 0.12]], 0.008, { segments: 12 }));
      for (let k = 0; k < 6; k++) sprays.push(cyl(0.004, yy - (yy > cl.planeY ? 0.016 : -0.004), yy - (yy > cl.planeY ? 0.004 : -0.016), x0 + 0.08 + k * ((sx - 0.16) / 5), cl.z + 0.12, 10, 0.0005));
    }
    const line = tubeAlongPath([[x1 + 0.02, cl.planeY + 0.11, cl.z + 0.12], [x1 + 0.08, cl.planeY + 0.11, cl.z + 0.12], [x1 + 0.08, yb - 0.05, cl.z + 0.12], [x1 + 0.08, yb - 0.05, z1 + 0.05]], 0.006, { segments: 10, cornerRadius: 0.03 });
    const fm = box(x1 + 0.05, x1 + 0.11, cl.planeY - 0.02, cl.planeY + 0.06, cl.z + 0.09, cl.z + 0.15, 0.004);
    const drain = tubeAlongPath([[cl.x, yb + 0.004, cl.z], [cl.x, yb - 0.1, cl.z], [cl.x, yb - 0.1, z0 - 0.05], [cl.x, 0.06, z0 - 0.05]], 0.014, { segments: 12, cornerRadius: 0.04 });
    sink.fixed("cleaner_sprays", F.cleaner, "stainless", mergeMeshData(sprays), { cutaway: "keep", castShadow: false });
    sink.fixed("cleaner_rinse_line", F.cleaner, "polymer_white", mergeMeshData([line, drain]), { cutaway: "keep", castShadow: false });
    sink.fixed("cleaner_flow_meter", F.cleaner, "painted_dark", fm, { cutaway: "keep", castShadow: false });
    // shutter outside the access opening
    sink.fixed("cleaner_shutter", F.cleanerShutter, "polymer_gray", box(cl.x - 0.19, cl.x + 0.19, op.y0 - 0.008, op.y1 + 0.008, z0 - 0.01, z0, 0.003), { cutaway: "keep", jointId: CMP_FE_JOINTS.cleanShutter });
    // brush rollers along X with axial ribs (spin reads), authored at the cleaning (contact) position
    const rr = cf.roller_radius;
    const len = cf.roller_length;
    const roller = (yc: number) => {
      const core: MeshData[] = [];
      const md = revolveProfile(rectProfile(0, rr * 0.92, -len / 2, len / 2), { segments: 32 });
      // axis +Y -> +X : (x, y, z) -> (y, -x, z) is a proper rotation
      for (let i = 0; i < md.positions.length; i += 3) {
        const x = md.positions[i];
        const y = md.positions[i + 1];
        md.positions[i] = y + cl.x;
        md.positions[i + 1] = -x + yc;
        md.positions[i + 2] += cl.z;
        const nx = md.normals[i];
        const ny = md.normals[i + 1];
        md.normals[i] = ny;
        md.normals[i + 1] = -nx;
      }
      core.push(md);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const rib = chamferedBox([len - 0.02, 0.008, 0.01], 0.002, [cl.x, yc + (rr - 0.004) * Math.sin(a), cl.z + (rr - 0.004) * Math.cos(a)]);
        core.push(rib);
      }
      return mergeMeshData(core);
    };
    const yUp = cl.planeY + t + rr;
    const yLo = cl.planeY - rr;
    sink.fixed("brush_upper", F.brushUpper, "polymer_white", roller(yUp), { cutaway: "keep", jointId: CMP_FE_JOINTS.brushUpSpin, castShadow: false });
    sink.fixed("brush_lower", F.brushLower, "polymer_white", roller(yLo), { cutaway: "keep", jointId: CMP_FE_JOINTS.brushLowSpin, castShadow: false });
    // edge drive rollers: two per arm at z = +-0.06 around the wafer center (grooved), authored open
    const er = cf.edge_roller_radius;
    const dx = Math.sqrt(R * R - 0.06 * 0.06) + er + cf.edge_roller_travel;
    const edgeArm = (sgn: number) => {
      const out: MeshData[] = [];
      for (const dz of [-0.06, 0.06]) {
        const x = cl.x + sgn * dx;
        out.push(translateMeshData(revolveProfile([[0, cl.planeY - 0.016], [er, cl.planeY - 0.016], [er, cl.planeY - 0.003], [er * 0.55, cl.planeY + t / 2], [er, cl.planeY + t + 0.003], [er, cl.planeY + 0.016], [0, cl.planeY + 0.016]], { segments: 24 }), x, 0, cl.z + dz));
        out.push(translateMeshData(revolveProfile(chamfRect(0, 0.006, yb + 0.03, cl.planeY - 0.016, 0.001), { segments: 12 }), x, 0, cl.z + dz));
      }
      out.push(box(cl.x + sgn * dx - 0.015, cl.x + sgn * dx + 0.015, yb + 0.03, yb + 0.05, cl.z - 0.09, cl.z + 0.09, 0.003));
      return mergeMeshData(out);
    };
    sink.fixed("edge_rollers_a", F.edgeRollersA, "polymer_white", edgeArm(1), { cutaway: "keep", jointId: CMP_FE_JOINTS.rollersA, castShadow: false });
    sink.fixed("edge_rollers_b", F.edgeRollersB, "polymer_white", edgeArm(-1), { cutaway: "keep", jointId: CMP_FE_JOINTS.rollersB, castShadow: false });
    const wc = waferHalfMeshes(R, cl.planeY, t, false, cl.x, cl.z);
    sink.fixed("wafer_in_clean", F.waferClean, "silicon_wafer", wc.back, { cutaway: "keep", castShadow: false });
    sink.fixed("wafer_in_clean_front", F.waferClean, "wafer_front", wc.front, { cutaway: "keep", castShadow: false });
  }
  // ---------------------------------------------------------------- end-effector rinse station (box facing the wet robot)
  {
    const rs = Fl.rinse;
    const [bx, by, bz] = fe.rinse_station.size;
    const bodyParts: MeshData[] = [];
    // box with a slot on the face toward the robot (local -x after rotation)
    const yc = rs.planeY;
    bodyParts.push(chamferedBox([bx, 0.03, bz], 0.004, [0, yc - by / 2 + 0.015, 0]));
    bodyParts.push(chamferedBox([bx, 0.03, bz], 0.004, [0, yc + by / 2 - 0.015, 0]));
    bodyParts.push(chamferedBox([0.012, by, bz], 0.003, [bx / 2 - 0.006, yc, 0]));
    bodyParts.push(chamferedBox([bx, by, 0.012], 0.003, [0, yc, bz / 2 - 0.006]));
    bodyParts.push(chamferedBox([bx, by, 0.012], 0.003, [0, yc, -bz / 2 + 0.006]));
    const nozzles: MeshData[] = [];
    for (const dyy of [-0.03, 0.03]) for (const dzz of [-0.04, 0, 0.04]) nozzles.push(translateMeshData(revolveProfile(chamfRect(0, 0.004, 0, 0.012, 0.0005), { segments: 10 }), 0.02, yc + (dyy > 0 ? 0.035 : -0.047), dzz));
    const body = mergeMeshData(bodyParts);
    const noz = mergeMeshData(nozzles);
    // orient the slot toward the robot: local +x points away from the robot
    for (const md of [body, noz]) {
      rotateYMeshData(md, rs.azimuth);
      translateMeshData(md, rs.x, 0, rs.z);
    }
    const stand = cyl(0.02, L.deckTopY, yc - by / 2, rs.x + Math.cos(rs.azimuth) * 0.05, rs.z + Math.sin(rs.azimuth) * 0.05, 16);
    sink.fixed("rinse_box", F.rinse, "polymer_gray", mergeMeshData([body, stand]), { cutaway: "keep" });
    sink.fixed("rinse_nozzles", F.rinse, "stainless", noz, { cutaway: "keep", castShadow: false, lod: "fine", pickable: false });
  }
  // ---------------------------------------------------------------- wet process enclosure + facility interface
  buildProcessEnclosureParts(sink, 0, cmpEnclosureSpec(L), { enclosure: F.enclosure, facility: F.facility });
  void EFEM_FLOOR_RAISE;
}
