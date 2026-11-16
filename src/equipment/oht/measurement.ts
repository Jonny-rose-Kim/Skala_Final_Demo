/**
 * OHT measurement seed (O-MP-01 .. O-MP-08). Every item is a representative sensor role of this project's
 * template, not a vendor configuration. Channels are Data unbound. The scripted travel position, hoist
 * extension, gripper pose and presented_holder are Preview status and are never copied into these channels.
 */
import type { ChannelPointBindingDef, InstrumentDef, InstrumentInstallationDef, MeasurementChannelDefV2, MeasurementPointDefV2, MeasurementSeed } from "../../domain/measurement";
import type { OhtLayout } from "./layout";
import { OHT_TEMPLATE_ID } from "./template";

export function buildOhtMeasurementSeed(L: OhtLayout): MeasurementSeed {
  const cfg = L.cfg;
  const z0 = L.rail.z0;
  const instruments: InstrumentDef[] = [];
  const installations: InstrumentInstallationDef[] = [];
  const points: MeasurementPointDefV2[] = [];
  const channels: MeasurementChannelDefV2[] = [];
  const bindings: ChannelPointBindingDef[] = [];
  const inst = (i: InstrumentDef, ins: Omit<InstrumentInstallationDef, "installationId" | "instrumentId" | "installationStatus" | "placementBasis" | "revision">) => {
    instruments.push(i);
    installations.push({ installationId: `inst.${i.instrumentId}`, instrumentId: i.instrumentId, installationStatus: "installed", placementBasis: "design_assumption", revision: "install-rev-1", ...ins });
  };
  const ch = (c: MeasurementChannelDefV2, pointId: string) => {
    channels.push(c);
    bindings.push({ bindingId: `bind.${c.channelId}`, channelId: c.channelId, pointId, role: "primary", configurationRevision: "cfg-rev-1" });
  };
  const v = cfg.vehicle;
  // O-MP-01 travel axis encoder (bogie drive)
  inst({ instrumentId: "oht.travel_encoder", name: "Travel drive encoder", type: "encoder", principle: "Drive wheel encoder (integrated)", installationStatus: "installed" }, { mountedOnAssetId: "bogies", mountFrameJointId: "travel", mountPosition: [cfg.rail.flange_width / 2 + 0.06, L.vehicle.bogieY, z0 + v.bogie_spacing / 2] });
  points.push({
    pointId: "oht.mp.travel_reference",
    name: "Rail travel reference (path distance)",
    targetAssetId: "rail",
    pointKind: "line_reference",
    geometry: { position: [0, L.rail.bottomY - 0.02, z0], pathTo: [0, L.rail.bottomY - 0.02, L.rail.z1] },
    quantity: "position_linear",
    reference: { positionHome: `Rail start (z0) = 0 m; station references are config metadata. 경로상 거리이며 world XYZ 실측이 아니다` },
    coverageKo: "Rail 경로 전체 (1차원 거리)",
    noteKo: "Encoder 기반 위치에는 home/station reference가 필요하다 (config metadata).",
  });
  ch({ channelId: "oht.ch.position.travel", instrumentId: "oht.travel_encoder", name: "Travel position feedback", quantity: "position_linear", canonicalUnit: "m", dataShape: "scalar", channelRole: "measurement" }, "oht.mp.travel_reference");
  // O-MP-02 hoist extension feedback + O-MP-03 upper limit
  inst({ instrumentId: "oht.hoist_encoder", name: "Hoist drive integrated encoder", type: "integrated_instrument", principle: "Reel encoder (integrated in the hoist drive)", installationStatus: "installed" }, { mountedOnAssetId: "hoist_drive", mountFrameJointId: "travel", mountPosition: [0.16, L.hoist.originY + 0.06, z0] });
  points.push({
    pointId: "oht.mp.hoist_extension_reference",
    name: "Hoist axis extension relative to home",
    targetAssetId: "hoist_belts",
    frameJointId: "travel",
    pointKind: "axis_reference",
    geometry: { position: [0, L.hoist.originY - 0.08, z0], axis: [0, -1, 0] },
    quantity: "position_linear",
    reference: { positionHome: "Retracted (upper limit) = 0; 아래쪽 extension 양수" },
    coverageKo: "단일 수직 축",
    noteKo: "Scripted hoist extension(Preview)과 encoder feedback(—)을 별도 표시한다.",
  });
  ch({ channelId: "oht.ch.position.hoist", instrumentId: "oht.hoist_encoder", name: "Hoist extension feedback", quantity: "position_linear", canonicalUnit: "m", dataShape: "scalar", channelRole: "measurement" }, "oht.mp.hoist_extension_reference");
  inst({ instrumentId: "oht.hoist_upper_limit", name: "Hoist upper-limit switch", type: "limit_switch", principle: "Mechanical limit switch at the retracted pose", installationStatus: "installed" }, { mountedOnAssetId: "hoist_drive", mountFrameJointId: "travel", mountPosition: [-0.14, L.hoist.originY + 0.01, z0 + 0.1] });
  points.push({
    pointId: "oht.mp.hoist_upper_limit",
    name: "Hoist upper-limit detection region",
    targetAssetId: "gripper_plate",
    frameJointId: "travel",
    pointKind: "region",
    geometry: { position: [-0.14, L.hoist.plateTopY, z0 + 0.1], radius: 0.02 },
    quantity: "status_binary",
    reference: { positionHome: "Retracted pose" },
    coverageKo: "Plate 상단이 switch 영역에 들어올 때",
    noteKo: "Retracted / upper-limit status.",
  });
  ch({ channelId: "oht.ch.status.hoist_upper_limit", instrumentId: "oht.hoist_upper_limit", name: "Hoist retracted (upper limit)", quantity: "status_binary", canonicalUnit: "bool", dataShape: "boolean", channelRole: "status" }, "oht.mp.hoist_upper_limit");
  // O-MP-04 gripper closed/open, O-MP-05 carrier presence (different conditions)
  inst({ instrumentId: "oht.gripper_switches", name: "Gripper open / closed switches", type: "limit_switch", principle: "Position switches on the finger mechanism", installationStatus: "installed" }, { mountedOnAssetId: "gripper_plate", mountFrameJointId: "hoist", mountPosition: [0.12, L.hoist.plateBottomY - 0.01, z0 + 0.14] });
  points.push({
    pointId: "oht.mp.gripper_mechanism",
    name: "Gripper finger mechanism position",
    targetAssetId: "gripper_finger_a",
    frameJointId: "hoist",
    pointKind: "line_reference",
    geometry: { position: [L.gripper.openHalfGap, L.hoist.plateBottomY - 0.02, z0], pathTo: [L.gripper.closedHalfGap, L.hoist.plateBottomY - 0.02, z0] },
    quantity: "status_binary",
    reference: { positionHome: "Open = reference; closed at the inner stop" },
    coverageKo: "Finger stroke 양 끝",
    noteKo: "Gripper closed와 Carrier present는 다른 조건이다.",
  });
  ch({ channelId: "oht.ch.status.gripper_closed", instrumentId: "oht.gripper_switches", name: "Gripper closed", quantity: "status_binary", canonicalUnit: "bool", dataShape: "boolean", channelRole: "status" }, "oht.mp.gripper_mechanism");
  ch({ channelId: "oht.ch.status.gripper_open", instrumentId: "oht.gripper_switches", name: "Gripper open", quantity: "status_binary", canonicalUnit: "bool", dataShape: "boolean", channelRole: "status" }, "oht.mp.gripper_mechanism");
  inst({ instrumentId: "oht.carrier_presence", name: "Carrier presence / engagement sensor", type: "proximity_sensor", principle: "Proximity sensor under the gripper plate", installationStatus: "installed" }, { mountedOnAssetId: "gripper_plate", mountFrameJointId: "hoist", mountPosition: [0, L.hoist.plateBottomY - 0.006, z0] });
  points.push({
    pointId: "oht.mp.carrier_capture_region",
    name: "Carrier capture region at the gripper",
    targetAssetId: "gripper_plate",
    frameJointId: "hoist",
    pointKind: "region",
    geometry: { position: [0, L.hoist.plateBottomY - 0.03, z0], extent: [0.07, 0.025, 0.07] },
    quantity: "presence",
    reference: { frameNote: "FOUP top flange가 plate 아래 capture region에 있을 때" },
    coverageKo: "Flange 크기의 영역",
    noteKo: "Carrier present / engaged role. presented_holder(scripted)와 구별한다.",
  });
  ch({ channelId: "oht.ch.presence.carrier_at_gripper", instrumentId: "oht.carrier_presence", name: "Carrier present at gripper", quantity: "presence", canonicalUnit: "bool", dataShape: "boolean", channelRole: "status" }, "oht.mp.carrier_capture_region");
  // O-MP-07 obstruction sensor detection region
  inst({ instrumentId: "oht.obstruction", name: "Forward / descent obstruction sensor", type: "obstruction_sensor", principle: "Optical distance sensor (representative)", installationStatus: "installed" }, { mountedOnAssetId: "obstruction_sensor", mountFrameJointId: "travel", mountPosition: [0, L.vehicle.bodyY0 + 0.12, z0 + v.body_size[2] / 2 + 0.02] });
  points.push({
    pointId: "oht.mp.obstruction_envelope",
    name: "Forward / hoist-descent detection envelope",
    targetAssetId: "obstruction_sensor",
    frameJointId: "travel",
    pointKind: "region",
    geometry: { position: [0, L.vehicle.bodyY0 - 0.2, z0 + v.body_size[2] / 2 + 0.4], extent: [0.25, 0.3, 0.4] },
    quantity: "presence",
    reference: { frameNote: "Detection region은 Sensor Observation이며 단순 Scene collision 검사와 다르다" },
    coverageKo: "전방 + 하강 envelope (대표 영역)",
    noteKo: "Clearance/충돌 점검은 대표 geometry 검사이며 인증된 safety controller가 아니다.",
  });
  ch({ channelId: "oht.ch.presence.obstruction", instrumentId: "oht.obstruction", name: "Obstruction detected", quantity: "presence", canonicalUnit: "bool", dataShape: "boolean", channelRole: "status" }, "oht.mp.obstruction_envelope");
  // O-MP-06 load-port seating (candidate here: the seating sensor belongs to each tool's load port; listed as a point of the rail system for the station regions)
  points.push({
    pointId: "oht.mp.station_seating_region",
    name: "Load-port seating region (per station; sensor belongs to the tool)",
    targetAssetId: "rail",
    pointKind: "region",
    geometry: { position: [0, 0.9, z0], extent: [0.15, 0.03, 0.15] },
    quantity: "presence",
    reference: { frameNote: "각 station의 seating pad 영역; Carrier seated/present role은 Load port 측 센서가 담당" },
    coverageKo: "Station별 seating pad 영역 (overlay로 표시)",
    noteKo: "설치 후보 / Not installed (이 template에는 instrument가 없다; tool 측 센서로 등록 예정).",
    candidate: true,
  });
  // O-MP-08 carrier ID reader: optional, not installed
  points.push({
    pointId: "oht.mp.id_read_zone",
    name: "Carrier ID read zone (optional reader)",
    targetAssetId: "gripper_plate",
    frameJointId: "hoist",
    pointKind: "region",
    geometry: { position: [0.1, L.hoist.plateBottomY - 0.05, z0 - 0.12], radius: 0.04 },
    quantity: "identity",
    reference: { frameNote: "RFID / barcode read zone 후보" },
    coverageKo: "Flange 근처 read zone",
    noteKo: "설치 후보 / Not installed.",
    candidate: true,
  });
  return {
    templateId: OHT_TEMPLATE_ID,
    seedRevision: "oht-meas-seed-1",
    instruments,
    installations,
    points,
    channels,
    pointBindings: bindings,
    sourceBindings: [],
    calibrations: instruments.map((i) => ({ calibrationId: `cal.${i.instrumentId}`, instrumentId: i.instrumentId, status: "unknown" as const })),
  };
}
