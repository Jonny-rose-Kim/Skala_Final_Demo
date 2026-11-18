-- OHT와 load port 하드웨어 센서 DB (PostgreSQL). 그림과 같은 스펙에서 자동 생성했다.
CREATE SCHEMA IF NOT EXISTS oht;
SET search_path TO oht;

CREATE TABLE oht_vehicle (
  vehicle_id text PRIMARY KEY NOT NULL,
  model text,
  system_id text,
  belt_thickness double precision,
  drum_diameter double precision,
  wheel_diameter double precision,
  asset_id text,
  commissioned date
);
COMMENT ON TABLE oht_vehicle IS 'OHT 차량 한 대의 사양과 차량별 보정값. 벨트 두께, 드럼 지름, 휠 지름. 이유: 호이스트 내림 거리와 주행 위치 계산이 차량마다 다른 보정값에 달려 있다.';
COMMENT ON COLUMN oht_vehicle.system_id IS '여러 AMHS를 함께 쓸 때 구분';
COMMENT ON COLUMN oht_vehicle.belt_thickness IS '[mm]';
COMMENT ON COLUMN oht_vehicle.drum_diameter IS '[mm]';
COMMENT ON COLUMN oht_vehicle.wheel_diameter IS '[mm]';

CREATE TABLE oht_signal (
  signal_id text PRIMARY KEY NOT NULL,
  vehicle_id text REFERENCES oht_vehicle(vehicle_id),
  trace_table text,
  trace_column text,
  quantity text,
  unit text,
  source_tag text,
  sensor_type text,
  sensor_asset_id text,
  point_asset_id text,
  report_hz double precision
);
COMMENT ON TABLE oht_signal IS '차량에 달린 측정 항목 명단. 시계열 열 하나가 한 행이고 단위, 원래 태그, 센서 본체와 측정 지점을 적는다. 이유: 값이 어느 센서의 어느 지점에서 왔는지 알아야 값을 믿고, 센서 고장과 공정 이상을 가린다.';
COMMENT ON COLUMN oht_signal.trace_column IS '이 신호가 들어가는 테이블과 열';
COMMENT ON COLUMN oht_signal.quantity IS '물리량. pressure, flow, rf_power, torque 등';
COMMENT ON COLUMN oht_signal.source_tag IS '차량 컨트롤러나 원천 데이터에서 쓰는 원래 이름(SVID, FDC 태그, 공개 데이터 열 이름)';
COMMENT ON COLUMN oht_signal.sensor_type IS '측정 방식. 센서 없이 컨트롤러가 계산하거나 정한 값은 NULL';
COMMENT ON COLUMN oht_signal.sensor_asset_id IS '센서 본체가 달린 3D 부품. 컨트롤러가 계산한 값은 NULL';
COMMENT ON COLUMN oht_signal.point_asset_id IS '실제로 재는 지점의 3D 부품. 게이지 본체와 탭 위치가 다를 수 있다';
COMMENT ON COLUMN oht_signal.report_hz IS '장비가 보고하는 명목 주기. 실제 간격은 ts로 확인. 변할 때만 남는 신호는 NULL [Hz]';

CREATE TABLE oht_station (
  station_id text PRIMARY KEY NOT NULL,
  equipment_id text,
  port_no integer,
  station_type text,
  rail_segment text,
  rail_position double precision,
  barcode_tag text,
  asset_id text
);
COMMENT ON TABLE oht_station IS 'OHT가 서는 자리. 어느 공정 장비의 몇 번 포트인지, 레일 구간과 위치, 바코드 태그. 이유: 반송 기록을 실제 PECVD, CMP 장비의 load port와 이어야 장비 쪽 기록과 맞춰 볼 수 있다.';
COMMENT ON COLUMN oht_station.station_id IS '예: LP.CMP-01.1';
COMMENT ON COLUMN oht_station.equipment_id IS '포트가 달린 공정 장비. 예: CMP-01';
COMMENT ON COLUMN oht_station.station_type IS 'load_port | stocker | buffer';
COMMENT ON COLUMN oht_station.rail_segment IS '레일 구간 ID. 갈림길이 있으면 위치만으로는 자리가 하나로 정해지지 않는다';
COMMENT ON COLUMN oht_station.rail_position IS '구간 시작점부터 거리 [mm]';
COMMENT ON COLUMN oht_station.barcode_tag IS '바코드 위치 표식을 쓰는 레일만 선택: 해당 센서나 옵션이 없으면 NULL.';

