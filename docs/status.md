# 진행 상황 (V1 확장, 2026-11-12)

## 완료 범위

기존 CCP PECVD V1(2026-11-09)을 유지한 채 같은 Scene과 같은 presentation clock 위에 Remote ICP PECVD, Rotary STI CMP, OHT와 FOUP을 추가했다. 백엔드, 센서 데이터, 물리 모델은 여전히 없다. 아래 내용은 모두 이 환경(Ubuntu 22.04, i7-14700F, RTX 4070 SUPER, Chrome 148)에서 직접 실행해서 확인했다. macOS와 Safari는 확인하지 못했다.

| 요구 사항 | 상태 | 근거 |
| --- | --- | --- |
| 프론트엔드 단독으로 네 장비 유형과 상세 관찰이 뜸 | 완료 | e2e "loads the four equipment templates plus the FOUP", `npm run dev` |
| 기존 CCP의 ID, plasma, picking, cutaway, exploded, timeline 유지 | 완료 | 기존 e2e 9개가 WebGL2와 WebGPU에서 통과, 단위 테스트 "keeps the original CCP asset ids and channel ids", 캡처 `final-*/01`, `final-*/ccp/` |
| Remote의 upstream tube, coil, downstream precursor, wafer chamber 구분 | 완료 | 템플릿 assembly 분리, 단위 테스트 "differs from the CCP", 캡처 `final-*/03`, `04` |
| Remote 주 발광이 source에만 있고 CCP wafer-gap glow를 복제하지 않음 | 완료 | 단위 테스트 "puts the main glow inside the dielectric tube", e2e "remote source glow sits inside the discharge tube" |
| CMP polishing 중 frontside가 pad, backside가 head를 향하고 관통과 부유가 없음 | 완료 | 단위 테스트 "wafer faces the pad during polishing"(접촉면 일치), e2e "CMP: polishing contact", 캡처 `final-*/06` |
| Platen, head, conditioner 운동과 slurry 경로가 간섭하지 않음 | 완료 | config validation(nozzle이 head footprint 밖, conditioner가 pad 위), 단위 테스트 "conditioner disc stays on the pad" |
| STI 완료 단면에 trench oxide와 SiN이 남고 출처가 보임 | 완료 | 단위 테스트 "illustrative film", Process inset "Schematic · Exaggerated scale · Illustrative", 캡처 `final-*/09` |
| CMP optical path가 pad window와 움직이는 footprint에 맞음 | 완료 | 단위 테스트 "optical footprint is In view only when ...", 캡처 `final-*/08` |
| OHT가 같은 FOUP을 load port, gripper, load port로 연속 인계 | 완료 | e2e "the same FOUP entity moves ... without a pose jump"(경계 전후 위치 차 1 cm 미만, mesh 수 불변), 캡처 `final-*/10`, `11`, `12` |
| OHT가 bare wafer를 운반하지 않고 station, hoist, FOUP frame이 정렬 | 완료 | `npm run validate:config` station별 lateral 0.0 mm, hoist 1.088 m |
| Instrument body, Mount, Point, Channel, Data binding 구분 선택과 조회 | 완료 | Inspector Sensing 섹션, e2e "inspector separates instrument body ...", 캡처 `final-*/13` |
| 미연결 channel은 Data unbound, 가짜 observation 없음 | 완료 | 단위 테스트 "has no data source binding ...", /api와 ws 요청 0건 |
| Pause, Scrub, Restart가 pose, holder, slot, phase, film state를 함께 복원 | 완료 | 단위 테스트 "rewind restores slot occupancy ...", e2e "Route A: rewinding ..." |
| Visual 조작이 backend run, clock, measurement, command를 바꾸지 않음 | 완료 | backend 없음, 요청 0건 |
| 한 instance의 clipping, highlight, 삭제가 다른 instance에 영향 없음 | 완료 | e2e "two CMP instances ... independent", 기존 two-chambers e2e |
| Force WebGL2에서 핵심 장면과 동작 확인 | 완료 | `chrome-webgl2` 프로젝트 18개 통과, `final-webgl2/` 캡처 |
| Route A, B의 외부 입력 공정과 미검증 recipe 명시, CCP와 Remote 직렬 route 없음 | 완료 | 단위 테스트 "both routes are registered, independent alternatives", Inspector Scenario 섹션 |

## 검증 결과

| 항목 | 결과 |
| --- | --- |
| `npm run typecheck` | 통과 |
| `npm test` | 66개 통과 (기존 39 + 확장 27: registry와 계측 seed validation, Remote 구조, CMP joint 범위와 conditioner와 optical footprint와 film, OHT 도달성과 holder 유일성과 역방향 scrub, Route A와 B rewind와 determinism, fixture) |
| `npm run validate:config` | 5개 bundle 오류 0, 경고 0, station 3개 reach ok |
| `npm run test:e2e` | `chrome-webgl2` 18개 통과, `chrome-webgpu` 18개 통과 (기존 9개 + 확장 9개) |
| `npm run build` | 통과 (메인 청크 2.39 MB, gzip 625 kB) |
| 캡처 중 콘솔 오류 | 0 (WebGL2, WebGPU 모두) |

### 검토용 캡처

`qa/out/final-webgl2/`와 `qa/out/final-webgpu/`에 같은 뷰 목록(`qa/views/final.json`)으로 찍었다. 카메라 고정, 시각 시간 고정, seed 7, High, DPR 1.

