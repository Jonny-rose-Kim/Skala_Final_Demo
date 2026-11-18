# 센서 crosswalk: DB 열과 런타임 계측 모델

`db/schema/*.sql`의 시계열 열과 앱 안의 계측 모델(`src/equipment/*/measurement.ts`)을 한 줄씩 맞춰 본 표다. 상세 장비 모델 작업(EFEM, load lock, robot, CMP front end, OHT 상세) 전에 만들었고, 작업 뒤에 다시 확인했다.

## 읽는 법

- DB 열: `테이블.열`과 DB 주석에 적힌 단위.
- Instrument: 런타임 instrument id와 종류. 없으면 `없음`.
- 설치: instrument의 installation 상태. 후보 point만 있는 경우 `Not installed (후보)`.
- Channel: 런타임 channel id. 모든 channel은 V1에서 `Data unbound`이다. Source binding이 하나도 없고 관측값을 만들지 않는다.
- 물리량 / 단위 / 기준: 런타임 channel의 quantity, canonical unit, 압력 기준(absolute, gauge) 같은 reference.
- Point: measurement point id와 종류(point, region, optical_path, line_reference, axis_reference).
- Asset (nodeKey): 센서 본체가 달린 부품과 point가 가리키는 부품. 둘이 다르면 둘 다 적었다.
- Mesh: 센서 본체를 따로 그렸는지. `통합`은 drive, generator, valve 같은 부품 안에 들어 있는 feedback이라 따로 그리지 않았다는 뜻이다.

단위가 다른 경우(DB는 Torr, psi, mm, Å, 런타임은 Pa, kPa, m, mm)는 바꾸지 않고 그대로 적었다. 단위 변환은 나중에 ChannelSourceBinding의 `unitConversion`에서 할 일이고 V1에는 binding이 없다.

Robot joint, slit valve, load lock door, FOUP door, shutter, 그리고 CMP brush와 dryer chuck의 위치와 열림 상태는 모두 scripted presentation 값이다. Encoder나 limit switch 관측으로 저장하지 않으며 DB 열도 만들지 않았다. 이번 작업에서 새 센서, 새 instrument, 새 DB entity는 추가하지 않았다. 새로 생긴 robot, 문, shutter 부품은 기존 기능 부품 아래의 상세 mesh이거나 새 component이며 계측 대상이 아니다.

## CCP PECVD (PECVD-01.CH-A, `ccp_pecvd_single_wafer_300`)

| DB 열 | DB 단위 | Instrument | 설치 | Channel | 물리량 / 단위 / 기준 | Point | Asset (nodeKey) | Mesh |
|---|---|---|---|---|---|---|---|---|
| ccp_chamber_trace.chamber_pressure | Torr | sensor.chamber_pressure (pressure_gauge) | installed | ch.pressure.chamber | pressure / Pa / absolute | mp.chamber_pressure (region) | 본체 pressure_sensor (sensing.pressure), point chamber_body (body.wall) | 있음 |
| ccp_chamber_trace.heater_temp | °C | sensor.pedestal_tc (thermocouple) | installed | ch.temperature.pedestal | temperature / degC | mp.pedestal_center (point) | 본체 thermocouple (sensing.pedestal_tc, pedestal_z를 따라 움직임), point pedestal (support.pedestal) | 있음 |
| ccp_rf_trace.forward_power | W | sensor.rf_power (directional_coupler) | installed | ch.rf.forward_power | rf_power / W | mp.rf_output (point) | rf_generator (rf.generator) | 통합 |
| ccp_rf_trace.reflected_power | W | sensor.rf_power (directional_coupler) | installed | ch.rf.reflected_power | rf_power / W | mp.rf_output (point) | rf_generator (rf.generator) | 통합 |
| ccp_chamber_trace.throttle_valve_pos | % | sensor.throttle_position (integrated_instrument) | installed | ch.valve.throttle_position | valve_position / % | mp.throttle (axis_reference) | throttle_valve (vacuum.throttle) | 통합 |
| ccp_chamber_trace.sih4_flow | sccm | sensor.mfc_flow (mfc) | installed | ch.flow.mfc1 | flow_gas / sccm | mp.mfc_01_out (point) | mfc_01 (gas.panel.mfc_01) | 있음 |
| ccp_chamber_trace.n2o_flow | sccm | 없음 | | 없음 | | | | |
| ccp_chamber_trace.n2_flow | sccm | 없음 | | 없음 | | | | |
| ccp_chamber_trace.foreline_pressure | Torr | 없음 | | 없음 | | | | |
| ccp_chamber_trace.heater_output | % | 없음 | | 없음 | | | | |
| ccp_chamber_trace.electrode_spacing | mm | 없음 (간격 고정 장비) | | 없음 | | | | |
| ccp_rf_trace.match_tune_pos, match_load_pos | % | 없음 | | 없음 | | | matching_network (rf.match) | |
| ccp_rf_trace.vpp, vi_voltage, vi_current, vi_phase | V, V, A, ° | 없음 | | 없음 | | | | |
| ccp_oes_trace.* (선 세기, spectrum_uri) | a.u. | 없음 | Not installed (후보) | 없음 | optical_spectrum | mp.ccp_viewport_oes_path (optical_path, 후보) | viewport (access.viewport) | 관찰창만 있음 |
| (DB 열 없음) | | sensor.slit_gate_status (limit_switch) | installed | ch.gate.closed, ch.gate.open | status_binary / bool | mp.slit_gate_detect (line_reference) | slit_valve (access.slit_valve) | 통합 |

