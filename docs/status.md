# 진행 상황 (상세 장비 모델, 2026-11-16)

## 이번 작업 범위

네 장비를 외장, 내부, wafer handling robot, 센서 mount까지 같은 구조로 다시 만들었다. 기존 instanceId와 templateId, asset id, channel id는 그대로다. Route A(CCP)와 Route B(Remote)는 계속 서로 대안이다. 새 치수는 모두 generic design assumption이며 OEM CAD나 공정 조건이 아니다. 아래 내용은 Ubuntu 22.04, i7-14700F, RTX 4070 SUPER, Chrome 148에서 직접 실행해서 확인했다. macOS와 Safari는 확인하지 못했다.

| 장비 | 상태 | 내용 |
| --- | --- | --- |
| CCP PECVD | 완료 | Load port(dock plate, door opener), EFEM과 대기 SCARA robot, load lock(support pin, 대기 door, 2단 진공 blade), slit valve, process enclosure(HMI, 점검 panel, 관찰창, facility plate). Pedestal transfer 위치와 lift pin stroke 조정. Handling 시나리오 `ccp-handling-cycle-v1` |
| Remote ICP PECVD | 완료 | CCP와 같은 station 모듈. Stage lift와 lift pin 추가. Source housing cover를 떼면 coil과 tube가 보임. Handling 시나리오 `remote-handling-cycle-v1` |
| STI CMP | 완료 | Dry EFEM과 dry robot, transfer tower(spin dryer, flip station), overhead wet robot(edge grip, roll), load cup edge pin, brush cleaner, end-effector rinse station, wet deck과 drip tray. 시나리오 `sti-cmp-cycle-v2` |
| OHT, FOUP | 완료 | Gripper finger 축 방향 수정. Rail 이음판, end stop, 급전선, hanger turnbuckle, bogie 바퀴와 guide roller, 구동 motor, pickup, body cover와 bumper와 lamp, hoist pulley, gripper 기구 |
| Bay 배경 | 완료 | 바닥 타일, 통로 표시, 천장 grid와 FFU와 조명, 벽, 후면 utility와 장비별 drop. 천장과 벽 자동 숨김 |
| Route A, B | 완료 | `route-a-linked-v2`, `route-b-linked-v2`. 증착 장비 station handling, OHT, CMP 전체 흐름을 한 clock으로 |

## FOUP 단면 보기 (추가 작업)

FOUP 안에 웨이퍼가 몇 장 들었는지 볼 수 있게 FOUP 단면 보기를 넣었다.

- 위쪽 FOUP section 버튼으로 켠다. FOUP만 seat 축을 지나는 평면으로 뒤쪽 절반이 잘리고, 선택한 장비와 보기 모드는 그대로다. OHT에 매달려 이동하는 동안에도 단면이 FOUP을 따라간다.
- 켜져 있는 동안 뷰포트 왼쪽 위에 웨이퍼 수(예: 웨이퍼 1장 / 25 slot), 25칸 slot map, 점유된 slot의 wafer ID가 나온다. 웨이퍼가 장비 안에 있으면 지금 holder와 돌아올 slot을 적는다.
- 그 상자의 FOUP 보기 버튼은 선택한 장비를 바꾸지 않고 카메라만 잘린 쪽(뒤쪽)으로 옮긴다.
- FOUP을 선택한 장비로 고르면 Cutaway와 X-ray가 FOUP에 적용된다. X-ray에서는 shell과 door만 투명해지고 slot rib은 불투명하게 남는다.
- FOUP 안의 웨이퍼는 slot마다 하나씩 만들어 두고 carrier slot map에서 점유된 slot만 켠다. 이전에는 slot-13 웨이퍼 하나만 있었고, OHT 단독 시연에서는 slot에 있는 웨이퍼를 FOUP이 표시하지 않았다(지금은 표시한다).
- 지금 시연의 lot은 W-01 한 장이라 FOUP에는 한 장 또는 0장이 보인다. Slot map은 scripted 상태이며 load port mapping sensor 값이 아니다.

