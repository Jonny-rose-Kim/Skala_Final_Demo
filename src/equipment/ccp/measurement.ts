/**
 * CCP measurement seed in the shared contract, built from the original V1 sensor definitions so the
 * existing sensor / channel / point ids keep their meaning (compatibility mapping, not a re-seed).
 * Added per the extension spec: slit gate status (limit switch) and an OES candidate point that is
 * NOT installed (viewport optical path without an installed spectrometer).
 */
import type { ChamberLayout } from "../../config/geometry";
import { azimuthToXZ } from "../../config/geometry";
import type { MeasurementSeed, MeasurementPointDefV2, MeasurementChannelDefV2, InstrumentDef, InstrumentInstallationDef, ChannelPointBindingDef, Quantity } from "../../domain/measurement";
import { SENSORS, measurementPoints } from "../../domain/sensors";
import type { SensorInstanceDef } from "../../domain/types";

const LEGACY_QUANTITY: Record<SensorInstanceDef["channels"][number]["quantity"], Quantity> = {
  pressure: "pressure",
  temperature: "temperature",
  flow: "flow_gas",
  rf_power: "rf_power",
  valve_position: "valve_position",
  voltage: "voltage",
};

const INSTRUMENT_TYPE: Record<string, InstrumentDef["type"]> = {
  "sensor.chamber_pressure": "pressure_gauge",
  "sensor.pedestal_tc": "thermocouple",
  "sensor.rf_power": "directional_coupler",
  "sensor.throttle_position": "integrated_instrument",
  "sensor.mfc_flow": "mfc",
};

/** Body position of each legacy sensor in the instance frame (the legacy definition only named the mount asset). */
function legacyMountPosition(sensorId: string, L: ChamberLayout): [number, number, number] {
  const cfg = L.cfg;
  switch (sensorId) {
    case "sensor.chamber_pressure": {
      const pt = L.ports.pressure_tap;
      const r = L.rOuter + cfg.ports.pressure_tap.standoff_length + cfg.ports.pressure_tap.sensor_body_length / 2;
      const xz = azimuthToXZ(pt.azimuth, r);
      return [xz.x, pt.centerY, xz.z];
    }
    case "sensor.pedestal_tc":
      return [0, L.shaftBottomY + 0.02, 0];
    case "sensor.rf_power": {
      const c = cfg.peripherals.rf_generator_center;
      return [c[0], c[1] + cfg.peripherals.rf_generator_size[1] / 2, c[2]];
    }
    case "sensor.throttle_position": {
      const ex = L.ports.exhaust;
      const xz = azimuthToXZ(ex.azimuth, L.rOuter + cfg.ports.exhaust.stub_length + cfg.exhaust_line.throttle_valve_body_length / 2);
      return [xz.x, ex.centerY + cfg.exhaust_line.throttle_valve_body_diameter / 2 + 0.04, xz.z];
    }
    case "sensor.mfc_flow":
      return L.mfcBlocks.centers[0];
    default:
      return [0, 0, 0];
  }
}

