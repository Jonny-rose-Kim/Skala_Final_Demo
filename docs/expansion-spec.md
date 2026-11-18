# 확장 구현 명세 (CCP 보존 + Remote ICP PECVD, Rotary STI CMP, OHT)

2026-11-12 기준으로 저장소에 실제로 들어간 내용을 정리한 문서다. 원래 CCP V1은 그대로 두고, 같은 Scene과 같은 presentation clock 위에 세 장비와 FOUP carrier를 추가했다.

2026-11-16에 상세 장비 모델 작업이 이어졌다. 불투명 transfer enclosure 대신 EFEM robot, load lock, 진공 blade(CCP, Remote)와 dry robot, flip station, overhead wet robot, cleaner, spin dryer(CMP)가 실제로 wafer를 옮긴다. 바뀐 내용은 `docs/equipment-assumptions.md`, `docs/scenarios.md`, `docs/status.md`에 있고, 이 문서의 시나리오 ID와 테스트 개수는 11-12 당시 값이다.

## 범위

- CCP PECVD (`PECVD-01.CH-A`): 기존 asset ID, plasma, 선택, 단면, 투시, 분해, 타임라인 유지. 반송 연결용 tool shell(load lock, EFEM, load port)만 추가했다.
- Remote ICP PECVD (`REMOTE-01`, template `remote_pecvd_upstream_icp`): upstream dielectric discharge tube, 외부 induction coil, source housing, transport section, downstream precursor injection ring, heated stage, chamber.
- Rotary STI CMP (`CMP-01`, template `sti_cmp_rotary_single_platen`): platen과 pad, carrier head(membrane 3 zone, retaining ring), conditioner, slurry 공급, window-in-pad optical endpoint, wet enclosure, dry loading alcove, clean과 dry module.
- OHT (`OHT-01`, template `oht_single_vehicle`): 천장 rail, vehicle 1대, belt hoist, gripper. FOUP(`FOUP-01`, template `foup_carrier_300`)는 별도 mobile entity다.
- 시나리오: 장비별 단독 시연 4개와 연결 시연 Route A(CCP), Route B(Remote).

구현하지 않은 것은 `docs/status.md`에 모아 두었다. 백엔드, 실측 데이터, 물리 solver, 다수 OHT 교통 제어, E84 구현은 없다.

## 코드 배치

| 경로 | 역할 |
| --- | --- |
| `src/domain/types.ts` | 템플릿, 부품, joint, 포트, station interface 타입 |
| `src/domain/measurement.ts` | Instrument, Installation, MeasurementPoint, Channel, ChannelPointBinding, ChannelSourceBinding, Calibration, Observation 계약과 validation |
| `src/domain/registry.ts` | 템플릿 bundle 레지스트리와 generic validation |
| `src/domain/materialFlow.ts` | FOUP, slot, wafer, incoming STI stack, recipe, route 정의 |
| `src/presentation/preview.ts` | PreviewState(scripted pose, holder, IllustrativeFilmState) |
| `src/presentation/scenario.ts`, `scenarioRegistry.ts` | phase table과 scenario 등록 |
| `src/scene/equipmentInstance.ts` | 템플릿 공통 scene instance(joint 노드, 축 오프셋 sector cutaway, stretch part) |
| `src/scene/measurementOverlay.ts` | 센서 본체, 측정 위치, 경로 marker |
| `src/scene/sceneHost.ts` | 한 Scene에 모든 instance, 시나리오 평가, carrier 배치 |
| `src/equipment/ccp` | 기존 CCP를 bundle로 감싼 adapter와 계측 호환 seed |
| `src/equipment/remote` | layout, template, parts, measurement, effects, scenario |
| `src/equipment/cmp` | 위와 동일 구성 |
| `src/equipment/oht`, `src/equipment/foup` | rail과 vehicle, carrier |
| `src/equipment/routes` | Route A, B 연결 시나리오 |
| `src/geometry/sharedParts.ts` | 새 템플릿이 공유하는 파라미터식 형상 생성기 |
| `config/geometry/*.json` | 장비별 치수(유일한 치수 원천) |
| `config/equipment/instances.json` | Bay 배치와 fixture |

CCP 생성기(`src/geometry/chamberParts.ts`)는 station 부품 추가 외에는 바꾸지 않았다.

## 공통 구조

Containment는 template assembly와 parentAssetId로, Connection은 포트와 ConnectionDef로, Layout은 instance position과 joint origin으로, Route는 `materialFlow.ts`로, SceneBinding은 mesh metadata(instanceId, assetId)로 따로 관리한다. Picking은 metadata만 읽는다.

Joint는 템플릿에 선언하고(`JointDef`), 값은 PreviewState가 준다. 부품은 rest pose의 instance 좌표로 만들고 scene instance가 joint 원점으로 옮긴다. 회전 부품의 sector cutaway는 각 부품의 축(`axisXZ`) 기준으로 같은 방위를 제거하며, cutaway 중에는 자전 표시를 0으로 고정한다(sector가 부품과 함께 돌지 않도록). Exploded는 display offset이며 joint 값을 고정한다.

Station interface(`template.station`)는 load port seat frame, door 방향, EFEM enclosure, wafer 표시 asset을 정의한다(11-12 당시에는 불투명 transfer enclosure였다). Scene host는 instance pose로 station world frame을 만들고 OHT 시나리오와 FOUP 배치가 이를 쓴다.

## 계측 데이터 계약

`src/domain/measurement.ts`의 객체를 템플릿마다 seed로 채운다(`src/equipment/*/measurement.ts`). `validateMeasurementSeed`가 ID 중복, 없는 component나 joint, quantity와 unit 불일치, pressure reference 누락, gas flow 기준 조건 누락, 한 channel의 복수 primary binding, 물리 channel의 instrument 누락, derived channel의 lineage 누락을 잡는다. `npm run validate:config`와 단위 테스트가 모든 bundle에 대해 실행한다.

V1에는 ChannelSourceBinding이 하나도 없다. Inspector는 Mount, Point linked, Data unbound를 따로 보여주고 값은 `—`로 둔다. Candidate point(Remote source pressure tap, CCP viewport OES, OHT ID reader, station seating)는 설치 후보 / Not installed로 표시한다.

## 시각 효과

- CCP: 기존 plasma shader 그대로.
- Remote: 같은 ray-march shader를 tube 내부 bounds로 한 번, transport section afterglow로 한 번 더 쓴다. source gas와 precursor 경로는 schematic overlay다.
- CMP: slurry stream과 pad 위 film, optical path와 footprint overlay. footprint는 platen 각도와 head 위치로 계산한 window 위치가 wafer 아래에 있을 때만 보인다.
- OHT: belt는 mesh를 다시 만들지 않고 hoist 값으로 scale만 바꾼다. rail frame overlay는 station seating 영역과 접근점을 그린다.

어느 효과도 농도, 에너지, 유량, 두께를 뜻하지 않는다.

## 검증

- `npm run typecheck`, `npm test`(단위 66개), `npm run validate:config`(5 bundle + bay reach 검사), `npm run test:e2e`(WebGL2와 WebGPU, 기존 9개 + 확장 9개).
- 실제 화면 캡처는 `qa/shoot.mjs`로 `qa/views/*.json`을 찍어 `qa/out/m2` ~ `qa/out/m5`에 두었다. 자세한 결과는 `docs/status.md`.