CREATE TABLE oht_station_teach (
  teach_id text PRIMARY KEY NOT NULL,
  station_id text REFERENCES oht_station(station_id),
  travel_offset double precision,
  lateral_offset double precision,
  rotation_offset double precision,
  hoist_distance double precision,
  taught_ts timestamptz,
  valid_to timestamptz
);
COMMENT ON TABLE oht_station_teach IS '포트마다 가르친 교시값의 이력. 주행 방향, 옆, 회전 보정과 내림 거리. 다시 가르치면 새 행. 이유: 덮어쓰면 과거 인계를 그때의 교시값으로 설명할 수 없다. handoff가 당시 teach_id를 가리킨다.';
COMMENT ON COLUMN oht_station_teach.travel_offset IS '[mm]';
COMMENT ON COLUMN oht_station_teach.lateral_offset IS '[mm]';
COMMENT ON COLUMN oht_station_teach.rotation_offset IS '[°]';
COMMENT ON COLUMN oht_station_teach.hoist_distance IS '[mm]';
COMMENT ON COLUMN oht_station_teach.valid_to IS '다음 교시 시각. 지금 쓰는 값이면 NULL';

CREATE TABLE oht_transfer (
  transfer_id text PRIMARY KEY NOT NULL,
  vehicle_id text REFERENCES oht_vehicle(vehicle_id),
  carrier_id text,
  from_station text REFERENCES oht_station(station_id),
  to_station text REFERENCES oht_station(station_id),
  assigned_ts timestamptz,
  end_ts timestamptz,
  status text,
  failure_code text,
  data_origin text
);
COMMENT ON TABLE oht_transfer IS 'FOUP 반송 한 건. 차량, FOUP, 출발과 도착 포트, 배정과 끝 시각, 상태. 이유: 주행, 호이스트, 인계 기록을 반송 한 건에 묶어야 지연과 실패를 추적한다. 집기와 내려놓기 시각은 handoff에서 구한다.';
COMMENT ON COLUMN oht_transfer.carrier_id IS 'FOUP ID. 공정 장비 run의 carrier_id와 같은 값';
COMMENT ON COLUMN oht_transfer.end_ts IS '끝나기 전이면 NULL';
COMMENT ON COLUMN oht_transfer.status IS 'assigned | moving | done | failed | cancelled';
COMMENT ON COLUMN oht_transfer.failure_code IS '실패면 원인 알람 코드(oht_event.code)';
COMMENT ON COLUMN oht_transfer.data_origin IS 'equipment(실제 장비) | replay(공개 데이터 재생) | simulation';

