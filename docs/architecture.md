# 구조

## 레이어

- DomainDefinition: `src/domain`(템플릿, 계측, carrier, route)과 `src/equipment/*/template.ts`, `measurement.ts`.
- GeometryDefinition: `config/geometry/*.json`과 `src/equipment/*/layout.ts`, 부품 생성기 `parts.ts`, 공유 생성기 `src/geometry/sharedParts.ts`, 기존 `src/geometry/chamberParts.ts`.
- PresentationState: `src/presentation/store.ts`(Zustand). 선택, 카메라, 관찰 모드, overlay, 시나리오 선택, 저빈도 snapshot(timeline, preview).
- PreviewState: `src/presentation/preview.ts`와 `scenario.ts`. 시나리오 evaluator가 매 frame 계산하는 scripted 상태.
- Scene: `src/scene/sceneHost.ts`(엔진 수명, 한 Scene에 모든 instance), `equipmentInstance.ts`, `effectsRegistry.ts`, `measurementOverlay.ts`, `cameraPresets.ts`.
- SimulationState, MeasurementState, Replay는 타입과 모드 설명만 있고 구현이 없다(`src/providers/modes.ts`).

## 장비 등록

`src/equipment/index.ts`가 bundle(템플릿, layout, parts, 계측 seed, 카메라 preset), scene effect factory, 시나리오를 등록한다. UI와 scene host는 레지스트리만 본다. 장비를 하나 더 두려면 `config/equipment/instances.json`에 instance를 추가하면 된다.

## 렌더 루프

1. VisualClock tick으로 presentation_time을 얻는다.
2. 선택된 ScenarioDefinition을 평가해 PreviewState를 만든다.
3. instance마다 joint 값을 적용하고(path joint는 bundle의 pathPose), wafer 표시 asset을 켜고 끄고, effect set을 갱신한다. Cutaway 중에는 `freezeInCutaway` joint를 0으로 고정한다.
4. mobile instance(FOUP)는 holder에 따라 station seat frame이나 OHT gripper frame에서 world pose를 받는다.
5. marker overlay, 조명, 렌더, 라벨, perf와 timeline과 preview snapshot 발행.

인스턴스를 바꾸어도 Scene은 다시 만들지 않는다. 비활성 instance는 plasma step 수를 줄이고 overlay를 끈다.

## 관찰 모드

- Cutaway: 회전 부품은 각자 축 기준 sector 기하와 cap, 부착 부품은 방위 숨김. CCP plasma shader와 Remote glow는 같은 sector로 해석적으로 잘린다.
- X-ray: shell 부품만 per-instance 투명 재질로 바꾼다. `alwaysOpaque` 부품(EFEM, load lock, alcove, wet transfer)은 그대로 둔다.
- Exploded: asset node의 display offset. joint 값은 진입 시점에 고정되고 plasma, slurry, hoist overlay는 숨긴다.
- Overview: 전체 bay, 장비 라벨, cutaway와 x-ray와 explode 미적용.

## 엔진

`src/scene/engineFactory.ts`: WebGPU 시도 후 실패하면 새 canvas로 WebGL2. `?renderer=webgl2`로 강제할 수 있다.