- 01 CCP 기존 단면(회귀)
- 02 Bay overview: 네 장비와 rail, 주행 중인 OHT
- 03 Remote 종단면: source, transport, precursor ring, wafer
- 04 Remote source 근접: quartz tube, coil, glow
- 05 Remote 분해와 OES optical path marker
- 06 CMP head, wafer, pad 접촉 단면
- 07 CMP head membrane, retaining ring 분해
- 08 CMP optical window와 footprint(투시)
- 09 CMP clean, dry 구역과 STI inset(투시)
- 10 OHT pickup(gripper가 flange를 잡는 순간)
- 11 OHT 적재 주행
- 12 OHT destination seating과 해제
- 13 Inspector: gauge 본체와 chamber tap point가 다른 위치
- 14 Route A의 CMP polish 단계(연결 시연)

`ccp/` 하위에는 기존 `qa/screenshots.mjs` 10장을 두 backend로 다시 찍어 두었다. 단계별 중간 캡처는 `qa/out/m2`(Remote), `m3`(CMP), `m4`(OHT), `m5`(Route)에 있다.

검토하면서 찾아서 고친 문제:

- CMP 회전 부품의 sector cutaway가 부품과 함께 돌아 head가 잘리지 않던 문제(cutaway 중 자전 표시 고정)
- 계측 marker가 target asset 노드 기준으로 잘못 재배치되던 문제(frame joint가 다르면 joint 노드에 부착)
- 같은 point를 보는 두 channel이 link mesh 이름을 중복 생성하던 문제
- 적재 중 FOUP이 gripper에서 5.2 m 떨어진 곳에 놓이던 문제(carrierAttach 좌표를 rest pose instance 좌표로 통일)
- QA 카메라가 preset interpolation과 Follow-phase 포커스에 밀리던 문제
- Remote의 coil lead가 housing 밖까지 닿지 않던 config, coil과 glow 포트 매체 불일치, CMP dry status channel의 quantity 불일치(validation이 잡음)

### 성능

창 모드 Chrome, vsync 끔, 캔버스 1426×992, DPR 1, High. 네 장비가 모두 한 Scene에 있으므로 CCP 단독이던 이전 수치보다 낮다. RTX 4070 SUPER에서 잰 값이며 다른 하드웨어의 성능을 보증하지 않는다.

| 상태 | WebGL2 | WebGPU |
| --- | --- | --- |
| CCP 단면, plasma 켜짐(회귀) | 156 fps / 6.4 ms | 134 fps / 7.5 ms |
| CCP 단면 근접, plasma가 화면을 채움 | 174 fps / 5.8 ms | 148 fps / 6.8 ms |
| Bay overview(4 tools + rail), High | 117 fps / 8.6 ms | 96 fps / 10.5 ms |
| Remote source 단면(glow, afterglow, trace) | 116 fps / 8.6 ms | 92 fps / 10.8 ms |
| CMP 접촉 단면 | 310 fps / 3.2 ms | 249 fps / 4.0 ms |
| CMP 조립, platen 회전 재생 중 | 297 fps / 3.4 ms | 248 fps / 4.0 ms |
| OHT 적재 주행 재생 중 | 180 fps / 5.6 ms | 142 fps / 7.0 ms |
| Bay overview, Balanced | 115 fps / 8.7 ms | 95 fps / 10.6 ms |

vsync를 켜면 모든 상태에서 60 fps를 유지한다. 단면 전환 시 CMP는 15 ms 안팎, CCP는 50 ms 안팎이 걸리고 디바운스가 걸려 있다.

## 가정과 한계

- 모든 치수와 계측 배치는 가정값이다(`docs/equipment-assumptions.md`).
- 내부 로봇은 없고 EFEM, load lock, CMP alcove, wet transfer는 불투명 enclosure 안의 holder 전이로만 표현한다(simplified internal transfer).
- CMP wafer의 face-down 전환은 alcove 안에서, face-up 복귀는 wet transfer 안에서 일어난다고 가정한다.
- Remote의 source pressure tap, CCP viewport OES, OHT carrier ID reader, load port seating sensor는 설치 후보로만 두었다.
- 막 변화는 IllustrativeFilmState뿐이며 두께, 제거율, dishing, endpoint 수치를 만들지 않는다.
- OHT는 직선 rail 1개, vehicle 1대, station 3개다. 교통 제어, E84 신호, 충돌 safety controller는 없다.
- 단면은 방위각 sector 방식이며 임의 평면 단면은 없다.

## 미구현

- Simulation과 Replay 모드, 운영 backend, SECS/GEM, E84/E87/E90 구현, 다수 OHT, MES와 스케줄러.
- Plasma, CFD, 표면 반응, CMP 접촉과 제거 solver, 실제 sensor streaming, 차트, 수율과 결함 예측, ML.
- GLB 에셋 교체(모두 procedural), Blender 작업, 임의 평면 cutaway, 센서 drag-and-drop 편집기.

## 다음 우선순위

1. Operational backend 골격(FastAPI, 명령 accepted/applied/rejected, FSM)과 Simulation provider를 붙이되 PresentationState와 PreviewState를 섞지 않는다.
2. CMP와 Remote의 FilmState를 받는 DepositionModel, CMPModel adapter 경계에 집중 매개변수 모델을 연결하고 Route A, B의 film 전달을 모델 출력으로 바꾼다.
3. OHT와 load port 사이의 ScriptedCarrierHandoff를 handoff adapter로 분리하고 carrier seated, present 센서를 tool 측 Instrument로 등록한다. 임의 평면 cutaway와 GLB 교체는 그다음이다.