CREATE TABLE oht_handoff (
  handoff_id text PRIMARY KEY NOT NULL,
  transfer_id text REFERENCES oht_transfer(transfer_id),
  station_id text REFERENCES oht_station(station_id),
  teach_id text REFERENCES oht_station_teach(teach_id),
  direction text,
  attempt_no integer,
  start_ts timestamptz,
  end_ts timestamptz,
  result text,
  timeout_timer text,
  timeout_limit double precision
);
COMMENT ON TABLE oht_handoff IS 'load port와 한 번 주고받은 인계 시도. 집기(unload)인지 내려놓기(load)인지, 몇 번째 시도인지, 결과. 이유: 재시도와 중단을 시도 단위로 센다. 타임아웃이 났으면 어느 타이머였고 그때 설정값이 얼마였는지 남긴다.';
COMMENT ON COLUMN oht_handoff.teach_id IS '이 시도에 쓴 교시값';
COMMENT ON COLUMN oht_handoff.direction IS 'load(내려놓기) | unload(집기)';
COMMENT ON COLUMN oht_handoff.attempt_no IS '같은 반송, 같은 포트에서 몇 번째 시도';
COMMENT ON COLUMN oht_handoff.result IS 'ok | timeout | abort | error';
COMMENT ON COLUMN oht_handoff.timeout_timer IS 'TA1~TA3(OHT 쪽), TP1~TP6(포트 쪽). 정상이면 NULL';
COMMENT ON COLUMN oht_handoff.timeout_limit IS '그때 설정된 제한 시간. 장비마다 1~999 s [s]';

CREATE TABLE oht_e84_signal (
  handoff_id text NOT NULL REFERENCES oht_handoff(handoff_id),
  seq_no integer NOT NULL,
  ts timestamptz,
  signal text,
  value boolean,
  side text,
  PRIMARY KEY (handoff_id, seq_no)
);
COMMENT ON TABLE oht_e84_signal IS '인계 중 E84 신호가 바뀔 때마다 한 행. VALID, CS_0, L_REQ, U_REQ, TR_REQ, READY, BUSY, COMPT, HO_AVBL, ES. 이유: 켜진 시각만 남기면 재시도, 순간 잡음, 꺼지는 순서를 다시 볼 수 없다. 단계별 시각 요약은 view로 계산한다.';
COMMENT ON COLUMN oht_e84_signal.seq_no IS '같은 시각에 바뀐 신호의 순서';
COMMENT ON COLUMN oht_e84_signal.ts IS '신호를 기록한 쪽의 시계';
COMMENT ON COLUMN oht_e84_signal.signal IS 'E84 신호 이름';
COMMENT ON COLUMN oht_e84_signal.value IS 'true 켜짐, false 꺼짐';
COMMENT ON COLUMN oht_e84_signal.side IS 'oht | port. 신호를 낸 쪽';

CREATE TABLE oht_drive_trace (
  vehicle_id text NOT NULL REFERENCES oht_vehicle(vehicle_id),
  ts timestamptz NOT NULL,
  transfer_id text REFERENCES oht_transfer(transfer_id),
  rail_segment text,
  rail_position double precision,
  last_tag text,
  speed double precision,
  accel double precision,
  front_motor_torque double precision,
  rear_motor_torque double precision,
  loaded boolean,
  op_state text,
  obstacle_zone text,
  PRIMARY KEY (vehicle_id, ts)
);
COMMENT ON TABLE oht_drive_trace IS '주행 시계열. 레일 구간과 위치, 속도, 가속도, 앞뒤 구동 모터 토크, 적재 여부, 주행 상태, 장애물 구역. 이유: 모터 토크로 휠 마모와 구동부 이상을 미리 본다. 적재와 가감속, 곡선, 대기 상태를 같이 남겨야 부하 차이를 고장으로 오인하지 않는다.';
COMMENT ON COLUMN oht_drive_trace.transfer_id IS '공차 주행, 대기면 NULL';
COMMENT ON COLUMN oht_drive_trace.rail_position IS '구간 시작점부터 거리 [mm]';
COMMENT ON COLUMN oht_drive_trace.last_tag IS '바코드 레일만 선택: 해당 센서나 옵션이 없으면 NULL.';
COMMENT ON COLUMN oht_drive_trace.speed IS '[mm/s]';
COMMENT ON COLUMN oht_drive_trace.accel IS '컨트롤러 값. 가속도 센서 없이 속도에서 계산했다면 signal의 sensor_type을 비운다 [mm/s²]';
COMMENT ON COLUMN oht_drive_trace.front_motor_torque IS '컨트롤러가 계산한 정격 대비 값 [% 정격]';
COMMENT ON COLUMN oht_drive_trace.rear_motor_torque IS '[% 정격]';
COMMENT ON COLUMN oht_drive_trace.loaded IS 'FOUP을 들고 있으면 true';
COMMENT ON COLUMN oht_drive_trace.op_state IS 'stop | accel | cruise | decel | curve | wait';
COMMENT ON COLUMN oht_drive_trace.obstacle_zone IS 'none | far | near | stop';
-- TimescaleDB를 쓰면: SELECT create_hypertable('oht.oht_drive_trace', 'ts');