구현: 상자 형상 부품을 sector 평면으로 자르는 `clipToSector`와 잘린 상자의 단면 cap을 만드는 `boxSectionCaps`(`src/geometry/meshlib/sectorClip.ts`), `PartSink.clipped`, part의 `presenceKey`와 `EquipmentInstance.setPresentKeys`, 장비별 cut을 고르는 `SceneHost.cutFor`. FOUP template은 1.2.0이다.

## 오른쪽 패널과 Process inset 제거 (추가 작업)

화면을 단순하게 하려고 오른쪽 패널(Component inspector와 Visual controls)과 뷰포트 오른쪽 아래의 Process inset을 뺐다. 3D 화면이 오른쪽 끝까지 넓어졌다.

- 함께 없어진 것: 부품 상세 정보(역할, 재질, 치수, 연결, 계측기와 측정 위치, scripted joint 값), Isolate 버튼(숨기기는 component tree의 눈 아이콘으로 계속 된다), plasma와 source glow 설정, Cutaway 각도, X-ray 불투명도, 분해 정도, cover 모드 선택, Fab environment와 overlay 토글, STI 단면 그림. 위쪽 바의 Inspector 열기/닫기 버튼도 뺐다.
- 남은 설정은 기본값으로 동작한다. Cover는 Auto(선택한 장비만 cover를 뗌)이고, 환경은 켜져 있으며 천장과 벽은 카메라 위치에 따라 숨는다. Overlay는 Remote의 source와 precursor 경로와 afterglow, CMP의 slurry와 optical path가 켜져 있고 나머지는 꺼져 있다. Cutaway 각도는 장비 기본값이나 카메라 preset 값을 쓴다.
- 부품을 고르면 3D 하이라이트와 component tree 선택은 그대로 되고, 위쪽 Focus 버튼도 그대로 쓴다.
- FOUP 보기 버튼은 FOUP 단면을 켰을 때 왼쪽 위에 나오는 상자로 옮겼다.
- 시각 설정, cutaway, cover, overlay, 환경 상태는 scene과 QA 스크립트가 쓰므로 store에 남겼다. 쓸 곳이 없어진 `panels.inspector`와 `overlays.filmInset`만 지웠다. 웨이퍼 막 상태(`IllustrativeFilmState`)는 PreviewState에 그대로 있다.
- 지운 파일: `src/app/panels/Inspector.tsx`, `VisualControls.tsx`, `ProcessInset.tsx`, `holderLabels.ts`. 계측 계약(본체, 측정 위치, 채널 분리와 모든 channel unbound)은 단위 테스트가 계속 확인한다.

## Component tree 폭 조절과 접기 (추가 작업)

왼쪽 component tree의 폭을 바꾸고, 쓰지 않을 때는 화면 왼쪽 가장자리로 접어 둘 수 있게 했다.

- Tree 오른쪽 경계선을 끌면 폭이 160 px에서 창 폭의 절반(최대 560 px) 사이로 바뀐다. 기본 폭은 이전과 같은 234 px이라 기본 화면과 QA 캡처는 그대로다.
- 160 px에서 더 끌면 폭이 그대로 멈춰 있다가, 96 px보다 왼쪽까지 끌면 tree가 16 px 폭의 세로 줄로 접힌다. 줄에는 Component tree라고 세로로 적혀 있다.
- 접힌 줄을 누르면 접기 전의 폭으로 펼쳐지고, 줄을 오른쪽으로 끌면 끈 만큼의 폭으로 펼쳐진다. 경계선을 더블클릭하면 기본 폭으로 돌아간다.
- Tree 제목 옆의 접기 버튼과 위쪽 바의 tree 버튼도 같은 줄로 접고 편다. 전에는 위쪽 바 버튼이 tree를 아예 없앴다.
- 키보드로는 경계선에 focus를 두고 왼쪽, 오른쪽 화살표로 16 px씩 바꾸고 Enter로 접고 편다.
- 접혀 있는 동안에도 tree는 화면 뒤에 남아 있어서 검색어와 접어 둔 assembly가 그대로다. 폭은 저장하지 않아서 새로고침하면 기본 폭이다.
- 3D 캔버스는 기존 ResizeObserver로 폭이 바뀔 때마다 다시 맞춰진다. 다만 폭이 바뀌는 프레임마다 빈 프레임이 하나씩 화면에 나가서 끄는 동안 깜빡인다(아래 남은 문제). 좁은 폭에서 잘린 부품 이름은 마우스를 올리면 전체 이름과 설명이 나온다.
- 구현: `src/app/panels/TreeDock.tsx`와 store의 `setPanel`.

