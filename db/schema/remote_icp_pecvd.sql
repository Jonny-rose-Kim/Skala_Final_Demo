-- Remote ICP PECVD 하드웨어 센서 DB (PostgreSQL). 그림과 같은 스펙에서 자동 생성했다.
CREATE SCHEMA IF NOT EXISTS remote_icp_pecvd;
SET search_path TO remote_icp_pecvd;

CREATE TABLE remote_equipment (
  equipment_id text PRIMARY KEY NOT NULL,
  model text,
  source_type text,
  source_model text,
  rf_frequency double precision,
  tube_material text,
  stage_type text,
  asset_id text,
  install_date date
);
COMMENT ON TABLE remote_equipment IS 'Remote ICP 장비 한 대의 하드웨어 사양. 소스 방식과 모델, 튜브 재질, 스테이지 구성. 이유: 소스 방식에 따라 나오는 신호 자체가 다르다. 코일형만 매처와 반사 전력을 따로 보고한다.';
COMMENT ON COLUMN remote_equipment.source_type IS 'coil_icp(외부 RF 발생기와 매처, 석영 튜브와 코일) | integrated_toroidal(일체형 원격 소스). REMOTE-01은 coil_icp';
COMMENT ON COLUMN remote_equipment.source_model IS '소스나 RF 발생기 모델';
COMMENT ON COLUMN remote_equipment.rf_frequency IS '명목 주파수 [MHz]';

