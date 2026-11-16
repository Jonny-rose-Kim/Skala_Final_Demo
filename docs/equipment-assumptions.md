# 장비별 구조 근거와 가정

치수는 모두 `config/geometry/*.json`에 있고 `assumed`로 표시한다. 어느 값도 특정 제조사 도면이나 실측이 아니다. 아래에서 "근거"는 구조를 그렇게 잡은 이유이고 "가정"은 이 프로젝트가 임의로 정한 값이다.

## CCP PECVD (기존, 변경 없음)

구조와 치수는 `docs/geometry-assumptions.md` 그대로다. 이번에 추가한 것은 slit valve 바깥의 tool shell뿐이다.

- 가정: load lock 길이 200 mm, EFEM 길이 460 mm, enclosure 폭 900 mm, load port deck 높이 900 mm, FOUP seat는 EFEM 전면에서 220 mm. 내부 로봇은 없고 enclosure는 투시 모드에서도 불투명하다(simplified internal transfer).
- 계측 seed: 기존 5개 센서를 같은 ID로 유지하고 slit gate limit switch를 추가했다. viewport OES는 설치 후보로만 둔다.

## Remote ICP PECVD (`config/geometry/remote-icp-pecvd-300-v1.json`)

근거: ICP로 여기한 upstream 방전과 downstream precursor 투입 구조는 Park, Rhee(2004)와 Lucovsky(1989)의 remote PECVD 사례를 따른다. Oxford ICPCVD 자료는 ICP라는 이름만으로 remote 구조를 단정할 수 없다는 점을 확인하는 데 썼다. 구조만 참고했고 치수와 공정 조건은 가져오지 않았다.

- 방전관: quartz, 내경 100 mm, 벽 6 mm, 길이 280 mm. 관 끝은 금속 clamp로 잡는다.
- Coil: 구리관 지름 9.5 mm, 4 turn, pitch 36 mm, 관 외벽에서 10 mm 띄움. 관 내부나 wafer 위에는 금속 전극이 없다.
- Housing: 알루미늄, 내경 300 mm, 높이 330 mm. Source viewport는 225도 방향, OES 본체는 housing 밖.
- Transport section: 내경 100 mm, 길이 120 mm, flange 지름 180 mm. Lid 중앙 bore(130 mm)로 열린다. 60도 방향에 source pressure tap 후보가 있으나 기본 instance에는 설치하지 않았다.
- Precursor injection ring: 내경 360 mm, 단면 22 x 16 mm, 구멍 36개, lid 아래 205 mm 높이. RF를 걸지 않는 수동 분배 부품이다.
- Chamber: 내경 460 mm, 높이 250 mm. Stage 지름 340 mm, wafer 상면 105.8 mm. Substrate RF bias는 없다.
- 발광: 주 glow는 coil 구간 위아래 20 mm 여유까지만, afterglow는 transport section 안에서만 그린다. Wafer 위에는 glow slab을 만들지 않는다.
- Ion filter, Faraday shield, photon trap은 이 template revision에 없다.

계측(R-MP-01 ~ 09)은 `src/equipment/remote/measurement.ts`에 있다. 냉각 회로는 coil 전용이라고 가정했다.

## Rotary STI CMP (`config/geometry/sti-cmp-rotary-300-v1.json`)

근거: Applied Materials CMP 자료의 face-down polishing, backside downforce, post-polish clean과 dry 흐름, Reflexion LK의 window-in-pad endpoint, EBARA 자료의 pad, slurry, dresser 관계를 구조 참고로 썼다. 1 platen, 1 head는 seed이며 산업 표준 개수가 아니다.

- Platen 반지름 380 mm, 두께 50 mm, 상면 950 mm. Pad 두께 2.5 mm, 동심 groove pitch 4 mm.
- Head: housing 반지름 190 mm, retaining ring 내경 302 mm, 외경 380 mm, 두께 25 mm, membrane 반지름 150 mm, zone 반지름 60, 110, 150 mm. Polish 위치 x = -190 mm, load cup 위치 x = -640 mm(lateral 축 450 mm).
- 접촉: head lift가 -67.5 mm일 때 wafer frontside 면이 pad 상면과 일치한다. Load cup pick은 -110 mm.
- Conditioner: pivot (450, 320) mm, arm 420 mm, disc 반지름 50 mm. Sweep 0 ~ 0.5 rad에서 disc가 pad 위에 있고, park 각도(계산값 약 0.93 rad)에서 pad 밖이다. 기본 demo는 head가 물러난 뒤의 ex-situ conditioning이다.
- Slurry nozzle: (50, -140) mm, pad 위 head footprint 밖. Point-of-use flow meter는 nozzle 직전 line.
- Optical endpoint: pad window가 반지름 190 mm 궤도에 있고 optical head는 platen 안 같은 위치. 고정 source와 detector module은 platen 축 아래의 rotary optical interface로 잇는다(simplified optical interface).
- Dry loading: alcove(x -860 ~ -420 mm)와 상부 sliding hatch. Wafer는 alcove 안에서 face-down으로 뒤집혀 load cup에 놓인다고 가정한다. 연마 후에는 wet transfer 안에서 face-up으로 돌아온다고 가정한다.
- Clean module은 brush roller 2개와 rinse nozzle, dry module은 spin chuck과 bowl이다. 둘 다 별도 asset이다.

계측(C-MP-01 ~ 12)은 `src/equipment/cmp/measurement.ts`에 있다. zone과 ring pressure는 regulator outlet의 gauge 압력이며 contact pressure map이 아니다. Endpoint의 raw spectrum, endpoint indicator, thickness estimate는 role이 다른 세 channel이다.

## OHT (`config/geometry/oht-bay-v1.json`)

근거: Muratec과 Daifuku 자료의 rail vehicle, hoist, FOUP, load port 관계만 참고했다. SEMI E84는 범위 확인용이며 구현하지 않았다.

- Rail: z -5.2 ~ 5.6 m, 아랫면 높이 2.9 m, hanger 간격 1.2 m, 천장 3.4 m.
- Vehicle body 0.50 x 0.42 x 0.80 m, bogie 2개, 전방과 하강 obstruction sensor 1개.
- Hoist: belt 4개, stroke 1.5 m, retracted pose에서 gripper plate 하면 2.38 m, finger 하단 2.31 m.
- Gripper: finger open gap 170 mm, closed gap 100 mm(FOUP flange 120 mm 아래로 들어감).
- FOUP: 0.44 x 0.34 x 0.42 m, flange 120 x 12 x 120 mm, neck 40 mm, slot 25. 운반 중 닫혀 있다.
- Bay: load port seat 3개 모두 x = -1.297 m 선 위에 있고 높이 0.9 m라서 travel과 hoist만으로 닿는다. Lateral 공차 6 mm. `npm run validate:config`가 station별 s, lateral, hoist extension을 출력한다.

계측(O-MP-01 ~ 08)은 `src/equipment/oht/measurement.ts`에 있다. Scripted travel, hoist, gripper 값은 Preview status이며 encoder와 switch channel은 비어 있다.
