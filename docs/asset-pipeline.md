# Asset pipeline: Blender -> GLB -> glTF-Transform -> glTF-Validator -> Babylon

장비 외장(패널, 문, 경첩, 손잡이, 통풍구, 발, 상부 box, idle module, idle load port, OHT 차체)은 Blender로 만든 GLB다. 공정 내부(chamber, 전극, cup, chuck, robot, 웨이퍼)는 sector cutaway와 단면 cap이 필요해서 procedural로 둔다. 두 종류 모두 같은 part 파이프라인(asset node, joint rebase, picking metadata, highlight, Focus, cover / LOD / x-ray)을 지난다.

## 실행

| 단계 | 명령 | 결과 |
| --- | --- | --- |
| 0. Livery | `npm run assets:livery` (system Python + Pillow) | `assets/source/textures/livery/clw08v2_livery.png`(1024² decal atlas, RGBA), `clw08v2_display.png`(LED 창 emissive map), `clw08v2_livery.json`(atlas 좌표) |
| 1. Envelope | `npm run assets:envelopes` | `assets/source/envelopes/<templateId>.json`: TS layout에서 계산한 외곽 치수(인스턴스 frame). Blender가 같은 config를 따른다 |
| 2. Blender | `npm run assets:blender` (= `sh scripts/blender/run.sh [tool ...]`, Blender 4.5.16 LTS; 다른 경로는 `BLENDER=...`) | `assets/source/blender/<id>.blend`(편집용), `assets/source/glb-raw/<id>.glb`(git 제외), `assets/manifests/<id>.glb-manifest.json` |
| 3. 최적화 | `npm run assets:optimize` | `public/models/<id>.glb`, `assets/manifests/<id>.optimize-report.json` |
| 4. 검증 | `npm run assets:validate` | `assets/manifests/<id>.validation.json` (validator error가 있거나 manifest가 어긋나면 실패) |
| 전체 | `npm run assets:build` | 0-4 순서대로 |
| IBL | `npm run assets:env` (dev server 필요) | `public/env/white_studio_05.env` |

Blender 직접 실행: `blender --background --factory-startup --python scripts/blender/build_equipment.py -- producer tactras cellesta clw`.

## Frame과 단위

- **단위:** m.
- **Builder 좌표:** builder는 앱의 인스턴스 frame(+Y up, Babylon left-handed)으로 생각하고, `lib.B(x, y, z) = (-x, -z, y)`로 Blender에 놓는다.
- **변환 측정:** Blender (x, y, z)는 glTF export(+Y up)와 Babylon glTF loader의 `__root__`(handedness 변환)를 거쳐 Babylon (-x, z, -y)가 된다. Probe GLB로 2026-11-24에 측정했다.
- **변환 횟수:** 변환은 loader의 `__root__` 한 번뿐이다. Adapter(`src/scene/glbParts.ts`)는 world matrix를 vertex에 한 번 굽고, 회전이나 scale을 더하지 않는다.
- **감는 방향(winding):** 거울 변환으로 glTF의 CCW가 left-handed frame에서 CW가 되는데, 이것이 Babylon의 앞면이다. 그래서 index를 뒤집지 않는다. 뒤집으면 면이 안팎이 바뀌어 상단면이 검게 나오는 것을 확인하고 고쳤다.
- **배율 확인:** GLB 외장은 TS layout에서 나온 envelope 치수 안에 놓인다. 예를 들어 Producer MOD-01 skin은 config의 `module_x0..x1`을 따른다. 300 mm wafer와 seat는 procedural 쪽에 있으며, manifest의 `boundsInstance`로 인스턴스 frame 위치를 확인할 수 있다.

## 의미(semantics) 연결

**Extras:** Blender 객체의 custom property가 glTF `extras`로 나간다. 항목은 `assetId`, `partKey`, `materialRef`(fallback), `cutaway`(`keep` / `hide-in-sector`), `cover`, `lod`, `jointId`, `pickable`, `castShadow`, `isGlass`다.

