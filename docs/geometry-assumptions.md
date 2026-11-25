# 형상 가정

대표적인 300mm 단일 웨이퍼 CCP PECVD 챔버의 구조와 치수를 정리한 문서다.

모든 값은 가정값(source kind: assumed)이다. 300mm 평행판 직접 방전형 PECVD 챔버에서 서로 모순 없이 맞아떨어지는 대표값을 고른 것이고, 특정 제조사 장비를 측정한 값이 아니다. 설정 파일은 `config/geometry/ccp-pecvd-300-v1.json`(`geometry_revision: ccp-pecvd-300-v1.1.0`)이고, 배치 계산은 `src/config/geometry.ts`의 `deriveChamberLayout`에서 한다.

## 좌표계

- 내부 단위는 미터다.
- +Y가 위쪽이고 왼손 좌표계를 쓴다(Babylon 기본값, `scene.useRightHandedSystem = false`).
- 원점은 챔버 중심축과 바닥 안쪽 윗면이 만나는 점(y = 0)이다.
- 방위각 φ(도)는 +X에서 +Z 방향으로 잰다. 위치는 (r cos φ, y, r sin φ)이고, `ArcRotateCamera.alpha`도 같은 기준을 쓴다.
- glTF/GLB(오른손 좌표계)는 Babylon 로더가 변환한다. 절차적 형상은 처음부터 씬 좌표계로 만든다. GLB로 교체할 때도 각 부품은 같은 `assetId`/`nodeKey`를 유지해야 한다(`assets/manifests/ccp-pecvd-300.manifest.json` 참고).

## 구조 (설계 결정)

- 상부 전극은 RF 전력이 걸리는 다공 샤워헤드 페이스플레이트다. 페이스플레이트와 백킹 플레이트 사이에 가스 플리넘이 있고, 그 가운데에 블로커 플레이트가 있다.
- 하부 전극은 가열되는 페데스탈(서셉터)이고 접지되어 있다. 이 템플릿에는 하부 RF 바이어스를 따로 두지 않았다.
- 샤워헤드 조립체는 세라믹 아이솔레이터 링을 사이에 두고 리드에 매달려 있다. RF 스템은 리드 중앙 구멍에 끼운 세라믹 피드스루 부싱을 지나가고, 전극 둘레는 세라믹 에지 인슐레이터가 감싼다. 전력이 걸리는 전극이 접지된 외함에 직접 닿는 곳은 없다.
- 가스는 가스 패널에서 1/2인치 배관, RF 스템 안의 공급관(세라믹 절연 구간 포함), 플리넘, 블로커, 페이스플레이트 구멍을 차례로 지나 웨이퍼 위로 들어온다. 그다음 페데스탈 가장자리 바깥으로 흘러 슬롯이 뚫린 펌핑 배플, 배기 플리넘, 측면 배기 포트, 스로틀 밸브, 엘보, 격리(게이트) 밸브, 포어라인을 거쳐 드라이 펌프로 빠져나간다.
- 접근부로는 웨이퍼 반송 높이(페데스탈을 내린 상태)의 측면 슬릿 밸브, 전극 간격 높이의 뷰포트, 정전용량 압력계가 달린 압력 탭, 샤프트를 통과하는 페데스탈 열전대가 있다.
- ICP 코일이나 돔, 원격 플라즈마 소스, 하부 바이어스 구성은 일부러 섞지 않았다. 이런 구성은 나중에 별도 템플릿으로 만든다.

## 주요 치수 (가정값)

