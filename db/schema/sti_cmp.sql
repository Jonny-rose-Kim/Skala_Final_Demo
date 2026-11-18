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
COMMENT ON TABLE cmp_equipment IS 'CMP 장비 한 대의 하드웨어 사양. 플래튼 수, 헤드 압력 구역 수, 종점 방식, 세정기 구성. 이유: 플래튼과 헤드 구성이 다르면 같은 레시피라도 제거 특성과 나오는 신호가 달라진다.';
COMMENT ON COLUMN cmp_equipment.head_zone_count IS 'CMP-01은 멤브레인 3구역과 retaining ring';
COMMENT ON COLUMN cmp_equipment.endpoint_type IS 'optical_window | none';
COMMENT ON COLUMN cmp_equipment.cleaner_type IS 'brush_megasonic | brush | none';

CREATE TABLE cmp_signal (
  signal_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES cmp_equipment(equipment_id),
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
COMMENT ON TABLE cmp_signal IS '장비에 달린 측정 항목 명단. 시계열 열 하나가 한 행이고 단위, 원래 태그, 센서 본체와 측정 지점을 적는다. 이유: 값이 어느 센서의 어느 지점에서 왔는지 알아야 값을 믿고, 센서 고장과 공정 이상을 가린다.';
COMMENT ON COLUMN cmp_signal.trace_column IS '이 신호가 들어가는 테이블과 열';
COMMENT ON COLUMN cmp_signal.quantity IS '물리량. pressure, flow, rf_power, torque 등';
COMMENT ON COLUMN cmp_signal.source_tag IS '장비나 원천 데이터에서 쓰는 원래 이름(SVID, FDC 태그, 공개 데이터 열 이름)';
COMMENT ON COLUMN cmp_signal.sensor_type IS '측정 방식. 센서 없이 컨트롤러가 계산하거나 정한 값은 NULL';
COMMENT ON COLUMN cmp_signal.sensor_asset_id IS '센서 본체가 달린 3D 부품. 컨트롤러가 계산한 값은 NULL';
COMMENT ON COLUMN cmp_signal.point_asset_id IS '실제로 재는 지점의 3D 부품. 게이지 본체와 탭 위치가 다를 수 있다';
COMMENT ON COLUMN cmp_signal.report_hz IS '장비가 보고하는 명목 주기. 실제 간격은 ts로 확인. 변할 때만 남는 신호는 NULL [Hz]';

CREATE TABLE cmp_run (
  run_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES cmp_equipment(equipment_id),
  pass_id text,
  wafer_id text,
  lot_id text,
  carrier_id text,
  slot_no integer,
  recipe_id text,
  recipe_rev text,
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
COMMENT ON TABLE cmp_run IS '웨이퍼 한 장을 한 플래튼에서 연마한 기록. 종료 이유와 시작 시점의 소모품 사용량. 같은 웨이퍼의 CMP 전체는 pass_id로 묶는다. 이유: 제거율을 가장 크게 바꾸는 것은 그 플래튼의 패드, 디스크와 그 헤드의 멤브레인 사용량이라 처리마다 함께 남긴다.';
COMMENT ON COLUMN cmp_run.pass_id IS '웨이퍼 한 장이 CMP 장비에 들어와 연마와 세정을 마칠 때까지를 묶는 ID. 플래튼이 하나면 run과 1:1';
COMMENT ON COLUMN cmp_run.carrier_id IS 'FOUP ID. OHT 반송 기록의 carrier_id와 같은 값';
COMMENT ON COLUMN cmp_run.recipe_rev IS '레시피 개정판';
COMMENT ON COLUMN cmp_run.end_reason IS 'endpoint | max_time | abort';
COMMENT ON COLUMN cmp_run.pad_usage IS 'run 시작 시점, 이 플래튼에 달린 패드의 사용량. 패드 교체 때 0 [h]';
COMMENT ON COLUMN cmp_run.disk_usage IS '컨디셔너 디스크 사용량. 디스크 교체 때 0 [h]';
COMMENT ON COLUMN cmp_run.membrane_usage IS '이 헤드의 멤브레인. 교체 때 0 [장]';
COMMENT ON COLUMN cmp_run.ring_usage IS 'retaining ring 카운터를 주는 장비만 선택: 해당 센서나 옵션이 없으면 NULL. [장]';
COMMENT ON COLUMN cmp_run.backing_film_usage IS '[장]';
COMMENT ON COLUMN cmp_run.data_origin IS 'equipment(실제 장비) | replay(공개 데이터 재생) | simulation';

CREATE TABLE cmp_run_step (
  run_id text NOT NULL REFERENCES cmp_run(run_id),
  step_no integer NOT NULL,
  recipe_step_no integer,
  step_name text,
  start_ts timestamptz,
  end_ts timestamptz,
  sp_platen_speed double precision,
  sp_head_speed double precision,
  sp_zone_pressures jsonb,
  sp_ring_pressure double precision,
  sp_slurry_flows jsonb,
  sp_max_time double precision,
  PRIMARY KEY (run_id, step_no)
);
COMMENT ON TABLE cmp_run_step IS '실제로 실행한 단계별 설정값과 시작, 끝 시각. 본 연마, 추가 연마, 물 세척. 이유: 실측 시계열을 설정값과 비교해야 이탈을 판단할 수 있다. 구역 압력과 슬러리 라인은 실측 열과 같은 이름의 키로 둔다.';
COMMENT ON COLUMN cmp_run_step.step_no IS '실행 순서(1부터)';
COMMENT ON COLUMN cmp_run_step.recipe_step_no IS '레시피상 단계 번호';
COMMENT ON COLUMN cmp_run_step.sp_platen_speed IS '[rpm]';
COMMENT ON COLUMN cmp_run_step.sp_head_speed IS '[rpm]';
COMMENT ON COLUMN cmp_run_step.sp_zone_pressures IS '{"zone1": psi, "zone2": psi, "zone3": psi}. 키는 polish_trace의 zone 열과 같다';
COMMENT ON COLUMN cmp_run_step.sp_ring_pressure IS '[psi]';
COMMENT ON COLUMN cmp_run_step.sp_slurry_flows IS '{"a": mL/min, "b": ..., "c": ...}. 그 단계에서 쓰는 라인만';
COMMENT ON COLUMN cmp_run_step.sp_max_time IS '[s]';

CREATE TABLE cmp_polish_trace (
  equipment_id text NOT NULL REFERENCES cmp_equipment(equipment_id),
  platen_no integer NOT NULL,
  ts timestamptz NOT NULL,
  run_id text,
  step_no integer,
  platen_speed double precision,
  head_speed double precision,
  zone1_pressure double precision,
  zone2_pressure double precision,
  zone3_pressure double precision,
  ring_pressure double precision,
  slurry_flow_a double precision,
  slurry_flow_b double precision,
  slurry_flow_c double precision,
  platen_motor_current double precision,
  head_motor_current double precision,
  pad_temp double precision,
  PRIMARY KEY (equipment_id, platen_no, ts),
  FOREIGN KEY (run_id, step_no) REFERENCES cmp_run_step(run_id, step_no)
);
COMMENT ON TABLE cmp_polish_trace IS '연마 시계열. 회전, 멤브레인 구역 압력, ring 압력, 슬러리 유량, 모터 전류. 10 Hz. 이유: 압력과 속도가 제거량을 정하고, 모터 전류는 패드와 웨이퍼 사이 마찰 변화를 보여 준다.';
COMMENT ON COLUMN cmp_polish_trace.run_id IS '연마 중이 아니면 NULL';
COMMENT ON COLUMN cmp_polish_trace.platen_speed IS '[rpm]';
COMMENT ON COLUMN cmp_polish_trace.head_speed IS '[rpm]';
COMMENT ON COLUMN cmp_polish_trace.zone1_pressure IS '가운데 구역. 공압 회로 출구 압력이고 웨이퍼 접촉 압력 분포가 아니다 [psi]';
COMMENT ON COLUMN cmp_polish_trace.zone2_pressure IS '[psi]';
COMMENT ON COLUMN cmp_polish_trace.zone3_pressure IS '가장자리 구역 [psi]';
COMMENT ON COLUMN cmp_polish_trace.ring_pressure IS '[psi]';
COMMENT ON COLUMN cmp_polish_trace.slurry_flow_a IS '사용 지점(POU) 유량계 [mL/min]';
COMMENT ON COLUMN cmp_polish_trace.slurry_flow_b IS '두 번째 슬러리나 첨가제 라인이 있을 때만 선택: 해당 센서나 옵션이 없으면 NULL. [mL/min]';
COMMENT ON COLUMN cmp_polish_trace.slurry_flow_c IS '선택: 해당 센서나 옵션이 없으면 NULL. [mL/min]';
COMMENT ON COLUMN cmp_polish_trace.platen_motor_current IS '[A]';
COMMENT ON COLUMN cmp_polish_trace.head_motor_current IS '선택: 해당 센서나 옵션이 없으면 NULL. [A]';
COMMENT ON COLUMN cmp_polish_trace.pad_temp IS 'IR 온도 센서를 단 경우만 선택: 해당 센서나 옵션이 없으면 NULL. [°C]';
-- TimescaleDB를 쓰면: SELECT create_hypertable('sti_cmp.cmp_polish_trace', 'ts');

CREATE TABLE cmp_conditioner_trace (
  equipment_id text NOT NULL REFERENCES cmp_equipment(equipment_id),
  platen_no integer NOT NULL,
  ts timestamptz NOT NULL,
  run_id text REFERENCES cmp_run(run_id),
  mode text,
  dressing_water_on boolean,
  downforce double precision,
  disk_speed double precision,
  sweep_position double precision,
  disk_torque double precision,
  PRIMARY KEY (equipment_id, platen_no, ts)
);
COMMENT ON TABLE cmp_conditioner_trace IS '패드 컨디셔너 시계열. 동작 모드, 드레싱 물, 컨트롤러가 주면 누르는 힘, 디스크 회전, 팔 위치, 토크. 10 Hz. 이유: 패드 표면 상태가 제거율을 좌우한다. 웨이퍼 없이 하는 컨디셔닝도 있어 run이 없어도 쌓인다.';
COMMENT ON COLUMN cmp_conditioner_trace.run_id IS '웨이퍼 없는 단독 컨디셔닝이면 NULL';
COMMENT ON COLUMN cmp_conditioner_trace.mode IS 'in_situ(연마와 동시) | ex_situ(단독) | idle';
COMMENT ON COLUMN cmp_conditioner_trace.downforce IS '선택: 해당 센서나 옵션이 없으면 NULL. [N]';
COMMENT ON COLUMN cmp_conditioner_trace.disk_speed IS '선택: 해당 센서나 옵션이 없으면 NULL. [rpm]';
COMMENT ON COLUMN cmp_conditioner_trace.sweep_position IS '선택: 해당 센서나 옵션이 없으면 NULL. [mm]';
COMMENT ON COLUMN cmp_conditioner_trace.disk_torque IS '디스크 마모 판단용. 토크를 주는 장비만 선택: 해당 센서나 옵션이 없으면 NULL. [N·m]';
-- TimescaleDB를 쓰면: SELECT create_hypertable('sti_cmp.cmp_conditioner_trace', 'ts');

CREATE TABLE cmp_endpoint_trace (
  run_id text NOT NULL REFERENCES cmp_run(run_id),
  platen_rev integer NOT NULL,
  zone integer NOT NULL,
  ts timestamptz,
  est_thickness double precision,
  fit_quality double precision,
  algo_version text,
  spectrum_uri text,
  PRIMARY KEY (run_id, platen_rev, zone)
);
COMMENT ON TABLE cmp_endpoint_trace IS '패드 창 광학 종점. 플래튼 한 바퀴마다 구역별 남은 두께 추정과 원본 스펙트럼. 이유: 언제 멈출지를 정한 근거이고, 종점 실패나 슬러리 끊김을 이 신호로 찾는다. 추정치라 오프라인 측정과 따로 둔다.';
COMMENT ON COLUMN cmp_endpoint_trace.platen_rev IS '연마 시작 후 플래튼 회전 번호';
COMMENT ON COLUMN cmp_endpoint_trace.zone IS '웨이퍼 반지름 방향 측정 구역. 장비가 정한다';
COMMENT ON COLUMN cmp_endpoint_trace.est_thickness IS '광학 모델 추정치 [Å]';
COMMENT ON COLUMN cmp_endpoint_trace.fit_quality IS '장비가 주는 맞춤 점수. 범위와 방향은 장비 문서 선택: 해당 센서나 옵션이 없으면 NULL. [무차원]';
COMMENT ON COLUMN cmp_endpoint_trace.algo_version IS '추정 알고리즘이나 모델 버전';
COMMENT ON COLUMN cmp_endpoint_trace.spectrum_uri IS '원본 스펙트럼 파일. 다시 분석할 계획이 있을 때 선택: 해당 센서나 옵션이 없으면 NULL.';

CREATE TABLE cmp_clean_trace (
  equipment_id text NOT NULL REFERENCES cmp_equipment(equipment_id),
  module text NOT NULL,
  ts timestamptz NOT NULL,
  pass_id text,
  wafer_id text,
  wafer_speed double precision,
  diw_flow double precision,
  brush_speed double precision,
  brush_pressure double precision,
  chem_flow double precision,
  megasonic_power double precision,
  PRIMARY KEY (equipment_id, module, ts)
);
COMMENT ON TABLE cmp_clean_trace IS '연마가 끝난 웨이퍼의 세정과 건조 시계열. 모듈별 웨이퍼 회전과 물 유량, 단 경우 브러시, 약액, 메가소닉. 1 Hz. 이유: 세정은 플래튼별 run이 아니라 웨이퍼 CMP 전체(pass_id) 끝에 한 번 하고, 세정 조건이 남는 입자와 결함을 정한다.';
COMMENT ON COLUMN cmp_clean_trace.module IS 'brush1 | brush2 | megasonic | spin_dry';
COMMENT ON COLUMN cmp_clean_trace.pass_id IS 'cmp_run.pass_id와 같은 값';
COMMENT ON COLUMN cmp_clean_trace.wafer_speed IS '그 모듈에서 웨이퍼 회전. spin_dry면 건조 회전 [rpm]';
COMMENT ON COLUMN cmp_clean_trace.diw_flow IS '[mL/min]';
COMMENT ON COLUMN cmp_clean_trace.brush_speed IS '선택: 해당 센서나 옵션이 없으면 NULL. [rpm]';
COMMENT ON COLUMN cmp_clean_trace.brush_pressure IS '선택: 해당 센서나 옵션이 없으면 NULL. [psi]';
COMMENT ON COLUMN cmp_clean_trace.chem_flow IS '약액 종류는 signal.source_tag 선택: 해당 센서나 옵션이 없으면 NULL. [mL/min]';
COMMENT ON COLUMN cmp_clean_trace.megasonic_power IS '선택: 해당 센서나 옵션이 없으면 NULL. [W]';
-- TimescaleDB를 쓰면: SELECT create_hypertable('sti_cmp.cmp_clean_trace', 'ts');

CREATE TABLE cmp_event (
  event_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES cmp_equipment(equipment_id),
  run_id text REFERENCES cmp_run(run_id),
  ts timestamptz,
  kind text,
  code text,
  name text,
  asset_id text,
  cleared_ts timestamptz
);
COMMENT ON TABLE cmp_event IS '장비가 보낸 사건과 알람. 웨이퍼 이탈, 슬러리 유량 부족, 종점 미검출, 소모품 수명 도달. 이유: 알람 직전 시계열을 찾는 출발점이다. 어느 플래튼, 헤드, 세정 모듈인지 3D 부품으로 가리킨다.';
COMMENT ON COLUMN cmp_event.run_id IS '생산 외 시간(세정, 대기, 정비)이면 NULL';
COMMENT ON COLUMN cmp_event.kind IS 'alarm | warning | state | info';
COMMENT ON COLUMN cmp_event.code IS '장비 알람 코드(ALID)';
COMMENT ON COLUMN cmp_event.name IS '장비가 보낸 원래 문구';
COMMENT ON COLUMN cmp_event.asset_id IS '원인으로 지목된 부품';
COMMENT ON COLUMN cmp_event.cleared_ts IS 'alarm만 해제 시각을 채운다. 일반 사건은 NULL';

CREATE TABLE cmp_maintenance (
  pm_id text PRIMARY KEY NOT NULL,
  equipment_id text REFERENCES cmp_equipment(equipment_id),
  event_id text REFERENCES cmp_event(event_id),
  kind text,
  planned boolean,
  start_ts timestamptz,
  end_ts timestamptz,
  asset_id text,
  part_serial text,
  note text
);
COMMENT ON TABLE cmp_maintenance IS '정비 기록. 패드, 디스크, retaining ring, 멤브레인 교체와 패드 길들이기, 교정. 이유: 교체하면 그 부품의 사용량 카운터가 0이 되고 제거율이 바뀌는 기준점이다.';
COMMENT ON COLUMN cmp_maintenance.event_id IS '고장이나 알람 대응이면 원인 알람';
COMMENT ON COLUMN cmp_maintenance.kind IS 'pad_replace | disk_replace | ring_replace | membrane_replace | pad_breakin | calibration';
COMMENT ON COLUMN cmp_maintenance.planned IS 'true 계획 정비, false 고장이나 알람 대응';
COMMENT ON COLUMN cmp_maintenance.asset_id IS '정비한 부품. 교체면 이 부품의 사용량 카운터가 0이 된다. 교정이면 센서 본체';
COMMENT ON COLUMN cmp_maintenance.part_serial IS '새로 단 부품의 serial이나 lot. 세정은 NULL';
COMMENT ON COLUMN cmp_maintenance.note IS '작업자 메모. 구조화된 값을 대신하지 않는다';

CREATE TABLE cmp_thickness_measurement (
  meas_id text NOT NULL,
  site_no integer NOT NULL,
  pass_id text,
  wafer_id text,
  phase text,
  site_type text,
  x_mm double precision,
  y_mm double precision,
  thickness double precision,
  measured_ts timestamptz,
  metrology_tool_id text,
  PRIMARY KEY (meas_id, site_no)
);
COMMENT ON TABLE cmp_thickness_measurement IS 'CMP 전후 측정 지점별 두께. 전과 후는 다른 측정이라 phase로 나누고, 트렌치 산화막과 활성 질화막은 site_type으로 나눈다. 이유: 같은 지점의 전후 차이가 제거량이다. 연마 전 값은 앞 공정 증착 후 측정을 그대로 써도 된다.';
COMMENT ON COLUMN cmp_thickness_measurement.meas_id IS '측정 한 번. 다시 재면 새 meas_id';
COMMENT ON COLUMN cmp_thickness_measurement.pass_id IS 'cmp_run.pass_id와 같은 값';
COMMENT ON COLUMN cmp_thickness_measurement.phase IS 'pre | post';
COMMENT ON COLUMN cmp_thickness_measurement.site_type IS 'trench_oxide | active_nitride';
COMMENT ON COLUMN cmp_thickness_measurement.x_mm IS '[mm]';
COMMENT ON COLUMN cmp_thickness_measurement.y_mm IS '[mm]';
COMMENT ON COLUMN cmp_thickness_measurement.thickness IS '[Å]';
COMMENT ON COLUMN cmp_thickness_measurement.metrology_tool_id IS '계측 장비 ID';