CREATE TABLE oht_hoist_trace (
  vehicle_id text NOT NULL REFERENCES oht_vehicle(vehicle_id),
  ts timestamptz NOT NULL,
  transfer_id text REFERENCES oht_transfer(transfer_id),
  handoff_id text REFERENCES oht_handoff(handoff_id),
  hoist_position double precision,
  hoist_speed double precision,
  upper_limit boolean,
  gripper_closed boolean,
  carrier_present boolean,
  hoist_motor_torque double precision,
  following_error double precision,
  gripper_tilt double precision,
  PRIMARY KEY (vehicle_id, ts)
);
COMMENT ON TABLE oht_hoist_trace IS '호이스트와 그리퍼 시계열. 내린 길이, 속도, 상한 스위치, 그립과 FOUP 감지, 단 경우 토크, 추종 오차, 기울기. 이유: 벨트 늘어남과 그립 실패는 위치 추종 오차와 그립 신호 순서에서 먼저 보인다.';
COMMENT ON COLUMN oht_hoist_trace.transfer_id IS '정비나 시험 동작이면 NULL';
COMMENT ON COLUMN oht_hoist_trace.handoff_id IS '인계 중일 때';
COMMENT ON COLUMN oht_hoist_trace.hoist_position IS '[mm]';
COMMENT ON COLUMN oht_hoist_trace.hoist_speed IS '[mm/s]';
COMMENT ON COLUMN oht_hoist_trace.upper_limit IS '호이스트가 다 올라왔을 때 켜지는 스위치';
COMMENT ON COLUMN oht_hoist_trace.carrier_present IS '그리퍼 아래 FOUP 감지';
COMMENT ON COLUMN oht_hoist_trace.hoist_motor_torque IS '선택: 해당 센서나 옵션이 없으면 NULL. [% 정격]';
COMMENT ON COLUMN oht_hoist_trace.following_error IS '서보 컨트롤러가 주는 경우. 지령 위치 빼기 실제 위치 선택: 해당 센서나 옵션이 없으면 NULL. [mm]';
COMMENT ON COLUMN oht_hoist_trace.gripper_tilt IS '기울기 센서를 단 경우만 선택: 해당 센서나 옵션이 없으면 NULL. [°]';
-- TimescaleDB를 쓰면: SELECT create_hypertable('oht.oht_hoist_trace', 'ts');

