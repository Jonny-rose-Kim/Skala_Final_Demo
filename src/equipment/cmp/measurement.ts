/**
 * Rotary STI CMP measurement seed (C-MP-01 .. C-MP-12). Representative instrumentation of this project's
 * template; every channel is Data unbound in V1. Pneumatic pressures are gauge values on the zone / ring
 * lines, not a wafer–pad contact-pressure map. The optical endpoint channel is a raw spectrum; the endpoint
 * indicator and thickness estimate are separate derived / model channels with explicit lineage.
 */
import type { ChannelPointBindingDef, InstrumentDef, InstrumentInstallationDef, MeasurementChannelDefV2, MeasurementPointDefV2, MeasurementSeed } from "../../domain/measurement";
import type { CmpLayout } from "./layout";
import { CMP_TEMPLATE_ID } from "./template";

export const CMP_OPTICAL_POINT_ID = "cmp.mp.optical_footprint";

export function buildCmpMeasurementSeed(L: CmpLayout): MeasurementSeed {
  const cfg = L.cfg;
  const hx = L.head.polishX;
  const cz = L.head.carriage.size;
  const cy = L.head.carriage.centerY;
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

  // C-MP-01..04: head pneumatics (regulator block on the carriage; moves laterally, does not rotate)
  inst({ instrumentId: "cmp.head_pneumatics", name: "Head pneumatic pressure transducers (zones 1-3, ring)", type: "pressure_transducer", principle: "Gauge pressure transducers at the regulator outlets", installationStatus: "installed" }, { mountedOnAssetId: "head_carriage", mountFrameJointId: "head_lateral", mountPosition: [hx, cy + 0.02, cz[2] / 2 + 0.03] });
  const zoneNames = ["Zone 1 (center)", "Zone 2 (middle)", "Zone 3 (edge)", "Retaining ring"];
  zoneNames.forEach((name, i) => {
    const pid = i < 3 ? `cmp.mp.zone${i + 1}_line` : "cmp.mp.ring_line";
    points.push({
      pointId: pid,
      name: `${name} pneumatic line reference`,
      targetAssetId: i < 3 ? "membrane_backing" : "retaining_ring",
      frameJointId: "head_lateral",
      pointKind: "point",
      geometry: { position: [hx + 0.03, cy + 0.055 - i * 0.025, cz[2] / 2 + 0.066] },
      quantity: "pressure",
      reference: { pressureReference: "gauge", frameNote: "Regulator outlet / pneumatic line (kPa g). Command, pneumatic pressure, 총 normal force, contact stress를 서로 바꾸어 쓰지 않는다." },
      coverageKo: "해당 공압 회로의 line pressure (zone 전체에 균일하다고 가정하지 않음)",
      noteKo: i < 3 ? `Membrane zone ${i + 1} 공압 feedback. Wafer–pad contact-pressure map과 다르다.` : "별도 ring pressure 회로 (membrane zone과 별도 Point/Channel).",
    });
    ch({ channelId: i < 3 ? `cmp.ch.pressure.zone${i + 1}` : "cmp.ch.pressure.ring", instrumentId: "cmp.head_pneumatics", name: `${name} pressure`, quantity: "pressure", canonicalUnit: "kPa", dataShape: "scalar", channelRole: "measurement", referenceNoteKo: "gauge" }, pid);
  });

  // C-MP-05: slurry point-of-use liquid flow
  const fm = L.slurry.flowMeter;
  inst({ instrumentId: "cmp.slurry_flow", name: "Slurry point-of-use flow meter", type: "liquid_flow_meter", principle: "Inline liquid flow meter on the nozzle feed line", installationStatus: "installed" }, { mountedOnAssetId: "slurry_flow_meter", mountPosition: fm });
  points.push({
    pointId: "cmp.mp.slurry_pou",
    name: "Slurry line after the point-of-use meter",
    targetAssetId: "slurry_line",
    pointKind: "line_reference",
    geometry: { position: [fm[0] - 0.03, fm[1], fm[2]], pathTo: [fm[0] - 0.12, fm[1], fm[2]] },
    quantity: "flow_liquid",
    reference: { frameNote: "Liquid volumetric flow (mL/min); MFC gas standard flow와 다르다" },
    coverageKo: "Line 단면 평균 유량",
    noteKo: "Nozzle 직전의 공급 유량. Pad 위 분포와 다르다.",
  });
  ch({ channelId: "cmp.ch.flow.slurry", instrumentId: "cmp.slurry_flow", name: "Slurry flow (POU)", quantity: "flow_liquid", canonicalUnit: "mL/min", dataShape: "scalar", channelRole: "measurement" }, "cmp.mp.slurry_pou");

  // C-MP-06 / 09: platen drive encoder + motor current (+ derived torque estimate)
  inst({ instrumentId: "cmp.platen_drive_feedback", name: "Platen drive encoder / motor current", type: "integrated_instrument", principle: "Servo drive integrated encoder and current sensing", installationStatus: "installed" }, { mountedOnAssetId: "platen_drive", mountPosition: [0.0, cfg.platen.drive_housing_bottom_y + 0.05, cfg.platen.drive_housing_radius + 0.01] });
  points.push({
    pointId: "cmp.mp.platen_axis",
    name: "Platen drive axis reference",
    targetAssetId: "platen_drive",
    pointKind: "axis_reference",
    geometry: { position: [0, cfg.platen.drive_housing_bottom_y + 0.12, 0], axis: [0, 1, 0] },
    quantity: "speed_rotational",
    reference: { positionHome: "Platen index mark; rpm은 상대 선속도와 다르며 wafer 전 영역에 일정하지 않다" },
    coverageKo: "단일 회전축",
    noteKo: "Scripted platen pose(preview)와 encoder feedback을 구별한다.",
  });
  points.push({
    pointId: "cmp.mp.platen_motor",
    name: "Platen motor electrical reference",
    targetAssetId: "platen_drive",
    pointKind: "point",
    geometry: { position: [0, cfg.platen.drive_housing_bottom_y - cfg.platen.motor_length / 2, cfg.platen.motor_radius + 0.01] },
    quantity: "motor_current",
    reference: { frameNote: "Drive current; 추정 torque는 실제 torque transducer가 아니다" },
    coverageKo: "Motor 상전류 (drive 측정)",
    noteKo: "Optional drive telemetry (C-MP-09).",
  });
  ch({ channelId: "cmp.ch.speed.platen", instrumentId: "cmp.platen_drive_feedback", name: "Platen speed", quantity: "speed_rotational", canonicalUnit: "rpm", dataShape: "scalar", channelRole: "measurement" }, "cmp.mp.platen_axis");
  ch({ channelId: "cmp.ch.current.platen_motor", instrumentId: "cmp.platen_drive_feedback", name: "Platen motor current", quantity: "motor_current", canonicalUnit: "A", dataShape: "scalar", channelRole: "measurement" }, "cmp.mp.platen_motor");
  channels.push({ channelId: "cmp.ch.torque.platen_estimate", instrumentId: null, name: "Platen torque (estimated from current)", quantity: "torque_estimate", canonicalUnit: "N·m", dataShape: "scalar", channelRole: "derived_estimate", derivedFrom: ["cmp.ch.current.platen_motor"], referenceNoteKo: "추정값; torque transducer 실측이 아니다" });

  // C-MP-07: head spindle rotation feedback (encoder in the carriage; axis follows the lift)
  inst({ instrumentId: "cmp.head_spindle_encoder", name: "Head spindle encoder", type: "encoder", principle: "Rotary encoder on the spindle drive", installationStatus: "installed" }, { mountedOnAssetId: "head_carriage", mountFrameJointId: "head_lateral", mountPosition: [hx, cy + 0.12, -cz[2] / 2 - 0.02] });
  points.push({
    pointId: "cmp.mp.head_spindle_axis",
    name: "Head spindle axis reference",
    targetAssetId: "head_spindle",
    frameJointId: "head_lift",
    pointKind: "axis_reference",
    geometry: { position: [hx, L.head.housingY1 + 0.06, 0], axis: [0, 1, 0] },
    quantity: "speed_rotational",
    reference: { positionHome: "Spindle index; platen과 독립된 축" },
    coverageKo: "단일 회전축",
    noteKo: "Scripted head spin pose와 encoder feedback을 구별한다.",
  });
  ch({ channelId: "cmp.ch.speed.head", instrumentId: "cmp.head_spindle_encoder", name: "Head spindle speed", quantity: "speed_rotational", canonicalUnit: "rpm", dataShape: "scalar", channelRole: "measurement" }, "cmp.mp.head_spindle_axis");

  // C-MP-08: head lift position feedback
  inst({ instrumentId: "cmp.head_lift_feedback", name: "Head lift position feedback", type: "integrated_instrument", principle: "Linear encoder on the lift axis", installationStatus: "installed" }, { mountedOnAssetId: "head_carriage", mountFrameJointId: "head_lateral", mountPosition: [hx - cz[0] / 2 - 0.01, cy, 0] });
  points.push({
    pointId: "cmp.mp.head_lift_axis",
    name: "Head lift axis (raised = home)",
    targetAssetId: "head_carriage",
    frameJointId: "head_lateral",
    pointKind: "axis_reference",
    geometry: { position: [hx - cz[0] / 2 - 0.01, cy - 0.08, 0], axis: [0, 1, 0] },
    quantity: "position_linear",
    reference: { positionHome: "Raised position = 0; contact / pick는 음의 변위" },
    coverageKo: "단일 선형 축",
    noteKo: "Scripted lift pose(preview)와 position feedback을 구별한다.",
  });
  ch({ channelId: "cmp.ch.position.head_lift", instrumentId: "cmp.head_lift_feedback", name: "Head lift position", quantity: "position_linear", canonicalUnit: "mm", dataShape: "scalar", channelRole: "measurement" }, "cmp.mp.head_lift_axis");

  // C-MP-10: optical endpoint (window-in-pad)
  const mp = L.endpoint.module;
  inst({ instrumentId: "cmp.endpoint_optics", name: "Optical endpoint source / detector", type: "optical_spectrometer", principle: "Broadband source + spectrometer through a fiber rotary interface to the in-platen optical head", installationStatus: "installed", noteKo: "Simplified optical interface" }, { mountedOnAssetId: "endpoint_module", mountPosition: mp });
  const oh = L.endpoint.opticalHeadLocal;
  const w = L.pad.window;
  points.push({
    pointId: CMP_OPTICAL_POINT_ID,
    name: "Moving optical footprint on the wafer frontside (through the pad window)",
    targetAssetId: "wafer",
    frameJointId: "platen_spin",
    pointKind: "optical_path",
    geometry: { position: [oh[0], oh[1] + cfg.endpoint.head_size[1] / 2, oh[2]], pathTo: [w.r * Math.cos(w.azimuth), L.padTopY + 0.0005, w.r * Math.sin(w.azimuth)], radius: w.widT / 2 },
    quantity: "optical_spectrum",
    reference: { frameNote: "Rotating platen frame(window) ↔ wafer local frame 사이의 relative position을 resolver가 계산한다. Window가 wafer 아래에 있을 때만 In view." },
    coverageKo: "Window 폭 크기의 단일 footprint가 wafer 아래를 지나는 궤적. 전체 wafer map을 순간 측정하지 않는다.",
    noteKo: "Raw spectrum(measurement), endpoint indicator(derived), thickness estimate(model)는 서로 다른 channel role이다.",
    resolver: "cmp_optical_footprint",
  });
  ch({ channelId: "cmp.ch.optical.reflected_spectrum", instrumentId: "cmp.endpoint_optics", name: "Reflected spectrum", quantity: "optical_spectrum", canonicalUnit: "counts", dataShape: "spectrum", channelRole: "measurement" }, CMP_OPTICAL_POINT_ID);
  channels.push({ channelId: "cmp.ch.optical.endpoint_indicator", instrumentId: null, name: "Endpoint indicator (analyzed)", quantity: "status_enum", canonicalUnit: "enum", dataShape: "enum", channelRole: "derived_estimate", derivedFrom: ["cmp.ch.optical.reflected_spectrum"], referenceNoteKo: "Endpoint illustration만 제공; detected 결과를 생성하지 않는다" });
  channels.push({ channelId: "cmp.ch.optical.thickness_estimate", instrumentId: null, name: "Remaining oxide thickness (model estimate)", quantity: "position_linear", canonicalUnit: "mm", dataShape: "scalar", channelRole: "model_output", derivedFrom: ["cmp.ch.optical.reflected_spectrum"], referenceNoteKo: "Model output; IllustrativeFilmState와 무관" });

  // C-MP-11: rinse supply flow
  const cm = L.clean;
  inst({ instrumentId: "cmp.rinse_flow", name: "Rinse supply flow meter", type: "liquid_flow_meter", principle: "Inline liquid flow meter on the rinse line", installationStatus: "installed" }, { mountedOnAssetId: "clean_module", mountPosition: [cm.center[0] + cm.size[0] / 2 + 0.01, cm.center[1] + 0.05, cm.center[2]] });
  points.push({
    pointId: "cmp.mp.rinse_line",
    name: "Rinse supply line reference",
    targetAssetId: "clean_module",
    pointKind: "line_reference",
    geometry: { position: [cm.center[0] + cm.size[0] / 2 + 0.01, cm.center[1] + 0.05, cm.center[2]], pathTo: [cm.center[0] + 0.1, cm.baseY + cm.size[1] - 0.02, cm.center[2]] },
    quantity: "flow_liquid",
    reference: { frameNote: "Liquid volumetric flow (DI rinse)" },
    coverageKo: "Line 단면 평균 유량",
    noteKo: "Dry spindle axis와 별도 Point/frame.",
  });
  ch({ channelId: "cmp.ch.flow.rinse", instrumentId: "cmp.rinse_flow", name: "Rinse flow", quantity: "flow_liquid", canonicalUnit: "mL/min", dataShape: "scalar", channelRole: "measurement" }, "cmp.mp.rinse_line");

  // C-MP-12: dry spindle speed / status
  const dm = L.dry;
  inst({ instrumentId: "cmp.dry_spindle_feedback", name: "Dry spindle drive feedback", type: "integrated_instrument", principle: "Drive integrated encoder and status", installationStatus: "installed" }, { mountedOnAssetId: "dry_module", mountPosition: [dm.center[0], dm.baseY + 0.03, dm.center[2] + dm.size[2] / 2 + 0.01] });
  points.push({
    pointId: "cmp.mp.dry_spindle_axis",
    name: "Dry spindle axis reference",
    targetAssetId: "dry_chuck",
    pointKind: "axis_reference",
    geometry: { position: [dm.center[0], dm.baseY + 0.06, dm.center[2]], axis: [0, 1, 0] },
    quantity: "speed_rotational",
    reference: { positionHome: "Spindle index" },
    coverageKo: "단일 회전축",
    noteKo: "Rinse line과 별도 Point/frame.",
  });
  points.push({
    pointId: "cmp.mp.dry_spindle_status",
    name: "Dry spindle drive status reference",
    targetAssetId: "dry_module",
    pointKind: "point",
    geometry: { position: [dm.center[0], dm.baseY + 0.03, dm.center[2] + dm.size[2] / 2 + 0.01] },
    quantity: "status_enum",
    reference: { frameNote: "Drive status word (idle / spinning / fault)" },
    coverageKo: "Drive 상태",
    noteKo: "Speed feedback과 별도 channel role (status).",
  });
  ch({ channelId: "cmp.ch.speed.dry", instrumentId: "cmp.dry_spindle_feedback", name: "Dry spindle speed", quantity: "speed_rotational", canonicalUnit: "rpm", dataShape: "scalar", channelRole: "measurement" }, "cmp.mp.dry_spindle_axis");
  ch({ channelId: "cmp.ch.status.dry", instrumentId: "cmp.dry_spindle_feedback", name: "Dry spindle status", quantity: "status_enum", canonicalUnit: "enum", dataShape: "enum", channelRole: "status" }, "cmp.mp.dry_spindle_status");

  return {
    templateId: CMP_TEMPLATE_ID,
    seedRevision: "cmp-meas-seed-1",
    instruments,
    installations,
    points,
    channels,
    pointBindings: bindings,
    sourceBindings: [],
    calibrations: instruments.map((i) => ({ calibrationId: `cal.${i.instrumentId}`, instrumentId: i.instrumentId, status: "unknown" as const })),
  };
}
