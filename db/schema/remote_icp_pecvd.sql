-- Remote ICP PECVD 하드웨어 센서 DB (PostgreSQL). 자동 생성: 그림과 같은 스펙에서 만들었다.
CREATE SCHEMA IF NOT EXISTS remote_icp_pecvd;
SET search_path TO remote_icp_pecvd;

CREATE TABLE remote_equipment (
  equipment_id text PRIMARY KEY NOT NULL,
  model text,
  source_type text,
  rf_frequency double precision,
  tube_material text,
  stage_type text,
  asset_id text,
  install_date date
);
COMMENT ON TABLE remote_equipment IS 'Remote ICP 장비 한 대의 하드웨어 사양. 소스 방식, 튜브 재질, 스테이지 구성. 이유: 같은 레시피라도 하드웨어 구성이 다르면 센서값 기준이 달라진다.';
COMMENT ON COLUMN remote_equipment.rf_frequency IS '[MHz]';

CREATE TABLE remote_sensor (
  sensor_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES remote_equipment(equipment_id),
  measures text,
  sensor_type text,
  trace_table text,
  trace_column text,
  sample_hz double precision,
  asset_id text,
  last_calibrated date
);
COMMENT ON TABLE remote_sensor IS '장비에 달린 센서 목록. 무엇을 어디서 재는지, 단위, 수집 주기, 교정일. 이유: 시계열의 각 열이 어느 물리 센서에서 왔는지 알아야 값을 믿고 고장을 가린다.';
COMMENT ON COLUMN remote_sensor.sample_hz IS '[Hz]';

CREATE TABLE remote_run (
  run_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES remote_equipment(equipment_id),
  wafer_id text,
  lot_id text,
  slot_no integer,
  recipe text,
  start_ts timestamptz,
  end_ts timestamptz,
  result text,
  wafers_since_clean integer,
  tube_plasma_hours double precision,
  data_origin text
);
COMMENT ON TABLE remote_run IS '웨이퍼 한 장을 한 번 증착한 기록. 레시피, 시작과 끝, 챔버 상태 카운터. 이유: 모든 시계열과 측정 결과를 이 한 번의 처리에 묶어야 비교와 추적이 된다.';
COMMENT ON COLUMN remote_run.tube_plasma_hours IS '[h]';

CREATE TABLE remote_run_step (
  run_id text NOT NULL REFERENCES remote_run(run_id),
  step_no integer NOT NULL,
  step_name text,
  start_ts timestamptz,
  end_ts timestamptz,
  sp_source_power double precision,
  sp_chamber_pressure double precision,
  sp_o2_flow double precision,
  sp_sih4_flow double precision,
  sp_stage_temp double precision,
  PRIMARY KEY (run_id, step_no)
);
COMMENT ON TABLE remote_run_step IS '레시피 단계별 설정값과 실제 시작, 끝 시각. 안정화, 점화, 증착, 퍼지. 이유: 실측 시계열을 설정값과 비교해야 이탈을 판단할 수 있다.';
COMMENT ON COLUMN remote_run_step.sp_source_power IS '[W]';
COMMENT ON COLUMN remote_run_step.sp_chamber_pressure IS '[Torr]';
COMMENT ON COLUMN remote_run_step.sp_o2_flow IS '[sccm]';
COMMENT ON COLUMN remote_run_step.sp_sih4_flow IS '[sccm]';
COMMENT ON COLUMN remote_run_step.sp_stage_temp IS '[°C]';

CREATE TABLE remote_source_trace (
  run_id text NOT NULL REFERENCES remote_run(run_id),
  ts timestamptz NOT NULL,
  step_no integer,
  rf_forward_power double precision,
  rf_reflected_power double precision,
  match_tune_pos double precision,
  match_load_pos double precision,
  plasma_on boolean,
  source_pressure double precision,
  coolant_flow double precision,
  coolant_temp double precision,
  PRIMARY KEY (run_id, ts)
);
COMMENT ON TABLE remote_source_trace IS '원격 플라즈마 소스의 시계열. RF 발생기, 매처, 튜브 냉각에서 10 Hz로 수집. 이유: 소스가 제대로 켜지고 유지됐는지가 래디컬 공급과 증착 속도를 정한다.';
COMMENT ON COLUMN remote_source_trace.rf_forward_power IS '[W]';
COMMENT ON COLUMN remote_source_trace.rf_reflected_power IS '[W]';
COMMENT ON COLUMN remote_source_trace.match_tune_pos IS '[%]';
COMMENT ON COLUMN remote_source_trace.match_load_pos IS '[%]';
COMMENT ON COLUMN remote_source_trace.source_pressure IS '[Torr]';
COMMENT ON COLUMN remote_source_trace.coolant_flow IS '[L/min]';
COMMENT ON COLUMN remote_source_trace.coolant_temp IS '[°C]';
-- TimescaleDB를 쓰면: SELECT create_hypertable('remote_icp_pecvd.remote_source_trace', 'ts');