CREATE TABLE oht_condition_trace (
  vehicle_id text NOT NULL REFERENCES oht_vehicle(vehicle_id),
  ts timestamptz NOT NULL,
  ntc_temp double precision,
  pm1_0 double precision,
  pm2_5 double precision,
  pm10 double precision,
  ct1_current double precision,
  ct2_current double precision,
  ct3_current double precision,
  ct4_current double precision,
  ir_max_temp double precision,
  ir_max_x_px integer,
  ir_max_y_px integer,
  ir_image_uri text,
  PRIMARY KEY (vehicle_id, ts)
);
COMMENT ON TABLE oht_condition_trace IS '과열 감시 모듈을 단 차량만. NTC 온도, 미세먼지, CT 전류 4채널, 열화상 최고 온도와 픽셀 위치. 이유: 탄화와 과열을 고장 전에 잡는 예지보전 데이터다. 근거 데이터(AI Hub)는 테스트베드에서 모사한 등급이다. 장착한 장비에만 있는 테이블.';
COMMENT ON COLUMN oht_condition_trace.ntc_temp IS '[°C]';
COMMENT ON COLUMN oht_condition_trace.pm1_0 IS '[µg/m³]';
COMMENT ON COLUMN oht_condition_trace.pm2_5 IS '[µg/m³]';
COMMENT ON COLUMN oht_condition_trace.pm10 IS '[µg/m³]';
COMMENT ON COLUMN oht_condition_trace.ct1_current IS '어느 회로인지는 signal.point_asset_id와 source_tag에 적는다 [A]';
COMMENT ON COLUMN oht_condition_trace.ct2_current IS '[A]';
COMMENT ON COLUMN oht_condition_trace.ct3_current IS '[A]';
COMMENT ON COLUMN oht_condition_trace.ct4_current IS '[A]';
COMMENT ON COLUMN oht_condition_trace.ir_max_temp IS '[°C]';
COMMENT ON COLUMN oht_condition_trace.ir_max_x_px IS '열화상 이미지 안 픽셀 좌표. 실제 공간 위치가 아니다';
COMMENT ON COLUMN oht_condition_trace.ir_image_uri IS '원본 열화상 프레임 위치';
-- TimescaleDB를 쓰면: SELECT create_hypertable('oht.oht_condition_trace', 'ts');

CREATE TABLE oht_loadport_event (
  lp_event_id text PRIMARY KEY NOT NULL,
  station_id text REFERENCES oht_station(station_id),
  handoff_id text REFERENCES oht_handoff(handoff_id),
  carrier_id text,
  ts timestamptz,
  event_type text,
  presence boolean,
  placement_ok boolean,
  clamped boolean,
  door_open boolean,
  slot_map jsonb
);
COMMENT ON TABLE oht_loadport_event IS 'load port 센서 상태가 바뀔 때마다 남기는 상태 묶음. FOUP 있음, 3점 안착, 클램프, 도어, 매핑 결과. 이유: FOUP이 제대로 앉았는지는 포트 센서가 확인한다. 인계 중이면 handoff_id로 잇고, 시각은 포트 시계라 OHT와 다를 수 있다.';
COMMENT ON COLUMN oht_loadport_event.handoff_id IS '인계 중일 때. 포트 자체 동작이면 NULL';
COMMENT ON COLUMN oht_loadport_event.event_type IS 'presence | placement | clamp | door | map. 무엇이 바뀌었는지';
COMMENT ON COLUMN oht_loadport_event.placement_ok IS '3점 안착 센서가 모두 켜짐';
COMMENT ON COLUMN oht_loadport_event.clamped IS '선택: 해당 센서나 옵션이 없으면 NULL.';
COMMENT ON COLUMN oht_loadport_event.door_open IS '선택: 해당 센서나 옵션이 없으면 NULL.';
COMMENT ON COLUMN oht_loadport_event.slot_map IS 'E87 슬롯 상태(empty, ok, double, cross). 웨이퍼 ID가 아니다. 매핑 센서가 있을 때만 선택: 해당 센서나 옵션이 없으면 NULL.';

CREATE TABLE oht_event (
  event_id text PRIMARY KEY NOT NULL,
  vehicle_id text REFERENCES oht_vehicle(vehicle_id),
  transfer_id text REFERENCES oht_transfer(transfer_id),
  ts timestamptz,
  kind text,
  code text,
  name text,
  asset_id text,
  cleared_ts timestamptz
);
COMMENT ON TABLE oht_event IS '차량 사건과 알람. 장애물 정지, 바코드 읽기 오류, 호이스트 한계, 그립 실패, E84 타임아웃. 이유: 알람 직전 시계열을 찾는 출발점이다. 원인 부품을 3D로 가리키고, load port 자체 알람은 포트 장비 쪽에 남긴다.';
COMMENT ON COLUMN oht_event.transfer_id IS '생산 외 시간(세정, 대기, 정비)이면 NULL';
COMMENT ON COLUMN oht_event.kind IS 'alarm | warning | state | info';
COMMENT ON COLUMN oht_event.code IS '장비 알람 코드(ALID)';
COMMENT ON COLUMN oht_event.name IS '장비가 보낸 원래 문구';
COMMENT ON COLUMN oht_event.asset_id IS '원인으로 지목된 부품';
COMMENT ON COLUMN oht_event.cleared_ts IS 'alarm만 해제 시각을 채운다. 일반 사건은 NULL';