## 코드 리뷰 반영 (추가 작업)

리뷰에서 나온 부품 충돌과 상태 오류를 고쳤다. 확인은 NullEngine에 실제 bundle을 올리고 모든 시나리오를 0.2 s(route는 0.4 s) 간격으로 돌리며 움직이는 부품의 삼각형 교차를 세는 방식으로 했다. 리뷰가 지적한 교차는 모두 없어졌고, 새로 생긴 교차는 flip 축이 actuator와 bearing에 끼워진 부분뿐이다.

- Load port: door opener rail을 opening 가운데 뒤쪽에서 opening 양옆 바깥으로 옮겼다. 대기 robot과 CMP dry robot이 그 rail을 지나가고 있었다. Frame plate를 EFEM 앞벽과 같은 면으로 맞춰서 dock한 FOUP 테두리가 plate 안에 10 mm 들어가던 것도 고쳤다.
- HMI 화면을 load port deck 폭 바깥으로 옮겼다. OHT가 FOUP을 올리고 내릴 때 FOUP 옆면이 화면을 지나갔다.
- Slit valve: gate를 load lock 쪽으로 옮기고 bonnet과 actuator를 chamber 바닥 flange 바깥에 두었다. Bonnet, gate rod, Remote의 열린 gate가 flange 안으로 들어가 있었다. Limit switch 케이블이 process enclosure 판을 지나던 것도 옆으로 돌렸다.
- 벽과 liner를 만드는 `portedShell`이 넓은 port 위아래 띠를 직선 하나로 그려서, slit 아래 벽이 Remote에서 9 cm, CCP에서 7 cm 안쪽에 있었다. 원호를 따라 그리게 고쳤다. Remote stage, edge ring, heater가 transfer 높이에서 벽을 뚫던 문제가 이것이었다.
- Remote liner를 바닥 1 mm 위부터 시작하게 내리고 배기 port에도 liner 구멍을 냈다. 전에는 liner 바닥이 slit 바닥과 같아서 slit 구멍이 빠졌고 blade와 wafer가 liner를 지나갔다. Port와 liner 높이 관계를 config validation에 넣었다.
- Lift hoop를 뺐다. Pin과 함께 움직이면 stroke 끝에서 pedestal 속으로 들어가고, 내린 pedestal 아래에는 들어갈 높이가 없다.
- Bellows처럼 늘어나는 부품의 단면 cap이 40 mm 위에 그려지고 늘어나지 않았다. 이제 cap도 같은 기준점과 배율을 쓴다.
- OHT finger: open, closed 간격을 lip 사이 간격으로 보고 다리를 그만큼 바깥에 두었다. Finger 높이를 70 mm에서 38 mm로 줄여 lip이 flange 바로 아래에 오고, 잡은 FOUP의 flange 윗면이 presence sensor에 닿는다. 전에는 닫힌 finger가 flange 안으로 10 mm 들어가고 lip이 FOUP 윗면 속에 있었다.
- CMP flip station: wafer와 두 robot fork를 가로지르던 rotor bar를 없앴다. Jaw는 guide rod를 따라 움직이고, jaw 바깥쪽 end block이 +Z actuator와 -Z bearing에 축으로 물린다. 열린 jaw가 actuator 안에 1 cm 들어가 있던 것도 같이 없어졌다.
- CMP dry robot: 대기하거나 돌 때 wafer 중심을 축 앞에 두고(FOUP 쪽 105 mm, tower 쪽 85 mm), FOUP와 tower 사이는 link 1이 EFEM 앞쪽으로 지나가는 방향으로 돈다. 전에는 대기 자세의 손목과 fork가 dryer 하우징 안에 있었고, 돌 때마다 link 1이 tower를 지나갔다.
- Wet robot이 rinse box에 fork를 넣는 깊이를 fork 끝이 뒷벽 10 mm 앞에 올 때까지로 줄였다. 전에는 뒷벽 밖으로 65 mm 나갔다. Spin dryer bowl 가장자리를 wafer보다 10 mm 바깥으로 넓히고, cleaner rinse spray 표시를 brush 옆으로 옮겼다.
- 시나리오: CMP와 OHT 단독 시연에서 시연에 나오지 않는 장비가 joint 0 자세 대신 대기 자세로 서 있다. Route A, B는 OHT 구간에 들어가도 증착 장비의 stage가 transfer 높이에 남는다(전에는 CCP 80 mm, Remote 55 mm가 한 프레임에 튀었다). 반복 재생할 때의 첫 자세와도 같다.
- 분해 보기에서 시나리오를 바꾸면 고정해 둔 자세를 새 시나리오에서 다시 잡는다.
- 같은 순간에 장비와 시나리오(또는 cutaway)를 함께 바꾸면, 뒤늦게 실행되는 장비 기본값이 직접 고른 값을 덮어쓰지 않는다. E2E의 자원 누적 테스트가 Route A를 실행하지 못했고 QA 캡처 f07의 cutaway가 기본값으로 바뀌던 원인이다.
- OHT 세부 부품의 거리 LOD를 rail 가운데뿐 아니라 vehicle 위치에서도 재고, 4.5 m 안에서 켜고 5 m 밖에서 끈다. 전에는 vehicle 바로 앞에서도 꺼져서 클릭이 안 됐다.
- CMP nodeKey 6개를 원래 이름으로 되돌렸다(`post.dry`, `post.dry.chuck`, `post.dry.wafer`, `post.clean`, `post.clean.brushes`, `post.clean.wafer`).
- QA: `qa/views/final.json`, `routes.json`, `routes2.json`의 v1 시나리오 id를 v2로 바꾸고 같은 단계의 시각으로 옮겼다. `qa/shoot.mjs`는 장비를 먼저 바꾼 뒤 시나리오와 cutaway를 적용하고, 없는 시나리오를 요청하면 멈춘다.
- FOUP 단면 상자의 slot map과 안내 문구에 마우스를 올리면 툴팁이 나온다. 천장 grid가 bay 끝에서 0.4 m씩 비던 자리를 잘린 panel로 채웠다.
- Config validation 보강: load lock과 slit valve body, transfer tower와 cleaner, rinse station과 cleaner가 겹치지 않는지, wet robot 손목이 alcove 밖에 있는지(식의 부호가 반대였다), dry robot 회전 자세, slit valve bonnet 공간, door opener 구역.
- 매 프레임 모든 joint transform을 다시 쓰던 것을 값이 바뀐 joint만 쓰게 했고, route는 CMP 상태를 프레임마다 한 번만 계산한다. CMP의 FOUP door와 gate 판단은 station 공용 함수를 쓴다.
- DB 스키마: run_id가 비어 있을 수 있는 trace 테이블 5개(`ccp_rf_trace`, `ccp_chamber_trace`, `remote_source_trace`, `remote_chamber_trace`, `cmp_polish_trace`)의 run_id에 run 테이블 외래 키를 더했다. 전에는 step_no가 비어 있으면 없는 run을 가리키는 행이 들어갔다. Run이 없는 시간의 행(run_id NULL)은 그대로 받는다. `docs/diagrams/db-*.png`는 다시 그리지 않았다.