## Remote ICP PECVD (REMOTE-01, `remote_pecvd_upstream_icp`)

| DB 열 | DB 단위 | Instrument | 설치 | Channel | 물리량 / 단위 / 기준 | Point | Asset (nodeKey) | Mesh |
|---|---|---|---|---|---|---|---|---|
| remote_source_trace.rf_forward_power | W | remote.rf_coupler (directional_coupler) | installed | remote.ch.rf.forward | rf_power / W | remote.mp.rf_feed_reference (point) | 본체 source_match_box (power.match), point coil_leads (power.leads) | 통합 |
| remote_source_trace.rf_reflected_power | W | remote.rf_coupler (directional_coupler) | installed | remote.ch.rf.reflected | rf_power / W | remote.mp.rf_feed_reference (point) | 위와 같음 | 통합 |
| remote_source_trace.o2_flow | sccm | remote.mfc_source (mfc) | installed | remote.ch.flow.source | flow_gas / sccm | remote.mp.mfc_source_out (point) | mfc_source (gas.source_panel.mfc_s) | 있음 |
| remote_source_trace.ar_flow | sccm | 없음 | | 없음 | | | | |
| remote_source_trace.source_pressure | Torr | 없음 | Not installed (후보) | 없음 | pressure / absolute | remote.mp.source_pressure_candidate (region, 후보) | transport_section (transport.tube) | |
| remote_source_trace.coolant_flow | L/min | remote.coolant_return (liquid_flow_meter) | installed | remote.ch.coolant.flow | flow_liquid / L/min | remote.mp.coolant_return_flow (point) | coolant_fittings (source.coolant) | 통합 |
| remote_source_trace.coolant_temp | °C | remote.coolant_return (liquid_flow_meter) | installed | remote.ch.coolant.temperature | temperature / degC | remote.mp.coolant_return (point) | coolant_fittings (source.coolant) | 통합 |
| remote_source_trace.match_tune_pos, match_load_pos | % | 없음 | | 없음 | | | | |
| remote_source_trace.plasma_on | state | 없음 | | 없음 | | | | |
| remote_chamber_trace.chamber_pressure | Torr | remote.gauge_chamber (pressure_gauge) | installed | remote.ch.pressure.chamber | pressure / Pa / absolute | remote.mp.chamber_pressure (region) | 본체 pressure_sensor (access.pressure_gauge), point chamber_body (body.wall) | 있음 |
| remote_chamber_trace.throttle_valve_pos | % | remote.throttle_position (integrated_instrument) | installed | remote.ch.valve.throttle_position | valve_position / % | remote.mp.throttle_axis (axis_reference) | throttle_valve (vac.throttle) | 통합 |
| remote_chamber_trace.sih4_flow | sccm | remote.mfc_precursor (mfc) | installed | remote.ch.flow.precursor | flow_gas / sccm | remote.mp.mfc_precursor_out (point) | mfc_precursor (gas.precursor_panel.mfc_p) | 있음 |
| remote_chamber_trace.stage_temp | °C | remote.stage_tc (thermocouple) | installed | remote.ch.temperature.stage | temperature / degC | remote.mp.stage_center (point) | 본체 thermocouple (stage.tc, stage_z를 따라 움직임), point stage (stage.body) | 있음 |
| remote_chamber_trace.stage_heater_output | % | 없음 | | 없음 | | | | |
| remote_oes_trace.* (선 세기, spectrum_uri) | a.u. | remote.oes (optical_spectrometer) | installed | remote.ch.oes.spectrum | optical_spectrum / counts | remote.mp.source_oes_path (optical_path) | 본체 oes_spectrometer (source.oes), point discharge_tube (source.tube) | 있음 |
| (DB 열 없음) | | remote.slit_gate_status (limit_switch) | installed | remote.ch.gate.closed, remote.ch.gate.open | status_binary / bool | remote.mp.slit_gate_detect (line_reference) | slit_valve (access.slit_valve) | 통합 |

