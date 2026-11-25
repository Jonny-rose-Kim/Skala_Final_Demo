# PECVD FAB Twin

반도체 FAB의 작은 bay 하나를 브라우저에서 3D로 살펴보는 웹 앱입니다. 300 mm 단일 웨이퍼용 CCP(평행판) PECVD 챔버, Remote ICP PECVD, Rotary STI CMP, 그리고 FOUP을 나르는 OHT가 한 장면에 들어 있습니다. 각 장비의 외장과 내부 구조, 웨이퍼를 옮기는 robot과 load lock, 센서가 어디에서 무엇을 재는지, 그리고 증착한 웨이퍼가 FOUP과 OHT를 거쳐 CMP로 가는 흐름을 볼 수 있습니다.

증착 장비는 FOUP에서 EFEM robot, load lock, 진공 blade를 거쳐 chamber로 웨이퍼를 넣고 같은 길로 꺼냅니다. CMP는 dry robot, flip station, wet robot, load cup, head, cleaner, spin dryer를 거쳐 마른 웨이퍼만 FOUP로 돌려보냅니다. 바닥 타일, 천장 FFU, 벽, 후면 utility 같은 bay 배경도 있습니다.


## 기술 스택

- React 19, TypeScript, Vite 8
- Babylon.js 9.34 (WebGPU를 먼저 시도하고, 지원하지 않으면 WebGL2로 실행)
- Tailwind CSS 4, Zustand 5, Lucide
- 테스트: Vitest, Playwright

## 실행 방법

Node.js 22.12 이상이 필요합니다. nvm을 쓴다면 `nvm use`로 맞출 수 있습니다.

```bash
git clone https://github.com/Jonny-rose-Kim/Skala_Final_Demo.git
cd Skala_Final_Demo
npm ci
npm run dev
```

실행 후 브라우저에서 http://localhost:5173 에 접속하면 됩니다.

## 명령어

| 명령어 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 실행 (5173 포트) |
| `npm run build` | 타입 검사 후 `dist/`에 빌드 |
| `npm run preview` | 빌드 결과 확인 (4173 포트) |
| `npm run typecheck` | 타입 검사 |
| `npm test` | 단위 테스트 |
| `npm run test:e2e` | E2E 테스트 (WebGL2, WebGPU 각각 실행) |
| `npm run validate:config` | 장비 치수 설정, 템플릿, 계측 정의, bay 배치 검사 |


부품 형상을 OBJ 파일로 내보내려면 `node --import tsx scripts/export-geometry-obj.ts`를 실행하세요.
결과는 `assets/exports/`에 저장됩니다.

## 사용법

- 마우스 왼쪽 드래그로 회전, 오른쪽 드래그(또는 Ctrl+드래그)로 이동, 휠로 확대/축소합니다.
- 위쪽의 Overview 버튼은 bay 전체(네 장비와 rail)를 보여 주고, 그 옆 목록에서 장비를 고르면 그 장비의 상세 화면으로 갑니다. 3D 화면에서 다른 장비를 클릭해도 바뀝니다.
- 부품을 클릭하면 3D 화면에서 테두리가 빛나고 왼쪽 component tree에서도 같은 부품이 선택됩니다. 위쪽 Focus 버튼을 누르면 카메라가 그 부품으로 갑니다.
- 왼쪽 component tree는 오른쪽 경계선을 끌어서 폭을 바꿀 수 있습니다. 경계선을 왼쪽 끝까지 밀거나 tree 제목 옆의 접기 버튼을 누르면 화면 왼쪽 가장자리의 얇은 줄로 접힙니다. 그 줄을 누르거나 오른쪽으로 끌면 다시 펼쳐지고, 경계선을 더블클릭하면 기본 폭으로 돌아갑니다. 폭은 저장하지 않아서 새로고침하면 기본 폭으로 돌아옵니다.
- 보기 모드(조립, 단면, 투시, 분해)와 카메라 preset은 장비마다 다릅니다. 단면은 가상 관찰이고 분해는 표시용 오프셋입니다.
- 위쪽의 FOUP section 버튼을 누르면 FOUP의 뒤쪽 절반이 잘려 안쪽의 slot과 웨이퍼가 보입니다. 어떤 장비를 보고 있어도 적용되고, 화면 왼쪽 위에 웨이퍼가 몇 장 들었는지와 25칸 slot map이 나옵니다. 그 상자의 FOUP 보기 버튼을 누르면 카메라가 잘린 쪽에서 FOUP을 비춥니다. 장비 목록에서 FOUP을 고르면 Cutaway와 X-ray도 FOUP에 적용됩니다. 지금 시연의 lot에는 W-01 한 장(slot 13)만 있어서, 웨이퍼가 장비 안에 있는 동안에는 FOUP이 비어 있는 것으로 나옵니다.
- 점검용 cover는 고른 장비에서만 떼어져 안쪽 robot이 보입니다. 문이나 gate가 열리는 것과는 상관없습니다. 천장과 벽은 카메라 위치에 따라 저절로 숨겨집니다.
- 아래쪽 타임라인에서 시나리오를 고릅니다. 장비별 단독 시연(CCP와 Remote는 plasma만 보는 것과 웨이퍼 handling까지 보는 것 두 가지), CMP 전체 흐름, OHT 반송, 그리고 증착 장비를 CCP 또는 Remote 중에서 고르는 연결 시연 Route A, B가 있습니다. Play, Pause, Restart, 위치 이동이 되고, 연결 시연에서는 Follow를 켜면 단계에 따라 장비와 카메라가 따라갑니다.