## 검증 결과

| 항목 | 결과 |
| --- | --- |
| `npm run typecheck` | 통과 |
| `npm test` | 106개 통과 (8 파일). 상세 장비 작업에서 추가한 `tests/unit/handling.test.ts` 21개, `tests/unit/cmpHandling.test.ts` 13개, FOUP 단면에서 추가한 `tests/unit/foupSection.test.ts` 7개 포함 |
| `npm run validate:config` | 5개 bundle 오류 0, 경고 0. Station 3개 모두 lateral 0.0 mm, hoist extension 1.081 m (finger가 presence sensor 아래에서 FOUP을 잡게 바꾸면서 12 mm 줄었다) |
| `npm run test:e2e` | main에 옮긴 뒤 다시 돌리지 않았다. 리뷰 반영은 중간 발표 브랜치에서 먼저 했고, 거기서 실패한 9개 테스트(backend마다, `expansion.spec.ts` 4개, `visual-inspection.spec.ts` 5개)는 Route B 자동 재생과 타임라인을 뺀 발표 화면 때문이었다. main에는 그 화면이 없다. 나머지는 모두 통과했고, 자원 누적 테스트는 이제 Route A가 실제로 실행되는지도 확인한다 |
| `npm run build` | 통과 (메인 청크 2.54 MB, gzip 671 kB) |
| 캡처 중 콘솔 오류 | 0 (WebGL2, WebGPU 모두) |

