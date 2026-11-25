# 장비 교체: Producer SE / Tactras / CELLESTA-i MD / CLW-08v2

2026-11-24, 브랜치 `equipment-migration`(기준 main `24bf229`). 기본 화면의 V1 장비(CCP PECVD, Remote ICP PECVD, STI CMP, OHT)를 네 장비로 교체했다. 모든 형상과 동작은 **대표 configuration**이며 OEM 인증 CAD, 장비 제어 모델, 검증된 공정·유체·플라스마 시뮬레이터가 아니다. 근거의 종류는 아래 "근거 구분"과 각 template의 `reference`, `facts`, assembly `reference`에 적었다.

## 1. 결정

| 주제 | 결정 | 이유 |
| --- | --- | --- |
| Tool / Module / Chamber | 장비 한 대 = `EquipmentInstance` 하나. Module과 chamber는 template 안의 scope가 붙은 component(`ComponentDef.scope`)와 `template.modules`로 표현한다. 공장 전체 id는 `${instanceId}.${moduleId}.${chamberId}`(예: `PRODUCER-01.MOD-01.CELL-A`) | load port station이 장비마다 하나(`LP.<instanceId>`), preview도 instance마다 하나라서 별도 instance로 나누면 station·wafer 표시가 갈라진다 |
| 좌표 원점 | 인스턴스 원점 = active chamber 축(Producer cell A, Tactras PM-01, CELLESTA PM-01). Active cell의 joint, wafer attachment, 센서 mount / target frame은 module 변환 없이 인스턴스 frame에 있다 | 회전한 module의 joint 축을 이중 변환할 위험을 없앤다. 회전·이동 배치는 idle / geometry-only module에만 쓰고, 그 module에는 joint와 센서가 없다 |
| Load port | 장비마다 active port 하나만 station id를 가진다. 나머지 port는 `idle_load_ports` component(station 없음) | 여러 port mesh를 같은 station id에 겹쳐 연결하지 않는다 |
| Vacuum transfer | 기존 station(EFEM SCARA, load lock, 2단 blade, slit valve)에 선택형 transfer chamber와 blade **shuttle** 관절을 더했다(`station.transfer_chamber`). 없으면 기존과 동일 | 검증된 인계 순서를 유지한다. Producer 중앙 vacuum robot, Tactras robot 형식은 재현하지 않았다(대표 설계로 기록) |
| 고정 하부 전극 | Tactras PM-01은 stage lift가 없다(`chamberKinematics(..., null, ...)`). 인계는 lift pin만 한다 | CCP-RIE 하부 전극은 RF / He / coolant feed가 붙은 고정 구조로 대표했다 |
| Wet clean | CELLESTA는 SCARA 계산과 EFEM / load port 부품만 공유하고, 공정 module과 순서는 새로 작성했다 | CMP의 wet robot -> brush cleaner -> dryer 동선을 복사하지 않는다 |
| OHT | `clw08v2_oht`는 기존 OHT 기구(rail path, hoist, gripper)와 `planTransfer`를 재사용하고 차체를 GLB로 바꿨다 | 같은 의미의 공통 기구 contract 재사용. 차체 외형과 정체성만 새 template |
| Legacy | 기존 4개 template, route A/B, 시나리오, 테스트는 `legacy-v1` fixture(환경 `fab-bay-v1`)에서만 쓰인다. 기본 화면과 기본 route에는 나오지 않는다 | 과거 seed / schema / history를 지우지 않는다 |

## 2. ID 대응표

새 id는 기존 id를 재사용하지 않는다. REMOTE-01 -> ETCH-01, CMP-01 -> CLEAN-01은 **UI 화면 교체 대응일 뿐 같은 물리 자산이 아니다**. 기존 센서·이력은 새 장비 데이터로 alias하지 않는다.

