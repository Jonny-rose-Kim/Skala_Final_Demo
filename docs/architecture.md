# 구조

## 레이어

- DomainDefinition: `src/domain`(템플릿, 계측, carrier, route)과 `src/equipment/*/template.ts`, `measurement.ts`.
- GeometryDefinition: `config/geometry/*.json`과 `src/equipment/*/layout.ts`, 부품 생성기 `parts.ts`, 공유 생성기 `src/geometry/sharedParts.ts`, 기존 `src/geometry/chamberParts.ts`.
- PresentationState: `src/presentation/store.ts`(Zustand). 선택, 카메라, 관찰 모드, overlay, 시나리오 선택, 저빈도 snapshot(timeline, preview).
- PreviewState: `src/presentation/preview.ts`와 `scenario.ts`. 시나리오 evaluator가 매 frame 계산하는 scripted 상태.
- Scene: `src/scene/sceneHost.ts`(엔진 수명, 한 Scene에 모든 instance), `equipmentInstance.ts`, `effectsRegistry.ts`, `measurementOverlay.ts`, `cameraPresets.ts`, `fabEnvironment.ts`(시각용 bay 배경).
- Handling: `src/equipment/handling/`(SCARA 역기구학 `scara.ts`, station layout, robot과 station 부품 생성기, station 시퀀스와 시나리오, 단독 handling 시나리오 생성기), `src/domain/kinematics.ts`(joint 그래프의 순수 forward kinematics), `src/presentation/motionTrack.ts`(단계별 motion track과 holder 인계).
- SimulationState, MeasurementState, Replay는 타입과 모드 설명만 있고 구현이 없다(`src/providers/modes.ts`).

## Joint와 motion hierarchy

Joint는 `JointDef`의 `parentJointId`로 이어진다. 부품은 rest pose의 instance 좌표로 만들고, 따라가는 joint를 component의 `jointId`로 정한다. 한 component의 모든 part는 같은 joint를 따라간다(단위 테스트가 확인). 의미상의 부모(`parentAssetId`, component tree)와 움직임의 부모(joint)는 따로다. 예를 들어 wafer 표시 asset은 tree에서는 robot end effector 아래에 있지만 움직임은 wrist나 roll joint를 따른다.

Joint 값은 config와 layout에서 나온 목표 값을 motion track이 보간한 결과다. Robot은 wafer 중심의 (reach, 방향)을 task 값으로 갖고 `scaraIK`로 shoulder, elbow, wrist를 계산한다. Evaluator는 순수 함수라서 pause, resume, restart, scrub이 모두 같은 결과를 낸다.

## 장비 등록

`src/equipment/index.ts`가 bundle(템플릿, layout, parts, 계측 seed, 카메라 preset, facility interface), scene effect factory, 시나리오를 등록한다. UI와 scene host는 레지스트리만 본다. 장비를 하나 더 두려면 `config/equipment/instances.json`에 instance를 추가하면 된다.

## 렌더 루프

1. VisualClock tick으로 presentation_time을 얻는다.
2. 선택된 ScenarioDefinition을 평가해 PreviewState를 만든다.
3. instance마다 joint 값을 적용하고(path joint는 bundle의 pathPose, 늘어나는 belt와 bellows는 scale), wafer 표시 asset 중 하나만 켜고, effect set을 갱신한다. Carrier(FOUP)는 slot map에서 점유된 slot의 웨이퍼 part만 켠다(part의 `presenceKey`가 slot id). Cutaway 중에는 `freezeInCutaway` joint를 0으로 고정한다.
4. mobile instance(FOUP)는 holder에 따라 station seat frame(dock offset 포함)이나 OHT gripper frame에서 world pose를 받는다.
5. 200 ms마다 거리 LOD(멀리 있는 비활성 장비의 fastener, 이음판 같은 fine 부품 숨김), 매 frame 환경 표시(천장과 벽 자동 숨김).
6. marker overlay, 조명, 렌더, 라벨, perf와 timeline과 preview snapshot 발행.

매 frame geometry를 다시 만들지 않는다. 움직임은 node transform과 scale만 바꾼다.

인스턴스를 바꾸어도 Scene은 다시 만들지 않는다. 비활성 instance는 plasma step 수를 줄이고 overlay를 끈다.

## 관찰 모드

- Cutaway: 회전 부품은 각자 축 기준 sector 기하와 cap, 부착 부품은 방위 숨김. 상자 형상 부품(FOUP shell 등)은 instance 축을 지나는 sector 평면으로 잘라 내고(`clipToSector`), 잘린 상자마다 단면 cap(`boxSectionCaps`)을 붙인다. CCP plasma shader와 Remote glow는 같은 sector로 해석적으로 잘린다.
- FOUP section: carrier만 template 기본 sector(뒤쪽 절반)로 자른다. 선택한 장비나 보기 모드와 별개로 켜고 끄며, FOUP이 선택된 장비이고 Cutaway 보기일 때만 Cutaway 설정이 우선한다(`SceneHost.cutFor`).
- X-ray: shell 부품만 per-instance 투명 재질로 바꾼다.
- Cover 제거: `cover` 표시가 있는 panel(EFEM, process enclosure, source housing 등)을 숨긴다. Auto는 선택한 장비만, Closed와 Removed는 전체에 적용한다. 보기 전용이며 door, gate, shutter 상태와 무관하다.
- Exploded: asset node의 display offset. 진입 순간의 PreviewState 전체를 고정하고(robot, wafer, carrier 함께) 나오면 evaluator 값으로 돌아간다. Plasma, slurry, hoist overlay는 숨긴다.
- Overview: 전체 bay, 장비 라벨, cutaway와 x-ray와 explode 미적용. FOUP section은 켜 둔 대로 유지한다.

## 엔진

`src/scene/engineFactory.ts`: WebGPU 시도 후 실패하면 새 canvas로 WebGL2. `?renderer=webgl2`로 강제할 수 있다.

## 현재 bay 추가 구조 (2026-11-24)

- **장비 계층:** Tool -> Module -> Chamber는 instance 하나 안의 scope가 붙은 component(`ComponentDef.scope`)와 `EquipmentTemplate.modules`로 표현한다. 결정과 ID 대응은 `docs/equipment-migration.md`에 있다.
- **Geometry source:** `EquipmentBundle.glb`가 있으면 `SceneHost.buildWorld`가 인스턴스를 만들기 전에 `GlbLibrary`(`src/scene/glbParts.ts`)로 GLB를 로드한다. GLB node는 extras와 manifest로 binding된 `PartGeometry`가 되어 procedural part와 같은 경로를 지난다. Pipeline은 `docs/asset-pipeline.md`에 있다.
- **Cover 규칙:** `EquipmentBundle.coversAuto`가 `inspection`이면 조립 상태에서는 외장이 닫혀 있고, 점검 모드(cutaway, x-ray, exploded)에서만 숨는다.
- **웨이퍼 표면:** `WaferSurfaceLibrary`(`src/materials/waferSurface.ts`)가 표시 중인 웨이퍼의 `IllustrativeFilmState`로 앞면 재질을 고른다(iridescence, 개념 패턴).
- **진단 하이라이트:** store `diagnosis`(agent 이벤트 해석 결과)를 선택 하이라이트 아래 층으로 그린다(`src/domain/agentContract.ts`).
- **환경:** instance 구성별로 bay 환경을 고른다(`instances.json`의 `environments`: 기본 `fab-bay-v2`, legacy는 `fab-bay-v1`). IBL은 `public/env/white_studio_05.env`이며, 실패하면 절차적 panorama를 쓴다.
