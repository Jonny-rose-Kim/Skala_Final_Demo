/**
 * Sensor semantics for the V1 template. Instruments, channels and measurement points are defined;
 * every channel binding is "unbound" because no data source exists in Visual Inspection mode.
 * No observations are fabricated.
 */
import type { ChamberLayout } from "../config/geometry";
import { azimuthToXZ } from "../config/geometry";
import type { ChannelBinding, MeasurementPointDef, SensorInstanceDef } from "./types";

export const SENSORS: SensorInstanceDef[] = [
  {
    sensorId: "sensor.chamber_pressure",
    name: "Chamber pressure (capacitance manometer)",
    principle: "Capacitance diaphragm gauge",
    mountAssetId: "pressure_sensor",
    channels: [{ channelId: "ch.pressure.chamber", name: "Chamber pressure", quantity: "pressure", unit: "Pa", payloadType: "scalar", measurementPointId: "mp.chamber_pressure" }],
  },
  {
    sensorId: "sensor.pedestal_tc",
    name: "Pedestal thermocouple",
    principle: "Type-K thermocouple (sheathed)",
    mountAssetId: "thermocouple",
    channels: [{ channelId: "ch.temperature.pedestal", name: "Pedestal temperature", quantity: "temperature", unit: "degC", payloadType: "scalar", measurementPointId: "mp.pedestal_center" }],
  },
  {
    sensorId: "sensor.rf_power",
    name: "RF generator power sensing",
    principle: "Directional coupler (forward / reflected)",
    mountAssetId: "rf_generator",
    channels: [
      { channelId: "ch.rf.forward_power", name: "Forward power", quantity: "rf_power", unit: "W", payloadType: "scalar", measurementPointId: "mp.rf_output" },
      { channelId: "ch.rf.reflected_power", name: "Reflected power", quantity: "rf_power", unit: "W", payloadType: "scalar", measurementPointId: "mp.rf_output" },
    ],
  },
  {
    sensorId: "sensor.throttle_position",
    name: "Throttle valve position feedback",
    principle: "Actuator encoder",
    mountAssetId: "throttle_valve",
    channels: [{ channelId: "ch.valve.throttle_position", name: "Throttle opening", quantity: "valve_position", unit: "%", payloadType: "scalar", measurementPointId: "mp.throttle" }],
  },
  {
    sensorId: "sensor.mfc_flow",
    name: "MFC flow feedback",
    principle: "Thermal mass flow controller",
    mountAssetId: "gas_panel",
    channels: [{ channelId: "ch.flow.mfc1", name: "MFC-1 flow", quantity: "flow", unit: "sccm", payloadType: "scalar", measurementPointId: "mp.gas_panel_out" }],
  },
];

export function measurementPoints(L: ChamberLayout): MeasurementPointDef[] {
  const tap = L.ports.pressure_tap;
  const tapXZ = azimuthToXZ(tap.azimuth, L.rLinerIn);
  const exhaustXZ = azimuthToXZ(L.ports.exhaust.azimuth, L.rOuter + L.cfg.ports.exhaust.stub_length + L.cfg.exhaust_line.throttle_valve_body_length / 2);
  return [
    {
      pointId: "mp.chamber_pressure",
      name: "Chamber volume pressure (lumped)",
      targetAssetId: "chamber_body",
      quantity: "pressure",
      position: [tapXZ.x, tap.centerY, tapXZ.z],
      note: "Lumped chamber pressure. 센서 본체는 벽 바깥 standoff 끝에 있고, 측정 대상은 tap 내측 개구부가 연결된 chamber 내부 공간이다.",
    },
    {
      pointId: "mp.pedestal_center",
      name: "Pedestal center temperature",
      targetAssetId: "pedestal",
      quantity: "temperature",
      position: [0, L.pedestalTopY - 0.006, 0],
      note: "Wafer 바로 아래 pedestal 중심. 센서 커넥터는 shaft 하단에 있다.",
    },
    {
      pointId: "mp.rf_output",
      name: "RF delivered at generator output",
      targetAssetId: "rf_generator",
      quantity: "rf_power",
      position: [L.cfg.peripherals.rf_generator_center[0], L.cfg.peripherals.rf_generator_center[1] + L.cfg.peripherals.rf_generator_size[1] / 2, L.cfg.peripherals.rf_generator_center[2]],
      note: "Generator 출력단 기준. Plasma에 실제 전달된 전력과는 다르다.",
    },
    {
      pointId: "mp.throttle",
      name: "Throttle valve opening",
      targetAssetId: "throttle_valve",
      quantity: "valve_position",
      position: [exhaustXZ.x, L.ports.exhaust.centerY, exhaustXZ.z],
      note: "Valve 개도 feedback.",
    },
    {
      pointId: "mp.gas_panel_out",
      name: "Gas panel outlet flow",
      targetAssetId: "gas_panel",
      quantity: "flow",
      position: [L.cfg.peripherals.gas_panel_center[0], L.cfg.peripherals.gas_panel_center[1] + L.cfg.peripherals.gas_panel_size[1] / 2, L.cfg.peripherals.gas_panel_center[2]],
      note: "MFC 출구 기준 유량.",
    },
  ];
}

export const CHANNEL_BINDINGS: ChannelBinding[] = SENSORS.flatMap((s) =>
  s.channels.map((ch) => ({ channelId: ch.channelId, source: "unbound" as const, installationRevision: "install-rev-1" })),
);

export function sensorsMountedOn(assetId: string): SensorInstanceDef[] {
  return SENSORS.filter((s) => s.mountAssetId === assetId);
}

export function measurementPointsFor(assetId: string, L: ChamberLayout): MeasurementPointDef[] {
  return measurementPoints(L).filter((p) => p.targetAssetId === assetId);
}