새 테스트가 확인하는 것:

- Clearance와 reach: load lock 안의 wafer, blade, pin, gate 여유, robot reach와 swing, wrist가 station housing 밖에 있는지, fork가 load cup pin 사이와 alcove opening을 지나는지(config validation).
- Joint: joint 그래프에 모르는 부모나 순환이 없고 축이 단위 벡터인지, 모든 joint 값이 선언한 범위 안인지, 한 component의 part가 모두 같은 joint를 따르는지.
- 닫힌 문 통과 금지: FOUP door, load lock door, slit valve, dryer shutter 두 개, cleaner shutter를 궤적 전체에서 검사.
- Interlock: 대기 door와 slit valve 동시 열림 없음, dryer shutter 하나씩, brush가 닿아 있는 동안 cleaner shutter 닫힘.
- 인계 연속성: 모든 holder 전환에서 두 holder 기준 wafer 위치 차 1e-6 m 미만, ±5 ms 사이 2 mm 미만(단위). 렌더된 wafer mesh 중심 위치 차 4 mm 미만, 항상 mesh 하나(e2e).
- Holder와 slot: wafer를 표시하는 asset은 언제나 하나, slot-13은 holder가 slot일 때만 점유.
- 젖은 wafer: FOUP, dry robot, flip station에는 dry wafer만. 끝에서 dry로 slot-13에 돌아옴. Flip과 roll은 clamp한 상태에서만.
- 면 방향: FOUP, dry robot, cleaner, dryer에서 face up, load cup과 head에서 face down. Flip과 roll 중에는 joint 자세와 같은 방향.
- 역방향 scrub, 회전한 instance(two-chambers)의 station frame, cover 모드가 door 상태를 바꾸지 않는지, exploded 보기의 snapshot과 복원, robot link tree 선택.
- FOUP 단면: 상자 부품을 자른 결과가 남기는 면적(평판의 1/4, 3/4)과 winding, 단면 cap의 위치와 방향, FOUP 모든 part가 조립과 단면 상태에서 유효한지, 기본 단면에서 뒤쪽 절반에 남는 vertex가 없는지, slot마다 웨이퍼가 하나씩 rib 위에 있는지, slot map 점유와 FOUP 웨이퍼 표시가 같은지(OHT, CCP handling, CMP 시나리오 전체를 0.5 s 간격으로 검사). E2E에서는 FOUP만 잘리고 다른 장비는 그대로인지, 개수 표시와 slot map, 웨이퍼가 장비 안에 있을 때 0장, OHT 이동 중 단면 유지, FOUP을 선택했을 때 Cutaway 설정 우선, FOUP 보기 카메라.
- 화면 구성: 오른쪽 패널과 Process inset이 다시 생기지 않았는지(e2e 첫 테스트).
- Component tree 폭: 경계선 드래그, 최소 폭에서 멈춤, 왼쪽 줄로 접기와 펼치기(줄 클릭, 줄 드래그, 접기 버튼, 위쪽 바 버튼, 키보드), 접었다 펴도 검색어가 남는지, 3D 캔버스와 drawing buffer가 폭을 따라가는지, 좁은 폭에서 tree 선택.