export function buildCcpMeasurementSeed(L: ChamberLayout): MeasurementSeed {
  const instruments: InstrumentDef[] = [];
  const installations: InstrumentInstallationDef[] = [];
  const channels: MeasurementChannelDefV2[] = [];
  const pointBindings: ChannelPointBindingDef[] = [];
  const legacyPoints = measurementPoints(L);
  const points: MeasurementPointDefV2[] = legacyPoints.map((p) => ({
    pointId: p.pointId,
    name: p.name,
    targetAssetId: p.targetAssetId,
    pointKind: p.pointId === "mp.chamber_pressure" ? "region" : p.pointId === "mp.throttle" ? "axis_reference" : "point",
    geometry: p.pointId === "mp.chamber_pressure" ? { position: p.position, radius: 0.05 } : p.pointId === "mp.throttle" ? { position: p.position, axis: [0, 1, 0] } : { position: p.position },
    quantity: LEGACY_QUANTITY[p.quantity],
    reference:
      p.quantity === "pressure"
        ? { pressureReference: "absolute", frameNote: "Chamber-side tap 내측 개구부가 연결된 공간의 lumped pressure" }
        : p.quantity === "flow"
          ? { flowStandard: "0 degC, 101.325 kPa (sccm, 가정)" }
          : p.quantity === "valve_position"
            ? { positionHome: "Fully closed = 0 %, commanded opening과 구별" }
            : p.quantity === "rf_power"
              ? { frameNote: "Generator 출력 reference plane; forward-reflected를 plasma absorbed power로 명명하지 않음" }
              : { frameNote: "Stage temperature; wafer surface temperature로 단정하지 않음" },
    coverageKo: p.pointId === "mp.chamber_pressure" ? "Lumped chamber volume (공간 분해능 없음)" : "단일 점 / 축 reference",
    noteKo: p.note,
  }));
  for (const s of SENSORS) {
    instruments.push({ instrumentId: s.sensorId, name: s.name, type: INSTRUMENT_TYPE[s.sensorId] ?? "integrated_instrument", principle: s.principle, installationStatus: "installed" });
    installations.push({
      installationId: `inst.${s.sensorId}`,
      instrumentId: s.sensorId,
      mountedOnAssetId: s.mountAssetId,
      mountPosition: legacyMountPosition(s.sensorId, L),
      installationStatus: "installed",
      placementBasis: "design_assumption",
      revision: "install-rev-1",
    });
    for (const ch of s.channels) {
      channels.push({ channelId: ch.channelId, instrumentId: s.sensorId, name: ch.name, quantity: LEGACY_QUANTITY[ch.quantity], canonicalUnit: ch.unit, dataShape: ch.payloadType === "scalar" ? "scalar" : ch.payloadType, channelRole: "measurement" });
      pointBindings.push({ bindingId: `bind.${ch.channelId}`, channelId: ch.channelId, pointId: ch.measurementPointId, role: "primary", configurationRevision: "cfg-rev-1" });
    }
  }
  // Gate closed/open detection (seed item 6): limit switch on the slit valve actuator, separate from the scene pose.
  const slit = L.ports.slit;
  const slitXZ = azimuthToXZ(slit.azimuth, L.rOuter + 0.012 + L.cfg.ports.slit.valve_body_size[2] / 2);
  instruments.push({ instrumentId: "sensor.slit_gate_status", name: "Slit valve gate position switches", type: "limit_switch", principle: "Closed / open limit switches on the actuator", installationStatus: "installed" });
  installations.push({
    installationId: "inst.sensor.slit_gate_status",
    instrumentId: "sensor.slit_gate_status",
    mountedOnAssetId: "slit_valve",
    mountPosition: [slitXZ.x, slit.centerY - L.cfg.ports.slit.valve_body_size[1] / 2 - 0.1, slitXZ.z],
    installationStatus: "installed",
    placementBasis: "design_assumption",
    revision: "install-rev-1",
  });
  points.push({
    pointId: "mp.slit_gate_detect",
    name: "Slit gate closed/open detection location",
    targetAssetId: "slit_valve",
    pointKind: "line_reference",
    geometry: { position: [slitXZ.x, slit.centerY - L.cfg.ports.slit.valve_body_size[1] / 2, slitXZ.z], pathTo: [slitXZ.x, slit.centerY - L.cfg.ports.slit.valve_body_size[1] / 2 - 0.16, slitXZ.z] },
    quantity: "status_binary",
    reference: { positionHome: "Closed limit = reference; open limit at actuator stroke end" },
    coverageKo: "Actuator stroke 양 끝의 두 switch 위치",
    noteKo: "Scene의 gate pose(scripted)와 실제 readback을 구별한다. V1에는 readback이 없다.",
  });
  channels.push(
    { channelId: "ch.gate.closed", instrumentId: "sensor.slit_gate_status", name: "Gate closed switch", quantity: "status_binary", canonicalUnit: "bool", dataShape: "boolean", channelRole: "status" },
    { channelId: "ch.gate.open", instrumentId: "sensor.slit_gate_status", name: "Gate open switch", quantity: "status_binary", canonicalUnit: "bool", dataShape: "boolean", channelRole: "status" },
  );
  pointBindings.push(
    { bindingId: "bind.ch.gate.closed", channelId: "ch.gate.closed", pointId: "mp.slit_gate_detect", role: "primary", configurationRevision: "cfg-rev-1" },
    { bindingId: "bind.ch.gate.open", channelId: "ch.gate.open", pointId: "mp.slit_gate_detect", role: "primary", configurationRevision: "cfg-rev-1" },
  );
  // Optional OES: candidate optical path through the viewport; no spectrometer is installed in the default instance.
  const vp = L.ports.viewport;
  const vpOut = azimuthToXZ(vp.azimuth, L.rOuter + L.cfg.ports.viewport.tube_length + 0.02);
  const vpIn = azimuthToXZ(vp.azimuth, L.rFaceplate * 0.4);
  points.push({
    pointId: "mp.ccp_viewport_oes_path",
    name: "Viewport optical line of sight (OES candidate)",
    targetAssetId: "viewport",
    pointKind: "optical_path",
    geometry: { position: [vpOut.x, vp.centerY, vpOut.z], pathTo: [vpIn.x, vp.centerY, vpIn.z] },
    quantity: "optical_spectrum",
    reference: { frameNote: "Viewport window을 통한 전극 사이 glow 관측 경로 후보" },
    coverageKo: "Line of sight (window 지름으로 제한); 공간 분해 없음",
    noteKo: "설치 후보 / Not installed. 설치 근거와 optical coverage가 확인될 때만 Instrument를 추가한다.",
    candidate: true,
  });
  return {
    templateId: "ccp_pecvd_single_wafer_300",
    seedRevision: "ccp-meas-seed-2",
    instruments,
    installations,
    points,
    channels,
    pointBindings,
    sourceBindings: [],
    calibrations: instruments.map((i) => ({ calibrationId: `cal.${i.instrumentId}`, instrumentId: i.instrumentId, status: "unknown" as const })),
  };
}
