-- CCP PECVD 하드웨어 센서 DB (PostgreSQL). 그림과 같은 스펙에서 자동 생성했다.
CREATE SCHEMA IF NOT EXISTS ccp_pecvd;
SET search_path TO ccp_pecvd;

CREATE TABLE ccp_equipment (
  equipment_id text PRIMARY KEY NOT NULL,
  tool_id text,
  model text,
  rf_frequency double precision,
  electrode_type text,
  heater_type text,
  asset_id text,
  install_date date
);
COMMENT ON TABLE ccp_equipment IS 'CCP PECVD 챔버 한 개의 하드웨어 사양. 상위 장비, RF 주파수, 전극과 히터 구성. 이유: 같은 레시피라도 챔버마다 하드웨어가 달라 센서값 기준과 모델을 챔버별로 나눠야 한다.';
COMMENT ON COLUMN ccp_equipment.equipment_id IS '챔버 단위 ID. 예: PECVD-01.CH-A';
COMMENT ON COLUMN ccp_equipment.tool_id IS '챔버가 속한 상위 장비. 예: PECVD-01';
COMMENT ON COLUMN ccp_equipment.rf_frequency IS '명목 주파수 [MHz]';

CREATE TABLE ccp_signal (
  signal_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES ccp_equipment(equipment_id),
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
COMMENT ON TABLE ccp_signal IS '장비에 달린 측정 항목 명단. 시계열 열 하나가 한 행이고 단위, 원래 태그, 센서 본체와 측정 지점을 적는다. 이유: 값이 어느 센서의 어느 지점에서 왔는지 알아야 값을 믿고, 센서 고장과 공정 이상을 가린다.';
COMMENT ON COLUMN ccp_signal.trace_column IS '이 신호가 들어가는 테이블과 열';
COMMENT ON COLUMN ccp_signal.quantity IS '물리량. pressure, flow, rf_power, torque 등';
COMMENT ON COLUMN ccp_signal.source_tag IS '장비나 원천 데이터에서 쓰는 원래 이름(SVID, FDC 태그, 공개 데이터 열 이름)';
COMMENT ON COLUMN ccp_signal.sensor_type IS '측정 방식. 센서 없이 컨트롤러가 계산하거나 정한 값은 NULL';
COMMENT ON COLUMN ccp_signal.sensor_asset_id IS '센서 본체가 달린 3D 부품. 컨트롤러가 계산한 값은 NULL';
COMMENT ON COLUMN ccp_signal.point_asset_id IS '실제로 재는 지점의 3D 부품. 게이지 본체와 탭 위치가 다를 수 있다';
COMMENT ON COLUMN ccp_signal.report_hz IS '장비가 보고하는 명목 주기. 실제 간격은 ts로 확인. 변할 때만 남는 신호는 NULL [Hz]';

CREATE TABLE ccp_run (
  run_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES ccp_equipment(equipment_id),
  wafer_id text,
  lot_id text,
  carrier_id text,
  slot_no integer,
  recipe_id text,
  recipe_rev text,
  start_ts timestamptz,
  end_ts timestamptz,
  run_status text,
  wafers_since_wet_clean integer,
  est_dep_since_dry_clean double precision,
  data_origin text
);
COMMENT ON TABLE ccp_run IS '웨이퍼 한 장을 한 번 증착한 기록. 레시피와 개정판, 시작과 끝, 시작 시점의 세정 이후 카운터. 이유: 모든 시계열과 측정 결과를 이 한 번의 처리에 묶어야 비교와 추적이 된다.';
COMMENT ON COLUMN ccp_run.carrier_id IS 'FOUP ID. OHT 반송 기록의 carrier_id와 같은 값';
COMMENT ON COLUMN ccp_run.recipe_rev IS '레시피 개정판. 같은 이름도 설정이 바뀔 수 있다';
COMMENT ON COLUMN ccp_run.run_status IS 'completed | aborted. 공정이 끝났는지만 적고, 막 합격 여부는 측정 테이블에서 본다';
COMMENT ON COLUMN ccp_run.wafers_since_wet_clean IS 'run 시작 시점 값. wet clean 때 0';
COMMENT ON COLUMN ccp_run.est_dep_since_dry_clean IS 'run 시작 시점, 레시피 목표 두께를 더한 추정치. 챔버 벽을 직접 잰 값이 아니다. dry clean 때 0 [µm]';
COMMENT ON COLUMN ccp_run.data_origin IS 'equipment(실제 장비) | replay(공개 데이터 재생) | simulation';

CREATE TABLE ccp_run_step (
  run_id text NOT NULL REFERENCES ccp_run(run_id),
  step_no integer NOT NULL,
  recipe_step_no integer,
  step_name text,
  start_ts timestamptz,
  end_ts timestamptz,
  sp_rf_power double precision,
  sp_pressure double precision,
  sp_spacing double precision,
  sp_heater_temp double precision,
  sp_sih4_flow double precision,
  sp_n2o_flow double precision,
  sp_n2_flow double precision,
  sp_duration double precision,
  PRIMARY KEY (run_id, step_no)
);
COMMENT ON TABLE ccp_run_step IS '실제로 실행한 단계별 설정값과 시작, 끝 시각. 안정화, 증착, 퍼지, 펌프다운. 이유: 실측 시계열을 설정값과 비교해야 이탈을 판단할 수 있다. 같은 레시피 단계를 반복해도 실행 순서로 구분한다.';
COMMENT ON COLUMN ccp_run_step.step_no IS '실행 순서(1부터)';
COMMENT ON COLUMN ccp_run_step.recipe_step_no IS '레시피상 단계 번호. 반복하면 같은 값이 여러 번 나온다';
COMMENT ON COLUMN ccp_run_step.sp_rf_power IS '[W]';
COMMENT ON COLUMN ccp_run_step.sp_pressure IS '[Torr]';
COMMENT ON COLUMN ccp_run_step.sp_spacing IS '레시피마다 전극 간격을 바꾸는 장비만 선택: 해당 센서나 옵션이 없으면 NULL. [mm]';
COMMENT ON COLUMN ccp_run_step.sp_heater_temp IS '[°C]';
COMMENT ON COLUMN ccp_run_step.sp_sih4_flow IS '[sccm]';
COMMENT ON COLUMN ccp_run_step.sp_n2o_flow IS '[sccm]';
COMMENT ON COLUMN ccp_run_step.sp_n2_flow IS 'N2를 레시피로 제어할 때만 선택: 해당 센서나 옵션이 없으면 NULL. [sccm]';
COMMENT ON COLUMN ccp_run_step.sp_duration IS '[s]';

CREATE TABLE ccp_rf_trace (
  equipment_id text NOT NULL REFERENCES ccp_equipment(equipment_id),
  ts timestamptz NOT NULL,
  run_id text REFERENCES ccp_run(run_id),
  step_no integer,
  forward_power double precision,
  reflected_power double precision,
  match_tune_pos double precision,
  match_load_pos double precision,
  vpp double precision,
  vi_voltage double precision,
  vi_current double precision,
  vi_phase double precision,
  PRIMARY KEY (equipment_id, ts),
  FOREIGN KEY (run_id, step_no) REFERENCES ccp_run_step(run_id, step_no)
);
COMMENT ON TABLE ccp_rf_trace IS 'RF 시계열. 발생기 정방향과 반사 전력이 기본이고 매처 위치, Vpp, VI probe는 단 경우만. 10 Hz 스칼라 값. 이유: 플라즈마에 실제로 들어간 전력과 임피던스 변화가 증착 속도와 막 stress를 바꾼다.';
COMMENT ON COLUMN ccp_rf_trace.run_id IS '생산 외 시간(dry clean, 시즈닝, 대기)이면 NULL';
COMMENT ON COLUMN ccp_rf_trace.forward_power IS '[W]';
COMMENT ON COLUMN ccp_rf_trace.reflected_power IS '[W]';
COMMENT ON COLUMN ccp_rf_trace.match_tune_pos IS '선택: 해당 센서나 옵션이 없으면 NULL. [%]';
COMMENT ON COLUMN ccp_rf_trace.match_load_pos IS '선택: 해당 센서나 옵션이 없으면 NULL. [%]';
COMMENT ON COLUMN ccp_rf_trace.vpp IS '측정 위치는 signal.point_asset_id 선택: 해당 센서나 옵션이 없으면 NULL. [V]';
COMMENT ON COLUMN ccp_rf_trace.vi_voltage IS 'VI probe 기본파 RMS. 13.56 MHz 원파형이 아니다 선택: 해당 센서나 옵션이 없으면 NULL. [V]';
COMMENT ON COLUMN ccp_rf_trace.vi_current IS 'VI probe 기본파 RMS 선택: 해당 센서나 옵션이 없으면 NULL. [A]';
COMMENT ON COLUMN ccp_rf_trace.vi_phase IS '전압과 전류의 위상차 선택: 해당 센서나 옵션이 없으면 NULL. [°]';
-- TimescaleDB를 쓰면: SELECT create_hypertable('ccp_pecvd.ccp_rf_trace', 'ts');

CREATE TABLE ccp_chamber_trace (
  equipment_id text NOT NULL REFERENCES ccp_equipment(equipment_id),
  ts timestamptz NOT NULL,
  run_id text REFERENCES ccp_run(run_id),
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
  PRIMARY KEY (equipment_id, ts),
  FOREIGN KEY (run_id, step_no) REFERENCES ccp_run_step(run_id, step_no)
);
COMMENT ON TABLE ccp_chamber_trace IS '챔버 시계열. 압력 게이지, throttle valve, MFC, 페데스탈 히터, 전극 간격. 10 Hz. 이유: 압력, 가스 유량, 온도, 간격이 막 두께와 굴절률을 직접 정한다.';
COMMENT ON COLUMN ccp_chamber_trace.run_id IS '생산 외 시간(dry clean, 시즈닝, 대기)이면 NULL';
COMMENT ON COLUMN ccp_chamber_trace.chamber_pressure IS '[Torr]';
COMMENT ON COLUMN ccp_chamber_trace.throttle_valve_pos IS '[%]';
COMMENT ON COLUMN ccp_chamber_trace.foreline_pressure IS '선택: 해당 센서나 옵션이 없으면 NULL. [Torr]';
COMMENT ON COLUMN ccp_chamber_trace.sih4_flow IS '[sccm]';
COMMENT ON COLUMN ccp_chamber_trace.n2o_flow IS '[sccm]';
COMMENT ON COLUMN ccp_chamber_trace.n2_flow IS 'N2 라인을 쓰는 장비만. 안 쓰는 라인을 0으로 채우지 않는다 선택: 해당 센서나 옵션이 없으면 NULL. [sccm]';
COMMENT ON COLUMN ccp_chamber_trace.heater_temp IS '페데스탈 열전대. 웨이퍼 온도 자체는 아니다 [°C]';
COMMENT ON COLUMN ccp_chamber_trace.heater_output IS '[%]';
COMMENT ON COLUMN ccp_chamber_trace.electrode_spacing IS '간격을 움직이는 장비만 선택: 해당 센서나 옵션이 없으면 NULL. [mm]';
-- TimescaleDB를 쓰면: SELECT create_hypertable('ccp_pecvd.ccp_chamber_trace', 'ts');

CREATE TABLE ccp_oes_trace (
  equipment_id text NOT NULL REFERENCES ccp_equipment(equipment_id),
  ts timestamptz NOT NULL,
  run_id text REFERENCES ccp_run(run_id),
  integration_ms double precision,
  sih_414nm double precision,
  n2_337nm double precision,
  h_alpha_656nm double precision,
  o_777nm double precision,
  spectrum_uri text,
  PRIMARY KEY (equipment_id, ts)
);
COMMENT ON TABLE ccp_oes_trace IS '관찰창으로 본 발광선 세기와 원본 스펙트럼 위치. 분광기를 단 경우만. 1 Hz. 이유: 벽 상태와 가스 해리 변화를 막 결과보다 먼저 보여 준다. 세기는 상대값이라 농도로 바로 읽지 않는다. 장착한 장비에만 있는 테이블.';
COMMENT ON COLUMN ccp_oes_trace.run_id IS '생산 외 시간(dry clean, 시즈닝, 대기)이면 NULL';
COMMENT ON COLUMN ccp_oes_trace.integration_ms IS '노출 시간. 세기를 비교하려면 필요 [ms]';
COMMENT ON COLUMN ccp_oes_trace.sih_414nm IS '[a.u.]';
COMMENT ON COLUMN ccp_oes_trace.n2_337nm IS '[a.u.]';
COMMENT ON COLUMN ccp_oes_trace.h_alpha_656nm IS '[a.u.]';
COMMENT ON COLUMN ccp_oes_trace.o_777nm IS '[a.u.]';
COMMENT ON COLUMN ccp_oes_trace.spectrum_uri IS '원본 스펙트럼 파일 위치';
-- TimescaleDB를 쓰면: SELECT create_hypertable('ccp_pecvd.ccp_oes_trace', 'ts');

CREATE TABLE ccp_event (
  event_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES ccp_equipment(equipment_id),
  run_id text REFERENCES ccp_run(run_id),
  ts timestamptz,
  kind text,
  code text,
  name text,
  asset_id text,
  cleared_ts timestamptz
);
COMMENT ON TABLE ccp_event IS '장비가 보낸 사건과 알람. 플라즈마 켜짐, 반사 전력 초과, 압력 안정화 시간 초과, 아킹. 이유: 알람 직전 시계열을 찾는 출발점이다. 원인 부품을 3D로 가리키고, 알람은 발생과 해제를 짝으로 남긴다.';
COMMENT ON COLUMN ccp_event.run_id IS '생산 외 시간(세정, 대기, 정비)이면 NULL';
COMMENT ON COLUMN ccp_event.kind IS 'alarm | warning | state | info';
COMMENT ON COLUMN ccp_event.code IS '장비 알람 코드(ALID)';
COMMENT ON COLUMN ccp_event.name IS '장비가 보낸 원래 문구';
COMMENT ON COLUMN ccp_event.asset_id IS '원인으로 지목된 부품';
COMMENT ON COLUMN ccp_event.cleared_ts IS 'alarm만 해제 시각을 채운다. 일반 사건은 NULL';

CREATE TABLE ccp_maintenance (
  pm_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES ccp_equipment(equipment_id),
  event_id text REFERENCES ccp_event(event_id),
  kind text,
  planned boolean,
  start_ts timestamptz,
  end_ts timestamptz,
  asset_id text,
  clean_endpoint_time double precision,
  part_serial text,
  note text
);
COMMENT ON TABLE ccp_maintenance IS '정비 기록. dry clean과 종점 시간, wet clean, 시즈닝, 부품 교체, 센서 교정. 이유: 세정과 교체는 카운터가 0이 되는 기준점이고, 계획 정비와 고장 수리를 나눠야 드리프트를 바르게 읽는다.';
COMMENT ON COLUMN ccp_maintenance.event_id IS '고장이나 알람 대응이면 원인 알람';
COMMENT ON COLUMN ccp_maintenance.kind IS 'dry_clean | wet_clean | seasoning | replace | calibration';
COMMENT ON COLUMN ccp_maintenance.planned IS 'true 계획 정비, false 고장이나 알람 대응';
COMMENT ON COLUMN ccp_maintenance.asset_id IS '정비한 부품. 교체면 이 부품의 사용량 카운터가 0이 된다. 교정이면 센서 본체';
COMMENT ON COLUMN ccp_maintenance.clean_endpoint_time IS 'dry clean만. 세정 시작부터 종점 검출까지 [s]';
COMMENT ON COLUMN ccp_maintenance.part_serial IS '새로 단 부품의 serial이나 lot. 세정은 NULL';
COMMENT ON COLUMN ccp_maintenance.note IS '작업자 메모. 구조화된 값을 대신하지 않는다';

CREATE TABLE ccp_film_measurement (
  meas_id text NOT NULL,
  site_no integer NOT NULL,
  run_id text REFERENCES ccp_run(run_id),
  x_mm double precision,
  y_mm double precision,
  thickness double precision,
  refractive_index double precision,
  measured_ts timestamptz,
  metrology_tool_id text,
  PRIMARY KEY (meas_id, site_no)
);
COMMENT ON TABLE ccp_film_measurement IS '증착 후 측정 지점별 막 두께와 굴절률. 엘립소미터 측정 한 번이 meas_id 하나. 이유: 센서값과 결과를 같은 처리에 묶어야 원인 분석과 가상 계측을 할 수 있다. 재측정은 새 meas_id로 남는다.';
COMMENT ON COLUMN ccp_film_measurement.meas_id IS '측정 한 번. 다시 재면 새 meas_id';
COMMENT ON COLUMN ccp_film_measurement.x_mm IS '[mm]';
COMMENT ON COLUMN ccp_film_measurement.y_mm IS '[mm]';
COMMENT ON COLUMN ccp_film_measurement.thickness IS '[Å]';
COMMENT ON COLUMN ccp_film_measurement.refractive_index IS '측정 파장과 광학 모델은 계측기 쪽 기록 선택: 해당 센서나 옵션이 없으면 NULL. [무차원]';
COMMENT ON COLUMN ccp_film_measurement.metrology_tool_id IS '계측 장비 ID';