## 검토용 캡처

`qa/out/detail-webgl2/`와 `qa/out/detail-webgpu/`에 같은 뷰 목록(`qa/views/detail.json`)으로 찍었다. 시각 시간 고정, seed 7, High, DPR 1. 두 backend의 차이는 채널당 평균 1/255 미만이다.

| 파일 | 내용 |
| --- | --- |
| d01_bay_overview | Bay 전체(Route A의 OHT 주행 중), 바닥과 벽 |
| d02_bay_aisle | 통로에서 본 bay, 천장 FFU와 조명, rail |
| d03_ccp_exterior | CCP 외장(cover 닫힘), load port와 FOUP |
| d04_ccp_robot_pick_foup | 대기 robot이 FOUP slot-13에서 wafer를 드는 순간 |
| d05_ccp_robot_place_ll | Load lock support pin에 wafer를 놓는 순간 |
| d06_ccp_blade_slit | 진공 blade가 slit valve를 지나 chamber로 들어간 상태(단면) |
| d07_ccp_pins_stage | Lift pin이 blade에서 wafer를 받는 순간(단면) |
| d08_remote_source_open | Remote source housing cover 제거, coil과 tube, glow |
| d09_remote_station | Remote station의 robot과 load lock |
| d10_cmp_exterior | CMP 외장(cover 닫힘) |
| d11_cmp_dry_robot_flip | Dry robot이 flip station jaw에 wafer를 넘기는 순간 |
| d12_cmp_flip_turn | Flip station이 clamp한 채 회전하는 중 |
| d13_cmp_wet_robot_cup | Wet robot이 alcove 옆 opening으로 load cup에 놓는 순간 |
| d14_cmp_polish_contact | Head, wafer, pad 접촉 단면 |
| d15_cmp_wet_roll | Wet robot이 robot 축 아래에서 clamp한 채 뒤집는 중 |
| d16_cmp_cleaner | Cleaner edge roller가 wafer를 잡는 순간(위에서) |
| d17_cmp_dryer_in | Wet robot이 wet side로 spin chuck에 놓는 순간 |
| d18_cmp_dry_robot_out | Dry robot이 dry side로 꺼내는 순간 |
| d19_oht_engage | OHT gripper가 FOUP flange를 잡는 순간 |
| d20_oht_vehicle | Vehicle, bogie, 구동 motor, 급전선, hanger |
| d21_robot_link_selected | 대기 robot link 1 선택(3D 하이라이트와 component tree) |

단계별 확인 캡처는 scratchpad에서 찍은 뒤 고친 결과만 위에 남겼다.

FOUP 단면 캡처는 `qa/out/foup-webgl2/`와 `qa/out/foup-webgpu/`에 있다(`qa/views/foup.json`). 두 backend의 차이는 채널당 평균 0.6/255 미만이고 콘솔 오류는 0이다.

| 파일 | 내용 |
| --- | --- |
| f01_lp_closed | CCP load port의 닫힌 FOUP(비교용) |
| f02_lp_section_one_wafer | FOUP 단면, slot 13의 W-01 한 장, 왼쪽 위 개수 표시 |
| f03_lp_section_close | 단면 근접, slot rib 25쌍과 웨이퍼 |
| f04_lp_section_pick | Door가 열리고 대기 robot fork가 slot 13 아래로 들어온 순간 |
| f05_lp_section_empty | 웨이퍼가 chamber에 있는 동안 빈 FOUP |
| f06_oht_section | OHT에 매달려 이동하는 FOUP의 단면 |
| f07_active_cutaway_quarter | FOUP을 선택하고 Cutaway를 90° sector로 바꾼 상태 |
| f08_active_xray | FOUP X-ray, rib은 불투명 |
| f09_overview_section | Bay overview에서 단면을 켠 상태 |
| f10_ui_empty, f11_ui_one_wafer | 전체 화면(위쪽 FOUP section 버튼, 왼쪽 위 개수 상자와 FOUP 보기 버튼). f10은 웨이퍼가 chamber에 있어 0장 |

