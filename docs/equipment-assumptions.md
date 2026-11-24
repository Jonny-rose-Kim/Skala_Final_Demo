# 장비별 구조 근거와 가정

치수는 모두 `config/geometry/*.json`에 있고 `assumed`로 표시한다. 어느 값도 특정 제조사 도면, 실측, 공정 조건이 아니다. 아래에서 "근거"는 구조를 그렇게 잡은 이유이고 "가정"은 이 프로젝트가 임의로 정한 값이다.

## 공통 wafer handling station (CCP, Remote)

CCP와 Remote는 같은 station 모듈(`src/equipment/handling/`)을 쓴다. 순서는 FOUP, EFEM 대기 robot, load lock, 진공 transfer blade, slit valve, chamber다. CCP에서 Remote로 이어지는 직렬 경로는 없다.

- Load port: deck 깊이 440 mm, 높이 900 mm. Dock plate가 30 mm 밀어 FOUP door 면을 EFEM opening에 붙인다. Door opener는 FOUP door를 60 mm 당긴 뒤 340 mm 내린다. Opening은 360 x 300 mm. Opening이 뚫린 frame plate는 EFEM 앞벽과 같은 면에 있어서 dock한 FOUP의 앞 테두리가 plate 앞 2 mm에서 멈춘다. Door를 내리는 guide rail 두 개는 opening 양옆 바깥, 당긴 door와 같은 깊이(door opener 구역 80 mm 안)에 있다. 처음에는 rail 하나를 opening 가운데 뒤쪽에 세웠는데, robot이 FOUP로 손을 넣는 길과 대기 자세의 link가 그 rail을 지나가서 옮겼다.
- HMI: EFEM 앞면 operator 쪽 swing arm. 화면은 load port deck 폭 바깥에 있어서 OHT가 FOUP를 들어 올리는 수직 공간을 막지 않는다.
- EFEM: 깊이 840 mm, 폭 1100 mm, 높이 2.0 m, 위에 180 mm FFU. Panel은 점검용 cover이며 cover 제거와 door 열림은 다른 상태다.
- 대기 robot: 바닥형 SCARA. Base, Z column(stroke 380 mm), link 1, link 2(각 280 mm), wrist, backside fork end effector가 각각 joint와 component다. Fork tine은 FOUP slot rib과 load lock support pin 사이로 지나가도록 안쪽 88 mm, 바깥쪽 118 mm 사이에 있다. 회전할 때는 wafer를 robot 축 위로 당겨 swing 반지름을 줄인다.
- Load lock: 길이 440 mm, 폭 500 mm. 300 mm wafer, support pin 4개(지름 6 mm), 2단 blade, 대기 door gate의 후퇴 공간이 들어가는지 config validation이 확인한다. 이전의 200 mm block은 이 조건을 만족하지 못해 바꿨다.
- 대기 door와 slit valve는 동시에 열리지 않는다. Pump-down과 vent는 scripted 단계이며 압력 관측을 만들지 않는다.
- Slit valve: gate는 load lock 쪽 면에서 slit을 막고, 열릴 때 body 아래 bonnet 안으로 내려간다. Bonnet과 actuator는 chamber 바닥 flange 바깥 반지름에 매달린다. 처음에는 gate가 chamber 쪽에 있었고 bonnet과 gate rod가 바닥 flange 안으로 들어갔다(Remote는 flange가 slit 바로 아래까지 나와 있어서 chamber 쪽 gate로는 피할 수 없었다).
- 진공 blade: 2단 telescopic(1단 carriage, 2단 blade), 두께 3 mm. Guide rail과 actuator housing이 load lock 안에 있고 slit valve를 지날 때만 gate가 열려 있다.
- Pedestal(CCP)은 transfer 위치를 100 mm에서 70 mm로 낮추고 lift pin stroke를 44 mm로 늘렸다. Remote stage는 process 105 mm, transfer 50 mm, pin stroke 37 mm다. Blade가 stage에 닿지 않게 하려는 값이다.
- Lift pin 구동부(lift hoop)는 그리지 않는다. Pin과 함께 움직이는 hoop는 stroke 끝에서 pedestal 속으로 들어가고, 내린 pedestal 아래에는 hoop가 들어갈 높이가 없다(CCP 25 mm, Remote 10 mm).
- Z 방향 인계: robot이 slot 아래에서 올라가며 wafer를 들고, support pin 위에 내려놓고 내려간다. Blade와 lift pin도 같은 방식이다. Holder는 접촉 높이를 지나는 순간 바뀐다.

