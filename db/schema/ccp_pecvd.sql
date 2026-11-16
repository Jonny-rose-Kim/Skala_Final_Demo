-- CCP PECVD 하드웨어 센서 DB (PostgreSQL). 그림과 같은 스펙에서 자동 생성했다.
CREATE SCHEMA IF NOT EXISTS ccp_pecvd;
SET search_path TO ccp_pecvd;

CREATE TABLE ccp_equipment (
  equipment_id text PRIMARY KEY NOT NULL,
  model text,
  chamber text,
  rf_frequency double precision,
  electrode_type text,
  heater_type text,
  asset_id text,
  install_date date
);
COMMENT ON TABLE ccp_equipment IS 'CCP PECVD 챔버 한 개의 하드웨어 사양. RF 주파수, 전극과 히터 구성. 이유: 같은 레시피라도 챔버마다 하드웨어가 달라 센서값 기준과 모델을 챔버별로 나눠야 한다.';
COMMENT ON COLUMN ccp_equipment.rf_frequency IS '[MHz]';

CREATE TABLE ccp_sensor (
  sensor_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES ccp_equipment(equipment_id),
  measures text,
  sensor_type text,
  trace_table text,
  trace_column text,
  sample_hz double precision,
  asset_id text,
  last_calibrated date
);
COMMENT ON TABLE ccp_sensor IS '챔버에 달린 센서 목록. 무엇을 어디서 재는지, 단위, 수집 주기, 교정일. 이유: 시계열의 각 열이 어느 물리 센서에서 왔는지 알아야 값을 믿고 센서 고장을 가린다.';
COMMENT ON COLUMN ccp_sensor.sample_hz IS '[Hz]';

CREATE TABLE ccp_run (
  run_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES ccp_equipment(equipment_id),
  wafer_id text,
  lot_id text,
  slot_no integer,
  recipe text,
  start_ts timestamptz,
  end_ts timestamptz,
  result text,
  wafers_since_clean integer,
  thickness_since_clean double precision,
  data_origin text
);
COMMENT ON TABLE ccp_run IS '웨이퍼 한 장을 한 번 증착한 기록. 레시피, 시작과 끝, 세정 이후 누적 카운터. 이유: 모든 시계열과 측정 결과를 이 한 번의 처리에 묶어야 비교와 추적이 된다.';
COMMENT ON COLUMN ccp_run.thickness_since_clean IS '[µm]';

CREATE TABLE ccp_run_step (
  run_id text NOT NULL REFERENCES ccp_run(run_id),
  step_no integer NOT NULL,
  step_name text,
  start_ts timestamptz,
  end_ts timestamptz,
  sp_rf_power double precision,
  sp_pressure double precision,
  sp_spacing double precision,
  sp_heater_temp double precision,
  sp_sih4_flow double precision,
  sp_n2o_flow double precision,
  sp_duration double precision,
  PRIMARY KEY (run_id, step_no)
);
COMMENT ON TABLE ccp_run_step IS '레시피 단계별 설정값과 실제 시작, 끝 시각. 안정화, 증착, 퍼지, 펌프다운. 이유: 실측 시계열을 설정값과 비교해야 이탈을 판단할 수 있다.';
COMMENT ON COLUMN ccp_run_step.sp_rf_power IS '[W]';
COMMENT ON COLUMN ccp_run_step.sp_pressure IS '[Torr]';
COMMENT ON COLUMN ccp_run_step.sp_spacing IS '[mm]';
COMMENT ON COLUMN ccp_run_step.sp_heater_temp IS '[°C]';
COMMENT ON COLUMN ccp_run_step.sp_sih4_flow IS '[sccm]';
COMMENT ON COLUMN ccp_run_step.sp_n2o_flow IS '[sccm]';
COMMENT ON COLUMN ccp_run_step.sp_duration IS '[s]';

CREATE TABLE ccp_rf_trace (
  run_id text NOT NULL REFERENCES ccp_run(run_id),
  ts timestamptz NOT NULL,
  step_no integer,
  forward_power double precision,
  reflected_power double precision,
  match_tune_pos double precision,
  match_load_pos double precision,
  vpp double precision,
  vi_voltage double precision,
  vi_current double precision,
  vi_phase double precision,
  PRIMARY KEY (run_id, ts)
);
COMMENT ON TABLE ccp_rf_trace IS 'RF 계열 시계열. RF 발생기, 매처, VI probe에서 10 Hz로 수집. 이유: 플라즈마에 실제로 들어간 전력과 임피던스 변화가 증착 속도와 막 stress를 바꾼다.';
COMMENT ON COLUMN ccp_rf_trace.forward_power IS '[W]';
COMMENT ON COLUMN ccp_rf_trace.reflected_power IS '[W]';
COMMENT ON COLUMN ccp_rf_trace.match_tune_pos IS '[%]';
COMMENT ON COLUMN ccp_rf_trace.match_load_pos IS '[%]';
COMMENT ON COLUMN ccp_rf_trace.vpp IS '[V]';
COMMENT ON COLUMN ccp_rf_trace.vi_voltage IS '[V]';
COMMENT ON COLUMN ccp_rf_trace.vi_current IS '[A]';
COMMENT ON COLUMN ccp_rf_trace.vi_phase IS '[°]';
-- TimescaleDB를 쓰면: SELECT create_hypertable('ccp_pecvd.ccp_rf_trace', 'ts');