검토하면서 찾아서 고친 문제:

- 처음 만든 바닥형 wet robot은 wrist drop post가 회전 자세에서 자기 Z column을 지나갔다. Overhead mount로 바꿔 robot 축 아래를 비웠다.
- OHT gripper finger가 닫힐 때 바깥으로 움직였다(축 부호 반대).
- CMP cleaner shutter가 brush와 같은 단계에서 닫혀 brush가 닿는 동안 잠깐 열려 있었다. 단계를 나눴다.
- Wet robot 회전 방향을 단계마다 가까운 쪽으로 고르면서 shoulder joint가 ±2π 범위를 넘던 문제.
- Two-chambers fixture에서 두 chamber의 뒤쪽이 0.34 m 겹쳤다(front end가 길어짐). 간격을 넓혔다.
- 플라즈마가 없는 장면에서도 opaque depth pass가 장면 전체를 그렸다. Glow가 보일 때만, 그리고 그 장비와 카메라 사이의 mesh만 그리게 했다.

## 성능

`node qa/perf.mjs webgl2|webgpu`. 창 모드 Chrome, vsync 끔, 캔버스 1426×992, DPR 1, High. RTX 4070 SUPER에서 잰 값이며 MacBook 같은 내장 GPU 성능을 보증하지 않는다. Draw call은 shadow, SSAO, plasma depth pass를 포함한 수다.

| 상태 | WebGL2 | WebGPU | Draw call | 삼각형 |
| --- | --- | --- | --- | --- |
| CCP 단면, plasma 켜짐(회귀) | 113 fps / 8.8 ms | 88 fps / 11.4 ms | 1036 | 1.34 M |
| CCP 단면 근접, plasma가 화면을 채움 | 130 fps / 7.7 ms | 101 fps / 9.9 ms | 940 | 1.30 M |
| Bay overview, High | 302 fps / 3.3 ms | 178 fps / 5.6 ms | 1169 | 1.53 M |
| Remote source 단면(glow, afterglow) | 84 fps / 11.9 ms | 58 fps / 17.2 ms | 1284 | 1.56 M |
| CMP 접촉 단면 | 722 fps / 1.4 ms | 426 fps / 2.3 ms | 533 | 0.62 M |
| CMP 조립, platen 회전 재생 | 683 fps / 1.5 ms | 399 fps / 2.5 ms | 573 | 0.71 M |
| OHT 적재 주행 재생 | 489 fps / 2.0 ms | 272 fps / 3.7 ms | 889 | 1.25 M |
| CCP handling, cover 제거, robot과 load lock 재생 | 482 fps / 2.1 ms | 268 fps / 3.7 ms | 856 | 1.24 M |
| CMP front end, cover 제거, wet robot 재생 | 575 fps / 1.7 ms | 337 fps / 3.0 ms | 697 | 0.75 M |
| Bay 안쪽, 천장과 벽 표시 | 347 fps / 2.9 ms | 203 fps / 4.9 ms | 1053 | 1.50 M |
| CCP load port의 닫힌 FOUP(비교용) | 600 fps / 1.7 ms | 370 fps / 2.7 ms | 655 | 1.16 M |
| 같은 시점에서 FOUP 단면 켬 | 589 fps / 1.7 ms | 353 fps / 2.8 ms | 669 | 1.16 M |
| Bay overview, Balanced | 311 fps / 3.2 ms | 183 fps / 5.5 ms | 1164 | 1.53 M |

FOUP 단면을 넣은 뒤 다시 잰 값이다. 같은 PC에서도 실행할 때마다 10 ~ 25% 차이가 나서 WebGL2는 두 번 재고 두 번째 값을 적었다. FOUP 단면을 켜면 draw call이 14개(단면 cap과 slot 웨이퍼) 늘고 frame time 차이는 0.1 ms 안쪽이다.

