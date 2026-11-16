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
COMMENT ON COLUMN oht_vehicle.belt_thickness IS '[mm]';
COMMENT ON COLUMN oht_vehicle.drum_diameter IS '[mm]';
COMMENT ON COLUMN oht_vehicle.wheel_diameter IS '[mm]';

CREATE TABLE oht_sensor (
  sensor_id text PRIMARY KEY NOT NULL,
  vehicle_id text REFERENCES oht_vehicle(vehicle_id),
  measures text,
  sensor_type text,
  trace_table text,
  trace_column text,
  sample_hz double precision,
  asset_id text,
  last_calibrated date
);
COMMENT ON TABLE oht_sensor IS '차량에 달린 센서 목록. 무엇을 어디서 재는지, 단위, 수집 주기, 교정일. 이유: 시계열의 각 열이 어느 물리 센서에서 왔는지 알아야 값을 믿고 센서 고장을 가린다.';
COMMENT ON COLUMN oht_sensor.sample_hz IS '[Hz]';

CREATE TABLE oht_station (
  station_id text PRIMARY KEY NOT NULL,
  barcode_tag text,
  rail_position double precision,
  lateral_offset double precision,
  rotation_offset double precision,
  hoist_distance double precision,
  taught_ts timestamptz,
  asset_id text
);
COMMENT ON TABLE oht_station IS 'load port마다 가르쳐 둔 교시값. 레일 위 정지 위치, 옆 이동, 회전, 내림 거리. 이유: FOUP을 정확한 자리에 내려놓는 기준이라, 바뀌면 인계 실패와 바로 이어진다.';
COMMENT ON COLUMN oht_station.rail_position IS '[mm]';
COMMENT ON COLUMN oht_station.lateral_offset IS '[mm]';
COMMENT ON COLUMN oht_station.rotation_offset IS '[°]';
COMMENT ON COLUMN oht_station.hoist_distance IS '[mm]';

CREATE TABLE oht_transfer (
  transfer_id text PRIMARY KEY NOT NULL,
  vehicle_id text REFERENCES oht_vehicle(vehicle_id),
  carrier_id text,
  from_station text REFERENCES oht_station(station_id),
  to_station text REFERENCES oht_station(station_id),
  assigned_ts timestamptz,
  pickup_start_ts timestamptz,
  pickup_end_ts timestamptz,
  dropoff_start_ts timestamptz,
  dropoff_end_ts timestamptz,
  result text,
  data_origin text
);
COMMENT ON TABLE oht_transfer IS 'FOUP 반송 한 건. 출발과 도착 station, 집기와 내려놓기의 시작, 끝 시각. 이유: 주행, 호이스트, 인계 기록을 반송 한 건에 묶어야 지연과 실패를 추적한다.';

CREATE TABLE oht_handoff (
  handoff_id text PRIMARY KEY NOT NULL,
  transfer_id text REFERENCES oht_transfer(transfer_id),
  station_id text REFERENCES oht_station(station_id),
  kind text,
  valid_on_ts timestamptz,
  req_on_ts timestamptz,
  tr_req_on_ts timestamptz,
  ready_on_ts timestamptz,
  busy_on_ts timestamptz,
  carrier_detect_ts timestamptz,
  busy_off_ts timestamptz,
  compt_on_ts timestamptz,
  result text,
  timeout_code text
);
COMMENT ON TABLE oht_handoff IS 'load port와 주고받은 E84 신호가 켜진 시각. 집기 한 번, 내려놓기 한 번이 한 행. 이유: 어느 단계에서 기다렸고 어떤 타임아웃(TP1~TP5)이 났는지 바로 보인다.';

CREATE TABLE oht_drive_trace (
  vehicle_id text NOT NULL REFERENCES oht_vehicle(vehicle_id),
  ts timestamptz NOT NULL,
  transfer_id text REFERENCES oht_transfer(transfer_id),
  rail_position double precision,
  last_tag text,
  speed double precision,
  accel double precision,
  front_motor_torque double precision,
  rear_motor_torque double precision,
  obstacle_zone text,
  PRIMARY KEY (vehicle_id, ts)
);
COMMENT ON TABLE oht_drive_trace IS '주행 시계열. 레일 위치, 마지막 바코드, 속도, 가속도, 앞뒤 구동 모터 토크, 장애물 구역. 이유: 모터 토크의 변화로 휠 마모와 구동부 이상을 미리 알 수 있다.';
COMMENT ON COLUMN oht_drive_trace.rail_position IS '[mm]';
COMMENT ON COLUMN oht_drive_trace.speed IS '[mm/s]';
COMMENT ON COLUMN oht_drive_trace.accel IS '[mm/s²]';
COMMENT ON COLUMN oht_drive_trace.front_motor_torque IS '[%]';
COMMENT ON COLUMN oht_drive_trace.rear_motor_torque IS '[%]';
-- TimescaleDB를 쓰면: SELECT create_hypertable('oht.oht_drive_trace', 'ts');