## CCP PECVD (`config/geometry/ccp-pecvd-300-v1.json`, v1.3.0)

Chamber 내부 구조와 치수는 `docs/geometry-assumptions.md` 그대로다. 외부에 process enclosure, HMI, 점검 panel, 관찰창, 가스·RF·배기 facility interface plate를 붙였다.

계측 seed는 기존 센서 ID를 그대로 둔다. Slit gate limit switch가 있고 viewport OES는 설치 후보로만 둔다. 자세한 대응은 `docs/sensor-crosswalk.md`.

## Remote ICP PECVD (`config/geometry/remote-icp-pecvd-300-v1.json`, v1.1.0)

근거: ICP로 여기한 upstream 방전과 downstream precursor 투입 구조는 Park, Rhee(2004)와 Lucovsky(1989)의 remote PECVD 사례를 따른다. Oxford ICPCVD 자료는 ICP라는 이름만으로 remote 구조를 단정할 수 없다는 점을 확인하는 데 썼다. 구조만 참고했고 치수와 공정 조건은 가져오지 않았다.

- 방전관: quartz, 내경 100 mm, 벽 6 mm, 길이 280 mm. 관 끝은 금속 clamp로 잡는다.
- Coil: 구리관 지름 9.5 mm, 4 turn, pitch 36 mm, 관 외벽에서 10 mm 띄움. 관 내부나 wafer 위에는 금속 전극이 없다.
- Housing: 알루미늄, 내경 300 mm, 높이 330 mm. Source viewport는 225도 방향, OES 본체는 housing 밖. 점검 보기에서 housing cover를 떼면 coil과 관이 보인다.
- Transport section: 내경 100 mm, 길이 120 mm. 60도 방향 source pressure tap은 후보로만 둔다.
- Precursor injection ring: 내경 360 mm, 구멍 36개. RF를 걸지 않는 수동 분배 부품이며 CCP showerhead처럼 보이지 않게 단면을 작게 했다.
- Source gas와 precursor는 다른 panel, 다른 line이다. 새 bias, ion filter, Faraday shield는 넣지 않았고 power, match, 센서를 중복해 만들지 않았다.
- 발광: 주 glow는 관 안 coil 구간, afterglow는 transport section 안에서만 그린다. Wafer 위에는 glow slab을 만들지 않는다.
- Liner: 바닥 1 mm 위에서 242 mm까지. Slit(60 ~ 110 mm)과 배기 port(4 ~ 64 mm)가 모두 liner 높이 안에 들어가고 각각 liner에도 구멍이 있다. 이전 liner는 60 mm에서 시작해서 slit 바닥과 높이가 같았고, 그래서 slit 구멍이 빠진 채 그려져 blade와 wafer가 liner 벽을 지나갔다.

## Rotary STI CMP (`config/geometry/sti-cmp-rotary-300-v1.json`, v1.1.0)

근거: Applied Materials CMP 자료의 face-down polishing, post-polish clean과 dry 흐름, Reflexion LK의 window-in-pad endpoint, EBARA 자료의 pad, slurry, dresser 관계를 구조 참고로 썼다. 1 platen, 1 head는 seed이며 산업 표준 개수가 아니다. Polishing 부분(platen, head, conditioner, slurry, optical endpoint)의 치수는 v1.0.0과 같다.

Front end는 새로 만들었다. 이전에는 wafer가 FOUP slot에서 load cup으로 바로 옮겨졌다.

