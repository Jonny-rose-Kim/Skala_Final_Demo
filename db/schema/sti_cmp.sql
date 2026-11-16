-- Rotary STI CMP 하드웨어 센서 DB (PostgreSQL). 그림과 같은 스펙에서 자동 생성했다.
CREATE SCHEMA IF NOT EXISTS sti_cmp;
SET search_path TO sti_cmp;

CREATE TABLE cmp_equipment (
  equipment_id text PRIMARY KEY NOT NULL,
  model text,
  platen_count integer,
  head_zone_count integer,
  endpoint_type text,
  cleaner_type text,
  asset_id text,
  install_date date
);
COMMENT ON TABLE cmp_equipment IS 'CMP 장비 한 대의 하드웨어 사양. 플래튼 수, 헤드 압력 구역 수, 종점 방식, 세정기 구성. 이유: 플래튼과 헤드 구성이 다르면 같은 레시피라도 제거 특성이 달라진다.';

CREATE TABLE cmp_sensor (
  sensor_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES cmp_equipment(equipment_id),
  measures text,
  sensor_type text,
  trace_table text,
  trace_column text,
  sample_hz double precision,
  asset_id text,
  last_calibrated date
);
COMMENT ON TABLE cmp_sensor IS '장비에 달린 센서 목록. 무엇을 어디서 재는지, 단위, 수집 주기, 교정일. 이유: 시계열의 각 열이 어느 물리 센서에서 왔는지 알아야 값을 믿고 센서 고장을 가린다.';
COMMENT ON COLUMN cmp_sensor.sample_hz IS '[Hz]';

CREATE TABLE cmp_run (
  run_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES cmp_equipment(equipment_id),
  wafer_id text,
  lot_id text,
  slot_no integer,
  recipe text,
  platen_no integer,
  head_no integer,
  start_ts timestamptz,
  end_ts timestamptz,
  end_reason text,
  pad_usage double precision,
  disk_usage double precision,
  membrane_usage double precision,
  ring_usage double precision,
  backing_film_usage double precision,
  data_origin text
);
COMMENT ON TABLE cmp_run IS '웨이퍼 한 장을 한 플래튼에서 연마한 기록. 종료 이유와 그 시점의 소모품 사용량. 이유: 제거율을 가장 크게 바꾸는 것은 패드, 디스크, 멤브레인의 사용량이라 처리마다 함께 남긴다.';
COMMENT ON COLUMN cmp_run.pad_usage IS '[h]';
COMMENT ON COLUMN cmp_run.disk_usage IS '[h]';
COMMENT ON COLUMN cmp_run.membrane_usage IS '[장]';
COMMENT ON COLUMN cmp_run.ring_usage IS '[장]';
COMMENT ON COLUMN cmp_run.backing_film_usage IS '[장]';

CREATE TABLE cmp_run_step (
  run_id text NOT NULL REFERENCES cmp_run(run_id),
  step_no integer NOT NULL,
  step_name text,
  start_ts timestamptz,
  end_ts timestamptz,
  sp_platen_speed double precision,
  sp_head_speed double precision,
  sp_zone_pressures jsonb,
  sp_ring_pressure double precision,
  sp_slurry_flow double precision,
  sp_max_time double precision,
  PRIMARY KEY (run_id, step_no)
);
COMMENT ON TABLE cmp_run_step IS '레시피 단계별 설정값과 실제 시작, 끝 시각. 본 연마, 추가 연마, 물 세척. 이유: 실측 시계열을 설정값과 비교해야 이탈을 판단할 수 있다.';
COMMENT ON COLUMN cmp_run_step.sp_platen_speed IS '[rpm]';
COMMENT ON COLUMN cmp_run_step.sp_head_speed IS '[rpm]';
COMMENT ON COLUMN cmp_run_step.sp_ring_pressure IS '[psi]';
COMMENT ON COLUMN cmp_run_step.sp_slurry_flow IS '[mL/min]';
COMMENT ON COLUMN cmp_run_step.sp_max_time IS '[s]';