| 종류 | V1 (legacy-v1) | 현재 bay | 비고 |
| --- | --- | --- | --- |
| Instance (증착) | `PECVD-01.CH-A` | `PRODUCER-01` | Module `MOD-01`(twin), chamber `CELL-A`(active) / `CELL-B`(idle); `MOD-02`, `MOD-03` geometry only |
| Instance (원격 증착 / 식각) | `REMOTE-01` | `ETCH-01` | 다른 공정이다. PM `PM-01`(active, chamber `CH-01`), `PM-02`..`PM-05` geometry only |
| Instance (CMP / 세정) | `CMP-01` | `CLEAN-01` | 다른 공정이다. `PM-01`(active), `PM-02`..`PM-05` geometry only, `CHEM` cabinet |
| Instance (OHT / carrier / wafer) | `OHT-01`, `FOUP-01`, `W-01` | 같은 id 유지 | 의미가 같아서 identity 유지 |
| Template | `ccp_pecvd_single_wafer_300` 1.3.0 | `producer_se_ccp_twin_300` 1.0.0 | Geometry `producer-se-ccp-cell-1.0.0` |
| Template | `remote_pecvd_upstream_icp` 1.1.0 | `tactras_oxide_ccp_rie_300` 1.0.0 | Geometry `tactras-oxide-rie-1.0.0` |
| Template | `sti_cmp_rotary_single_platen` 1.1.0 | `cellesta_i_md_clean_300` 1.0.0 | Geometry `cellesta-i-md-clean-1.0.0` |
| Template | `oht_single_vehicle` 1.1.0 | `clw08v2_oht` 1.1.0 (1.0.0: 무지 차체) | Geometry `clw08v2-oht-1.0.0` |
| Family | `CCP_PECVD`, `REMOTE_PECVD`, `STI_CMP_ROTARY`, `OHT` | `PECVD_TWIN_CLUSTER`, `ETCH_CCP_RIE_CLUSTER`, `WET_CLEAN_SINGLE_WAFER`, `OHT` | `EquipmentRole`에 `etch`, `wet_clean` 추가 |
| Station | `LP.PECVD-01.CH-A`, `LP.REMOTE-01`, `LP.CMP-01` | `LP.PRODUCER-01`, `LP.ETCH-01`, `LP.CLEAN-01` | 모두 rail 선 x = -1.974 위 |
| Component (예) | `pedestal`, `stage`, `platen` ... | Producer cell A는 CCP id 유지(`pedestal` 등, nodeKey `mod01.cell_a.*`), cell B는 `cellb_*`; Tactras `esc_puck`, `focus_ring`, `lower_electrode_base`, `backside_he_line` ...; CELLESTA `spin_chuck`, `cup_guard`, `dispense_arm`, `supply_ipa` ... | nodeKey는 template마다 고정 |
| Joint (예) | `pedestal_z`, `stage_z`, `platen_spin` ... | Producer `pedestal_z`, `lift_pins_z`, `vac_shuttle`; Tactras `lift_pins_z`, `vac_shuttle`; CELLESTA `spin`, `cup_guard`, `dispense_arm`, `pm_shutter`, `tr_*`; CLW `travel`, `hoist`, `gripper_a/b` | |
| Channel prefix | `mp.*`, `remote.*`, `cmp.*`, `oht.*` | `producer.*`, `tactras.*`, `cellesta.*`, `clw.*` | 측정 id는 전역 유일, 기존 채널 alias 없음 |
| Recipe | `rcp.ccp.*`, `rcp.remote.*`, `rcp.cmp.*`, `rcp.oht.*` | `rcp.producer.pecvd_oxide_demo`, `rcp.external.lithography_demo`, `rcp.tactras.oxide_etch_demo`, `rcp.external.resist_strip_demo`, `rcp.cellesta.post_etch_clean_demo`, `rcp.clw.foup_transfer_demo` (모두 `demo-1`) | `Recipe.operation`에 `etch`, `wet_clean`, `external_lithography`, `external_resist_strip` 추가 |
| Route | `A`, `B` (`route-a/b-linked-v2`) | `RT-DEP-ETCH-CLEAN` rev `v1` (`route-dep-etch-clean-v1`) | `ProcessRouteDef`(versioned) |
| Scenario | `ccp-*`, `remote-*`, `sti-cmp-cycle-v2`, `oht-transfer-v1` | `producer-deposition-cycle-v1`, `tactras-etch-cycle-v1`, `cellesta-clean-cycle-v1`, `clw08v2-transfer-v1` | Standalone + route |

## 3. 재사용과 신규