**Manifest:** node마다 extras, 부모, 삼각형 수, 인스턴스 frame bounds를 기록한다.

**런타임 binding 규칙:**
- Mesh가 part가 되는 조건은 세 가지가 모두 맞을 때다.
  1. Extras에 `partKey`가 있다.
  2. 그 `partKey`가 manifest에 같은 `assetId`로 있다.
  3. Template에 그 asset(과 joint)이 있다.
- 이름은 해석하지 않는다.
- Manifest에 있는데 GLB에 없는 node, 중복 partKey, 모르는 asset이나 joint가 있으면 load 오류다.

**같은 asset, 같은 재질의 조각:** 한 node로 합쳐서 draw call을 줄인다. 예를 들어 `mod01_enclosure.doors.paint_offwhite`가 그렇다. 의미 단위(asset)는 유지한다.

**관절:** OHT 차체 같은 관절 부품은 rest pose(vehicle이 rail 시작점, hoist retracted)로 만들고 `jointId`를 extras에 넣는다. Adapter가 procedural 부품과 같은 rest-origin rebase를 적용한다.

**Animation:** GLB `AnimationGroup`은 자동 재생하지 않는다. Load 즉시 멈추고 dispose하며, 모든 자세는 PreviewState와 visual clock이 정한다.

## 최적화(명시적 transform만)

- **적용:** `dedup`(accessor, material, texture)과 `weld`.
- **적용하지 않음:**
  - `optimize` 일괄 적용, flatten, join, prune, simplify: semantic node, pivot, extras를 잃을 수 있다.
  - meshopt quantization: 얇은 판과 작은 간격의 오차를 검사하는 단계를 만들지 않았다.
  - KTX2 / Basis: 텍스처가 512 px JPEG 2장(약 20 KB)이라 압축 이득보다 decoder 배포 부담이 크다.
- **변경 검사:** 최적화 전후 node 표(이름, 부모, extras, TRS)를 비교하고, 하나라도 바뀌면 실패한다.

| GLB | Node | 삼각형 | 재질 / 텍스처 | 크기 | Validator |
| --- | --- | --- | --- | --- | --- |
| producer_se_ccp_twin_300 | 41 + root | 33,652 | 9 / 2 | 3.0 MB | error 0, warning 0 |
| tactras_oxide_ccp_rie_300 | 72 + root | 44,892 | 10 / 2 | 3.8 MB | error 0, warning 0 |
| cellesta_i_md_clean_300 | 70 + root | 47,104 | 10 / 2 | 4.2 MB | error 0, warning 0 |
| clw08v2_oht | 20 + root | 4,772 | 10 / 4 | 0.7 MB | error 0, warning 0 |

크기의 대부분은 bevel이 들어간 geometry다. 다음 단계 후보는 bevel segment 줄이기와 quantization 오차 검사다.

## 재질과 텍스처

- **재질 방식:** glTF metallic-roughness(Principled BSDF). 기본 색은 상수이고 normal map만 CC0 텍스처를 쓴다(512 px로 줄임).
  - 도장 패널: ambientCG `Plastic010` normal map.
  - Stainless와 aluminium: ambientCG `Metal012` normal map.
- **Roughness map을 뺀 이유:** CC0 roughness map이 실제 장비 표면보다 훨씬 매끈해서, stainless가 어두운 방을 비추는 검은 거울처럼 나왔다.
- **뺀 텍스처:** 녹과 오염이 있는 painted-metal 텍스처는 클린룸 장비에 맞지 않아 쓰지 않았다(내려받은 뒤 삭제).
- **색공간:** base color는 sRGB, normal은 Non-Color.
- **재질 공유:** GLB 재질과 텍스처는 template마다 `GlbLibrary`가 소유하고 scene teardown 때 해제한다. Highlight는 layer로, x-ray는 복제 variant로 처리하므로 한 장비가 공유 재질을 바꾸지 않는다.
- **Cover:** 외장 node는 `cover`이고 `coversAuto: "inspection"`을 따른다. 조립 상태에서는 닫혀 있고, 단면 / x-ray / 분해 보기에서 숨는다. Idle module 외장도 점검 모드에서 숨어서 내부를 가리지 않는다.

