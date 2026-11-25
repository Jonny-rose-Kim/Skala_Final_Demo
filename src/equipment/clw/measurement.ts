/**
 * CLW-08v2 measurement seed (representative mapping, not a manufacturer sensor list).
 * "planned": channels of the team's synthetic OHT dataset (db/JAVAS, OHT integrated transport v1.0, vehicle
 * OHT_SIM_01; the dataset itself marks the model name and the two-motor layout as unconfirmed).
 * "candidate": the rest. Nothing is installed; every channel is Data unbound. The animated travel / hoist
 * position is presentation and is never an encoder observation.
 */
import { buildSeed, crosswalkRows, type SensorSpec } from "../../domain/measurementKit";
import type { MeasurementSeed } from "../../domain/measurement";
import type { OhtLayout } from "../oht/layout";
import { CLW_TEMPLATE_ID } from "./template";

export const CLW_MEAS_PREFIX = "clw";
const J = "OHT_SIM_01";

export function clwSensors(L: OhtLayout): SensorSpec[] {
  const z0 = L.rail.z0;
  const v = L.cfg.vehicle;
  const by = L.vehicle.bogieY;
  const plateY = L.hoist.plateBottomY;
  return [
    ...(["front", "rear"] as const).map(
      (side): SensorSpec => ({
        key: `${side}_drive`,
        name: `${side === "front" ? "Front" : "Rear"} drive motor output`,
        instrumentType: "integrated_instrument",
        principle: "Servo amplifier output (가정)",
        status: "planned",
        mount: { assetId: "bogies", position: [0.07, by, z0 + (side === "front" ? 1 : -1) * v.bogie_spacing / 2], jointId: "travel" },
        point: { name: `${side} drive wheel`, targetAssetId: "bogies", position: [0, by, z0 + (side === "front" ? 1 : -1) * v.bogie_spacing / 2], jointId: "travel", quantity: "drive_output_percent", coverageKo: "구동 출력(정격 대비 %). 실측 torque가 아니다." },
        channels: [{ suffix: "torque_pct", name: `${side} motor torque output`, role: "command", unit: "%", candidateSourceKey: `${J}_${side.toUpperCase()}_MOTOR_TORQUE`, noteKo: "합성 데이터셋은 controller output(% rated)으로 둔다." }],
        noteKo: "Motor 2개 배치는 합성 데이터셋 가정이며 CLW-08v2 사양으로 확인되지 않았다.",
      }),
    ),
    {
      key: "travel",
      name: "Travel position / speed",
      instrumentType: "encoder",
      principle: "Drive encoder (가정)",
      status: "planned",
      mount: { assetId: "bogies", position: [0.08, by + 0.03, z0], jointId: "travel" },
      point: { name: "Vehicle travel reference", targetAssetId: "bogies", position: [0, by, z0], jointId: "travel", quantity: "position_linear", reference: { positionHome: "Rail start z0 = 0; distance along the rail path (mm)" }, coverageKo: "경로상 위치." },
      channels: [{ suffix: "pos", name: "Rail position", role: "measurement", unit: "mm", candidateSourceKey: `${J} drive trace rail_position_mm` }],
      noteKo: "화면의 vehicle 위치는 scripted이며 이 채널 값이 아니다.",
    },
    {
      key: "speed",
      name: "Travel speed",
      instrumentType: "encoder",
      principle: "Drive encoder derivative (가정)",
      status: "planned",
      mount: { assetId: "bogies", position: [-0.08, by + 0.03, z0], jointId: "travel" },
      point: { name: "Vehicle travel speed", targetAssetId: "bogies", position: [0, by, z0 + 0.01], jointId: "travel", quantity: "speed_linear", coverageKo: "주행 속도." },
      channels: [
        { suffix: "v", name: "Travel speed", role: "measurement", unit: "mm/s", candidateSourceKey: `${J}_SPEED` },
        { suffix: "a", name: "Acceleration (derived from speed)", role: "derived_estimate", quantity: "speed_linear", unit: "mm/s", derivedFrom: ["clw.ch.speed.v"], noteKo: "합성 데이터셋 ACCEL(mm/s2)은 속도에서 계산되는 값으로 본다. 단위 변환은 데이터 경계에서 한다(여기서는 speed 채널 참조만)." },
      ],
      noteKo: "가속도는 derived 채널.",
    },
    {
      key: "hoist",
      name: "Hoist position",
      instrumentType: "encoder",
      principle: "Hoist reel encoder (가정)",
      status: "planned",
      mount: { assetId: "hoist_drive", position: [0.16, L.hoist.originY + 0.06, z0], jointId: "travel" },
      point: { name: "Hoist extension reference", targetAssetId: "gripper_plate", position: [0, plateY, z0], jointId: "hoist", quantity: "position_linear", reference: { positionHome: "Retracted (upper limit) = 0, positive down (mm)" }, coverageKo: "Gripper plate 하강 거리." },
      channels: [
        { suffix: "pos", name: "Hoist position (feedback)", role: "measurement", unit: "mm", candidateSourceKey: `${J}_HOIST_POSITION` },
        { suffix: "cmd", name: "Hoist position command", role: "command", unit: "mm", candidateSourceKey: `${J} hoist trace hoist_command_mm` },
        { suffix: "follow_err", name: "Hoist following error (derived)", role: "derived_estimate", unit: "mm", derivedFrom: ["clw.ch.hoist.pos", "clw.ch.hoist.cmd"], candidateSourceKey: `${J}_HOIST_FOLLOWING_ERROR`, noteKo: "Feedback과 command의 차이. 측정값이 아니다." },
      ],
      noteKo: "Belt / pulley 수는 대표 기구다.",
    },
    {
      key: "carrier_present",
      name: "Carrier presence (gripper)",
      instrumentType: "proximity_sensor",
      principle: "Presence sensor on the gripper plate (가정)",
      status: "planned",
      mount: { assetId: "gripper_plate", position: [0.05, plateY + 0.005, z0], jointId: "hoist" },
      point: { name: "FOUP top flange seat", targetAssetId: "gripper_plate", position: [0, plateY - 0.006, z0], jointId: "hoist", quantity: "presence", coverageKo: "Flange 유무." },
      channels: [{ suffix: "present", name: "Carrier present", role: "status", unit: "bool", candidateSourceKey: `${J}_CARRIER_PRESENT` }],
      noteKo: "",
    },
    {
      key: "gripper",
      name: "Gripper closed",
      instrumentType: "limit_switch",
      principle: "Finger closed switch (가정)",
      status: "planned",
      mount: { assetId: "gripper_plate", position: [-0.05, plateY + 0.005, z0], jointId: "hoist" },
      point: { name: "Gripper fingers", targetAssetId: "gripper_finger_a", position: [0, plateY - 0.02, z0], jointId: "hoist", quantity: "status_binary", coverageKo: "Finger 닫힘 상태." },
      channels: [{ suffix: "closed", name: "Gripper closed", role: "status", unit: "bool", candidateSourceKey: `${J} hoist trace gripper_closed` }],
      noteKo: "",
    },
    {
      key: "hoist_upper_limit",
      name: "Hoist upper limit",
      instrumentType: "limit_switch",
      principle: "Limit switch (가정)",
      status: "planned",
      mount: { assetId: "hoist_drive", position: [-0.14, L.hoist.originY + 0.01, z0 + 0.1], jointId: "travel" },
      point: { name: "Hoist retracted pose", targetAssetId: "hoist_drive", position: [0, L.hoist.originY, z0], jointId: "travel", quantity: "status_binary", coverageKo: "Retracted 여부." },
      channels: [{ suffix: "at_limit", name: "Hoist at upper limit", role: "status", unit: "bool", candidateSourceKey: `${J} hoist trace upper_limit` }],
      noteKo: "",
    },
    {
      key: "e84",
      name: "E84 load-port handshake",
      instrumentType: "integrated_instrument",
      principle: "Optical E84 interface (후보)",
      status: "candidate",
      mount: { assetId: "vehicle_body", position: [0.2, L.vehicle.bodyY0 + 0.05, z0 + 0.3], jointId: "travel" },
      point: { name: "Handshake state with the load port", targetAssetId: "vehicle_body", position: [0, L.vehicle.bodyY0, z0], jointId: "travel", quantity: "status_enum", coverageKo: "Handshake 신호 상태(단순화)." },
      channels: [{ suffix: "state", name: "E84 handshake state", role: "status", unit: "enum", candidateSourceKey: `${J} 10_e84_transitions (protocol simplified, synthetic)` }],
      noteKo: "Load port 쪽 E84 구현은 없다.",
    },
    {
      key: "hoist_current",
      name: "Hoist motor current",
      instrumentType: "integrated_instrument",
      principle: "Drive current monitor (후보)",
      status: "candidate",
      mount: { assetId: "hoist_drive", position: [0, L.hoist.originY + 0.08, z0], jointId: "travel" },
      point: { name: "Hoist motor", targetAssetId: "hoist_drive", position: [0, L.hoist.originY + 0.05, z0], jointId: "travel", quantity: "motor_current", coverageKo: "Motor 전류." },
      channels: [{ suffix: "a", name: "Hoist motor current", role: "measurement", unit: "A" }],
      noteKo: "합성 데이터셋은 hoist torque(%)만 둔다(후보).",
    },
  ];
}

export function buildClwMeasurementSeed(L: OhtLayout): MeasurementSeed {
  return buildSeed(CLW_TEMPLATE_ID, "clw-meas-seed-1", CLW_MEAS_PREFIX, L.cfg.geometry_revision, clwSensors(L));
}

export const clwCrosswalk = (L: OhtLayout) => crosswalkRows(clwSensors(L), CLW_MEAS_PREFIX);