CREATE TABLE oht_hoist_trace (
  vehicle_id text NOT NULL REFERENCES oht_vehicle(vehicle_id),
  ts timestamptz NOT NULL,
  transfer_id text REFERENCES oht_transfer(transfer_id),
  hoist_position double precision,
  hoist_speed double precision,
  hoist_motor_torque double precision,
  following_error double precision,
  gripper_closed boolean,
  flange_detected boolean,
  gripper_tilt double precision,
  PRIMARY KEY (vehicle_id, ts)
);
COMMENT ON TABLE oht_hoist_trace IS '호이스트와 그리퍼 시계열. 내린 길이, 속도, 모터 토크, 그립과 플랜지 감지, 기울기. 이유: 벨트 늘어남과 그립 실패는 위치 추종 오차와 기울기에서 먼저 보인다.';
COMMENT ON COLUMN oht_hoist_trace.hoist_position IS '[mm]';
COMMENT ON COLUMN oht_hoist_trace.hoist_speed IS '[mm/s]';
COMMENT ON COLUMN oht_hoist_trace.hoist_motor_torque IS '[%]';
COMMENT ON COLUMN oht_hoist_trace.following_error IS '[mm]';
COMMENT ON COLUMN oht_hoist_trace.gripper_tilt IS '[°]';
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
  ir_max_xy text,
  ir_image_uri text,
  PRIMARY KEY (vehicle_id, ts)
);
COMMENT ON TABLE oht_condition_trace IS '상태 감시 시계열. NTC 온도, 미세먼지, CT 전류 4채널, 열화상 최고 온도와 위치. 이유: 과열과 마모 입자를 고장 전에 잡는 예지보전 데이터다.';
COMMENT ON COLUMN oht_condition_trace.ntc_temp IS '[°C]';
COMMENT ON COLUMN oht_condition_trace.pm1_0 IS '[µg/m³]';
COMMENT ON COLUMN oht_condition_trace.pm2_5 IS '[µg/m³]';
COMMENT ON COLUMN oht_condition_trace.pm10 IS '[µg/m³]';
COMMENT ON COLUMN oht_condition_trace.ct1_current IS '[A]';
COMMENT ON COLUMN oht_condition_trace.ct2_current IS '[A]';
COMMENT ON COLUMN oht_condition_trace.ct3_current IS '[A]';
COMMENT ON COLUMN oht_condition_trace.ct4_current IS '[A]';
COMMENT ON COLUMN oht_condition_trace.ir_max_temp IS '[°C]';
-- TimescaleDB를 쓰면: SELECT create_hypertable('oht.oht_condition_trace', 'ts');

CREATE TABLE oht_loadport_event (
  lp_event_id text PRIMARY KEY NOT NULL,
  station_id text REFERENCES oht_station(station_id),
  carrier_id text,
  ts timestamptz,
  event_type text,
  presence boolean,
  placement_ok boolean,
  clamped boolean,
  door_open boolean,
  slot_map jsonb
);
COMMENT ON TABLE oht_loadport_event IS 'load port 센서 변화. FOUP 있음, 3점 안착, 클램프, 도어, 매핑 결과(슬롯 상태). 이유: OHT가 내려놓은 FOUP이 제대로 앉았는지는 장비 쪽 센서가 확인한다.';

CREATE TABLE oht_event (
  event_id text PRIMARY KEY NOT NULL,
  vehicle_id text REFERENCES oht_vehicle(vehicle_id),
  transfer_id text REFERENCES oht_transfer(transfer_id),
  ts timestamptz,
  kind text,
  code text,
  name text,
  cleared_ts timestamptz
);
COMMENT ON TABLE oht_event IS '차량 사건과 알람. 장애물 정지, 바코드 읽기 오류, 호이스트 한계, 그립 실패, E84 타임아웃. 이유: 알람 직전의 시계열을 찾아보는 출발점이다.';

CREATE TABLE oht_maintenance (
  pm_id text PRIMARY KEY NOT NULL,
  vehicle_id text REFERENCES oht_vehicle(vehicle_id),
  kind text,
  start_ts timestamptz,
  end_ts timestamptz,
  part text,
  part_serial text,
  measured jsonb,
  note text
);
COMMENT ON TABLE oht_maintenance IS '정비 기록. 구동, 가이드 휠 교체, 호이스트 벨트 교체, 그리퍼 점검, 연 1회 오버홀. 이유: 교체 전후로 모터 토크와 위치 오차의 기준이 바뀐다.';