## Decal과 사진 기반 외장 (CLW-08v2, 2026-11-25)

- **참고 사진:** OHT 차체는 SK hynix 팹 OHT 공개 사진을 보고 형상과 배치를 맞췄다.
  - 형상: 평면 모서리가 크게 둥근 앞뒤 end shell이 옆으로 감겨 들어가고, 위에 검은 cap, 아래에 ledge가 있다.
  - 앞뒤 면 배치: 센서 창, 로고, 호기 번호, 센서 창과 명판, LED 표시창과 비상정지, 하단 센서 창. 경고 라벨은 왼쪽 가장자리에 있다.
  - 높이는 사진에서 읽은 비율(shell 높이 기준)이고, 폭과 높이는 config의 vehicle envelope을 따른다. 사진에서 잰 치수가 아니다.
- **Decal 방식:** 면에서 1.5 mm 띄운 평면 quad에 atlas UV를 준다. 재질은 `alphaMode: MASK`(cutoff 0.5)다.
  - Blender에서는 Image Alpha를 Math:Round를 거쳐 BSDF Alpha에 연결한다. Exporter는 Alpha가 연결된 텍스처를 PNG로 내보내므로 전역 JPEG 설정과 충돌하지 않는다.
  - Decal은 pick되지 않고 그림자를 만들지 않는다. 작은 라벨은 `lod: fine`이다.
- **재질:** 차체 흰색에 `KHR_materials_clearcoat`(0.5)를 쓰고, 센서 창은 clearcoat 1.0의 검은 아크릴이다. LED 창은 `emissiveTexture`와 `KHR_materials_emissive_strength`(1.6)를 쓴다.
- **표시창 내용:** 호기 번호와 instance id만 정적으로 보여 준다. 사진의 cycle 수 같은 운행 값은 넣지 않았다(가짜 관측 금지).
- **센서 창:** 위쪽 센서 창과 하향 센서는 `obstruction_sensor` asset의 GLB node다. 그래서 CLW bundle은 공통 OHT의 procedural obstruction sensor를 쓰지 않는다.

## Cutaway 정책

- 임의 GLB에 sector cut을 자동 적용하지 않는다. GLB node는 `keep`(또는 `hide-in-sector`)이다.
- 공정 내부의 단면은 procedural sector와 cap이 만든다.
- 내부를 볼 때 외장은 cover 숨김으로 처리한다.
- 점검용 cover 숨김은 실제 문이나 gate의 열림과 다른 상태다.

## 로드와 실패

- **로드 순서:** `SceneHost.buildWorld`가 인스턴스를 만들기 전에 template마다 GLB를 비동기로 로드한다. 진행 상태는 renderer message로 보여 주므로, 반쯤 만들어진 장비가 첫 프레임에 나오지 않는다.
- **취소:** 로드 중 teardown(React StrictMode, renderer fallback)이 일어나면 `GlbLibrary`가 결과를 버리고 해제한다.
- **실패:** 필수(`required`) GLB가 실패하면 그 template의 시나리오는 `Preview blocked`로 시계를 멈춘다. 선택 GLB가 실패하면 procedural 부품만 남는다.

## Blender 결과물 관련 미완료

- Cycles bake(AO, normal)는 하지 않았다. 움직이는 부품 사이의 그림자를 한 자세로 굽지 않는다는 원칙 때문이기도 하다.
- 고정 외장의 AO bake와 UV unwrap 품질 개선은 다음 단계다.
- 최종 화질 판정은 Babylon 런타임 캡처(`docs/status.md`)로 했다. Blender 렌더는 판정에 쓰지 않았다.
