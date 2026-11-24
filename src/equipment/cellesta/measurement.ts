/**
 * CELLESTA PM-01 measurement seed (representative mapping, not a manufacturer sensor list).
 * "planned": channels of the team's synthetic wet-clean dataset (db/JAVAS, WetClean SiO2 post-etch v1.0,
 * process module WCLEAN_SIM_A_PROCESS_MODULE). "candidate": IPA, exhaust, leak, presence, shutter and
 * atmosphere items that no dataset provides. Nothing is installed; every channel is Data unbound.
 * There is no dryness sensor: the demonstration's dry-confirmed state is scripted, not an observation.
 */
import { buildSeed, crosswalkRows, type SensorSpec } from "../../domain/measurementKit";
import type { MeasurementSeed } from "../../domain/measurement";
import type { CellestaLayout } from "./layout";
import { CELLESTA_JOINTS } from "./sequence";
import { CELLESTA_TEMPLATE_ID } from "./template";

export const CELLESTA_MEAS_PREFIX = "cellesta";
const J = "WCLEAN_SIM_A";

export function cellestaSensors(L: CellestaLayout): SensorSpec[] {
  const pm = L.pm;
  const man = pm.supply.manifold_center;
  const pv = pm.arm.pivot;
  const head: [number, number, number] = [pv[0] + L.armRestDir[0] * pm.arm.length, pm.arm.arm_height, pv[2] + L.armRestDir[1] * pm.arm.length];
  const dr = pm.drain;
  return [
    {
      key: "chem_flow",
      name: "Chemical flow controller",
      instrumentType: "liquid_flow_meter",
      principle: "Liquid flow meter + control valve (가정)",
      status: "planned",
      mount: { assetId: "supply_manifold", position: [man[0], man[1] + 0.06, man[2]] },
      point: { name: "Chemical line upstream of the nozzle", targetAssetId: "supply_chemical", position: [man[0], man[1] + 0.12, man[2] - 0.02], quantity: "flow_liquid", coverageKo: "Nozzle 상류 line 유량. Wafer 위 액량이 아니다." },
      channels: [
        { suffix: "pv", name: "Chemical flow (feedback)", role: "measurement", unit: "mL/min", candidateSourceKey: `${J}_CHEM_FLOW_FB` },
        { suffix: "sp", name: "Chemical flow setpoint", role: "setpoint", unit: "mL/min", candidateSourceKey: `${J}_CHEM_FLOW_SP (FLOW_CONTROL)` },
      ],
      noteKo: "약액 종류와 농도는 정하지 않았다.",
    },
    {
      key: "chem_temp",
      name: "Chemical heater temperature",
      instrumentType: "thermocouple",
      principle: "In-line sensor (가정)",
      status: "planned",
      mount: { assetId: "supply_manifold", position: [man[0], man[1] - 0.06, man[2]] },
      point: { name: "Chemical line after the heater", targetAssetId: "supply_chemical", position: [man[0], man[1] + 0.12, man[2] - 0.02], quantity: "temperature", coverageKo: "Line 액온. Wafer 표면 온도가 아니다." },
      channels: [
        { suffix: "pv", name: "Chemical temperature (feedback)", role: "measurement", unit: "degC", candidateSourceKey: `${J}_CHEM_TEMP_FB` },
        { suffix: "sp", name: "Chemical temperature setpoint", role: "setpoint", unit: "degC", candidateSourceKey: `${J}_CHEM_TEMP_SP` },
      ],
      noteKo: "Heater 본체는 3D에 따로 만들지 않았다(manifold 내부 가정).",
    },
    {
      key: "chem_line_pressure",
      name: "Chemical line pressure",
      instrumentType: "pressure_transducer",
      principle: "In-line transducer (가정)",
      status: "planned",
      mount: { assetId: "supply_manifold", position: [man[0] - 0.05, man[1], man[2]] },
      point: { name: "Chemical line pressure", targetAssetId: "supply_chemical", position: [man[0], man[1] + 0.12, man[2] - 0.02], quantity: "pressure", reference: { pressureReference: "gauge", frameNote: "Line 압력(gauge, 가정)" }, coverageKo: "Supply line 한 점의 압력." },
      channels: [{ suffix: "pv", name: "Chemical line pressure", role: "measurement", unit: "kPa", candidateSourceKey: `${J}_CHEM_LINE_PRESSURE_FB` }],
      noteKo: "합성 데이터셋 단위 kPa.",
    },
    {
      key: "diw_flow",
      name: "UPW (DIW) flow controller",
      instrumentType: "liquid_flow_meter",
      principle: "Liquid flow meter (가정)",
      status: "planned",
      mount: { assetId: "supply_manifold", position: [man[0], man[1], man[2] + 0.04] },
      point: { name: "UPW line upstream of the nozzle", targetAssetId: "supply_upw", position: [man[0], man[1] + 0.12, man[2]], quantity: "flow_liquid", coverageKo: "Rinse line 유량." },
      channels: [
        { suffix: "pv", name: "UPW flow (feedback)", role: "measurement", unit: "L/min", candidateSourceKey: `${J}_DIW_FLOW_FB` },
        { suffix: "sp", name: "UPW flow setpoint", role: "setpoint", unit: "L/min", candidateSourceKey: `${J}_DIW_FLOW_SP` },
      ],
      noteKo: "합성 데이터셋 단위 L/min.",
    },
    {
      key: "nozzle_position",
      name: "Dispense arm position feedback",
      instrumentType: "encoder",
      principle: "Arm drive encoder (가정)",
      status: "planned",
      mount: { assetId: "dispense_arm_drive", position: [pv[0], pm.cup.bottom_y - 0.12, pv[2]] },
      point: { name: "Nozzle radial position over the wafer", targetAssetId: "dispense_arm", position: head, jointId: CELLESTA_JOINTS.arm, quantity: "position_linear", reference: { positionHome: "Nozzle radial distance from the spin axis (mm). The representative arm is rotary; angle -> radial mm is converted at the data boundary." }, coverageKo: "Nozzle의 반경 방향 위치. 분사 패턴이 아니다." },
      channels: [
        { suffix: "pv", name: "Nozzle position (feedback)", role: "measurement", unit: "mm", candidateSourceKey: `${J}_NOZZLE_POSITION_FB` },
        { suffix: "cmd", name: "Nozzle position command", role: "command", unit: "mm", candidateSourceKey: `${J}_NOZZLE_POSITION_CMD` },
      ],
      noteKo: "합성 데이터셋은 직선 축(DISPENSE_NOZZLE_AXIS)으로 둔다. 화면 arm 각도는 scripted이며 encoder 값이 아니다.",
    },
    {
      key: "spin_speed",
      name: "Spindle speed feedback",
      instrumentType: "encoder",
      principle: "Motor encoder (가정)",
      status: "planned",
      mount: { assetId: "spindle_drive", position: [0, pm.chuck.motor_y0 + 0.02, 0] },
      point: { name: "Spin chuck rotation", targetAssetId: "spin_chuck", position: [0, -0.02, 0], kind: "axis_reference", axis: [0, 1, 0], quantity: "speed_rotational", coverageKo: "Chuck 회전 속도." },
      channels: [
        { suffix: "pv", name: "Spin speed (feedback)", role: "measurement", unit: "rpm", candidateSourceKey: `${J}_SPIN_RPM_FB` },
        { suffix: "cmd", name: "Spin speed command", role: "command", unit: "rpm", candidateSourceKey: `${J}_SPIN_RPM_CMD` },
      ],
      noteKo: "화면의 rpm은 scripted 표시값이며 이 채널 값이 아니다.",
    },
    {
      key: "drain_flow",
      name: "Drain flow",
      instrumentType: "liquid_flow_meter",
      principle: "Drain flow sensor (가정)",
      status: "planned",
      mount: { assetId: "drain_outer", position: [dr.outer_x + 0.15, L.floorY + 0.12, dr.z] },
      point: { name: "Outer collection drain", targetAssetId: "drain_outer", position: [dr.outer_x, pm.cup.bottom_y - 0.05, dr.z], quantity: "flow_liquid", coverageKo: "Drain line 유량. 어느 회수 channel인지는 합성 데이터셋에 없다(바깥 channel에 대표 배치)." },
      channels: [{ suffix: "pv", name: "Drain flow", role: "measurement", unit: "L/min", candidateSourceKey: `${J}_DRAIN_FLOW_FB` }],
      noteKo: "Channel 구분은 가정이다.",
    },
    {
      key: "ipa_flow",
      name: "IPA flow",
      instrumentType: "liquid_flow_meter",
      principle: "Liquid flow meter (후보)",
      status: "candidate",
      mount: { assetId: "supply_manifold", position: [man[0], man[1] - 0.1, man[2] + 0.04] },
      point: { name: "IPA line upstream of the nozzle", targetAssetId: "supply_ipa", position: [man[0], man[1] + 0.12, man[2] + 0.02], quantity: "flow_liquid", coverageKo: "IPA line 유량." },
      channels: [{ suffix: "pv", name: "IPA flow", role: "measurement", unit: "mL/min" }],
      noteKo: "합성 데이터셋에는 건조 module 센서가 없다(후보).",
    },
    {
      key: "cup_exhaust",
      name: "Cup exhaust pressure",
      instrumentType: "pressure_transducer",
      principle: "Differential pressure (후보)",
      status: "candidate",
      mount: { assetId: "cup_exhaust", position: [pm.box.x1 - 0.06, pm.box.top_y - 0.2, pm.exhaust.z] },
      point: { name: "Cup exhaust duct", targetAssetId: "cup_exhaust", position: [pm.exhaust.x, pm.cup.bottom_y - 0.1, pm.exhaust.z], quantity: "pressure", reference: { pressureReference: "gauge", frameNote: "Duct 정압(gauge, 후보)" }, coverageKo: "Duct 한 점의 정압." },
      channels: [{ suffix: "pv", name: "Cup exhaust static pressure", role: "measurement", unit: "Pa" }],
      noteKo: "후보.",
    },
    {
      key: "leak",
      name: "Leak sensor (leak pan)",
      instrumentType: "proximity_sensor",
      principle: "Liquid presence (후보)",
      status: "candidate",
      mount: { assetId: "leak_pan", position: [0.3, L.floorY + 0.09, 0.25] },
      point: { name: "Leak pan", targetAssetId: "leak_pan", position: [0.05, L.floorY + 0.08, 0], quantity: "presence", coverageKo: "Pan 안 액체 유무." },
      channels: [{ suffix: "wet", name: "Leak detected", role: "status", unit: "bool" }],
      noteKo: "후보.",
    },
    {
      key: "wafer_presence",
      name: "Wafer presence on the chuck",
      instrumentType: "proximity_sensor",
      principle: "Optical presence (후보)",
      status: "candidate",
      mount: { assetId: "cup", position: [-0.18, pm.cup.rim_y + 0.02, -0.12] },
      point: { name: "Chuck support plane", targetAssetId: "spin_chuck", position: [0.1, 0, 0], quantity: "presence", coverageKo: "Wafer 유무. 건조 상태가 아니다." },
      channels: [{ suffix: "present", name: "Wafer present", role: "status", unit: "bool" }],
      noteKo: "후보. Dryness 센서는 두지 않았다.",
    },
    {
      key: "shutter_state",
      name: "Shutter closed switch",
      instrumentType: "limit_switch",
      principle: "Limit switch (후보)",
      status: "candidate",
      mount: { assetId: "pm_shutter", position: [pm.box.x0 + 0.02, pm.shutter.center_y + 0.06, pm.shutter.width / 2 + 0.03] },
      point: { name: "Shutter closed position", targetAssetId: "pm_shutter", position: [pm.box.x0, pm.shutter.center_y, 0], quantity: "status_binary", coverageKo: "Shutter 닫힘 여부." },
      channels: [{ suffix: "closed", name: "Shutter closed", role: "status", unit: "bool" }],
      noteKo: "후보.",
    },
    {
      key: "spindle_current",
      name: "Spindle motor current",
      instrumentType: "integrated_instrument",
      principle: "Drive current monitor (후보)",
      status: "candidate",
      mount: { assetId: "spindle_drive", position: [0.06, pm.chuck.motor_y0 + 0.05, 0] },
      point: { name: "Spindle motor", targetAssetId: "spindle_drive", position: [0, (pm.chuck.motor_y0 + pm.chuck.motor_y1) / 2, 0], quantity: "motor_current", coverageKo: "Motor 전류." },
      channels: [{ suffix: "a", name: "Spindle motor current", role: "measurement", unit: "A" }],
      noteKo: "후보.",
    },
  ];
}

export function buildCellestaMeasurementSeed(L: CellestaLayout): MeasurementSeed {
  return buildSeed(CELLESTA_TEMPLATE_ID, "cellesta-meas-seed-1", CELLESTA_MEAS_PREFIX, L.cfg.geometry_revision, cellestaSensors(L));
}

export const cellestaCrosswalk = (L: CellestaLayout) => crosswalkRows(cellestaSensors(L), CELLESTA_MEAS_PREFIX);