CREATE TABLE remote_chamber_trace (
  run_id text NOT NULL REFERENCES remote_run(run_id),
  ts timestamptz NOT NULL,
  step_no integer,
  chamber_pressure double precision,
  throttle_valve_pos double precision,
  o2_flow double precision,
  ar_flow double precision,
  sih4_flow double precision,
  stage_temp double precision,
  stage_heater_output double precision,
  PRIMARY KEY (run_id, ts)
);
COMMENT ON TABLE remote_chamber_trace IS '공정 챔버의 시계열. 압력 게이지, throttle valve, MFC, 스테이지 히터에서 10 Hz. 이유: 압력, 가스 유량, 웨이퍼 온도가 막 두께와 굴절률을 직접 바꾼다.';
COMMENT ON COLUMN remote_chamber_trace.chamber_pressure IS '[Torr]';
COMMENT ON COLUMN remote_chamber_trace.throttle_valve_pos IS '[%]';
COMMENT ON COLUMN remote_chamber_trace.o2_flow IS '[sccm]';
COMMENT ON COLUMN remote_chamber_trace.ar_flow IS '[sccm]';
COMMENT ON COLUMN remote_chamber_trace.sih4_flow IS '[sccm]';
COMMENT ON COLUMN remote_chamber_trace.stage_temp IS '[°C]';
COMMENT ON COLUMN remote_chamber_trace.stage_heater_output IS '[%]';
-- TimescaleDB를 쓰면: SELECT create_hypertable('remote_icp_pecvd.remote_chamber_trace', 'ts');

CREATE TABLE remote_oes_trace (
  run_id text NOT NULL REFERENCES remote_run(run_id),
  ts timestamptz NOT NULL,
  o_777nm double precision,
  o_845nm double precision,
  ar_750nm double precision,
  h_alpha_656nm double precision,
  spectrum_uri text,
  PRIMARY KEY (run_id, ts)
);
COMMENT ON TABLE remote_oes_trace IS '소스 관찰창으로 본 발광선 세기와 원본 스펙트럼 위치. 1 Hz. 이유: O 대 Ar 발광 비(actinometry)로 래디컬 상태와 관찰창 오염을 간접 확인한다.';
COMMENT ON COLUMN remote_oes_trace.o_777nm IS '[a.u.]';
COMMENT ON COLUMN remote_oes_trace.o_845nm IS '[a.u.]';
COMMENT ON COLUMN remote_oes_trace.ar_750nm IS '[a.u.]';
COMMENT ON COLUMN remote_oes_trace.h_alpha_656nm IS '[a.u.]';
-- TimescaleDB를 쓰면: SELECT create_hypertable('remote_icp_pecvd.remote_oes_trace', 'ts');

CREATE TABLE remote_event (
  event_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES remote_equipment(equipment_id),
  run_id text REFERENCES remote_run(run_id),
  ts timestamptz,
  kind text,
  code text,
  name text,
  cleared_ts timestamptz
);
COMMENT ON TABLE remote_event IS '장비가 보낸 사건과 알람. 플라즈마 켜짐, 점화 실패, 냉각수 부족, 반사 전력 초과. 이유: 알람 직전의 시계열을 찾아보는 출발점이고, 인터락 동작 기록이다.';

CREATE TABLE remote_maintenance (
  pm_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES remote_equipment(equipment_id),
  kind text,
  start_ts timestamptz,
  end_ts timestamptz,
  part text,
  part_serial text,
  note text
);
COMMENT ON TABLE remote_maintenance IS '정비 기록. 석영 튜브 교체, 챔버 wet clean, NF3 세정, 시즈닝, 센서 교정. 이유: 세정과 교체 직후 첫 웨이퍼 효과와 장기 드리프트를 설명하는 기준점이다.';

CREATE TABLE remote_film_measurement (
  run_id text NOT NULL REFERENCES remote_run(run_id),
  site_no integer NOT NULL,
  x_mm double precision,
  y_mm double precision,
  thickness double precision,
  refractive_index double precision,
  measured_ts timestamptz,
  metrology_tool text,
  PRIMARY KEY (run_id, site_no)
);
COMMENT ON TABLE remote_film_measurement IS '증착 후 웨이퍼 위 측정 지점별 막 두께와 굴절률. 이유: 센서값과 결과를 같은 처리에 묶어야 원인 분석과 가상 계측을 할 수 있다.';
COMMENT ON COLUMN remote_film_measurement.x_mm IS '[mm]';
COMMENT ON COLUMN remote_film_measurement.y_mm IS '[mm]';
COMMENT ON COLUMN remote_film_measurement.thickness IS '[Å]';
COMMENT ON COLUMN remote_film_measurement.refractive_index IS '[무차원]';