## STI CMP (CMP-01, `sti_cmp_rotary_single_platen`)

| DB 열 | DB 단위 | Instrument | 설치 | Channel | 물리량 / 단위 / 기준 | Point | Asset (nodeKey) | Mesh |
|---|---|---|---|---|---|---|---|---|
| cmp_polish_trace.platen_speed | rpm | cmp.platen_drive_feedback (integrated_instrument) | installed | cmp.ch.speed.platen | speed_rotational / rpm | cmp.mp.platen_axis (axis_reference) | platen_drive (platen.drive) | 통합 |
| cmp_polish_trace.platen_motor_current | A | cmp.platen_drive_feedback (integrated_instrument) | installed | cmp.ch.current.platen_motor | motor_current / A | cmp.mp.platen_motor (point) | platen_drive (platen.drive) | 통합 |
| cmp_polish_trace.head_speed | rpm | cmp.head_spindle_encoder (encoder) | installed | cmp.ch.speed.head | speed_rotational / rpm | cmp.mp.head_spindle_axis (axis_reference) | 본체 head_carriage (head.carriage), point head_spindle (head.spindle) | 통합 |
| cmp_polish_trace.zone1_pressure (가운데) | psi | cmp.head_pneumatics (pressure_transducer) | installed | cmp.ch.pressure.zone1 | pressure / kPa / gauge | cmp.mp.zone1_line (point) | 본체 head_carriage (head.carriage), point membrane_backing (head.zones) | 통합 |
| cmp_polish_trace.zone2_pressure | psi | cmp.head_pneumatics | installed | cmp.ch.pressure.zone2 | pressure / kPa / gauge | cmp.mp.zone2_line (point) | 위와 같음 | 통합 |
| cmp_polish_trace.zone3_pressure (가장자리) | psi | cmp.head_pneumatics | installed | cmp.ch.pressure.zone3 | pressure / kPa / gauge | cmp.mp.zone3_line (point) | 위와 같음 | 통합 |
| cmp_polish_trace.ring_pressure | psi | cmp.head_pneumatics | installed | cmp.ch.pressure.ring | pressure / kPa / gauge | cmp.mp.ring_line (point) | 본체 head_carriage, point retaining_ring (head.retaining_ring) | 통합 |
| cmp_polish_trace.slurry_flow_a | mL/min | cmp.slurry_flow (liquid_flow_meter) | installed | cmp.ch.flow.slurry | flow_liquid / mL/min | cmp.mp.slurry_pou (line_reference) | 본체 slurry_flow_meter (slurry.flow_meter), point slurry_line (slurry.line) | 있음 |
| cmp_polish_trace.slurry_flow_b, slurry_flow_c | mL/min | 없음 (런타임 slurry line 1개) | | 없음 | | | | |
| cmp_polish_trace.head_motor_current | A | 없음 | | 없음 | | | | |
| cmp_polish_trace.pad_temp | °C | 없음 | | 없음 | | | | |
| cmp_conditioner_trace.downforce, disk_speed, sweep_position, disk_torque | N, rpm, mm, N·m | 없음 | | 없음 | | | conditioner_arm, conditioner_disc | |
| cmp_endpoint_trace.spectrum_uri | | cmp.endpoint_optics (optical_spectrometer) | installed | cmp.ch.optical.reflected_spectrum | optical_spectrum / counts | cmp.mp.optical_footprint (optical_path, resolver) | 본체 endpoint_module (endpoint.module), point wafer (head.wafer) | 있음 |
| cmp_endpoint_trace.est_thickness | Å | 없음 (model channel) | | cmp.ch.optical.thickness_estimate | position_linear / mm, model_output | | | |
| cmp_endpoint_trace.fit_quality, zone | | 없음 | | 없음 | | | | |
| cmp_clean_trace.diw_flow (module = brush1) | mL/min | cmp.rinse_flow (liquid_flow_meter) | installed | cmp.ch.flow.rinse | flow_liquid / mL/min | cmp.mp.rinse_line (line_reference) | clean_module (post.clean_module) | 통합 |
| cmp_clean_trace.wafer_speed (module = spin_dry) | rpm | cmp.dry_spindle_feedback (integrated_instrument) | installed | cmp.ch.speed.dry | speed_rotational / rpm | cmp.mp.dry_spindle_axis (axis_reference) | 본체 dry_module (post.dry_module), point dry_chuck (post.dry_chuck) | 통합 |
| cmp_clean_trace.brush_speed, brush_pressure, chem_flow, megasonic_power | rpm, psi, mL/min, W | 없음 | | 없음 | | | brush_rollers, brush_roller_lower | |
| cmp_clean_trace (module = brush2, megasonic) | | 없음 (런타임 cleaner는 brush pair 1개) | | 없음 | | | | |
| (DB 열 없음) | | cmp.head_lift_feedback (integrated_instrument) | installed | cmp.ch.position.head_lift | position_linear / mm | cmp.mp.head_lift_axis (axis_reference) | head_carriage (head.carriage) | 통합 |
| (DB 열 없음) | | cmp.dry_spindle_feedback | installed | cmp.ch.status.dry | status_enum | cmp.mp.dry_spindle_status (point) | dry_module (post.dry_module) | 통합 |
| (DB 열 없음) | | 없음 | | cmp.ch.torque.platen_estimate, cmp.ch.optical.endpoint_indicator | derived_estimate | | | |