CREATE TABLE cmp_polish_trace (
  run_id text NOT NULL REFERENCES cmp_run(run_id),
  ts timestamptz NOT NULL,
  step_no integer,
  platen_speed double precision,
  head_speed double precision,
  center_zone_pressure double precision,
  ripple_zone_pressure double precision,
  outer_zone_pressure double precision,
  edge_zone_pressure double precision,
  ring_pressure double precision,
  head_chamber_pressure double precision,
  slurry_flow_a double precision,
  slurry_flow_b double precision,
  slurry_flow_c double precision,
  platen_motor_current double precision,
  head_motor_current double precision,
  pad_temp double precision,
  PRIMARY KEY (run_id, ts)
);
COMMENT ON TABLE cmp_polish_trace IS '연마 시계열. 회전, 헤드 구역별 압력, 슬러리 유량, 모터 전류, 패드 온도. 10 Hz. 이유: 압력과 속도가 제거량을 정하고, 모터 전류와 패드 온도는 마찰 변화를 보여 준다.';
COMMENT ON COLUMN cmp_polish_trace.platen_speed IS '[rpm]';
COMMENT ON COLUMN cmp_polish_trace.head_speed IS '[rpm]';
COMMENT ON COLUMN cmp_polish_trace.center_zone_pressure IS '[psi]';
COMMENT ON COLUMN cmp_polish_trace.ripple_zone_pressure IS '[psi]';
COMMENT ON COLUMN cmp_polish_trace.outer_zone_pressure IS '[psi]';
COMMENT ON COLUMN cmp_polish_trace.edge_zone_pressure IS '[psi]';
COMMENT ON COLUMN cmp_polish_trace.ring_pressure IS '[psi]';
COMMENT ON COLUMN cmp_polish_trace.head_chamber_pressure IS '[psi]';
COMMENT ON COLUMN cmp_polish_trace.slurry_flow_a IS '[mL/min]';
COMMENT ON COLUMN cmp_polish_trace.slurry_flow_b IS '[mL/min]';
COMMENT ON COLUMN cmp_polish_trace.slurry_flow_c IS '[mL/min]';
COMMENT ON COLUMN cmp_polish_trace.platen_motor_current IS '[A]';
COMMENT ON COLUMN cmp_polish_trace.head_motor_current IS '[A]';
COMMENT ON COLUMN cmp_polish_trace.pad_temp IS '[°C]';
-- TimescaleDB를 쓰면: SELECT create_hypertable('sti_cmp.cmp_polish_trace', 'ts');

CREATE TABLE cmp_conditioner_trace (
  run_id text NOT NULL REFERENCES cmp_run(run_id),
  ts timestamptz NOT NULL,
  downforce double precision,
  disk_speed double precision,
  sweep_position double precision,
  disk_torque double precision,
  sweep_torque double precision,
  dressing_water_on boolean,
  PRIMARY KEY (run_id, ts)
);
COMMENT ON TABLE cmp_conditioner_trace IS '패드 컨디셔너 시계열. 누르는 힘, 디스크 회전, 팔 위치, 토크, 드레싱 물. 10 Hz. 이유: 패드 표면 상태가 제거율을 좌우하고, 디스크 토크는 패드와 디스크 마모를 알려 준다.';
COMMENT ON COLUMN cmp_conditioner_trace.downforce IS '[N]';
COMMENT ON COLUMN cmp_conditioner_trace.disk_speed IS '[rpm]';
COMMENT ON COLUMN cmp_conditioner_trace.sweep_position IS '[mm]';
COMMENT ON COLUMN cmp_conditioner_trace.disk_torque IS '[N·m]';
COMMENT ON COLUMN cmp_conditioner_trace.sweep_torque IS '[N·m]';
-- TimescaleDB를 쓰면: SELECT create_hypertable('sti_cmp.cmp_conditioner_trace', 'ts');

