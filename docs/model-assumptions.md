# 물리 모델 가정

V1에는 물리 모델이 없다. 플라즈마 밀도, 전자 온도, 압력, 온도, 유량, 막 성장 같은 계산은 코드 어디에도 없다. 화면에 보이는 것은 다음 두 가지 중 하나다.

- 가정한 형상 (`docs/geometry-assumptions.md` 참고)
- 설명용 시각화(`render_source = "illustrative"`): 플라즈마 볼륨 셰이더, 점화/소멸 연출, 가스 흐름 화살표, 쉬스 개념 영역

## 이후 물리 모델과의 경계

백엔드에 둘 `PhysicsAdapter`(예정)는 다음 기능을 갖는다.

- `initialize(config, initialConditions)`
- 타입이 정해진 입력(이름, 물리량, 단위, 범위, 인과 방향)
- `advance(toSimTime)`
- `source`와 `model_version`이 붙은 출력
- `reset`, `dispose`
- 지원 기능 선언(체크포인트, 복원, 다중 인스턴스)

첫 구현은 Python으로 만든 집중 매개변수(lumped) 압력 모델과 1차 응답 모델이 될 수 있다(시간 간격 후보는 0.1초). 그다음 후보는 MATLAB Engine API for Python이나 Simulink에서 내보낸 FMU인데, 어느 쪽이든 쓰기 전에 버전, OS, 런타임 호환성을 먼저 확인한다.

물리 상태 하나는 모델 하나만 담당한다. 시각 효과는 모델 입력이나 센서 값에 영향을 주지 않는다. 모델이 제공하지 않는 값(플라즈마 밀도, 전자 온도, 공간 가스 분포, 막 두께)을 어댑터 출력인 것처럼 꾸며내지 않는다.

## 2026-11-12 확장 이후의 경계

Remote ICP PECVD, Rotary STI CMP, OHT가 추가되었지만 물리 모델은 여전히 없다. 유지하는 adapter 경계는 다음과 같다.

- DepositionModel: 입력(가스, 압력, 온도, RF)과 단위를 받아 FilmState를 내야 한다. 지금은 CCP와 Remote 모두 `IllustrativeFilmState`의 overcoat fraction만 timeline에서 바꾼다.
- CMPModel: incoming FilmState, pattern, recipe, consumables를 받아 제거와 평탄화 결과를 내야 한다. 지금은 overburden, surface oxide, SiN, trench oxide의 present fraction을 timeline으로 바꾸며 dishing, erosion, removal rate 수치를 만들지 않는다.
- MaterialTransferAdapter: carrier와 wafer location, handoff를 담당해야 한다. 지금은 scripted holder 전이만 있다.
- SensorAdapter: model이나 외부 source를 Channel observation으로 바꿔야 한다. 지금은 ChannelSourceBinding이 하나도 없다.

Trench fill mode는 external, recipe validation status는 assumed_demo다. density, stress, hydrogen content, removal rate 같은 물성은 생성하지 않는다. MATLAB, Simulink, FMU, ML 모델은 연결하지 않았다.