재사용(공통 의미 유지): EFEM SCARA와 IK, load port / door opener, load lock, 2단 vacuum blade, slit valve, motionTrack의 접촉 시점 인계, 단일 wafer holder와 slot reservation / occupancy, Timeline / pause / reverse scrub / Restart / Follow, Exploded의 PreviewState snapshot, FOUP section과 25-slot map, ComponentTree / picking / Focus, 거리 LOD, OHT rail path / hoist / gripper / `planTransfer` / `ohtSequence`, CCP chamber 부품과 template(함수로 바꿈, `ccpChamberPieces`).

신규:
- **Producer:** whole-tool layout, transfer chamber와 shuttle, cell B(정적 copy, 자기 축 기준 sector), module 계층, 측정 seed, GLB 외장
- **Tactras:** oxide CCP-RIE chamber 전체(접지 상부 전극과 plenum, ESC, 냉각 base와 channel, focus ring, 절연 ring, ground shield, column, lift pin, He / coolant / RF feed, 배기, viewport와 OES mount), 식각 segment, ion 방향 효과, 측정 seed, GLB 외장
- **CELLESTA:** front end(4 port, LP 가로 위치 인자), pass station, transfer robot, PM-01(cup, 3단 guard, edge-support chuck, swing arm와 nozzle 3개, park, shutter, manifold, filter, drain 2, 배기, leak pan, recycle return), 이송 / 공정 순서, 효과, 측정 seed, GLB 외장
- **CLW-08v2:** template wrapper, 차체와 carrier bay end wall GLB, 측정 seed
- **공통:** 웨이퍼 상태 함수(`src/domain/waferState.ts`), 버전 관리 route(`src/equipment/routes/current.ts`), 추적성 계약, agent 계약, GLB adapter, 웨이퍼 표면 재질, 개념 단면 inset, 외부 공정 카드, bay 환경 v2, 실내 IBL

제거(새 active 모델에서): CMP platen / pad / carrier head / membrane zone / conditioner / slurry / STI clearing, Remote ICP coil / upstream tube / afterglow. 이 코드는 legacy template에만 남아 있고 새 route에서 호출되지 않는다(`tests/unit/currentBay.test.ts`가 확인).

## 4. Route와 웨이퍼 상태

`RT-DEP-ETCH-CLEAN` v1, 길이 308.5 s(presentation time).

1. `S10_PRODUCER_DEPOSITION`: FOUP(LP.PRODUCER-01) -> EFEM -> load lock -> shuttle -> cell A -> 증착 -> 복귀. 산화막(`target_oxide`)만 생긴다.
2. `S20_EXTERNAL_LITHOGRAPHY`: 장면 밖 공정. FOUP는 LP.PRODUCER-01에 닫힌 채 있고, 전환 카드가 뜨며, 이 단계 **끝**에서 photoresist mask가 생긴다.
3. `S30_OHT_LEG_1`: Producer -> Tactras. Leg를 따로 계획하고, park에서 출발한다.
4. `S40_TACTRAS_OXIDE_ETCH`: ESC clamp -> 식각 -> de-clamp. 노출 영역 산화막만 줄고, mask는 남고, 잔여물이 생긴다.
5. `S50_EXTERNAL_RESIST_STRIP`: 장면 밖, recipe-dependent. Photoresist만 제거하고, hard mask는 이 단계가 지우지 않는다.
6. `S60_OHT_LEG_2`: Tactras -> CELLESTA. Leg 1이 멈춘 위치에서 출발한다(`planTransfer(..., { startS })`).
7. `S70_CELLESTA_POST_ETCH_CLEAN`: dry in -> 세정 -> rinse -> IPA·분위기 제어 대표 건조 -> spin-down -> dry-confirmed -> dry out. 잔여물만 줄고 mask와 oxide는 그대로다.

**불변 조건(테스트로 확인):**
- holder는 하나뿐이다.
- 접촉 시점 인계가 연속이다.
- OHT는 닫힌 FOUP만 운반한다.
- wet wafer는 FOUP에 들어가지 않는다.
- 같은 t면 같은 결과가 나온다.
- OHT 이동 중에는 pattern이 생기지 않는다.
- clean은 etch 함수를 부르지 않는다.

