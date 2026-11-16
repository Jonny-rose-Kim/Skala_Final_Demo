# 시각 설계

재질, 조명, 플라즈마 표현, 보기 모드, 화질 설정을 정리한 문서다.

## 재질 (`src/materials/materialLibrary.ts`)

metallic-roughness 방식 PBR 재질을 씬 전체에서 공유한다.

| 이름 | 사용 부품 | 표현 |
| --- | --- | --- |
| `aluminum_machined` | 몸체, 리드, 플랜지, 샤워헤드, 페데스탈, 스템 | albedo 0.86, metallic 1, roughness 0.36. 가는 선반 가공 자국 normal map을 쓰고, UV를 미터 단위로 잡아서 가공 자국이 회전 방향을 따라간다. metallic 텍스처의 G 채널로 roughness에 변화를 준다 |
| `aluminum_anodized` | 라이너, 펌핑 배플 | 더 어둡고 roughness 0.62, 가공면 normal map |
| `stainless` | 배관, 밸브, 피팅, 샤프트, 벨로즈 | roughness 0.30, 가는 헤어라인 normal map |
| `painted_housing` | 매칭 네트워크, 가스 패널, 펌프, RF 발생기, 프레임 | 비금속 회색(0.62), roughness 0.5 |
| `ceramic` | 아이솔레이터 링, 부싱, 에지 인슐레이터, 에지 링, 리프트 핀, 가스 절연관 | 살짝 누런 흰색, 미세한 반점 normal map |
| `quartz` | 뷰포트 창 | 알파 0.28 블렌딩, roughness 0.04, IOR 1.46 |
| `silicon_wafer` | 웨이퍼 | 어두운(0.17) 연마 금속 느낌, roughness 0.18. IBL은 페이스플레이트가 천장을 가리는 것을 반영하지 못해서 환경광 세기를 낮췄다 |
| `copper`, `nichrome`, `dark_steel` | RF 스트랩, 히터 발열체, 볼트/소켓/케이블 | 기본값 |
| 단면 캡 | 단면 보기의 잘린 면 | albedo × 0.3, roughness 0.85, 비금속 |

투시 재질은 처음 필요할 때 기본 재질을 복제해서 만들고 캐시해 둔다(알파 블렌딩, depth pre-pass, bump/roughness 텍스처 제거). 불투명도는 화면 설정 값이다.

## 조명 (`src/scene/lighting.ts`, `src/materials/environment.ts`)

- IBL: 클린룸을 흉내 낸 RGBE 파노라마(천장 조명 패널 격자, 무채색 벽, 어두운 바닥)를 메모리에서 만들고 `HDRCubeTexture`로 prefilter한다. 환경광 세기는 외관 조명일 때 0.75, 내부 관찰 조명일 때 0.9다.
- 주광은 directional light이고 PCF 그림자를 쓴다(그림자 맵 2048/1024, `forceBackFacesOnly`, bias 0.0015, normal bias 0.02). 보조광으로 hemispheric light를 더한다.
- 내부 관찰 프리셋에서는 카메라를 따라다니는 point light(헤드램프)를 추가하고 주광을 줄인다.
- 플라즈마가 주변 표면을 비추는 효과는 볼륨 중심에 둔 point light로 표현한다. 세기는 시나리오 세기와 glow 값에 비례하고, 색은 프리셋의 중심 색을 쓰며, 가까운 내부 메시에만 적용된다. 복사 전달을 계산한 것이 아니라 조명으로 근사한 것이다.
- 후처리: `DefaultRenderingPipeline`(HDR)에 FXAA, MSAA, ACES 톤 매핑을 적용하고 노출 0.88, 대비 1.05로 맞췄다. 블룸, 렌즈 플레어, 모션 블러, 색수차, 피사계 심도는 기본으로 꺼 두었다. High 화질에서는 약한 SSAO2(geometry buffer 기반)를 켠다.
- 배경: 조명 영향을 받지 않는 배경 구를 두어 WebGL2와 WebGPU에서 톤 매핑된 배경 색이 똑같이 나오게 했다.

## 플라즈마 볼륨 (`src/plasma/**`)