| 항목 | 값 |
| --- | --- |
| 웨이퍼 | Ø300 mm × 0.775 mm (SEMI 300mm 표준 두께) |
| 전극 간격 (페이스플레이트 아랫면과 웨이퍼 윗면 사이) | 20 mm (양산 장비는 보통 10–25 mm. 화면에서 잘 보이도록 20 mm로 정함) |
| 샤워헤드 페이스플레이트 | Ø340 × 12 mm, 구멍 Ø1.2 mm, 피치 5.5 mm(동심원 배열), 구멍 영역 Ø310 mm |
| 플리넘 | 높이 12 mm, Ø316 mm. 백킹 플레이트 22 mm, 블로커 플레이트 Ø140 × 3 mm |
| 아이솔레이터 링(세라믹) | Ø280/Ø344, 높이 23.2 mm (백킹 플레이트 윗면부터 리드 아랫면까지) |
| 에지 인슐레이터(세라믹) | 샤워헤드 둘레, 두께 12 mm |
| RF 스템 | Ø56/Ø40. 리드의 Ø80 구멍을 지나고 그 틈은 세라믹 부싱이 채움 |
| 챔버 몸체 | 내경 Ø520, 벽 두께 35 mm, 내부 높이 240 mm, 바닥 두께 40 mm, 상부 플랜지 Ø660 × 40 mm |
| 리드 | Ø670 × 50 mm, Ø630 원주에 볼트 24개, O링 홈 Ø600 |
| 라이너 | 아노다이징 알루미늄 4 mm, 벽과 간격 6 mm, y 82–232 mm |
| 페데스탈 | Ø340 × 45 mm, 공정 위치 윗면 y = 150 mm, 반송 위치 윗면 y = 70 mm(v1.3.0, 이전 100 mm), 샤프트 Ø70, 히터 공간 Ø70–300 × 16 mm(링형 발열체 7개), 리프트 핀 3개(Ø210 원주, 행정 44 mm, 이전 12 mm) |
| 에지 링(세라믹) | Ø302/Ø340 × 3 mm |
| 펌핑 배플 | Ø350/Ø498, 두께 4 mm, y = 75 mm, 슬롯 36개(개구율 42%) |
| 슬릿 | 360 × 50 mm, 중심 y = 112 mm, 방위각 180° (반송 중인 웨이퍼 높이 y = 112.8 mm가 슬릿 안을 지남) |
| 뷰포트 | 구멍 Ø60, 석영 창 Ø80 × 8 mm, 방위각 45°, 중심 y = 161 mm |
| 압력 탭 | 구멍 Ø16, 방위각 120°, y = 125 mm |
| 배기 포트 | 구멍 Ø64, 방위각 320°, y = 40 mm (배플 아래) |
| 가스 패널 MFC 블록 | 45 × 90 × 20 mm, 3개, 간격 55 mm (패널 앞면). 첫 번째 블록이 MFC-01(`mfc_01`, 유량 센서 장착), 나머지는 아직 정의하지 않은 슬롯 |

## 검증 규칙

`validateGeometryConfig`는 다음 경우를 오류로 처리한다.

- 웨이퍼가 페데스탈 위에 제대로 놓이지 않음
- 전극 간격이 0 이하
- 샤워헤드가 라이너에 닿음
- 구멍 영역이 페이스플레이트를 벗어남
- 아이솔레이터 높이가 8 mm 미만
- 스템이 부싱에 들어가지 않거나, 가스관이 스템에 들어가지 않음
- 페데스탈이 배플 안쪽을 통과하지 못하거나, 배플이 라이너와 겹침
- 슬릿이 라이너 범위를 벗어나거나 배플보다 낮음
- 반송 높이가 슬릿 개구부를 벗어남
- 배기 포트가 배플보다 높음
- 볼트 원주가 플랜지를 벗어나거나, O링 홈이 리드 면을 벗어남

전극 간격이 흔치 않은 값이거나 포트 주변 금지 구간끼리 겹치면 경고를 낸다. 결과는 개발 모드 경고 화면, `npm test`, `npm run validate:config`에서 볼 수 있다.

## 단면 구간

단면 보기는 클리핑 평면이 아니라 형상을 실제로 잘라서 만든다. 회전체 부품은 남길 각도 구간만 다시 생성하고, 잘린 면에 평면 캡(어두운 무광 단면 재질)을 붙여서 벽 두께가 제대로 보이게 했다. 특정 방위각에 붙어 있는 부품은 그 방위각이 제거 구간 안에 들어가면 숨긴다.

구간 경계가 포트 주변 금지 구간에 걸리면 경계를 밖으로 옮긴다(`src/presentation/cutaway.ts`). 그래서 포트가 반쯤 잘리는 일 없이 통째로 빠지거나 통째로 남는다. 실제로 적용된 각도는 화면에 따로 표시한다. 플라즈마 셰이더도 같은 구간 값을 받아 계산으로 잘라낸다.

## 재현성