**데이터와의 관계:** 팀의 합성 데이터셋 v2.0(`db/JAVAS`, git 미추적)은 네 장비 사이 wafer / carrier 연결을 `UNLINKED`로 둔다. 이 route의 연결은 시연용 정의이며 데이터에서 온 것이 아니다.

## 5. 근거 구분

**확인한 사실(공개 자료, 2026-11-24 접근):**
- **TEL Tactras 제품 페이지:** 직사각형 cluster, 300 mm, chamber 1-6, Dielectric / Conductor / RIE 용도.
- **TEL CELLESTA 제품 페이지:**
  - CELLESTA-i MD가 300 mm single wafer clean이다.
  - chamber atmosphere control과 IPA dispenser 성능 개선으로 pattern collapse-free drying을 한다.
  - chemical recycle 개념이 있다.
  - 건조 그림 설명으로 "IPA dry"와 "Surface modification dry"가 함께 나온다(SMD 약어 풀이를 이 모델에 쓰지 않았다).
- **Daifuku 페이지:** Cleanway model CLW-08v2. 경량화와 motor control 개선으로 주행 속도가 200 m/min에서 300 m/min으로 올랐다.
- **Applied Materials 2001 보고서(링크만 기록, 미열람):** Producer / Twin-Chamber / SE가 언급된다. Producer 제품 페이지는 접근 시 HTTP 403이라 확인하지 못했다.

**대표 설계(가정):**
- 모든 치수
- module 수와 배치, transfer 방식(linear shuttle)
- Tactras chamber 구성(single RF, ESC, He, focus ring)
- CELLESTA cup / guard / chuck / arm 구조와 공정 순서
- CLW 내부 기구(bogie, belt, gripper)
- 모든 timing과 속도

**확인하지 않은 것:**
- Producer SE 설치 장비의 옵션과 치수
- Producer cell 사이 shared pump / valve topology
- 각 장비의 실제 vacuum / atmospheric robot 형식
- Tactras RF 주파수와 dual-frequency 여부, bias
- CELLESTA MD의 module 수, SMD 기구, 약액 종류
- CLW-08v2 hoist와 낙하 방지 기구

**쓰지 않은 것:** 제조사 로고, 상표 그래픽, OEM 사진의 재배포(참고용 이미지는 저장소에 넣지 않았다).

## 6. Agent 연결 계약과 필요한 데이터

- `src/domain/agentContract.ts`: DetectionEvent(raised / cleared, severity, evidence), PredictionEvent(generatedAt, horizon, predicted interval, model / version, 제공될 때만 uncertainty), RcaEvent(subject wafer / lot / run, 후보 component / chamber 순위, supporting / contradicting evidence, `confirmedByProvider`).
- **Target scope:** tool / module / chamber / component를 구분한다. `resolveTarget`가 template asset으로 해석하고, scene hook `applyAgentEvent`가 강조와 Focus를 한다.
- **강조 우선순위:** 사용자 선택과 hover가 같은 mesh에서 우선한다.
- **해제 시점:** detection은 `cleared`가 오거나 사용자가 닫을 때까지 유지된다. prediction은 horizon 끝까지 유지되는데, 이 시연에는 공장 시계가 없어 닫을 때까지 유지된다. RCA는 닫을 때까지 유지된다.
- **추적성(`src/domain/traceability.ts`):** lotId, waferId, carrierId, slotId, routeId+revision, recipeId+revision, processRunId, stepId, tool / module / chamber, eventTime, presentationTimeSec. 시연에서는 provenance `demo`이고 processRunId와 eventTime은 `null`이다.
- **백엔드가 채워야 할 것:**
  1. 각 채널의 `ChannelSourceBinding`(provider, sourceKey, timeDomain, 단위 변환). 후보 매핑은 `docs/sensor-crosswalk.md`에 있다.
  2. 실제 run / step id와 eventTime(MES나 장비 로그).
  3. wafer-carrier-slot 이력(합성 데이터셋에는 없다).
  4. 장비 이상 이벤트와 evidence window.
  5. 예측의 model / version과 그 uncertainty 정의.

  프런트엔드는 confidence, RUL, 불량 확률을 계산하지 않고, 장비 이상을 웨이퍼 불량의 원인으로 확정하지 않는다.

## 7. 검증

결과와 실행 환경은 `docs/status.md`의 "장비 교체" 절에 있다.