- 프록시 원기둥: 반지름은 전극 반지름에 halo 여유를 더한 값이고, 높이는 전극 간격과 정확히 같다. 그래서 웨이퍼나 페이스플레이트와 겹치지 않는다.
- 안쪽 면만 그린다(면 방향을 뒤집고 back-face culling). 깊이 테스트와 깊이 쓰기는 끄고, premultiplied alpha로 블렌딩하며, `alphaIndex -10`으로 유리나 투시 외피보다 먼저 그린다.
- 프래그먼트 셰이더는 광선과 원기둥의 교차를 수식으로 구해 [t0, t1] 구간을 얻는다. 카메라가 볼륨 안에 있을 때를 위해 `t0 = max(t0, 0)`으로 두고, `t1 = min(t1, opaqueDepth / cos)`로 불투명 물체 뒤쪽을 잘라낸다. opaqueDepth는 `DepthRenderer`가 불투명 메시의 카메라 공간 Z만 기록한 값이다(투명 외피, 유리, 보조 표시, 플라즈마 자신은 제외). 샘플 수는 고정이고(High 48, Balanced 24), 픽셀마다 interleaved gradient noise로 시작 위치를 조금씩 흔든다. 시간에 따라 바뀌는 난수는 쓰지 않는다.
- 밀도: 반지름 방향으로 부드럽게 옅어지고(edge softness), 축 방향으로는 양쪽 전극 근처에 어두운 쉬스 띠가 있다(`sheathFraction`, 개발자 설정). 가장자리를 약간 밝게 하고, 3D value noise `f(position, time, seed)`로 변화를 준다.
- 단면: 계산된 제거 구간을 샘플마다 `atan2`로 판정하므로 형상의 단면 캡과 정확히 맞는다.
- GLSL(WebGL2)과 WGSL(WebGPU) 코드는 uniform 의미가 같다. WGSL을 직접 작성했기 때문에 twgsl WASM을 내려받지 않아도 된다. 두 백엔드에서 결과가 같다는 것은 QA 스크린샷으로 확인했다.
- 사용자 패널에서 조절하는 값: 표시 여부, glow 세기, 불투명도, 색 프리셋(겉모습으로 이름 붙임), edge softness, 공간 변화, 애니메이션 속도, 시드, 플라즈마 조명 켜기/끄기. 개발자 설정으로 sheath fraction과 halo margin이 있다. 물리량 이름을 붙인 파라미터는 없다.
- `render_source = "illustrative"`이고, Inspector의 플라즈마 항목에 이 사실과 연출 시퀀스 출처를 보여준다.

## 시나리오 (`config/visual/illustrative-cycle-v1.json`)

| 구간 | 시간 | 내용 |
| --- | --- | --- |
| 꺼짐 | 0–1.5초 | |
| 점화 연출 | 1.5–4초 | 정해진 패턴으로 몇 번 깜빡인 뒤 밝아짐 |
| 안정 | 4–14초, 이후 Extinguish를 누를 때까지 유지 | ±2.5% 범위에서 천천히 변함 |
| 소멸 연출 | 14–16.5초 | 서서히 어두워지다가 마지막에 약하게 깜빡이며 꺼짐 |
| 꺼짐 | 16.5–18초 | |

앱을 열면 꺼짐과 점화를 거쳐 안정 상태가 되고, 안정 구간 끝(13.999초)에서 재생 위치가 멈춘다. 그 뒤로는 안정 상태가 계속 유지되며, 플라즈마 노이즈와 느린 밝기 변화도 계속 움직인다. 부품을 보는 동안 플라즈마가 꺼지지 않게 하려는 것이다. Extinguish 버튼을 누르면 소멸 연출로 넘어가고, 끝까지 재생된 뒤 꺼진 상태로 멈춘다. 반복 재생은 하지 않으며, Play나 Restart를 누르면 다시 처음부터 시작한다. Extinguish 버튼은 안정 구간에서만 누를 수 있다.

타임라인에서 재생, 일시정지, 처음부터 다시, 위치 이동, 구간 바로가기, 배속을 지원한다. 단계와 밝기는 재생 위치로, 노이즈는 효과 시간(재생 위치 + 유지한 시간)으로 계산한다. 위치를 옮기거나 처음부터 다시 하면 유지 시간이 0으로 돌아가므로 같은 위치는 항상 같은 화면이 된다.

## 보기 모드

