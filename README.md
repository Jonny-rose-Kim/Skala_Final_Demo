# PECVD FAB Twin

300mm 단일 웨이퍼용 CCP(평행판) PECVD 공정 챔버를 브라우저에서 3D로 살펴보는 웹 앱입니다.
챔버 내부 구조와 플라즈마가 켜지고 꺼지는 모습을 단면, 투시, 분해 화면으로 볼 수 있습니다.

지금 버전(V1)은 프론트엔드만으로 동작합니다. 백엔드, 실제 센서 데이터, 물리 시뮬레이션은 아직 없고,
화면에 나오는 플라즈마는 이해를 돕기 위한 시각 효과일 뿐 물리 계산 결과가 아닙니다.

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
| `npm run validate:config` | 챔버 치수 설정 파일 검사 |

E2E 테스트와 `qa/` 폴더의 스크립트는 PC에 설치된 Google Chrome을 창으로 띄워서 실행합니다.
리눅스라면 화면이 있는 환경(DISPLAY 설정)에서 돌려야 합니다. 앱을 실행하는 데는 필요 없습니다.

부품 형상을 OBJ 파일로 내보내려면 `node --import tsx scripts/export-geometry-obj.ts`를 실행하세요.
결과는 `assets/exports/`에 저장됩니다.

## 사용법

- 마우스 왼쪽 드래그로 회전, 오른쪽 드래그(또는 Ctrl+드래그)로 이동, 휠로 확대/축소합니다.
- 부품을 클릭하면 오른쪽 패널에 설명, 재질, 치수, 연결된 부품이 표시됩니다.
- 위쪽 메뉴에서 보기 모드(조립, 단면, 투시, 분해), 카메라 위치, 화질을 바꿀 수 있습니다.
- 왼쪽 부품 목록에서 검색하거나 특정 부품을 숨길 수 있습니다.
- 오른쪽 아래에서 단면 각도, 투명도, 플라즈마 색과 밝기 등을 조절합니다.
- 아래쪽 타임라인에서 플라즈마 연출(꺼짐, 점화, 안정, 소멸)을 재생하거나 원하는 시점으로 옮길 수 있습니다.

센서 항목은 구조만 만들어 두었고 연결된 데이터가 없어서 "연결된 데이터 없음"으로 표시됩니다.

### URL 옵션

| 옵션 | 설명 |
| --- | --- |
| `?renderer=webgl2` | WebGPU 대신 WebGL2로 실행 |
| `?fixture=two-chambers` | 챔버 두 개를 띄우는 테스트 화면 |
| `?plasmaDebug=depth` | 플라즈마 깊이 처리 확인용 디버그 화면 |

## 폴더 구조

```
config/            챔버 치수, 장비 목록, 플라즈마 연출 타이밍 (JSON)
src/
  config/          치수 계산과 설정값 검증
  domain/          부품, 포트, 센서 정의
  geometry/        부품 3D 형상 생성
  materials/       재질, 텍스처, 환경광
  plasma/          플라즈마 셰이더 (GLSL, WGSL)
  scene/           엔진 초기화, 조명, 카메라, 렌더링
  interaction/     부품 선택, 라벨, 가스 흐름 표시
  presentation/    화면 상태, 단면 계산, 타임라인
  providers/       실행 모드 정의
  app/             React UI
scripts/           설정 검사, OBJ 내보내기
tests/             단위 테스트, E2E 테스트
qa/                스크린샷, 성능 측정 스크립트
docs/              설계 문서
```

## 문서

- `docs/architecture.md` 전체 구조와 상태 관리 방식
- `docs/geometry-assumptions.md` 챔버 구조와 치수 가정
- `docs/visual-design.md` 재질, 조명, 플라즈마 표현 방식
- `docs/data-contract.md` 부품/센서 데이터 구조와 이후 API 계획
- `docs/model-assumptions.md` 물리 모델 범위 (아직 구현하지 않음)
- `docs/status.md` 진행 상황, 테스트 결과, 성능 측정값
- `assets/ATTRIBUTIONS.md` 외부 자료 출처

## 참고

- 챔버 치수는 특정 장비의 실제 도면이 아니라 일반적인 구조를 바탕으로 정한 가정값입니다.
- 개발과 테스트는 Ubuntu 22.04, RTX 4070 SUPER, Chrome 148에서 했습니다.
- 리눅스용 Chrome은 기본 설정에서 WebGPU를 지원하지 않아 WebGL2로 실행됩니다.
  WebGPU로 보려면 Chrome을 `--enable-unsafe-webgpu --enable-features=Vulkan` 옵션으로 실행하세요.
- macOS와 Safari에서는 아직 테스트하지 않았습니다.
