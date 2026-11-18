# Tree 폭 조절 중 3D 화면 깜빡임

원인과 해결 방안을 정리한 문서다. 코드에는 아직 반영하지 않았고 후속 작업으로 남겨 둔다(2026-11-18).

## 증상

- 왼쪽 component tree의 경계선을 끄는 동안 3D 화면이 검게 깜빡인다. WebGL2와 WebGPU 모두 같다.
- WebGL2 High 품질에서는 깜빡임과 별개로 드래그가 끊긴다. WebGPU는 끊기지 않는다.

## 지금 구조

| 단계 | 내용 | 코드 |
| --- | --- | --- |
| Tree 폭 | `TreeDock`이 pointer가 움직일 때마다 폭 state를 바꾸고, 그만큼 viewport가 좁아지거나 넓어진다 | `src/app/panels/TreeDock.tsx` |
| 렌더 루프 | `engine.runRenderLoop`가 requestAnimationFrame마다 `renderFrame`을 부르고, 그 안에서 `scene.render()`를 한다 | `src/scene/sceneHost.ts`의 `renderFrame` |
| 화면 밖 렌더링 | `DefaultRenderingPipeline`(HDR, MSAA는 High 4x, Balanced 2x)이 장면을 render target에 그린 뒤 FXAA와 ACES tone mapping을 거쳐 canvas에 쓴다. High에서는 `SSAO2RenderingPipeline`도 쓴다. 플라즈마가 보일 때는 depth map도 render target에 그린다 | `src/scene/renderPipeline.ts` |
| Canvas 버퍼 | WebGL2는 `preserveDrawingBuffer: false`로 만들어서, 브라우저가 매 프레임 그린 버퍼를 compositor에 넘기고 다음 프레임은 새 버퍼에 그린다. WebGPU도 프레임마다 새 canvas texture에 그린다. 브라우저 쪽에서 이미 double buffer로 동작한다 | `src/scene/engineFactory.ts` |
| 크기 변경 | viewport에 붙인 `ResizeObserver`가 `engine.resize()`를 부른다. Babylon은 크기가 달라졌을 때만 canvas의 width와 height를 바꾼다 | `src/scene/sceneHost.ts`의 `resizeObserver` |

## 원인

### 빈 프레임