`node --import tsx scripts/export-geometry-obj.ts`를 실행하면 조립 상태의 모든 부품을 OBJ 파일과 매니페스트로 내보낸다. 형상을 확인하거나 Blender에서 다듬을 때 쓸 수 있다. 검증 환경에 Blender가 없어서 Blender로 만든 에셋은 없고, 앱에서 쓰는 형상은 모두 코드로 생성한 것이다.

## 2026-11-12: station 블록 (geometry revision v1.2.0, v1.3.0에서 대체)

Chamber 자체 치수는 바꾸지 않았다. `station` 블록이 slit valve 바깥의 tool shell을 정의한다: slit valve와의 간격 20 mm, load lock 길이 200 mm, EFEM 길이 460 mm, enclosure 폭 900 mm와 높이(y 0.40 m), load port deck 깊이 440 mm, 폭 520 mm, 높이 900 mm(바닥 기준), FOUP seat는 EFEM 전면에서 220 mm. `deriveStationLayout`이 slit 방위를 따라 radial 거리로 배치하고 validation이 slit valve와의 간섭, deck 위 seat 위치를 검사한다. 내부 로봇과 load lock 내부는 모델링하지 않았다(simplified internal transfer).

## 2026-11-16: 상세 station (geometry revision v1.3.0)

v1.2.0의 200 mm load lock block은 300 mm wafer, blade, support pin, door gate 후퇴 공간이 들어가지 않아서 내부가 있는 station으로 바꿨다. 값은 `station` 블록에 있고 `deriveStationLayout`(`src/equipment/handling/stationLayout.ts`)이 slit 방위를 따라 radial 거리 r로 배치한다. 아래 r은 chamber 축에서 잰 거리다.

| 구간 | 값 |
| --- | --- |
| Load lock 외곽 | r 0.417 ~ 0.857 m, 내부 0.442 ~ 0.832 m, 폭 500 mm, wafer 중심 r 0.632 m |
| Support pin | 4개, r 방향 ±70 mm, 옆 방향 ±55 mm, 지름 6 mm, 평면 위 16 mm까지 올라옴 |
| 대기 door | r 0.857 ~ 0.887 m, opening 340 × 40 mm, gate 후퇴 60 mm |
| 진공 blade | 2단, 두께 3 mm, 폭 80 mm. 1단 stroke 0.354 m, 2단 0.278 m |
| EFEM | r 0.887 ~ 1.727 m, 폭 1.1 m, 높이 2.0 m와 FFU 180 mm |
| 대기 robot | 축 r 1.267 m, link 280 mm 두 개, end effector 310 mm, Z stroke 380 mm |
| Load port | deck 높이 900 mm, FOUP seat r 1.974 m(dock 상태 1.944 m) |
| Pedestal 반송 위치 | 윗면 70 mm, lift pin stroke 44 mm |

Validation(`validateGeometryConfig`, Remote는 `validateRemoteConfig`)은 load lock 안의 wafer, blade, pin, gate 여유, robot reach와 swing 반지름, door opening 통과, blade가 stage에 닿지 않는지, robot Z stroke가 slot과 load lock 높이를 모두 덮는지 확인한다. Remote도 같은 블록을 쓰고 seat는 r 1.939 m다(instance x -0.035 m라서 world x는 CCP와 같다).

CMP front end는 `sti-cmp-rotary-300-v1.json`의 `front_end` 블록이다. Dry EFEM, transfer tower(spin dryer와 flip station), overhead wet robot(지붕 beam 위 Z housing), brush cleaner, end-effector rinse station, wet deck의 위치와 크기가 있고 `validateCmpConfig`가 reach, wrist가 station housing 밖에 있는지, swing이 tower와 cleaner와 alcove와 rinse station을 피하는지, load cup pin 사이로 fork가 지나는지, alcove 옆 opening, dryer bowl 높이, robot Z stroke를 확인한다.

Bay 배치(`config/equipment/instances.json`, instances-v4)는 seat가 바깥으로 나온 만큼 rail을 x = -1.974 m로, CMP instance를 x = 0.443 m로 옮겼다. `npm run validate:config`가 세 load port 모두 lateral 0.0 mm, hoist extension 1.093 m로 닿는 것을 출력한다.

Bay 배경(바닥 타일, 천장 grid, 벽, utility)은 `config/environment/fab-bay-v1.json`에 있고 시각용이다. 바닥 높이는 instances의 `bay.floor_y`를 쓴다.

## 현재 bay 배치 (2026-11-24)