위 표는 오른쪽 패널을 없애기 전, 캔버스 1426×992에서 잰 값이다. 패널을 없앤 뒤 같은 창 크기의 캔버스는 1686×992로 넓어졌다(픽셀 18% 증가). 넓어진 화면에 mesh가 더 들어와서 draw call이 상태에 따라 0 ~ 116개 늘었다(CMP front end 697에서 813, Bay 안쪽 1053에서 1119, FOUP 655에서 677). 같은 날 1686×992로 다시 쟀지만, 따로 열려 있던 Chrome 창이 GPU를 쓰고 있어서(측정하지 않을 때도 GPU 사용률 41%) fps가 표보다 20 ~ 50% 낮게 나왔다. 조건이 달라 비교할 수 없으므로 표는 바꾸지 않았다. 다른 GPU 사용 프로그램을 닫고 다시 재야 한다.

vsync를 켜면 WebGL2는 모든 상태에서 60 fps이고, WebGPU는 Remote source 단면만 60 fps 아래다. 플라즈마 ray march가 있는 장면(CCP, Remote)이 가장 무겁고, 상세 부품이 늘어난 만큼 이전보다 draw call이 많다. 부품은 picking과 선택을 위해 part 단위 mesh로 두었다. 내장 GPU에서는 Balanced 프리셋과 fine LOD가 먼저 효과를 낼 것으로 보지만 확인하지 못했다.

## 가정과 한계

- 모든 치수, robot 형상, 단계 시간은 가정값이다(`docs/equipment-assumptions.md`, `docs/geometry-assumptions.md`). 단계 시간은 보여 주기 위한 값이며 cycle time이 아니다.
- Robot joint, door, gate, shutter, brush, chuck 동작은 scripted presentation이다. Encoder나 limit switch 관측으로 저장하지 않는다.
- Load lock pump-down, vent, cooldown은 압력과 온도 값 없이 단계 이름만 있다.
- 센서는 새로 추가하지 않았다. DB와 런타임의 차이는 `docs/sensor-crosswalk.md`의 "DB와 런타임이 다른 점"에 정리했다(MFC 가스 이름, 단위, CMP 세정 모듈 수, slurry line 수, OHT 상태 감시 센서 등).
- Wet robot의 clean-ready 상태는 표시용 flag다. 실제 오염 계산은 없다.
- 단면은 방위각 sector 방식이며 임의 평면 단면은 없다. Robot과 load lock 내부는 cover 제거로 본다.
- OHT는 직선 rail 1개, vehicle 1대, station 3개다. 교통 제어, E84 신호, 충돌 safety controller는 없다.

## 남은 문제

- Draw call이 장면에 따라 500 ~ 1300개다. 같은 재질의 고정 부품을 장비별로 합치면 줄겠지만 part 단위 picking과 highlight를 유지하는 방법을 먼저 정해야 한다.
- 메인 청크가 2.55 MB다. 장비 bundle을 지연 로딩하면 첫 화면이 빨라진다.
- CMP 세정의 brush2, megasonic 모듈과 slurry line b, c는 DB에만 있다. 런타임에 넣을지 정해야 한다.
- MacBook과 Safari에서 확인하지 못했다.
- Tree 폭을 끄는 동안 3D 화면이 깜빡이고, WebGL2 High에서는 드래그가 끊긴다. 원인과 해결 방안, 측정 방법(`qa/flicker.mjs`)은 `docs/flickering_solutions.md`에 정리했다.
- CMP 세정 trace(`cmp_clean_trace`)와 두께 측정(`cmp_thickness_measurement`)은 pass_id로 cmp_run과 묶이지만 pass 테이블이 없어서 외래 키로 검사되지 않는다. Platen이 여러 개면 run과 pass가 1:1이 아니라서 pass 테이블을 따로 둘지 정해야 한다.

## 다음 우선순위

1. Operational backend 골격과 Simulation provider. PresentationState와 PreviewState를 섞지 않는다.
2. DB 열과 런타임 channel 사이의 ChannelSourceBinding(단위 변환 포함)을 recorded run부터 붙인다. 대응이 미결인 열은 crosswalk 표에서 먼저 정한다.
3. 고정 부품 merge와 bundle 지연 로딩으로 내장 GPU 성능을 확인한다.