- Dry EFEM: 깊이 840 mm. Backside fork를 가진 바닥형 dry robot이 FOUP와 transfer tower 사이를 오간다. Dry robot은 dry wafer만 잡는다.
- Transfer tower(EFEM 뒷벽에 걸침): 아래가 spin dryer, 위가 flip station이다. Flip station은 jaw 두 개로 wafer edge를 잡은 상태에서만 180도 돈다(face up에서 face down).
- Wet robot: 지붕 beam 두 개에 Z housing을 얹은 overhead SCARA다. Column이 아래로 내려오고 link 1, link 2, wrist drop post, 밀봉 roll actuator, edge-grip fork가 차례로 매달린다. Fork는 tip stop과 pusher로 wafer edge를 clamp하고, clamp한 상태에서만 roll 축으로 뒤집는다. 처음 만든 바닥형은 wrist drop post가 회전 자세에서 자기 column을 지나가는 문제가 있어 overhead로 바꿨다. Overhead이면 robot 축 아래에 아무것도 없어서 wafer를 축 아래로 당겨 돌리고 뒤집을 수 있다.
- Load cup: edge pin 3개(30, 150, 270도, 높이 20 mm). Wet robot fork가 pin 사이로 지나가며 alcove 옆 opening으로 들어간다. Head는 위쪽 hatch로 wafer를 집는다.
- Brush cleaner: 위아래 PVA brush roller 한 쌍, edge drive roller 두 조, rinse nozzle, drain, shutter가 있는 opening.
- End-effector rinse station: dirty-wet wafer를 옮긴 wet robot fork를 DIW로 헹구는 box. 이 단계를 지난 뒤에만 clean-wet wafer를 잡는다(clean-ready 상태는 presentation flag).
- Spin dryer: vacuum chuck이 bowl 안으로 60 mm 내려가 돈다. Wet robot은 wet side shutter로 넣고, dry robot은 EFEM 쪽 dry side shutter로 꺼낸다. 두 shutter는 동시에 열리지 않는다.
- 순서: FOUP에서 dry pick, flip, load cup, head, polish, load cup, wet robot이 clamp한 채 face up으로 뒤집기, cleaner, fork rinse, clean-wet 인계, dryer, dry robot, FOUP. 젖은 wafer는 FOUP로 돌아가지 않는다.
- Dry robot 대기와 회전: transfer tower가 EFEM 안으로 120 mm 들어와 있어서 robot 축에서 tower 면까지 260 mm뿐이다. 그래서 FOUP를 볼 때는 wafer 중심을 축에서 105 mm 앞에, tower를 볼 때는 85 mm 앞에 두고 돈다. 앞쪽은 손목 hub, 뒤쪽은 wafer 가장자리가 tower에서 15 mm 떨어진다. FOUP와 tower 사이를 돌 때는 link 1이 EFEM 앞쪽으로 지나가는 방향으로 돈다.
- Flip station rotor: 양쪽 jaw 블록이 각각 짧은 축으로 +Z actuator와 -Z bearing에 물린다. 두 블록을 잇는 bar가 wafer와 fork 사이를 가로지르지 않는다.
- Fork rinse: wet robot은 fork 끝이 rinse box 뒷벽 10 mm 앞에 올 때까지만 넣는다.
- Spin dryer bowl의 안쪽으로 굽은 가장자리는 wafer 가장자리보다 10 mm 바깥에 있다.
- Conditioning은 head가 물러난 뒤의 ex-situ 방식 그대로다. Slurry와 물은 illustrative 효과다.

계측(C-MP-01 ~ 12)은 `src/equipment/cmp/measurement.ts`에 있다. Zone과 ring pressure는 regulator outlet의 gauge 압력이며 contact pressure map이 아니다.

## OHT와 FOUP (`config/geometry/oht-bay-v1.json`, v1.1.0)

근거: Muratec과 Daifuku 자료의 rail vehicle, hoist, FOUP, load port 관계만 참고했다. SEMI E84는 범위 확인용이며 구현하지 않았다.