센서 항목은 계측기 본체, 측정 위치, 채널, 데이터 연결을 나누어 정의해 두었고, 연결된 데이터가 없어서 모든 채널이 Data unbound 상태입니다.

### URL 옵션

| 옵션 | 설명 |
| --- | --- |
| `?renderer=webgl2` | WebGPU 대신 WebGL2로 실행 |
| `?fixture=two-chambers` | CCP 챔버 두 개를 띄우는 테스트 화면 |
| `?fixture=two-remotes`, `?fixture=two-cmps` | Remote 두 개, CMP 두 개 테스트 화면 |
| `?plasmaDebug=depth` | 플라즈마 깊이 처리 확인용 디버그 화면 |

## 폴더 구조

```
config/            장비 치수, bay 배치, bay 배경, 플라즈마와 handling 연출 타이밍 (JSON)
src/
  config/          CCP 치수 계산과 설정값 검증
  domain/          부품, 포트, 계측 계약, carrier와 route, 템플릿 레지스트리
  equipment/       장비별 모듈 (ccp, remote, cmp, oht, foup, routes, handling)
  geometry/        부품 3D 형상 생성 (기존 CCP 생성기와 공유 생성기)
  materials/       재질, 텍스처, 환경광
  plasma/          플라즈마 셰이더 (GLSL, WGSL)
  scene/           엔진 초기화, 조명, 카메라, 범용 장비 instance, 계측 marker, bay 배경
  interaction/     부품 선택, 라벨, 경로 overlay
  presentation/    화면 상태, 단면 계산, 타임라인, PreviewState, 시나리오 등록
  providers/       실행 모드 정의
  app/             React UI
scripts/           설정 검사, OBJ 내보내기
tests/             단위 테스트, E2E 테스트
qa/                스크린샷, 성능 측정 스크립트와 뷰 목록
docs/              설계 문서
```

## 문서

- `docs/expansion-spec.md` 이번 확장(Remote, CMP, OHT)의 실제 구현 명세
- `docs/architecture.md` 전체 구조와 상태 관리 방식
- `docs/geometry-assumptions.md` CCP 챔버 구조와 치수 가정
- `docs/equipment-assumptions.md` handling station, Remote, CMP, OHT, FOUP의 구조 근거와 치수 가정
- `docs/sensor-crosswalk.md` DB 시계열 열과 앱 안 계측 모델의 대응표
- `docs/data-contract.md` 부품, 계측, carrier 데이터 구조와 버전
- `docs/scenarios.md` 시나리오, clock, identity 규칙
- `docs/visual-design.md` 재질, 조명, 플라즈마 표현 방식
- `docs/model-assumptions.md` 물리 모델 범위 (아직 구현하지 않음)
- `docs/status.md` 진행 상황, 테스트 결과, 성능 측정값
- `docs/flickering_solutions.md` tree 폭을 바꿀 때 3D 화면이 깜빡이는 원인과 해결 방안 (후속 작업)
- `assets/ATTRIBUTIONS.md` 외부 자료 출처