CREATE TABLE cmp_endpoint_trace (
  run_id text NOT NULL REFERENCES cmp_run(run_id),
  ts timestamptz NOT NULL,
  platen_rev integer,
  zone integer NOT NULL,
  est_thickness double precision,
  fit_quality double precision,
  spectrum_uri text,
  PRIMARY KEY (run_id, ts, zone)
);
COMMENT ON TABLE cmp_endpoint_trace IS '패드 창 광학 종점. 플래튼 한 바퀴마다 구역별 남은 두께 추정과 원본 스펙트럼. 이유: 언제 멈출지를 정한 근거이고, 종점 실패나 슬러리 끊김을 이 신호로 찾는다.';
COMMENT ON COLUMN cmp_endpoint_trace.est_thickness IS '[Å]';
COMMENT ON COLUMN cmp_endpoint_trace.fit_quality IS '[무차원]';
-- TimescaleDB를 쓰면: SELECT create_hypertable('sti_cmp.cmp_endpoint_trace', 'ts');

CREATE TABLE cmp_clean_trace (
  run_id text NOT NULL REFERENCES cmp_run(run_id),
  ts timestamptz NOT NULL,
  module text NOT NULL,
  brush_speed double precision,
  brush_pressure double precision,
  wafer_speed double precision,
  chem_flow double precision,
  diw_flow double precision,
  megasonic_power double precision,
  spin_speed double precision,
  PRIMARY KEY (run_id, ts, module)
);
COMMENT ON TABLE cmp_clean_trace IS '연마 후 세정기 시계열. 브러시, 메가소닉, 약액과 물 유량, 회전 건조. 1 Hz. 이유: 세정 조건이 남는 입자와 결함을 정한다.';
COMMENT ON COLUMN cmp_clean_trace.brush_speed IS '[rpm]';
COMMENT ON COLUMN cmp_clean_trace.brush_pressure IS '[psi]';
COMMENT ON COLUMN cmp_clean_trace.wafer_speed IS '[rpm]';
COMMENT ON COLUMN cmp_clean_trace.chem_flow IS '[mL/min]';
COMMENT ON COLUMN cmp_clean_trace.diw_flow IS '[mL/min]';
COMMENT ON COLUMN cmp_clean_trace.megasonic_power IS '[W]';
COMMENT ON COLUMN cmp_clean_trace.spin_speed IS '[rpm]';
-- TimescaleDB를 쓰면: SELECT create_hypertable('sti_cmp.cmp_clean_trace', 'ts');

CREATE TABLE cmp_event (
  event_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES cmp_equipment(equipment_id),
  run_id text REFERENCES cmp_run(run_id),
  ts timestamptz,
  kind text,
  code text,
  name text,
  cleared_ts timestamptz
);
COMMENT ON TABLE cmp_event IS '장비가 보낸 사건과 알람. 웨이퍼 이탈, 슬러리 유량 부족, 종점 미검출, 수명 도달. 이유: 알람 직전의 시계열을 찾아보는 출발점이고, 발생과 해제를 짝으로 남긴다.';

CREATE TABLE cmp_maintenance (
  pm_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES cmp_equipment(equipment_id),
  kind text,
  start_ts timestamptz,
  end_ts timestamptz,
  part text,
  part_serial text,
  note text
);
COMMENT ON TABLE cmp_maintenance IS '정비 기록. 패드, 디스크, retaining ring, 멤브레인 교체와 패드 길들이기, 교정. 이유: 교체하면 사용량 카운터가 0으로 돌아가고 제거율이 바뀌는 기준점이다.';

CREATE TABLE cmp_thickness_measurement (
  run_id text NOT NULL REFERENCES cmp_run(run_id),
  site_no integer NOT NULL,
  site_type text,
  x_mm double precision,
  y_mm double precision,
  pre_thickness double precision,
  post_thickness double precision,
  measured_ts timestamptz,
  metrology_tool text,
  PRIMARY KEY (run_id, site_no)
);
COMMENT ON TABLE cmp_thickness_measurement IS '연마 전후 측정 지점별 두께. 트렌치 위 산화막과 활성 영역 질화막을 나눠 잰다. 이유: 전후 차이가 제거량이고, 연마 전 값은 앞 공정 증착 후 측정과 같은 값이다.';
COMMENT ON COLUMN cmp_thickness_measurement.x_mm IS '[mm]';
COMMENT ON COLUMN cmp_thickness_measurement.y_mm IS '[mm]';
COMMENT ON COLUMN cmp_thickness_measurement.pre_thickness IS '[Å]';
COMMENT ON COLUMN cmp_thickness_measurement.post_thickness IS '[Å]';