CREATE TABLE oht_maintenance (
  pm_id text PRIMARY KEY NOT NULL,
  vehicle_id text REFERENCES oht_vehicle(vehicle_id),
  event_id text REFERENCES oht_event(event_id),
  kind text,
  planned boolean,
  start_ts timestamptz,
  end_ts timestamptz,
  asset_id text,
  measured jsonb,
  part_serial text,
  note text
);
COMMENT ON TABLE oht_maintenance IS '정비 기록. 구동, 가이드 휠 교체, 호이스트 벨트 교체, 그리퍼 점검, 오버홀. 이유: 교체 전후로 모터 토크와 위치 오차의 기준이 바뀐다. 계획 교체와 고장 수리를 나눈다.';
COMMENT ON COLUMN oht_maintenance.event_id IS '고장이나 알람 대응이면 원인 알람';
COMMENT ON COLUMN oht_maintenance.kind IS 'wheel_replace | belt_replace | gripper_check | overhaul | calibration';
COMMENT ON COLUMN oht_maintenance.planned IS 'true 계획 정비, false 고장이나 알람 대응';
COMMENT ON COLUMN oht_maintenance.asset_id IS '정비한 부품. 교체면 이 부품의 사용량 카운터가 0이 된다. 교정이면 센서 본체';
COMMENT ON COLUMN oht_maintenance.measured IS '정비 때 잰 값. {"metric": "wheel_wear", "value": 0.4, "unit": "mm"} 배열. 잰 경우만';
COMMENT ON COLUMN oht_maintenance.part_serial IS '새로 단 부품의 serial이나 lot. 세정은 NULL';
COMMENT ON COLUMN oht_maintenance.note IS '작업자 메모. 구조화된 값을 대신하지 않는다';

-- 예전 oht_handoff의 단계별 켜짐 시각은 원본 신호에서 계산한다.
CREATE VIEW oht_handoff_steps AS
SELECT h.handoff_id, h.direction, h.attempt_no,
       min(s.ts) FILTER (WHERE s.signal = 'VALID' AND s.value)                AS valid_on_ts,
       min(s.ts) FILTER (WHERE s.signal IN ('L_REQ', 'U_REQ') AND s.value)    AS req_on_ts,
       min(s.ts) FILTER (WHERE s.signal = 'TR_REQ' AND s.value)               AS tr_req_on_ts,
       min(s.ts) FILTER (WHERE s.signal = 'READY' AND s.value)                AS ready_on_ts,
       min(s.ts) FILTER (WHERE s.signal = 'BUSY' AND s.value)                 AS busy_on_ts,
       max(s.ts) FILTER (WHERE s.signal = 'BUSY' AND NOT s.value)             AS busy_off_ts,
       min(s.ts) FILTER (WHERE s.signal = 'COMPT' AND s.value)                AS compt_on_ts,
       count(s.seq_no)                                                        AS transitions
FROM oht_handoff h
LEFT JOIN oht_e84_signal s USING (handoff_id)
GROUP BY h.handoff_id, h.direction, h.attempt_no;
COMMENT ON VIEW oht_handoff_steps IS '인계 시도별 E84 단계 시각 요약. transitions가 정상보다 많으면 잡음이나 재시도가 있었다.';