CREATE TABLE ccp_chamber_trace (
  run_id text NOT NULL REFERENCES ccp_run(run_id),
  ts timestamptz NOT NULL,
  step_no integer,
  chamber_pressure double precision,
  throttle_valve_pos double precision,
  foreline_pressure double precision,
  sih4_flow double precision,
  n2o_flow double precision,
  n2_flow double precision,
  heater_temp double precision,
  heater_output double precision,
  electrode_spacing double precision,
  PRIMARY KEY (run_id, ts)
);
COMMENT ON TABLE ccp_chamber_trace IS '챔버 시계열. 압력 게이지, throttle valve, MFC, 페데스탈 히터, 전극 간격에서 10 Hz. 이유: 압력, 가스 유량, 온도, 간격이 막 두께와 굴절률을 직접 정한다.';
COMMENT ON COLUMN ccp_chamber_trace.chamber_pressure IS '[Torr]';
COMMENT ON COLUMN ccp_chamber_trace.throttle_valve_pos IS '[%]';
COMMENT ON COLUMN ccp_chamber_trace.foreline_pressure IS '[Torr]';
COMMENT ON COLUMN ccp_chamber_trace.sih4_flow IS '[sccm]';
COMMENT ON COLUMN ccp_chamber_trace.n2o_flow IS '[sccm]';
COMMENT ON COLUMN ccp_chamber_trace.n2_flow IS '[sccm]';
COMMENT ON COLUMN ccp_chamber_trace.heater_temp IS '[°C]';
COMMENT ON COLUMN ccp_chamber_trace.heater_output IS '[%]';
COMMENT ON COLUMN ccp_chamber_trace.electrode_spacing IS '[mm]';
-- TimescaleDB를 쓰면: SELECT create_hypertable('ccp_pecvd.ccp_chamber_trace', 'ts');

CREATE TABLE ccp_oes_trace (
  run_id text NOT NULL REFERENCES ccp_run(run_id),
  ts timestamptz NOT NULL,
  sih_414nm double precision,
  n2_337nm double precision,
  h_alpha_656nm double precision,
  o_777nm double precision,
  spectrum_uri text,
  PRIMARY KEY (run_id, ts)
);
COMMENT ON TABLE ccp_oes_trace IS '관찰창으로 본 플라즈마 발광선 세기와 원본 스펙트럼 위치. 1 Hz. 이유: 벽 상태와 가스 해리 정도의 변화를 막 결과보다 먼저 보여 준다.';
COMMENT ON COLUMN ccp_oes_trace.sih_414nm IS '[a.u.]';
COMMENT ON COLUMN ccp_oes_trace.n2_337nm IS '[a.u.]';
COMMENT ON COLUMN ccp_oes_trace.h_alpha_656nm IS '[a.u.]';
COMMENT ON COLUMN ccp_oes_trace.o_777nm IS '[a.u.]';
-- TimescaleDB를 쓰면: SELECT create_hypertable('ccp_pecvd.ccp_oes_trace', 'ts');

CREATE TABLE ccp_event (
  event_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES ccp_equipment(equipment_id),
  run_id text REFERENCES ccp_run(run_id),
  ts timestamptz,
  kind text,
  code text,
  name text,
  cleared_ts timestamptz
);
COMMENT ON TABLE ccp_event IS '장비가 보낸 사건과 알람. 플라즈마 켜짐, 반사 전력 초과, 압력 안정화 시간 초과, 아킹. 이유: 알람 직전의 시계열을 찾아보는 출발점이고, 발생과 해제를 짝으로 남긴다.';

CREATE TABLE ccp_maintenance (
  pm_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES ccp_equipment(equipment_id),
  kind text,
  start_ts timestamptz,
  end_ts timestamptz,
  clean_endpoint_time double precision,
  part text,
  part_serial text,
  note text
);
COMMENT ON TABLE ccp_maintenance IS '정비 기록. 챔버 세정과 종점까지 걸린 시간, wet clean, 시즈닝, 부품 교체, 교정. 이유: 세정 직후 첫 웨이퍼 효과와 누적 증착에 따른 드리프트를 설명하는 기준점이다.';
COMMENT ON COLUMN ccp_maintenance.clean_endpoint_time IS '[s]';

CREATE TABLE ccp_film_measurement (
  run_id text NOT NULL REFERENCES ccp_run(run_id),
  site_no integer NOT NULL,
  x_mm double precision,
  y_mm double precision,
  thickness double precision,
  refractive_index double precision,
  measured_ts timestamptz,
  metrology_tool text,
  PRIMARY KEY (run_id, site_no)
);
COMMENT ON TABLE ccp_film_measurement IS '증착 후 웨이퍼 위 측정 지점별 막 두께와 굴절률. 엘립소미터로 측정. 이유: 센서값과 결과를 같은 처리에 묶어야 원인 분석과 가상 계측을 할 수 있다.';
COMMENT ON COLUMN ccp_film_measurement.x_mm IS '[mm]';
COMMENT ON COLUMN ccp_film_measurement.y_mm IS '[mm]';
COMMENT ON COLUMN ccp_film_measurement.thickness IS '[Å]';
COMMENT ON COLUMN ccp_film_measurement.refractive_index IS '[무차원]';