**인스턴스 원점:** 각 장비의 active chamber 축이다.
- y=0: Producer pedestal 상면, Tactras ESC 상면, CELLESTA 웨이퍼 지지면.
- 바닥 높이: 각 config의 local floor y(Producer -0.782, Tactras -0.85, CELLESTA -0.95).
- 인스턴스 y는 world 바닥(-0.782)에 맞춘다(PRODUCER 0, ETCH 0.068, CLEAN 0.168).

**Load port seat:** 모두 rail 선 x = -1.974, deck 높이 0.9 m다. OHT로 계산하면 세 station 모두 측면 오차 0 mm, hoist 1.081 m다(`npm run validate:config`).

**Z 배치:** PRODUCER -4.3, ETCH 0, CLEAN 3.6. Bay 환경은 `config/environment/fab-bay-v2.json`이다.

## Bay 환경 v2.1: 공개 다큐멘터리 영상을 참고한 배경 (2026-11-25)

- **참고 자료:** 사용자가 제공한 메모리 팹 내부 사진 18장(공개 다큐멘터리 화면 캡처). 천장, 통로, FOUP 보관대, load port, 공정 장비 내부가 찍혀 있다.
  - 사진은 형상과 배치 참고용으로만 썼다. 저장소에 넣지 않았다(`img/`는 추적하지 않는다).
  - 방송사 로고, 장비 상표, 사람은 재현하지 않았다.
- **천장:** 높이 3.4 m에서 4.4 m로 올렸다.
  - 1.2 m 정사각 모듈, 모듈 크기의 매입형 LED 패널, T-bar 교차점 node, 짧은 기둥에 단 돔 CCTV.
  - 천장면은 밝은 회색이고, 아래로 반사되는 빛을 흉내 내려고 약한 자체 발광을 준다.
  - CLW-08v2 rail hanger의 `ceiling_y`도 4.4 m로 맞췄다.
- **천장 반송층(`src/scene/fabOverhead.ts`):**
  - 장식 OHT rail 3개: 통로 위 3.15 m 1개, 장비 위 3.75 m 2개.
  - rail 부속: 빨간 위치 strip, 위치 표지판, hanger frame, cable tray와 cable, 제어 box.
  - 장비 위 두 rail 사이에 S자 분기 곡선 2개.
  - FOUP 보관 선반: 통로 벽 쪽, 이 bay rail 옆(LP 사이), 장비 위.
  - 정지한 장식 차량 6대.
- **장식 차량과 FOUP:**
  - 장식 차량은 CLW GLB 외장을 복사하되 호기 번호와 표시창은 뺐다(차량 ID가 둘로 보이지 않도록). 움직이지 않는다.
  - 선반의 FOUP와 장식 차량은 배경이다. fleet, WIP, 재고 상태가 아니다.
- **사람 눈높이 구역(`src/scene/fabZones.ts`):**
  - 북쪽 벽 너머 노란 조명의 노광 구역. 통로 출입구와 창 band로 보이고, track형 장비 3줄, load port와 FOUP, 신호등, 모니터가 있다.
  - 이 구역은 route의 외부 노광 단계(S20)를 장면 안에서 보여 주는 배경이다. 모델링된 장비가 아니다.
  - 통로 벽 쪽 사물함 2열(작은 문, keypad, 라벨 card), 건물 기둥 2개, 통로 바닥 위치 번호 45-48.
- **장비 세부:**
  - FOUP: 짙은 연기색 shell, 뒤와 양옆의 호박색 창 plate(세로 rib과 볼트), 노란 side handle.
  - Load port: 개구부 위 흰 indicator panel과 꺼진 상태의 LED lens 8개(녹·황·적·청). 켜진 상태는 표시하지 않는다.
  - CELLESTA nozzle head: L bracket, manifold, 반투명 tapered tip. 세 nozzle 위치는 그대로다.
- **보기 편의:**
  - 천장 반송층은 카메라가 천장 위에 있으면 통째로 숨는다.
  - 카메라와 target 사이를 막는 chunk만 따로 숨는다(2.4 m 단위).
  - 노란 구역의 천장과 벽도 bay 천장·벽과 같은 규칙으로 숨는다.
- **모든 치수와 배치는 가정이다.** 실제 팹의 rail 높이, 선반 간격, 구역 배치가 아니다.
