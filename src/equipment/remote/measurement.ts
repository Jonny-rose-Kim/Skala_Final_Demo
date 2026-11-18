/**
 * Remote ICP PECVD measurement seed (R-MP-01 .. R-MP-09). Representative instrumentation of this
 * project's template, not a vendor's standard configuration. Every channel is Data unbound in V1.
 */
import { azimuthToXZ } from "../../config/geometry";
import type { ChannelPointBindingDef, InstrumentDef, InstrumentInstallationDef, MeasurementChannelDefV2, MeasurementPointDefV2, MeasurementSeed } from "../../domain/measurement";
import type { RemoteLayout } from "./layout";
import { REMOTE_TEMPLATE_ID } from "./template";

export function buildRemoteMeasurementSeed(L: RemoteLayout): MeasurementSeed {
  const cfg = L.cfg;
  const gp = cfg.peripherals;
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

  // R-MP-01: candidate source pressure tap (transport section) — point only, Not installed
  const tapC = azimuthToXZ(L.transport.candidateTapAzimuth, L.transport.rIn - 0.004);
  points.push({
    pointId: "remote.mp.source_pressure_candidate",
    name: "Source / transport pressure tap (candidate)",
    targetAssetId: "transport_section",
    pointKind: "region",
    geometry: { position: [tapC.x, L.transport.candidateTapY, tapC.z], radius: 0.03 },
    quantity: "pressure",
    reference: { pressureReference: "absolute", frameNote: "Transport section bore, separate from the chamber tap. 하나의 pressure 데이터를 두 실측처럼 복제하지 않는다." },
    coverageKo: "Transport section lumped pressure (후보)",
    noteKo: "별도 source-pressure 계측을 채택한 Instance에서만 Instrument를 설치한다. 기본 Instance에서는 설치 후보 / Not installed.",
    candidate: true,
  });

  // R-MP-02: chamber pressure tap -> chamber pressure gauge
  const pt = L.ports.pressure_tap;
  const tapIn = azimuthToXZ(pt.azimuth, L.rLinerIn);
  const bodyXZ = azimuthToXZ(pt.azimuth, L.rOuter + cfg.ports.pressure_tap.standoff_length + cfg.ports.pressure_tap.sensor_body_length / 2);
  inst({ instrumentId: "remote.gauge_chamber", name: "Chamber pressure gauge (capacitance manometer)", type: "pressure_gauge", principle: "Capacitance diaphragm gauge", installationStatus: "installed" }, { mountedOnAssetId: "pressure_sensor", mountPosition: [bodyXZ.x, pt.centerY, bodyXZ.z] });
  points.push({
    pointId: "remote.mp.chamber_pressure",
    name: "Process-chamber pressure at the tap (lumped)",
    targetAssetId: "chamber_body",
    pointKind: "region",
    geometry: { position: [tapIn.x, pt.centerY, tapIn.z], radius: 0.05 },
    quantity: "pressure",
    reference: { pressureReference: "absolute", frameNote: "Tap 내측 개구부가 연결된 chamber 공간" },
    coverageKo: "Lumped chamber volume (공간 분해능 없음)",
    noteKo: "Gauge 본체는 벽 밖 standoff 끝에 있다. Pumpdown 연출이 있어도 Observation을 만들지 않는다.",
  });
  ch({ channelId: "remote.ch.pressure.chamber", instrumentId: "remote.gauge_chamber", name: "Chamber pressure", quantity: "pressure", canonicalUnit: "Pa", dataShape: "scalar", channelRole: "measurement" }, "remote.mp.chamber_pressure");

  // R-MP-03: source RF feed reference plane -> forward / reflected
  const [mx, my, mz] = gp.source_match_box_center;
  const [mw] = gp.source_match_box_size;
  inst({ instrumentId: "remote.rf_coupler", name: "Source RF directional coupler", type: "directional_coupler", principle: "Directional coupler at the matching network output", installationStatus: "installed" }, { mountedOnAssetId: "source_match_box", mountPosition: [mx, my, mz] });
  points.push({
    pointId: "remote.mp.rf_feed_reference",
    name: "Source RF feed reference plane (match output)",
    targetAssetId: "coil_leads",
    pointKind: "point",
    geometry: { position: [mx - mw / 2, L.coil.y0, mz] },
    quantity: "rf_power",
    reference: { frameNote: "Matching network 출력 reference plane. Forward−reflected 차이를 plasma absorbed power로 명명하지 않는다." },
    coverageKo: "단일 reference plane",
    noteKo: "Generator 출력단과 coil 단자 사이의 손실은 포함되지 않는다.",
  });
  ch({ channelId: "remote.ch.rf.forward", instrumentId: "remote.rf_coupler", name: "Forward power", quantity: "rf_power", canonicalUnit: "W", dataShape: "scalar", channelRole: "measurement" }, "remote.mp.rf_feed_reference");
  ch({ channelId: "remote.ch.rf.reflected", instrumentId: "remote.rf_coupler", name: "Reflected power", quantity: "rf_power", canonicalUnit: "W", dataShape: "scalar", channelRole: "measurement" }, "remote.mp.rf_feed_reference");

  // R-MP-04: source optical viewport line of sight -> OES spectrum
  const sv = L.sourceViewport;
  const oesXZ = azimuthToXZ(sv.azimuth, L.housing.rOut + sv.tubeLength + 0.012 + sv.oesLength / 2);
  const losOut = azimuthToXZ(sv.azimuth, L.housing.rOut + sv.tubeLength);
  const losIn = azimuthToXZ(sv.azimuth, -L.tube.rIn * 0.6);
  inst({ instrumentId: "remote.oes", name: "Source OES spectrometer", type: "optical_spectrometer", principle: "Fiber-coupled optical emission spectrometer", installationStatus: "installed", noteKo: "installationBasis = design_assumption" }, { mountedOnAssetId: "oes_spectrometer", mountPosition: [oesXZ.x, sv.centerY, oesXZ.z] });
  points.push({
    pointId: "remote.mp.source_oes_path",
    name: "Source viewport line of sight into the discharge tube",
    targetAssetId: "discharge_tube",
    pointKind: "optical_path",
    geometry: { position: [losOut.x, sv.centerY, losOut.z], pathTo: [losIn.x, sv.centerY, losIn.z], radius: sv.rBore },
    quantity: "optical_spectrum",
    reference: { frameNote: "Housing viewport → quartz tube wall → 방전 영역 관측 경로 (chord)" },
    coverageKo: "Line of sight chord (viewport bore로 제한); 공간 분해 없음",
    noteKo: "Sensor body는 밖에 있고 coverage는 방전관 내부 관측 경로다.",
  });
  ch({ channelId: "remote.ch.oes.spectrum", instrumentId: "remote.oes", name: "OES spectrum", quantity: "optical_spectrum", canonicalUnit: "counts", dataShape: "spectrum", channelRole: "measurement" }, "remote.mp.source_oes_path");

  // R-MP-05: stage sensor pocket -> stage temperature
  inst({ instrumentId: "remote.stage_tc", name: "Stage thermocouple", type: "thermocouple", principle: "Type-K thermocouple (sheathed)", installationStatus: "installed" }, { mountedOnAssetId: "thermocouple", mountFrameJointId: "stage_z", mountPosition: [0, cfg.stage.shaft_bottom_y - 0.08, 0] });
  points.push({
    pointId: "remote.mp.stage_center",
    name: "Stage center sensor pocket",
    targetAssetId: "stage",
    frameJointId: "stage_z",
    pointKind: "point",
    geometry: { position: [0, L.stageTopY - 0.008, 0] },
    quantity: "temperature",
    reference: { frameNote: "Stage temperature; wafer surface temperature와 별도" },
    coverageKo: "단일 점 (stage 중심)",
    noteKo: "TC 커넥터는 shaft 하단에 있다.",
  });
  ch({ channelId: "remote.ch.temperature.stage", instrumentId: "remote.stage_tc", name: "Stage temperature", quantity: "temperature", canonicalUnit: "degC", dataShape: "scalar", channelRole: "measurement" }, "remote.mp.stage_center");

  // R-MP-06 / 07: source gas and precursor MFC measured flow (separate instruments)
  const ms = L.sourceMfc.centers[0];
  inst({ instrumentId: "remote.mfc_source", name: "MFC-S flow feedback (source gas)", type: "mfc", principle: "Thermal mass flow controller", installationStatus: "installed" }, { mountedOnAssetId: "mfc_source", mountPosition: ms });
  points.push({
    pointId: "remote.mp.mfc_source_out",
    name: "MFC-S outlet flow (source gas branch)",
    targetAssetId: "mfc_source",
    pointKind: "point",
    geometry: { position: [ms[0], ms[1] + L.sourceMfc.size[1] / 2, ms[2]] },
    quantity: "flow_gas",
    reference: { flowStandard: "0 degC, 101.325 kPa (sccm, 가정)" },
    coverageKo: "Branch 기준 유량 (단일 MFC)",
    noteKo: "Flow command와 구별되는 measured flow.",
  });
  ch({ channelId: "remote.ch.flow.source", instrumentId: "remote.mfc_source", name: "MFC-S measured flow", quantity: "flow_gas", canonicalUnit: "sccm", dataShape: "scalar", channelRole: "measurement" }, "remote.mp.mfc_source_out");
  const mp = L.precursorMfc.centers[0];
  inst({ instrumentId: "remote.mfc_precursor", name: "MFC-P flow feedback (precursor)", type: "mfc", principle: "Thermal mass flow controller", installationStatus: "installed" }, { mountedOnAssetId: "mfc_precursor", mountPosition: mp });
  points.push({
    pointId: "remote.mp.mfc_precursor_out",
    name: "MFC-P outlet flow (precursor branch)",
    targetAssetId: "mfc_precursor",
    pointKind: "point",
    geometry: { position: [mp[0], mp[1] + L.precursorMfc.size[1] / 2, mp[2]] },
    quantity: "flow_gas",
    reference: { flowStandard: "0 degC, 101.325 kPa (sccm, 가정)" },
    coverageKo: "Branch 기준 유량 (단일 MFC)",
    noteKo: "Source gas branch와 별도 instrument / channel.",
  });
  ch({ channelId: "remote.ch.flow.precursor", instrumentId: "remote.mfc_precursor", name: "MFC-P measured flow", quantity: "flow_gas", canonicalUnit: "sccm", dataShape: "scalar", channelRole: "measurement" }, "remote.mp.mfc_precursor_out");

  // R-MP-08: coolant return line -> temperature + flow
  const cl = L.coolant;
  const clXZ = azimuthToXZ(cl.azimuth, L.housing.rOut + 0.08);
  inst({ instrumentId: "remote.coolant_return", name: "Coolant return sensor (temperature + flow)", type: "liquid_flow_meter", principle: "Inline RTD + turbine flow meter on the return line", installationStatus: "installed", noteKo: "냉각 회로 선택(coil 전용)은 가정" }, { mountedOnAssetId: "coolant_fittings", mountPosition: [clXZ.x, cl.ys[1], clXZ.z] });
  points.push({
    pointId: "remote.mp.coolant_return",
    name: "Coolant return line reference",
    targetAssetId: "coolant_fittings",
    pointKind: "point",
    geometry: { position: [clXZ.x, cl.ys[1], clXZ.z] },
    quantity: "temperature",
    reference: { frameNote: "Return line 액체 온도; coil 금속 온도가 아니다" },
    coverageKo: "Return line 단면 평균",
    noteKo: "같은 Point를 flow channel도 관측한다 (복수 채널, 같은 위치).",
  });
  points.push({
    pointId: "remote.mp.coolant_return_flow",
    name: "Coolant return line flow reference",
    targetAssetId: "coolant_fittings",
    pointKind: "point",
    geometry: { position: [clXZ.x, cl.ys[1] + 0.001, clXZ.z] },
    quantity: "flow_liquid",
    reference: { frameNote: "Liquid volumetric flow (gas standard flow와 다름)" },
    coverageKo: "Return line 체적 유량",
    noteKo: "Liquid flow; MFC sccm과 혼동하지 않는다.",
  });
  ch({ channelId: "remote.ch.coolant.temperature", instrumentId: "remote.coolant_return", name: "Coolant return temperature", quantity: "temperature", canonicalUnit: "degC", dataShape: "scalar", channelRole: "measurement" }, "remote.mp.coolant_return");
  ch({ channelId: "remote.ch.coolant.flow", instrumentId: "remote.coolant_return", name: "Coolant return flow", quantity: "flow_liquid", canonicalUnit: "L/min", dataShape: "scalar", channelRole: "measurement" }, "remote.mp.coolant_return_flow");

  // R-MP-09: gate / valve detection (shared definition with the CCP)
  const slit = L.ports.slit;
  const slitXZ = azimuthToXZ(slit.azimuth, L.rOuter + 0.012 + cfg.ports.slit.valve_body_size[2] / 2);
  const gateY = slit.centerY - cfg.ports.slit.valve_body_size[1] / 2;
  inst({ instrumentId: "remote.slit_gate_status", name: "Slit valve gate position switches", type: "limit_switch", principle: "Closed / open limit switches on the actuator", installationStatus: "installed" }, { mountedOnAssetId: "slit_valve", mountPosition: [slitXZ.x, gateY - 0.1, slitXZ.z] });
  points.push({
    pointId: "remote.mp.slit_gate_detect",
    name: "Slit gate closed/open detection location",
    targetAssetId: "slit_valve",
    pointKind: "line_reference",
    geometry: { position: [slitXZ.x, gateY, slitXZ.z], pathTo: [slitXZ.x, gateY - 0.16, slitXZ.z] },
    quantity: "status_binary",
    reference: { positionHome: "Closed limit = reference" },
    coverageKo: "Actuator stroke 양 끝의 switch 위치",
    noteKo: "Scene의 gate pose(scripted)와 실제 readback을 구별한다.",
  });
  ch({ channelId: "remote.ch.gate.closed", instrumentId: "remote.slit_gate_status", name: "Gate closed switch", quantity: "status_binary", canonicalUnit: "bool", dataShape: "boolean", channelRole: "status" }, "remote.mp.slit_gate_detect");
  ch({ channelId: "remote.ch.gate.open", instrumentId: "remote.slit_gate_status", name: "Gate open switch", quantity: "status_binary", canonicalUnit: "bool", dataShape: "boolean", channelRole: "status" }, "remote.mp.slit_gate_detect");
  const ex = L.ports.exhaust;
  const exXZ = azimuthToXZ(ex.azimuth, L.rOuter + cfg.ports.exhaust.stub_length + cfg.exhaust_line.throttle_valve_body_length / 2);
  inst({ instrumentId: "remote.throttle_position", name: "Throttle valve position feedback", type: "integrated_instrument", principle: "Actuator encoder (integrated)", installationStatus: "installed" }, { mountedOnAssetId: "throttle_valve", mountPosition: [exXZ.x, ex.centerY + cfg.exhaust_line.throttle_valve_body_diameter / 2 + 0.04, exXZ.z] });
  points.push({
    pointId: "remote.mp.throttle_axis",
    name: "Throttle valve shaft reference",
    targetAssetId: "throttle_valve",
    pointKind: "axis_reference",
    geometry: { position: [exXZ.x, ex.centerY, exXZ.z], axis: [0, 1, 0] },
    quantity: "valve_position",
    reference: { positionHome: "Fully closed = 0 %; commanded opening과 구별" },
    coverageKo: "단일 축 각도 → 개도 %",
    noteKo: "Position feedback이며 conductance 계산값이 아니다.",
  });
  ch({ channelId: "remote.ch.valve.throttle_position", instrumentId: "remote.throttle_position", name: "Throttle opening", quantity: "valve_position", canonicalUnit: "%", dataShape: "scalar", channelRole: "measurement" }, "remote.mp.throttle_axis");

  return {
    templateId: REMOTE_TEMPLATE_ID,
    seedRevision: "remote-meas-seed-2",
    instruments,
    installations,
    points,
    channels,
    pointBindings: bindings,
    sourceBindings: [],
    calibrations: instruments.map((i) => ({ calibrationId: `cal.${i.instrumentId}`, instrumentId: i.instrumentId, status: "unknown" as const })),
  };
}