DB의 zone 번호와 런타임 zone 번호는 같은 뜻이다(1 가운데, 2 중간, 3 가장자리). 둘 다 공압 회로 출구 압력이며 wafer 접촉 압력 분포가 아니다. 런타임 기준은 gauge이고 DB 주석에는 기준이 적혀 있지 않다.

## OHT (OHT-01, `oht_single_vehicle`)

| DB 열 | DB 단위 | Instrument | 설치 | Channel | 물리량 / 단위 / 기준 | Point | Asset (nodeKey) | Mesh |
|---|---|---|---|---|---|---|---|---|
| oht_drive_trace.rail_position | mm | oht.travel_encoder (encoder) | installed | oht.ch.position.travel | position_linear / m (rail 시작점 기준) | oht.mp.travel_reference (line_reference) | 본체 bogies (vehicle.bogies), point rail (rail.beam) | 통합 |
| oht_hoist_trace.hoist_position | mm | oht.hoist_encoder (integrated_instrument) | installed | oht.ch.position.hoist | position_linear / m (상한 기준) | oht.mp.hoist_extension_reference (axis_reference) | 본체 hoist_drive (hoist.drive), point hoist_belts (hoist.belts) | 통합 |
| oht_hoist_trace.upper_limit | state | oht.hoist_upper_limit (limit_switch) | installed | oht.ch.status.hoist_upper_limit | status_binary / bool | oht.mp.hoist_upper_limit (region) | 본체 hoist_drive, point gripper_plate (gripper.plate) | 통합 |
| oht_hoist_trace.gripper_closed | state | oht.gripper_switches (limit_switch) | installed | oht.ch.status.gripper_closed | status_binary / bool | oht.mp.gripper_mechanism (line_reference) | 본체 gripper_plate, point gripper_finger_a (gripper.finger_a) | 통합 |
| (DB 열 없음) | | oht.gripper_switches (limit_switch) | installed | oht.ch.status.gripper_open | status_binary / bool | oht.mp.gripper_mechanism | 위와 같음 | 통합 |
| oht_hoist_trace.carrier_present | state | oht.carrier_presence (proximity_sensor) | installed | oht.ch.presence.carrier_at_gripper | presence / bool | oht.mp.carrier_capture_region (region) | gripper_plate (gripper.plate) | 있음 |
| oht_drive_trace.obstacle_zone | state | oht.obstruction (obstruction_sensor) | installed | oht.ch.presence.obstruction | presence / bool | oht.mp.obstruction_envelope (region) | obstruction_sensor (vehicle.obstruction_sensor) | 있음 |
| oht_drive_trace.speed, accel, front_motor_torque, rear_motor_torque | mm/s, mm/s², % | 없음 | | 없음 | | | | |
| oht_drive_trace.loaded | state | 없음 | | 없음 | | | | |
| oht_hoist_trace.hoist_speed, hoist_motor_torque, following_error, gripper_tilt | mm/s, %, mm, ° | 없음 | | 없음 | | | | |
| oht_condition_trace.* | °C, µg/m³, A | 없음 | | 없음 | | | | |
| oht_station.barcode_tag | | 없음 | Not installed (후보) | 없음 | | oht.mp.id_read_zone (region, 후보) | gripper_plate (gripper.plate) | |
| oht_station_teach.* | mm, ° | 없음 (teach 값은 설정이며 관측이 아님) | Not installed (후보) | 없음 | | oht.mp.station_seating_region (region, 후보) | rail (rail.beam) | |
| oht_loadport_event.presence, placement_ok, clamped, door_open, slot_map | state | 없음 | | 없음 | | | | |
| oht_e84_signal.* | | 없음 (E84는 범위 참고만) | | 없음 | | | | |

