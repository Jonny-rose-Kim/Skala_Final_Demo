/**
 * Tactras PM-01 measurement seed (representative mapping, not a manufacturer sensor list).
 *
 * "planned": channels the team's synthetic etch dataset designs (db/JAVAS, DryEtch SiO2 END2END v1.0, single
 * RF CCP-RIE chamber ETCH_SIM_A_CH01). "candidate": chuck / He / coolant / OES items of this configuration
 * that no dataset provides. Nothing is installed and every channel is Data unbound. The raw OES spectrum and
 * the endpoint estimate are separate channels; the endpoint is derived from the spectrum, never measured.
 */
import { azimuthToXZ } from "../../config/geometry";
import { buildSeed, crosswalkRows, type SensorSpec } from "../../domain/measurementKit";
import type { MeasurementSeed } from "../../domain/measurement";
import type { TactrasLayout } from "./layout";
import { TACTRAS_PINS_JOINT } from "./parts";
import { TACTRAS_TEMPLATE_ID } from "./template";

export const TACTRAS_MEAS_PREFIX = "tactras";
const J = "ETCH_SIM_A";

export function tactrasSensors(L: TactrasLayout): SensorSpec[] {
  const cfg = L.cfg;
  const pt = L.ports.pressure_tap;
  const tap = azimuthToXZ(pt.azimuth, L.rOuter + cfg.ports.pressure_tap.standoff_length + cfg.ports.pressure_tap.sensor_body_length / 2);
  const ex = L.ports.exhaust;
  const thr = azimuthToXZ(ex.azimuth, L.rOuter + cfg.ports.exhaust.stub_length + cfg.exhaust_line.throttle_valve_body_length / 2);
  const vp = L.ports.viewport;
  const vpOut = azimuthToXZ(vp.azimuth, L.rOuter + cfg.ports.viewport.tube_length + 0.03);
  const gapY = L.plasma.center[1];
  const p = cfg.peripherals;
  const gases = [
    { key: "cf4", asset: "mfc_cf4" },
    { key: "o2", asset: "mfc_o2" },
    { key: "ar", asset: "mfc_ar" },
  ];
  return [
    {
      key: "chamber_pressure",
      name: "Chamber pressure gauge (representative)",
      instrumentType: "pressure_gauge",
      principle: "Capacitance diaphragm (가정)",
      status: "planned",
      mount: { assetId: "pressure_sensor", position: [tap.x, pt.centerY, tap.z] },
      point: { name: "PM-01 process volume (lumped)", targetAssetId: "chamber_body", position: [0, gapY, 0], kind: "region", radius: 0.1, quantity: "pressure", reference: { pressureReference: "absolute", frameNote: "PM-01 내부 lumped pressure" }, coverageKo: "Chamber 한 지점의 대표 압력." },
      channels: [
        { suffix: "pv", name: "Chamber pressure (feedback)", role: "measurement", unit: "mTorr", candidateSourceKey: `${J}_PRESSURE_FB` },
        { suffix: "sp", name: "Pressure setpoint", role: "setpoint", unit: "mTorr", candidateSourceKey: `${J}_PRESSURE_SP (controller ETCH_SIM_A_APC_CONTROLLER)` },
      ],
      noteKo: "합성 데이터셋 단위는 mTorr.",
    },
    {
      key: "throttle_valve",
      name: "Throttle valve position",
      instrumentType: "integrated_instrument",
      principle: "Actuator position feedback (가정)",
      status: "planned",
      mount: { assetId: "throttle_valve", position: [thr.x, ex.centerY + 0.1, thr.z] },
      point: { name: "Throttle valve opening", targetAssetId: "throttle_valve", position: [thr.x, ex.centerY, thr.z], kind: "axis_reference", axis: [0, 1, 0], quantity: "valve_position", reference: { positionHome: "Fully closed = 0 %" }, coverageKo: "Valve 개도." },
      channels: [
        { suffix: "pv", name: "Throttle position (feedback)", role: "measurement", unit: "%", candidateSourceKey: `${J}_THROTTLE_POS_FB` },
        { suffix: "cmd", name: "Throttle open command", role: "command", unit: "%", candidateSourceKey: `${J}_THROTTLE_CMD` },
      ],
      noteKo: "Feedback과 command를 구분한다.",
    },
    ...gases.map(
      (g, i): SensorSpec => ({
        key: `${g.key}_flow`,
        name: `MFC ${i + 1} (${g.key.toUpperCase()} candidate line)`,
        instrumentType: "mfc",
        principle: "Thermal MFC (가정)",
        status: "planned",
        mount: { assetId: g.asset, position: L.mfcCenters[i] },
        point: { name: `${g.key.toUpperCase()} line at the MFC outlet`, targetAssetId: "gas_line", position: L.mfcCenters[i], quantity: "flow_gas", reference: { flowStandard: "0 degC, 101.325 kPa (sccm, 가정)" }, coverageKo: "MFC 위치 유량. Chamber 안 분포가 아니다." },
        channels: [
          { suffix: "pv", name: `${g.key.toUpperCase()} flow (feedback)`, role: "measurement", unit: "sccm", candidateSourceKey: `${J}_${g.key.toUpperCase()}_FB` },
          { suffix: "sp", name: `${g.key.toUpperCase()} flow setpoint`, role: "setpoint", unit: "sccm", candidateSourceKey: `${J}_${g.key.toUpperCase()}_SP` },
        ],
        noteKo: "Gas 종류는 합성 데이터셋의 line 설계를 따른 후보이며 장비 recipe가 아니다.",
      }),
    ),
    {
      key: "rf_power",
      name: "RF forward / reflected power",
      instrumentType: "directional_coupler",
      principle: "Directional coupler (가정)",
      status: "planned",
      mount: { assetId: "rf_generator", position: [p.rf_generator_center[0], p.rf_generator_center[1] + p.rf_generator_size[1] / 2, p.rf_generator_center[2]] },
      point: { name: "RF line to the lower electrode", targetAssetId: "matching_network", position: p.matching_network_center, quantity: "rf_power", coverageKo: "전달 경로의 RF 전력. Plasma 흡수 전력이나 bias 전압이 아니다." },
      channels: [
        { suffix: "fwd", name: "RF forward power (feedback)", role: "measurement", unit: "W", candidateSourceKey: `${J}_RF_FORWARD_FB` },
        { suffix: "sp", name: "RF power setpoint", role: "setpoint", unit: "W", candidateSourceKey: `${J}_RF_POWER_SP` },
        { suffix: "refl", name: "RF reflected power (feedback)", role: "measurement", unit: "W", candidateSourceKey: `${J}_RF_REFLECTED_FB (component MATCHING_NETWORK)` },
      ],
      noteKo: "주파수와 dual-frequency 여부는 정하지 않았다.",
    },
    {
      key: "esc_clamp",
      name: "ESC clamp supply",
      instrumentType: "integrated_instrument",
      principle: "HV supply monitor (후보)",
      status: "candidate",
      mount: { assetId: "lower_electrode_column", position: [-0.05, L.floorBottomY - 0.05, 0.05] },
      point: { name: "ESC electrode", targetAssetId: "esc_puck", position: [0, -0.003, 0], quantity: "voltage", coverageKo: "Clamp 전원 출력. Wafer 전위나 bias가 아니다." },
      channels: [
        { suffix: "v_cmd", name: "Clamp voltage command", role: "command", unit: "V" },
        { suffix: "v_mon", name: "Clamp voltage monitor", role: "measurement", unit: "V" },
      ],
      noteKo: "이 configuration은 ESC를 쓴다. 값과 극성은 정하지 않았다.",
    },
    {
      key: "esc_state",
      name: "ESC chuck state",
      instrumentType: "integrated_instrument",
      principle: "Controller state output (후보)",
      status: "candidate",
      mount: { assetId: "lower_electrode_column", position: [0.05, L.floorBottomY - 0.05, 0.05] },
      point: { name: "Chuck state", targetAssetId: "esc_puck", position: [0, -0.002, 0], quantity: "status_enum", coverageKo: "Clamped / released 상태 신호. 흡착력 측정이 아니다." },
      channels: [{ suffix: "state", name: "Chuck clamped / released", role: "status", unit: "enum" }],
      noteKo: "시연의 clamp 표시는 scripted이며 이 채널 값이 아니다.",
    },
    {
      key: "backside_he",
      name: "Backside He pressure controller",
      instrumentType: "pressure_transducer",
      principle: "He pressure control (후보)",
      status: "candidate",
      mount: { assetId: "backside_he_line", position: [0.45, L.floorY + 0.3, 0] },
      point: { name: "He groove under the wafer", targetAssetId: "esc_puck", position: [0.03, -0.001, 0], quantity: "pressure", reference: { pressureReference: "absolute", frameNote: "Wafer 뒷면 He 공간(대표 위치)" }, coverageKo: "뒷면 He 공간의 대표 압력." },
      channels: [
        { suffix: "pv", name: "Backside He pressure", role: "measurement", unit: "Torr" },
        { suffix: "sp", name: "Backside He setpoint", role: "setpoint", unit: "Torr" },
      ],
      noteKo: "이 configuration에 backside He가 있다. 합성 데이터셋에는 없다.",
    },
    {
      key: "chuck_temperature",
      name: "Lower electrode temperature sensor",
      instrumentType: "thermocouple",
      principle: "Embedded sensor (후보)",
      status: "candidate",
      mount: { assetId: "lower_electrode_base", position: [0.12, L.lower.baseY0 + 0.01, 0] },
      point: { name: "Base plate near the ESC", targetAssetId: "lower_electrode_base", position: [0.12, L.lower.escY0 - 0.005, 0], quantity: "temperature", coverageKo: "Base plate 한 점. Wafer 온도가 아니다." },
      channels: [{ suffix: "pv", name: "Base plate temperature", role: "measurement", unit: "degC" }],
      noteKo: "후보.",
    },
    {
      key: "coolant",
      name: "Chiller supply temperature / flow",
      instrumentType: "liquid_flow_meter",
      principle: "Chiller loop monitor (후보)",
      status: "candidate",
      mount: { assetId: "coolant_lines", position: [0.5 + cfg.peripherals.chiller_line_offset[0], L.floorY + 0.3, -0.04] },
      point: { name: "Coolant supply line", targetAssetId: "coolant_lines", position: [0.5, L.floorY + 0.3, -0.04], quantity: "flow_liquid", coverageKo: "공급 line 유량." },
      channels: [{ suffix: "flow", name: "Coolant flow", role: "measurement", unit: "L/min" }],
      noteKo: "후보.",
    },
    {
      key: "oes",
      name: "Optical emission spectrometer (not installed)",
      instrumentType: "optical_spectrometer",
      principle: "Fiber spectrometer on the viewport mount (후보)",
      status: "candidate",
      mount: { assetId: "oes_mount", position: [vpOut.x, vp.centerY, vpOut.z] },
      point: { name: "Viewport line of sight across the plasma gap", targetAssetId: "viewport", position: [vpOut.x, vp.centerY, vpOut.z], kind: "optical_path", pathTo: [0, gapY, 0], radius: 0.02, quantity: "optical_spectrum", coverageKo: "시선 위 적분 발광." },
      channels: [
        { suffix: "spectrum", name: "Raw emission spectrum", role: "measurement", unit: "counts", shape: "spectrum" },
        { suffix: "endpoint", name: "Endpoint estimate (derived from the spectrum)", role: "derived_estimate", quantity: "status_enum", unit: "enum", derivedFrom: ["tactras.ch.oes.spectrum"], noteKo: "Spectrum에서 계산하는 derived 채널(알고리즘 없음). 측정값이 아니다." },
      ],
      noteKo: "Mount bracket만 있다. 합성 데이터셋에는 OES가 없다.",
    },
  ];
}

export function buildTactrasMeasurementSeed(L: TactrasLayout): MeasurementSeed {
  return buildSeed(TACTRAS_TEMPLATE_ID, "tactras-meas-seed-1", TACTRAS_MEAS_PREFIX, L.cfg.geometry_revision, tactrasSensors(L));
}

export const tactrasCrosswalk = (L: TactrasLayout) => crosswalkRows(tactrasSensors(L), TACTRAS_MEAS_PREFIX);
void TACTRAS_PINS_JOINT;