Canvas의 width나 height를 바꾸면 브라우저는 버퍼를 새로 만들고 이전 내용을 버린다. 앞뒤 버퍼가 모두 다시 만들어지므로 double buffer여도 직전 프레임이 남지 않는다. 새 버퍼는 투명해서 뒤에 있는 viewport 배경색(#0b0e12)이 그대로 보인다.

브라우저는 한 프레임을 다음 순서로 처리한다.

1. 입력 이벤트: `TreeDock`이 폭 state를 바꾼다.
2. requestAnimationFrame 콜백: Babylon이 이번 프레임을 그린다.
3. Style과 layout: viewport와 canvas의 CSS 크기가 바뀐다.
4. ResizeObserver 콜백: `engine.resize()`가 canvas 크기를 바꾸고, 이때 버퍼가 비워진다.
5. 화면 표시: 비워진 버퍼가 그대로 나간다.

그래서 폭이 바뀐 프레임마다 빈 프레임이 하나씩 화면에 나가고, 다음 프레임에야 새 크기로 다시 그려진다. 측정에서도 resize 횟수와 빈 프레임 수가 모든 실행에서 정확히 같았다.

`preserveDrawingBuffer: true`로 바꾸거나 버퍼를 하나 더 두어도 해결되지 않는다. 크기가 바뀌면 그 버퍼도 다시 만들어지기 때문이다. 문제는 버퍼 개수가 아니라, 크기를 바꾼 뒤 다시 그리기 전에 화면에 나가는 순서다.

### WebGL2 드래그 끊김

Resize할 때마다 canvas와 함께 화면 밖 render target(HDR MSAA, SSAO, depth map 등)을 새로 만든다. WebGL2에서는 이 재할당 때문에 resize한 프레임이 50 ~ 150 ms 걸리고, 드래그 중에는 초당 20 프레임 안팎으로 떨어진다. Resize를 하지 않으면 같은 드래그가 초당 50 프레임 안팎이다.

Balanced(SSAO 끔, MSAA 2x)로 낮춰도 resize한 프레임이 약 50 ms 걸렸다. 그래서 SSAO나 MSAA 4x만의 문제는 아니고, 어떤 재할당이 비싼지는 아직 모른다. WebGPU는 같은 파이프라인인데도 resize 비용이 거의 없다.

## 측정

`qa/flicker.mjs`로 쟀다. Dev server(`npm run dev`)를 띄운 상태에서 실행한다.

```
node qa/flicker.mjs <webgl2|webgpu> [current|frame|throttle|release|none] [high|balanced]
```

- `current`는 지금 코드 그대로다. 나머지는 페이지 안에서 resize 방식만 바꿔 끼운 것으로, 소스는 고치지 않는다.
  - `frame`은 아래 방안 A다.
  - `throttle`은 C3, `release`는 C1이다.
  - `none`은 resize를 아예 하지 않는 대조군이다.
- 결과는 `qa/out/flicker/<backend>-<방식>-<품질>/summary.json`에 남고, 빈 프레임은 8장까지 JPEG로 저장된다.
- 조건: 1920×1080 창, DPR 1, Chrome 148, RTX 4070 SUPER, Ubuntu 22.04, CCP chamber overview 시점.
- 드래그: tree 경계선을 0.6초 동안 왼쪽으로 70 px, 이어서 2초 동안 오른쪽으로 240 px 끈다(초당 약 120 px).
- 빈 프레임 세기(`blankFrames`): 브라우저가 실제로 화면에 내보낸 프레임을 CDP screencast로 모두 받는다. 그중 3D 영역의 60% 넘게 배경색에 가까운 프레임을 빈 프레임으로 센다.
- 같은 프레임에 다시 그렸는지(`resizeWithoutRenderInSameFrame`): 페이지 안에서 resize와 render가 어느 animation frame(`document.timeline.currentTime`)에 일어났는지 기록한다. 그리고 resize 뒤 같은 프레임 안에 다시 그리지 못한 횟수를 센다. 두 값은 모든 실행에서 같았다.
- 측정하는 브라우저는 실제 창이다. 실행 중에는 그 창 위에서 마우스를 움직이지 않아야 한다.
- WebGL2를 잴 때 다른 Chrome 창과 원격 접속 프로그램이 GPU를 7 ~ 38% 쓰고 있었다. 그래서 WebGL2 프레임 수는 두 번 잰 범위로 적었다. 빈 프레임 수는 이 영향을 받지 않는다.

빈 프레임 (resize 횟수 / 빈 프레임 수, WebGL2는 두 번 잰 값):

| 방식 | WebGL2 High | WebGPU High |
| --- | --- | --- |
| 지금 (ResizeObserver에서 resize) | 13 / 13, 18 / 18 | 57 / 57 |
| A. 그리기 직전에 resize | 20 / 0, 24 / 0 | 54 / 0 |
| C1. 놓을 때 한 번만 resize | 1 / 0, 1 / 0 | 재지 않음 |
| C3. 120 ms 또는 64 px 간격으로만 resize | 14 / 0, 21 / 0 | 재지 않음 |
| Resize 안 함 (대조) | 0 / 0 | 재지 않음 |

드래그 중 초당 프레임 (2.6초 드래그 동안 그린 프레임 수로 계산한 대략값):

| 방식 | WebGL2 High | WebGL2 Balanced | WebGPU High |
| --- | --- | --- | --- |
| 드래그 전 | 60 | 60 | 60 |
| 지금 | 20 ~ 27 | 재지 않음 | 61 |
| A | 20 ~ 22 | 24 | 59 |
| C1 | 30 ~ 54 | 재지 않음 | 재지 않음 |
| C3 | 16 ~ 26 | 재지 않음 | 재지 않음 |
| Resize 안 함 | 46 ~ 54 | 재지 않음 | 재지 않음 |

C1의 30은 드래그 전부터 프레임이 33 ms로 느렸던 회차다. 드래그 자체가 더한 비용은 없었다.

## 해결 방안

| 방식 | 깜빡임 | WebGL2 드래그 | Trade-off | 작업량 |
| --- | --- | --- | --- | --- |
| A. 그리기 직전에 resize | 없어짐 | 지금처럼 끊김 | 매 프레임 canvas 크기를 읽으면서 layout을 한 번 확정한다(이 앱에서는 무시할 수준). Resize 비용은 그대로다 | 작음 |
| B. ResizeObserver에서 resize 후 바로 다시 그리기 | 없어짐 | 더 끊김 | Resize한 프레임마다 두 번 그린다. WebGPU는 frame 시작과 끝을 직접 감싸야 하고, clock, LOD, 성능 측정도 두 번 돈다 | 작음 |
| C1. 끄는 동안은 resize하지 않고 놓을 때 한 번 | A와 함께 넣으면 없어짐 | 끊기지 않음 | 끄는 동안 3D 그림이 가로로 늘어나거나 눌리고 조금 흐려진다(1700 px 화면에서 200 px 끌면 약 12%). 놓는 순간 한 번 끊기면서 제 비율로 돌아온다 | 작음 |
| C2. 끄는 동안 tree를 3D 위에 겹쳐 보이고 놓을 때 반영 | A와 함께 넣으면 없어짐 | 끊기지 않음 | 끄는 동안 tree가 장면 일부를 가린다. 놓을 때 장면 중심이 한 번 옮겨 간다 | 중간 |
| C3. 일정 간격으로만 resize | A와 함께 넣으면 없어짐 | 거의 그대로 | WebGL2에서는 resize 한 번이 120 ms보다 오래 걸려서 120 ms 간격으로는 횟수가 거의 줄지 않았다. 간격을 늘리면 그사이 늘어나 보이는 정도가 커진다 | 작음 |
| D. Canvas를 창 크기로 고정하고 camera viewport만 옮김 | 없어짐 | 끊기지 않음 | Tree 밑까지 늘 그린다(기본 폭에서 약 14%, 560 px에서 약 41% 더). Picking, label, 측정 마커, QA 캡처 좌표를 모두 맞춰야 하고 tree 배경을 불투명하게 해야 한다 | 큼 |
| E. 끄는 동안만 품질 낮추기 | A와 함께 넣으면 없어짐 | 거의 그대로 | Balanced로 낮춰도 resize한 프레임이 약 50 ms라 효과가 작았다. 끄는 동안 화질이 떨어지고, 놓을 때 품질을 되돌리면서 한 번 더 재할당한다 | 작음 |

### A. 그리기 직전에 resize

- `sceneHost.ts`의 `ResizeObserver`를 지운다. 대신 `renderFrame` 맨 앞이나 `engine.onBeginFrameObservable`에서 `engine.resize()`를 부른다. Babylon의 `resize()`는 크기가 같으면 아무것도 하지 않으므로 매 프레임 불러도 된다.
- `world.resizeObserver` 필드와 dispose에서 부르는 `disconnect()`도 같이 정리한다.
- 숨은 탭에서는 render loop가 멈추지만, 돌아온 첫 프레임에서 크기를 다시 맞춘다. 창 크기 변경도 같은 경로로 처리된다.
- 깜빡임은 이것만으로 없어진다. WebGL2 끊김은 남는다.

### C1. 놓을 때 한 번 resize

- `TreeDock`이 드래그 시작과 끝을 store에 알린다(예: `layoutDragging`). SceneHost는 그동안 resize를 건너뛰고, 드래그가 끝나면 다음 프레임에 한 번 resize한다.
- A와 함께 넣어야 마지막 resize도 깜빡이지 않는다.
- 끄는 동안 canvas는 CSS 크기만 바뀌므로 브라우저가 기존 버퍼를 늘려서 보여 준다. 그동안 camera 비율이 맞지 않아 그림이 가로로 늘어나거나 눌린다.
- 위쪽 바의 tree 버튼, 접기 버튼, 키보드처럼 한 번에 바뀌는 경우는 드래그가 아니므로 바로 resize한다.

### C2. 끄는 동안 겹쳐 보이기

- 드래그 중에는 dock을 absolute로 띄워 viewport 위에 겹치고, 놓을 때 레이아웃에 반영한다.
- Tree 배경은 지금 70% 불투명이라 겹치는 동안 장면이 비친다. 불투명하게 바꾸는 편이 낫다.

### C3. 간격을 두고 resize

- A에 간격 조건(시간 또는 폭 차이)을 더한다. 드래그가 멈추면 마지막 크기로 한 번 더 맞춘다.
- WebGL2에서 효과를 보려면 간격이 resize 비용(50 ~ 150 ms)보다 충분히 길어야 한다. 그만큼 그사이 늘어나 보이는 정도가 커진다.

### D. Canvas 크기 고정

- Canvas를 창 전체 폭으로 두고 tree를 그 위에 겹친다. Tree 폭이 바뀌면 camera의 viewport나 projection offset만 바꿔서, 장면 중심이 보이는 영역 가운데에 오게 한다.
- 버퍼를 다시 만들지 않으므로 가장 매끄럽다. Resize는 창 크기가 바뀔 때만 한다.
- 고칠 곳: picking 좌표, label overlay, 측정 마커, QA 스크립트(`#pecvd-canvas` 스크린샷), e2e의 canvas 크기 확인.

### E. 끄는 동안 품질 낮추기

- 드래그 동안 Balanced 설정을 쓰거나 hardware scaling을 올렸다가, 끝나면 되돌린다.
- 측정상 Balanced로도 resize 비용이 크게 줄지 않아서, 어떤 재할당이 비싼지 먼저 알아야 쓸모를 판단할 수 있다.

### B. ResizeObserver에서 바로 다시 그리기 (권하지 않음)

- RO 콜백에서 `engine.resize()` 뒤에 `renderFrame()`을 한 번 더 부른다.
- 같은 프레임에 두 번 그려서 resize 프레임이 더 무거워진다. WebGPU는 render loop 밖에서 그리면 명령이 제출되지 않으므로 `beginFrame`과 `endFrame`으로 감싸야 한다. A가 더 단순하고 비용도 적다.

### 해결되지 않는 방법

- `preserveDrawingBuffer: true`: 크기가 바뀌면 이 설정에서도 내용이 지워진다. 매 프레임 버퍼를 맞바꾸는 대신 복사하게 되어 오히려 느려진다.
- 버퍼 추가(triple buffering, 별도 offscreen 버퍼): 이미 화면 밖 target에 그리고 있고 canvas도 double buffer다. 문제는 그리는 순서다.
- OffscreenCanvas와 worker: worker가 크기 변경과 그리기를 한 번에 처리하므로 깜빡임은 없어진다. 하지만 store, picking, label, 입력을 모두 worker 메시지로 옮겨야 해서 이 문제 하나로는 과하다.
- 배경색을 장면 색에 맞추거나 직전 프레임 사진을 뒤에 깔기: 빈 프레임을 덜 보이게 할 뿐이다.

## 추천 순서

1. A를 넣어 깜빡임을 없앤다.
2. WebGL2에서 드래그가 끊기는 것이 거슬리면 C1을 더한다.
3. 그래도 부족하면 D를 검토한다. C3와 E는 측정상 효과가 작았다.

## 작업할 때 확인할 것

- `node qa/flicker.mjs webgl2 current`와 `node qa/flicker.mjs webgpu current`에서 `blankFrames`와 `resizeWithoutRenderInSameFrame`가 0인지 본다.
- `tests/e2e/tree-dock.spec.ts`에 확인을 하나 더한다. 드래그 중 resize한 프레임 안에서 다시 그리는지 보는 것이고, 위 두 번째 지표와 같은 방법을 쓴다.
- 기본 화면의 canvas가 그대로 1686×992인지 확인한다. QA 캡처가 이 크기를 기준으로 한다.
- 창 크기를 바꿀 때, WebGPU가 실패해서 WebGL2로 넘어갈 때, 숨은 탭에서 돌아올 때도 크기가 맞는지 본다.
- WebGL2 resize가 왜 비싼지 아직 모른다. 즉 어떤 render target 재할당이 큰지 모른다. Chrome Performance 기록을 보거나 render target을 하나씩 끄고 재 보면, C1로 충분한지 D까지 가야 하는지 판단하기 쉽다.