- Rail: I형 단면, z -5.2 ~ 5.6 m, 아랫면 높이 2.9 m, hanger 간격 1.2 m(turnbuckle 포함), 2.4 m마다 이음판, 양 끝 end stop과 완충재. 레일 옆에 비접촉 급전선 두 가닥과 insulator가 있다.
- Bogie: 구동 바퀴가 하부 flange 위를 web 양쪽에서 구른다. Side plate가 flange 가장자리를 감싸고, web 양옆에 guide roller가 있다. 앞 bogie 바깥에 구동 motor와 감속기, 반대쪽에 급전 pickup이 있다.
- Body: 0.50 x 0.42 x 0.80 m, 앞뒤 cover, bumper, 상태 lamp, 아랫면 hoist window, 전방과 하강 obstruction sensor와 bracket.
- Hoist: belt 4개(길이는 scale로만 바뀜), belt 출구 guide pulley, stroke 1.5 m. Gripper plate 위에 finger guide rail, finger actuator, belt clamp block이 있다.
- Gripper finger: +X 쪽 finger A와 -X 쪽 finger B가 안쪽으로 닫힌다. 이전 revision은 finger 축 방향이 반대라서 닫을 때 바깥으로 움직였다. Open gap 170 mm, closed gap 100 mm이고 둘 다 아래쪽 lip 사이 간격이다. Finger 다리는 lip보다 20 mm 바깥에 있어서 닫혀도 flange(120 mm) 가장자리에서 10 mm 떨어진다. Finger 높이는 38 mm로, 잡은 FOUP의 flange 윗면이 gripper plate 아래 presence sensor에 닿고 lip이 flange 바로 아래에 들어간다.
- FOUP: 0.42 x 0.335 x 0.39 m, 25 slot(pitch 10 mm, slot 1 높이 65 mm), top flange 120 x 12 x 120 mm, handle, kinematic coupling pad 3개. OHT는 닫힌 FOUP만 나른다. Hoist가 내려간 상태로 주행하지 않는다.
- FOUP 안의 웨이퍼: slot마다 웨이퍼 표시가 하나씩 있고, 시나리오가 주는 carrier slot map에서 점유된 slot의 웨이퍼만 보인다. 지금 시연의 lot은 W-01 한 장(slot 13)이다. Slot map은 scripted 상태이며 load port wafer mapping sensor의 결과가 아니다(그런 센서는 모델에 없다).
- FOUP 단면 보기: seat 축(웨이퍼 stack 중심)을 지나는 평면으로 door 반대쪽 절반을 잘라 낸다. Shell, handle, slot rib, flange, coupling은 상자 부품을 그 평면으로 자르고 잘린 자리에 단면 cap을 붙인다. 웨이퍼는 revolve 형상이라 같은 평면에서 sector로 잘린다. Door는 앞쪽 절반에 있어서 잘리지 않는다. 보기 전용이며 FOUP door, OHT, load port 상태와 무관하다. X-ray에서는 shell과 door만 투명해지고 slot rib은 불투명하게 남아 slot 위치가 보인다.
- Bay: load port seat 세 개(CCP, Remote, CMP)가 x = -1.974 m 선 위, 높이 0.9 m에 있다. 장비 front end가 길어지면서 seat가 바깥으로 나와 rail과 CMP 위치를 함께 옮겼다(`config/equipment/instances.json`, instances-v4).

계측(O-MP-01 ~ 08)은 `src/equipment/oht/measurement.ts`에 있다. Scripted travel, hoist, gripper 값은 Preview status이며 encoder와 switch channel은 비어 있다.

## 현재 bay 장비 가정 (2026-11-24)

결정, ID, 근거 구분은 `docs/equipment-migration.md`, 치수는 각 config에 있다.

**Producer SE 기반 (`config/geometry/producer-se-twin-v1.json`):**
- Cell A는 기존 CCP chamber geometry v1.3.0을 재사용한다.
- Transfer chamber는 0.90 m이고 linear blade shuttle로 지난다.
- Cell B는 +Z로 1.05 m 떨어진 정적 copy다.
- MOD-02와 MOD-03은 외형만 있다.
- RPS(remote chamber clean)는 이 configuration에 없다.

**Tactras 기반 (`tactras-oxide-rie-v1.json`):**
- 상부 전극은 접지이고 gap은 75 mm다.
- 하부는 ESC(298 mm), 냉각 base, focus ring(300-370 mm), 절연 ring, ground shield다.
- Lift pin stroke는 60 mm다.
- Transfer chamber는 1.45 m다.
- PM-02부터 PM-05까지는 외형만 있다.
- 단일 RF는 프로젝트가 선택한 대표 구성이다.

**CELLESTA-i MD 기반 (`cellesta-i-md-v1.json`):**
- 4 port 중 두 번째가 active다.
- Pass station은 EFEM 뒷벽에 걸쳐 있다.
- Transfer robot의 end effector는 0.45 m로, wrist가 PM-01 밖에 남는다.
- Cup은 안쪽과 바깥쪽 회수 channel이 있고, guard는 3단(transfer / chemical / rinse·dry)이다.
- Chuck는 support pin 6개와 edge pin으로 받친다.
- Swing arm에 nozzle 3개(약액 / UPW / IPA)가 있고, park 위치는 cup 밖이다.

**CLW-08v2 기반 (`clw08v2-oht-v1.json`):**
- 기존 OHT 기구를 쓰고, rail은 z -7.0에서 5.8 m까지다.
- 차체와 carrier bay end wall은 GLB다.