| 모드 | 구현 |
| --- | --- |
| 조립 (Assembled) | 외피는 불투명하다. 내부는 뷰포트 창으로 보이고, 플라즈마는 깊이 텍스처 덕분에 가려야 할 곳에서 가려진다 |
| 단면 (Cutaway) | 구간 형상 재생성과 단면 캡(90ms 디바운스), 방위각 기준 숨김, 플라즈마 셰이더의 같은 구간 잘라내기. 방위각과 각도 폭을 조절할 수 있고 포트 위치에 맞춰 경계를 보정한다 |
| 투시 (X-ray) | 외피 부품을 인스턴스별 투명 재질로 바꾼다. 내부와 플라즈마가 보이고 불투명도를 조절할 수 있다 |
| 분해 (Exploded) | 부품별 transform node에 표시용 오프셋을 준다(분해 정도 0–1). 플라즈마, 가스 배관, RF 스트랩, 동축 케이블은 숨긴다. 0으로 돌리면 정확히 원래 위치로 돌아온다 |
| 부품 관찰 | Focus(부품 범위로 카메라 이동), 단독 표시, 숨기기/보이기, 하이라이트(플라즈마와 보조 표시는 stencil에서 제외) |

카메라 프리셋은 전체 보기, 측면 단면, 웨이퍼 근접, 샤워헤드 아랫면(분해 상태에서 들어 올린 페이스플레이트 아래에 카메라를 둠), 분해 보기가 있다.

## 화질

| 프리셋 | 최대 DPR | MSAA | 플라즈마 샘플 수 | 그림자 맵 | SSAO |
| --- | --- | --- | --- | --- | --- |
| High | 2.0 | 4 | 48 | 2048 | 켬 |
| Balanced | 1.25 | 2 | 24 | 1024 | 끔 |

Auto 모드는 프레임 시간 이동 평균(EMA)이 2.5초 동안 26ms를 넘으면 Balanced로, 6초 동안 11ms 아래면 High로 바꾼다. 전환은 8초에 한 번까지만 하고, 250ms가 넘는 멈춤은 계산에서 뺀다. 프리셋을 바꿔도 셰이더나 GPU 리소스를 다시 만들지 않고 uniform 값과 렌더 타깃 크기만 바꾼다.

## 보조 표시 (선택)

- 가스 흐름: 조명 영향을 받지 않는 가는 관과 화살표 콘이 `presentation_time`에 맞춰 움직인다. 공급관 구멍, 페이스플레이트, 페데스탈 가장자리, 배플 슬롯, 배기 포트 같은 실제 통로를 따라가지만 어디까지나 개념도다.
- 부품 라벨: DOM으로 그린다. 겹치면 우선순위가 낮은 라벨을 숨기고, 낮은 주기로 광선을 쏴서 부품에 가려졌는지 확인한다.
- 쉬스 개념 영역: 양쪽 전극 근처에 반투명 링을 그린다. 계산한 경계가 아니라 개념을 보여주는 표시라고 명시한다.

## 2026-11-12 확장: 추가된 재질과 효과

- 재질 preset 추가: painted_dark, polymer_pad(groove가 있는 polyurethane pad), polymer_white(PPS, PEEK 계열 부품), rubber_membrane, foup_polymer, safety_marking, belt_fabric. `src/materials/materialLibrary.ts`.
- Remote source glow: CCP와 같은 ray-march shader를 discharge tube 내부 bounds로 그린다. transport section의 afterglow는 같은 shader를 낮은 강도로 한 번 더 쓰며 toggle로 끈다. wafer 위에는 glow가 없다.
- CMP: slurry stream(얇은 tube), pad 위 film(반투명 disc), optical path(선)와 footprint(disc). footprint는 window가 wafer 아래에 있을 때만 보인다.
- OHT: belt는 길이를 scale로만 바꾼다. rail frame overlay는 station seating 영역과 접근점, travel 0 m 표시를 그린다.
- 계측 marker: instrument body는 호박색 구, measurement point는 청록색 diamond, optical path는 초록 선. marker는 센서 형상이 아니다.
- 단면: 회전 부품은 각자 축 기준으로 같은 방위의 sector를 제거한다. 단면 중에는 자전 표시를 멈춘다.
- Bay overview는 장비 윤곽과 라벨을 우선하고 비활성 장비는 plasma step 수를 줄인다.
