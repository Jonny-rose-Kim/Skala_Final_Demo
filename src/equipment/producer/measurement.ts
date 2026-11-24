/**
 * Producer cell A measurement seed (representative mapping, not a manufacturer sensor list).
 *
 * Status rule: channels that the team's synthetic PECVD dataset designs (db/JAVAS, SiO2 PECVD pilot v0.3,
 * one logical chamber) are "planned"; the rest are "candidate". Nothing is "installed" and every channel is
 * Data unbound. Setpoint / command channels sit on the controlling instrument and never stand in for the PV.
 * The pedestal temperature point is the pedestal, not the wafer.
 */
import { azimuthToXZ } from "../../config/geometry";
import { buildSeed, crosswalkRows, type SensorSpec } from "../../domain/measurementKit";
import type { MeasurementSeed } from "../../domain/measurement";
import type { ProducerLayout } from "./layout";
import { PRODUCER_TEMPLATE_ID } from "./template";

export const PRODUCER_MEAS_PREFIX = "producer";
export const PRODUCER_SEED_REVISION = "producer-meas-seed-1";
const JAVAS = "PECVD_SIO2_SIM_A";

export function producerSensors(L: ProducerLayout): SensorSpec[] {
  const cfg = L.cfg;
  const pt = L.ports.pressure_tap;
  const tapR = L.rOuter + cfg.ports.pressure_tap.standoff_length + cfg.ports.pressure_tap.sensor_body_length / 2;
  const tap = azimuthToXZ(pt.azimuth, tapR);
  const ex = L.ports.exhaust;
  const thr = azimuthToXZ(ex.azimuth, L.rOuter + cfg.ports.exhaust.stub_length + cfg.exhaust_line.throttle_valve_body_length / 2);
  const rf = cfg.peripherals.rf_generator_center;
  const mfc = L.mfcBlocks.centers;
  const vp = L.ports.viewport;
  const vpOut = azimuthToXZ(vp.azimuth, L.rOuter + cfg.ports.viewport.tube_length + 0.05);
  const gapY = (L.pedestalTopY + L.faceplateBottomY) / 2;
  return [
    {
      key: "chamber_pressure",
      name: "Chamber pressure gauge (capacitance manometer, representative)",
      instrumentType: "pressure_gauge",
      principle: "Capacitance diaphragm (가정)",
      status: "planned",
      mount: { assetId: "pressure_sensor", position: [tap.x, pt.centerY, tap.z] },
      point: { name: "Cell A process volume (lumped)", targetAssetId: "chamber_body", position: [0, gapY, 0], kind: "region", radius: 0.12, quantity: "pressure", reference: { pressureReference: "absolute", frameNote: "Pressure tap이 연결된 cell A 내부의 lumped pressure" }, coverageKo: "Cell A 내부 한 지점의 대표 압력. 공간 분포를 뜻하지 않는다." },
      channels: [
        { suffix: "pv", name: "Chamber pressure (PV)", role: "measurement", unit: "Torr", candidateSourceKey: `${JAVAS}_CHAMBER_PRESSURE` },
        { suffix: "sp", name: "Pressure setpoint (APC)", role: "setpoint", unit: "Torr", candidateSourceKey: "APC/pressure_setpoint", noteKo: "APC 목표값. 측정값이 아니다." },
      ],
      noteKo: "합성 데이터셋이 설계한 채널. 실제 설치 사양은 확인하지 않았다.",
    },
    {
      key: "throttle_valve",
      name: "Throttle valve position (APC actuator)",
      instrumentType: "integrated_instrument",
      principle: "Actuator position feedback (가정)",
      status: "planned",
      mount: { assetId: "throttle_valve", position: [thr.x, ex.centerY + 0.09, thr.z] },
      point: { name: "Throttle valve opening", targetAssetId: "throttle_valve", position: [thr.x, ex.centerY, thr.z], kind: "axis_reference", axis: [0, 1, 0], quantity: "valve_position", reference: { positionHome: "Fully closed = 0 %" }, coverageKo: "Valve 개도. Pumping speed나 압력이 아니다." },
      channels: [
        { suffix: "pv", name: "Throttle position (feedback)", role: "measurement", unit: "%", candidateSourceKey: `${JAVAS}_THROTTLE_VALVE_POS` },
        { suffix: "cmd", name: "Throttle open command", role: "command", unit: "%", candidateSourceKey: "APC/throttle_open_command" },
      ],
      noteKo: "Feedback과 command를 구분한다.",
    },
    ...(["teos", "o2", "ar"] as const).map((g, i): SensorSpec => ({
      key: `${g}_flow`,
      name: g === "teos" ? "TEOS liquid flow controller (LFC, representative)" : `${g.toUpperCase()} mass flow controller`,
      instrumentType: g === "teos" ? "liquid_flow_meter" : "mfc",
      principle: g === "teos" ? "Liquid mass flow (가정)" : "Thermal MFC (가정)",
      status: "planned",
      mount: { assetId: "mfc_01", position: mfc[Math.min(i, mfc.length - 1)] },
      point: g === "teos"
        ? { name: "TEOS liquid line (LFC outlet)", targetAssetId: "gas_line", position: mfc[0], quantity: "flow_liquid_mass", coverageKo: "LFC 위치의 액체 질량 유량. Vaporizer 이후 기체 유량이 아니다." }
        : { name: `${g.toUpperCase()} gas line (MFC outlet)`, targetAssetId: "gas_line", position: mfc[Math.min(i, mfc.length - 1)], quantity: "flow_gas", reference: { flowStandard: "0 degC, 101.325 kPa (sccm, 가정)" }, coverageKo: "MFC 위치의 기체 유량. Showerhead 분포가 아니다." },
      channels: [
        { suffix: "pv", name: `${g.toUpperCase()} flow (PV)`, role: "measurement", unit: g === "teos" ? "mg/min" : "sccm", candidateSourceKey: `${JAVAS}_${g === "teos" ? "TEOS_LIQUID" : g.toUpperCase()}_FLOW` },
        { suffix: "sp", name: `${g.toUpperCase()} flow command`, role: "setpoint", unit: g === "teos" ? "mg/min" : "sccm", candidateSourceKey: `${g === "teos" ? "TEOS_LFC/teos_liquid_flow_command" : `${g.toUpperCase()}_MFC/${g}_flow_command`}` },
      ],
      noteKo: g === "teos" ? "합성 데이터셋은 LFC → injection valve → vaporizer → heated line 경로를 둔다. Vaporizer와 heated line은 3D에 따로 만들지 않았다." : "MFC 3개를 gas panel의 대표 block에 둔다.",
    })),
    {
      key: "pedestal_temperature",
      name: "Pedestal thermocouple",
      instrumentType: "thermocouple",
      principle: "Type K thermocouple in the pedestal (가정)",
      status: "candidate",
      mount: { assetId: "thermocouple", position: [0, L.shaftBottomY + 0.02, 0], jointId: "pedestal_z" },
      point: { name: "Pedestal body near the surface", targetAssetId: "pedestal", position: [0, L.pedestalTopY - 0.01, 0], jointId: "pedestal_z", quantity: "temperature", coverageKo: "Pedestal 내부 한 점. Wafer 실제 온도가 아니다." },
      channels: [{ suffix: "pv", name: "Pedestal temperature", role: "measurement", unit: "degC", noteKo: "합성 데이터셋 v0.3에는 heater / pedestal 채널이 없다(후보)." }],
      noteKo: "Pedestal과 함께 움직이므로 mount와 target 모두 pedestal_z frame을 따른다.",
    },
    {
      key: "rf_power",
      name: "RF forward / reflected power (directional coupler)",
      instrumentType: "directional_coupler",
      principle: "Directional coupler at the generator output (가정)",
      status: "candidate",
      mount: { assetId: "rf_generator", position: [rf[0], rf[1] + cfg.peripherals.rf_generator_size[1] / 2, rf[2]] },
      point: { name: "RF line between generator and match", targetAssetId: "matching_network", position: [cfg.peripherals.matching_network_center[0], cfg.peripherals.matching_network_center[1], cfg.peripherals.matching_network_center[2]], quantity: "rf_power", coverageKo: "RF 전달 경로의 전력. Plasma에 흡수된 전력이 아니다." },
      channels: [
        { suffix: "fwd", name: "RF forward power", role: "measurement", unit: "W" },
        { suffix: "refl", name: "RF reflected power", role: "measurement", unit: "W" },
      ],
      noteKo: "RF 주파수와 전력값은 정하지 않았다.",
    },
    {
      key: "rf_state",
      name: "RF generator output state",
      instrumentType: "integrated_instrument",
      principle: "Generator status output (가정)",
      status: "planned",
      mount: { assetId: "rf_generator", position: [rf[0] + 0.15, rf[1], rf[2]] },
      point: { name: "RF generator output", targetAssetId: "rf_generator", position: [rf[0], rf[1], rf[2]], quantity: "status_binary", coverageKo: "Generator 출력 on/off 상태. 전력값이 아니다." },
      channels: [{ suffix: "on", name: "RF on state", role: "status", unit: "bool", noteKo: "합성 데이터셋은 RF를 on/off 상태로만 둔다(13.56 MHz state only)." }],
      noteKo: "상태 채널. 전력 측정과 구분한다.",
    },
    {
      key: "oes",
      name: "Optical emission spectrometer (viewport, not installed)",
      instrumentType: "optical_spectrometer",
      principle: "Fiber-coupled spectrometer on the viewport (후보)",
      status: "candidate",
      mount: { assetId: "viewport", position: [vpOut.x, vp.centerY, vpOut.z] },
      point: { name: "Viewport line of sight through the plasma gap", targetAssetId: "viewport", position: [vpOut.x, vp.centerY, vpOut.z], kind: "optical_path", pathTo: [0, gapY, 0], radius: 0.02, quantity: "optical_spectrum", coverageKo: "Viewport 시선 위 plasma의 적분 발광. 공간 분포가 아니다." },
      channels: [{ suffix: "spectrum", name: "Raw emission spectrum", role: "measurement", unit: "counts", shape: "spectrum", noteKo: "Raw spectrum. Endpoint나 막 두께 추정은 별도 derived 채널이다(없음)." }],
      noteKo: "합성 데이터셋은 OES를 일부러 제외했다.",
    },
  ];
}

export function buildProducerMeasurementSeed(L: ProducerLayout): MeasurementSeed {
  return buildSeed(PRODUCER_TEMPLATE_ID, PRODUCER_SEED_REVISION, PRODUCER_MEAS_PREFIX, "producer-se-ccp-cell-1.0.0", producerSensors(L));
}

export const producerCrosswalk = (L: ProducerLayout) => crosswalkRows(producerSensors(L), PRODUCER_MEAS_PREFIX);