FOUP(`foup_carrier_300`)에는 instrument가 없다. Slot 점유와 door 상태는 PreviewState의 presentation 값이며 `oht_loadport_event.slot_map` 같은 관측과 연결하지 않았다.

## DB와 런타임이 다른 점

1. CCP의 MFC는 런타임에 하나(MFC-01)뿐이고 가스 이름이 정해져 있지 않다. DB의 sih4_flow를 MFC-01에 맞춘 것은 이 표의 가정이며 런타임에는 적혀 있지 않다. n2o_flow와 n2_flow에 해당하는 MFC는 런타임에 없다.
2. Remote의 source 쪽 MFC도 하나이고 DB의 o2_flow에 맞췄다. ar_flow에 해당하는 MFC는 없다. source_pressure는 후보 point만 있고 instrument와 channel은 없다.
3. 단위가 다르다. 압력은 DB가 Torr, psi이고 런타임이 Pa, kPa이다. 위치는 DB가 mm, 런타임이 m이다. 두께는 DB가 Å, 런타임 model channel이 mm이다.
4. CMP 세정은 DB가 brush1, brush2, megasonic, spin_dry 네 모듈로 나눈다. 런타임은 brush pair cleaner 하나와 spin dryer 하나다. cmp.ch.flow.rinse를 brush1의 diw_flow에 맞춘 것은 가정이다. brush2와 megasonic은 런타임에 없다.
5. CMP slurry line은 DB에 세 개(a, b, c), 런타임에 하나다.
6. CMP endpoint는 DB가 반지름 방향 zone별 행을 남기고, 런타임은 window 하나의 footprint track이다. zone을 나누는 resolver는 없다.
7. OHT의 구동, hoist torque, 속도, 상태 감시 센서와 load port 센서는 런타임 instrument가 없다.
8. Slit valve 상태 limit switch는 런타임에만 channel이 있고 DB에는 event 테이블로만 남을 수 있다.
9. Robot, load lock door, slit valve, CMP shutter, flip station, FOUP door의 움직임은 scripted presentation이다. 관측값으로 저장하지 않으며 위 표의 어떤 열과도 연결하지 않았다.

## 상세 모델 작업 뒤 바뀐 것

- CMP의 rinse flow meter와 dry spindle feedback은 cleaner와 spin dryer가 새 위치로 옮겨지면서 mount 위치가 함께 바뀌었다(`L.clean`, `L.dry`가 front end config에서 나온다). Instrument id, channel id, point id는 그대로다.
- CCP와 Remote의 thermocouple은 pedestal, stage lift joint를 따라 움직인다. 이전과 같다.
- 새 component(EFEM robot, load lock, vacuum blade, CMP dry robot, flip station, wet robot, cleaner shutter, dryer shutter, OHT 상세 부품)는 계측 point의 대상이 아니며 instrument가 달려 있지 않다.