CREATE TABLE remote_signal (
  signal_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES remote_equipment(equipment_id),
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
COMMENT ON TABLE remote_signal IS '장비에 달린 측정 항목 명단. 시계열 열 하나가 한 행이고 단위, 원래 태그, 센서 본체와 측정 지점을 적는다. 이유: 값이 어느 센서의 어느 지점에서 왔는지 알아야 값을 믿고, 센서 고장과 공정 이상을 가린다.';
COMMENT ON COLUMN remote_signal.trace_column IS '이 신호가 들어가는 테이블과 열';
COMMENT ON COLUMN remote_signal.quantity IS '물리량. pressure, flow, rf_power, torque 등';
COMMENT ON COLUMN remote_signal.source_tag IS '장비나 원천 데이터에서 쓰는 원래 이름(SVID, FDC 태그, 공개 데이터 열 이름)';
COMMENT ON COLUMN remote_signal.sensor_type IS '측정 방식. 센서 없이 컨트롤러가 계산하거나 정한 값은 NULL';
COMMENT ON COLUMN remote_signal.sensor_asset_id IS '센서 본체가 달린 3D 부품. 컨트롤러가 계산한 값은 NULL';
COMMENT ON COLUMN remote_signal.point_asset_id IS '실제로 재는 지점의 3D 부품. 게이지 본체와 탭 위치가 다를 수 있다';
COMMENT ON COLUMN remote_signal.report_hz IS '장비가 보고하는 명목 주기. 실제 간격은 ts로 확인. 변할 때만 남는 신호는 NULL [Hz]';

CREATE TABLE remote_run (
  run_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES remote_equipment(equipment_id),
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
  tube_plasma_hours double precision,
  data_origin text
);
COMMENT ON TABLE remote_run IS '웨이퍼 한 장을 한 번 증착한 기록. 레시피와 개정판, 시작과 끝, 시작 시점의 챔버와 튜브 카운터. 이유: 모든 시계열과 측정 결과를 이 한 번의 처리에 묶어야 비교와 추적이 된다.';
COMMENT ON COLUMN remote_run.carrier_id IS 'FOUP ID. OHT 반송 기록의 carrier_id와 같은 값';
COMMENT ON COLUMN remote_run.recipe_rev IS '레시피 개정판. 같은 이름도 설정이 바뀔 수 있다';
COMMENT ON COLUMN remote_run.run_status IS 'completed | aborted. 막 합격 여부는 측정 테이블에서 본다';
COMMENT ON COLUMN remote_run.wafers_since_wet_clean IS 'run 시작 시점 값. wet clean 때 0';
COMMENT ON COLUMN remote_run.tube_plasma_hours IS 'run 시작 시점, 지금 달린 석영 튜브의 누적 플라즈마 시간. 튜브 교체 때 0 [h]';
COMMENT ON COLUMN remote_run.data_origin IS 'equipment(실제 장비) | replay(공개 데이터 재생) | simulation';

CREATE TABLE remote_run_step (
  run_id text NOT NULL REFERENCES remote_run(run_id),
  step_no integer NOT NULL,
  recipe_step_no integer,
  step_name text,
  start_ts timestamptz,
  end_ts timestamptz,
  sp_source_power double precision,
  sp_chamber_pressure double precision,
  sp_o2_flow double precision,
  sp_ar_flow double precision,
  sp_sih4_flow double precision,
  sp_stage_temp double precision,
  sp_duration double precision,
  PRIMARY KEY (run_id, step_no)
);
COMMENT ON TABLE remote_run_step IS '실제로 실행한 단계별 설정값과 시작, 끝 시각. 안정화, 점화, 증착, 퍼지. 이유: 실측 시계열을 설정값과 비교해야 이탈을 판단할 수 있다. 같은 레시피 단계를 반복해도 실행 순서로 구분한다.';
COMMENT ON COLUMN remote_run_step.step_no IS '실행 순서(1부터)';
COMMENT ON COLUMN remote_run_step.recipe_step_no IS '레시피상 단계 번호';
COMMENT ON COLUMN remote_run_step.sp_source_power IS '[W]';
COMMENT ON COLUMN remote_run_step.sp_chamber_pressure IS '[Torr]';
COMMENT ON COLUMN remote_run_step.sp_o2_flow IS '[sccm]';
COMMENT ON COLUMN remote_run_step.sp_ar_flow IS '점화나 actinometry에 Ar을 쓸 때만 선택: 해당 센서나 옵션이 없으면 NULL. [sccm]';
COMMENT ON COLUMN remote_run_step.sp_sih4_flow IS '[sccm]';
COMMENT ON COLUMN remote_run_step.sp_stage_temp IS '[°C]';
COMMENT ON COLUMN remote_run_step.sp_duration IS '[s]';

CREATE TABLE remote_source_trace (
  equipment_id text NOT NULL REFERENCES remote_equipment(equipment_id),
  ts timestamptz NOT NULL,
  run_id text REFERENCES remote_run(run_id),
  step_no integer,
  rf_forward_power double precision,
  rf_reflected_power double precision,
  match_tune_pos double precision,
  match_load_pos double precision,
  plasma_on boolean,
  o2_flow double precision,
  ar_flow double precision,
  source_pressure double precision,
  coolant_flow double precision,
  coolant_temp double precision,
  PRIMARY KEY (equipment_id, ts),
  FOREIGN KEY (run_id, step_no) REFERENCES remote_run_step(run_id, step_no)
);
COMMENT ON TABLE remote_source_trace IS '소스 쪽 시계열. RF 정방향과 반사 전력, 매처, 점화 상태, 튜브로 들어가는 O2와 Ar 유량, 코일 냉각수. 10 Hz. 이유: 소스가 제대로 켜지고 유지됐는지와 소스에 넣은 가스량이 래디컬 공급과 증착 속도를 정한다.';
COMMENT ON COLUMN remote_source_trace.run_id IS '생산 외 시간(점화 시험, 세정, 시즈닝, 대기)이면 NULL';
COMMENT ON COLUMN remote_source_trace.rf_forward_power IS 'coil_icp의 방향성 결합기 값. 일체형 소스의 Power Monitor와는 다른 값 [W]';
COMMENT ON COLUMN remote_source_trace.rf_reflected_power IS '[W]';
COMMENT ON COLUMN remote_source_trace.match_tune_pos IS '선택: 해당 센서나 옵션이 없으면 NULL. [%]';
COMMENT ON COLUMN remote_source_trace.match_load_pos IS '선택: 해당 센서나 옵션이 없으면 NULL. [%]';
COMMENT ON COLUMN remote_source_trace.o2_flow IS '소스 가스 MFC. 튜브 위쪽으로 들어간다 [sccm]';
COMMENT ON COLUMN remote_source_trace.ar_flow IS '선택: 해당 센서나 옵션이 없으면 NULL. [sccm]';
COMMENT ON COLUMN remote_source_trace.source_pressure IS '소스 출구 압력 탭을 단 경우만. 챔버 게이지와 다른 위치 선택: 해당 센서나 옵션이 없으면 NULL. [Torr]';
COMMENT ON COLUMN remote_source_trace.coolant_flow IS '코일과 하우징 냉각수 귀환 유량 [L/min]';
COMMENT ON COLUMN remote_source_trace.coolant_temp IS '냉각수 귀환 온도 [°C]';
-- TimescaleDB를 쓰면: SELECT create_hypertable('remote_icp_pecvd.remote_source_trace', 'ts');

CREATE TABLE remote_chamber_trace (
  equipment_id text NOT NULL REFERENCES remote_equipment(equipment_id),
  ts timestamptz NOT NULL,
  run_id text REFERENCES remote_run(run_id),
  step_no integer,
  chamber_pressure double precision,
  throttle_valve_pos double precision,
  sih4_flow double precision,
  stage_temp double precision,
  stage_heater_output double precision,
  PRIMARY KEY (equipment_id, ts),
  FOREIGN KEY (run_id, step_no) REFERENCES remote_run_step(run_id, step_no)
);
COMMENT ON TABLE remote_chamber_trace IS '공정 챔버 시계열. 압력 게이지, throttle valve, 아래 링으로 넣는 SiH4 유량, 스테이지 히터. 10 Hz. 이유: 압력, 전구체 유량, 웨이퍼 온도가 막 두께와 굴절률을 직접 바꾼다.';
COMMENT ON COLUMN remote_chamber_trace.run_id IS '생산 외 시간(점화 시험, 세정, 시즈닝, 대기)이면 NULL';
COMMENT ON COLUMN remote_chamber_trace.chamber_pressure IS '[Torr]';
COMMENT ON COLUMN remote_chamber_trace.throttle_valve_pos IS '[%]';
COMMENT ON COLUMN remote_chamber_trace.sih4_flow IS '전구체 MFC. 튜브를 지나지 않고 챔버의 링으로 들어간다 [sccm]';
COMMENT ON COLUMN remote_chamber_trace.stage_temp IS '[°C]';
COMMENT ON COLUMN remote_chamber_trace.stage_heater_output IS '[%]';
-- TimescaleDB를 쓰면: SELECT create_hypertable('remote_icp_pecvd.remote_chamber_trace', 'ts');

CREATE TABLE remote_oes_trace (
  equipment_id text NOT NULL REFERENCES remote_equipment(equipment_id),
  ts timestamptz NOT NULL,
  run_id text REFERENCES remote_run(run_id),
  integration_ms double precision,
  o_777nm double precision,
  o_845nm double precision,
  ar_750nm double precision,
  spectrum_uri text,
  PRIMARY KEY (equipment_id, ts)
);
COMMENT ON TABLE remote_oes_trace IS '소스 관찰창으로 본 발광선 세기와 원본 스펙트럼 위치. 분광기를 단 경우만. 1 Hz. 이유: O와 Ar 발광 비로 래디컬 상태와 관찰창 오염을 정성적으로 본다. 세기 비를 농도나 웨이퍼 도달량으로 바로 읽지 않는다. 장착한 장비에만 있는 테이블.';
COMMENT ON COLUMN remote_oes_trace.run_id IS '생산 외 시간(점화 시험, 세정, 시즈닝, 대기)이면 NULL';
COMMENT ON COLUMN remote_oes_trace.integration_ms IS '노출 시간 [ms]';
COMMENT ON COLUMN remote_oes_trace.o_777nm IS '[a.u.]';
COMMENT ON COLUMN remote_oes_trace.o_845nm IS '[a.u.]';
COMMENT ON COLUMN remote_oes_trace.ar_750nm IS 'Ar을 넣을 때만 의미가 있다 선택: 해당 센서나 옵션이 없으면 NULL. [a.u.]';
COMMENT ON COLUMN remote_oes_trace.spectrum_uri IS '원본 스펙트럼 파일 위치';
-- TimescaleDB를 쓰면: SELECT create_hypertable('remote_icp_pecvd.remote_oes_trace', 'ts');

CREATE TABLE remote_event (
  event_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES remote_equipment(equipment_id),
  run_id text REFERENCES remote_run(run_id),
  ts timestamptz,
  kind text,
  code text,
  name text,
  asset_id text,
  cleared_ts timestamptz
);
COMMENT ON TABLE remote_event IS '장비가 보낸 사건과 알람. 플라즈마 켜짐, 점화 실패, 냉각수 부족이나 과열 인터락, 반사 전력 초과. 이유: 알람 직전 시계열을 찾는 출발점이고 인터락 동작 기록이다. 원인 부품을 3D로 가리킨다.';
COMMENT ON COLUMN remote_event.run_id IS '생산 외 시간(세정, 대기, 정비)이면 NULL';
COMMENT ON COLUMN remote_event.kind IS 'alarm | warning | state | info';
COMMENT ON COLUMN remote_event.code IS '장비 알람 코드(ALID)';
COMMENT ON COLUMN remote_event.name IS '장비가 보낸 원래 문구';
COMMENT ON COLUMN remote_event.asset_id IS '원인으로 지목된 부품';
COMMENT ON COLUMN remote_event.cleared_ts IS 'alarm만 해제 시각을 채운다. 일반 사건은 NULL';

CREATE TABLE remote_maintenance (
  pm_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES remote_equipment(equipment_id),
  event_id text REFERENCES remote_event(event_id),
  kind text,
  planned boolean,
  start_ts timestamptz,
  end_ts timestamptz,
  asset_id text,
  part_serial text,
  note text
);
COMMENT ON TABLE remote_maintenance IS '정비 기록. 석영 튜브 교체, 챔버 wet clean, NF3 세정, 시즈닝, 센서 교정. 이유: 세정과 교체는 카운터가 0이 되는 기준점이고, 계획 정비와 고장 수리를 나눠야 드리프트를 바르게 읽는다.';
COMMENT ON COLUMN remote_maintenance.event_id IS '고장이나 알람 대응이면 원인 알람';
COMMENT ON COLUMN remote_maintenance.kind IS 'tube_replace | wet_clean | dry_clean | seasoning | replace | calibration';
COMMENT ON COLUMN remote_maintenance.planned IS 'true 계획 정비, false 고장이나 알람 대응';
COMMENT ON COLUMN remote_maintenance.asset_id IS '정비한 부품. 교체면 이 부품의 사용량 카운터가 0이 된다. 교정이면 센서 본체';
COMMENT ON COLUMN remote_maintenance.part_serial IS '새로 단 부품의 serial이나 lot. 세정은 NULL';
COMMENT ON COLUMN remote_maintenance.note IS '작업자 메모. 구조화된 값을 대신하지 않는다';

CREATE TABLE remote_film_measurement (
  meas_id text NOT NULL,
  site_no integer NOT NULL,
  run_id text REFERENCES remote_run(run_id),
  x_mm double precision,
  y_mm double precision,
  thickness double precision,
  refractive_index double precision,
  measured_ts timestamptz,
  metrology_tool_id text,
  PRIMARY KEY (meas_id, site_no)
);
COMMENT ON TABLE remote_film_measurement IS '증착 후 측정 지점별 막 두께와 굴절률. 측정 한 번이 meas_id 하나. 이유: 센서값과 결과를 같은 처리에 묶어야 원인 분석과 가상 계측을 할 수 있다. 재측정은 새 meas_id로 남는다.';
COMMENT ON COLUMN remote_film_measurement.meas_id IS '측정 한 번. 다시 재면 새 meas_id';
COMMENT ON COLUMN remote_film_measurement.x_mm IS '[mm]';
COMMENT ON COLUMN remote_film_measurement.y_mm IS '[mm]';
COMMENT ON COLUMN remote_film_measurement.thickness IS '[Å]';
COMMENT ON COLUMN remote_film_measurement.refractive_index IS '측정 파장과 광학 모델은 계측기 쪽 기록 선택: 해당 센서나 옵션이 없으면 NULL. [무차원]';
COMMENT ON COLUMN remote_film_measurement.metrology_tool_id IS '계측 장비 ID';
