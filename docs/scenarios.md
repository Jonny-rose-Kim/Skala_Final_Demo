# 시나리오와 clock, identity 규칙

## 공통 규칙

- Clock은 `presentation_time` 하나다(`src/presentation/visualClock.ts`). Scenario를 바꾸면 duration과 hold point만 다시 설정한다.
- 모든 장비 pose, robot joint, door와 shutter, carrier와 wafer holder, slot 점유, wafer 면 방향과 wet 상태, IllustrativeFilmState는 `scenario.evaluate(t, seed, animT, ctx)`가 매 frame 새로 계산한다. 뒤로 scrub해도 이벤트를 재실행하지 않고 그 시각의 상태를 그대로 만든다.
- Handling 동작은 motion track(`src/presentation/motionTrack.ts`)으로 적는다. 단계마다 목표 값과 시간이 있고 smoothstep으로 보간한다. Holder는 접촉 높이를 지나는 순간 바뀐다(inverse smoothstep으로 정확한 시각을 계산).
- 단계 시간은 `config/visual/handling-sequence-v1.json`에 있다. 보여 주기 위한 시간이며 장비 cycle time이 아니다.
- 같은 t, seed, config면 결과가 같다. Camera, 선택, cutaway, cover 제거, exploded는 시나리오 상태를 바꾸지 않는다. Exploded 보기에 들어가면 그 순간의 PreviewState 전체(robot, wafer, carrier 포함)를 고정하고 나오면 evaluator 값으로 돌아간다.

## 장비별 단독 시연

| ID | 길이 | 내용 |
| --- | --- | --- |
| `ccp-illustrative-cycle-v1` | 18 s | 기존 CCP plasma cycle. Stable 단계에서 Extinguish까지 유지. Robot은 home, wafer는 pedestal 위 |
| `ccp-handling-cycle-v1` | 69.6 s | FOUP dock과 door open, 대기 robot으로 load lock, pump-down(scripted), blade로 chamber, pin 하강과 stage 상승, plasma cycle(유지 없음), 같은 길로 FOUP 복귀, door close, undock |
| `remote-icp-cycle-v1` | 33 s | Idle, Pumpdown 연출, 안정화, Source 점화, Precursor 투입과 증착 연출(유지, Precursor off로 해제), Purge, Source off, Ready |
| `remote-handling-cycle-v1` | 82.6 s | CCP handling과 같은 station 순서에 Remote cycle(Idle 제외, 유지 없음)을 넣은 것 |
| `sti-cmp-cycle-v2` | 115.2 s | FOUP dock, dry robot pick, flip(face down), wet robot으로 load cup, head pick, wetting, polish, clearing, overpolish, lift, conditioning, load cup 반환, wet robot clamp와 roll(face up), cleaner, fork rinse, dryer, spin dry, dry robot으로 FOUP, undock |
| `oht-transfer-v1` | 38 s | Ready, pickup 정렬, 빈 gripper 하강, carrier 결합, 적재 상승, 주행, 정렬, 적재 하강, seating과 해제, 빈 gripper 상승, 완료 |

이전 `sti-cmp-cycle-v1`(50 s, simplified transfer)은 `sti-cmp-cycle-v2`로 바뀌었다.

## 연결 시연 Route A, B

Route A(`route-a-linked-v2`, 227.8 s)와 Route B(`route-b-linked-v2`, 240.8 s)는 서로 대안이며 한 wafer에 두 증착을 하지 않는다.

1. 외부 준비 공정 완료(prepared STI wafer, FOUP slot-13), 2 s.
2. 증착 장비 station handling 반입(25.2 s): dock, door, 대기 robot, load lock, pump-down, blade, pin.
3. 증착 연출(CCP 18 s 또는 Remote 31 s). Overcoat layer `demo_overcoat`가 0에서 1로 자란다.
4. 같은 길로 FOUP 복귀(26.4 s). Door가 닫히고 undock된 뒤에 끝난다.
5. OHT 반송(38 s). Pickup은 slot 점유, door 닫힘, undock 이후에만 시작한다.
6. STI CMP 전체(115.2 s). Overcoat와 surface oxide가 제거되고 SiN과 trench oxide가 남는다. Wafer는 dry 상태로 slot-13에 돌아온다.
7. 완료(3 s).

Incoming stack은 `src/domain/materialFlow.ts`의 `STI_INCOMING_STACK`이다. Recipe는 모두 `assumed_demo`이며 qualified가 아니다.

Follow 토글을 켜면 단계가 바뀔 때 해당 장비가 선택되고 카메라가 이동한다. QA 캡처는 Follow를 끈다.

## Interlock과 표현 규칙

- 대기 door와 slit valve는 동시에 열리지 않는다. Load lock pump-down, vent, cooldown readiness는 scripted 단계이고 측정값이 없다.
- Robot fork나 blade는 닫힌 문을 지나지 않는다(FOUP door, load lock door, slit valve, dryer shutter, cleaner shutter). 단위 테스트가 궤적 전체를 검사한다.
- CMP dryer의 wet side와 dry side shutter는 동시에 열리지 않는다. Cleaner shutter는 brush가 wafer에 닿아 있는 동안 닫혀 있다.
- Flip station과 wet robot은 wafer edge를 clamp한 상태에서만 뒤집는다. 빈 상태로 원위치하는 회전은 허용한다.
- 젖은 wafer(wet_dirty, wet_clean)는 FOUP와 dry robot, flip station에 가지 않는다.
- OHT는 hoist가 올라간 상태로만 주행하고 gripper가 닫힌 상태로만 들어 올린다.

## Identity 규칙

- Carrier ID(FOUP-01)와 wafer ID(W-01)는 반송과 공정 중 바뀌지 않는다.
- `presented_holder`는 source station, gripper, destination station 중 하나이며 engage 끝(lift 시작)과 seat 순간(release 시작)에 원자적으로 바뀐다. FOUP mesh는 하나이고 holder가 바뀌어도 world pose가 이어진다.
- Wafer holder는 하나다. 종류는 carrier_slot, end_effector, loadlock_support, transfer_blade, process_stage, flip_station, load_cup, cmp_head, clean_module, dry_module이고 attachment(예: atm_robot, lift_pins, wet_robot, spin_chuck)로 어디에 붙어 있는지 적는다. 한 시각에 wafer를 표시하는 asset은 하나다.
- 복귀 예약 slot(reservedSlot)은 현재 holder와 별도 정보다. Slot은 wafer가 실제로 돌아온 뒤에만 다시 점유된다.
- FOUP 안에 그려지는 웨이퍼와 FOUP 단면 상자의 웨이퍼 수는 carrier slot map을 따른다. OHT 단독 시연에서도 W-01은 slot-13에 있으므로 FOUP이 W-01을 표시하고, FOUP 단면을 켜면 보인다.
- Wafer의 frontsideNormalLocal은 holder 자세에서 계산한다(head와 load cup에서는 -Y, flip과 wet robot roll 중에는 그 사이 값).
