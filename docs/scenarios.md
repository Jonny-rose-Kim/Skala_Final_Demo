# 시나리오와 clock, identity 규칙

## 공통 규칙

- clock은 `presentation_time` 하나다(`src/presentation/visualClock.ts`). Scenario를 바꾸면 duration과 hold point만 다시 설정한다.
- 모든 장비 pose, carrier와 wafer holder, slot 점유, IllustrativeFilmState는 `scenario.evaluate(t, seed, animT, ctx)`가 매 frame 새로 계산한다. 뒤로 scrub해도 이벤트를 재실행하지 않고 그 시각의 상태를 그대로 만든다.
- 같은 t, seed, config면 결과가 같다. Camera, 선택, cutaway, exploded는 시나리오 상태를 바꾸지 않는다.
- Restart는 시연만 처음으로 돌린다. Backend, run, command log는 존재하지 않으며 Visual 조작이 그것을 만들지도 않는다.

## 장비별 단독 시연

| ID | 길이 | 내용 |
| --- | --- | --- |
| `ccp-illustrative-cycle-v1` | 18 s | 기존 CCP plasma cycle. Stable 단계에서 Extinguish까지 유지 |
| `remote-icp-cycle-v1` | 33 s | Idle, Pumpdown 연출, 안정화, Source 점화, Precursor 투입과 증착 연출(유지, Precursor off로 해제), Purge, Source off, Ready |
| `sti-cmp-cycle-v1` | 50 s | Ready, wafer 인계, pad wetting, head 접근, bulk polish, clearing, bounded overpolish, head lift, conditioning(head 후퇴), unload, clean/rinse, spin dry, FOUP 복귀 |
| `oht-transfer-v1` | 38 s | Ready, pickup 정렬, 빈 gripper 하강, carrier 결합, 적재 상승, 주행, 정렬, 적재 하강, seating과 해제, 빈 gripper 상승, 완료 |

장비 선택 UI에서 다른 장비를 고르면 단독 시연도 그 장비 것으로 바뀐다. Pumpdown 단계가 있어도 pressure observation을 만들지 않는다.

## 연결 시연 Route A, B

Route A(`route-a-linked-v1`, 119 s)와 Route B(`route-b-linked-v1`, 134 s)는 서로 대안이며 한 wafer에 두 증착을 하지 않는다.

1. 외부 준비 공정 완료(prepared STI wafer, FOUP slot-13).
2. Wafer 반입(simplified internal transfer, 4 s).
3. 증착 연출(CCP 18 s 또는 Remote 33 s). Overcoat layer `demo_overcoat`가 0에서 1로 자란다.
4. FOUP 복귀와 door 닫힘(4 s). 마지막 1 s에 slot이 다시 점유된다.
5. OHT 반송(38 s). Pickup은 slot 점유와 door 닫힘 이후에만 시작한다.
6. STI CMP와 clean, dry(50 s). Overcoat와 surface oxide가 제거되고 SiN과 trench oxide가 남는다.
7. 완료(3 s).

Incoming stack은 `src/domain/materialFlow.ts`의 `STI_INCOMING_STACK`이다. Pad oxide, SiN stop, liner, trench fill, surface oxide는 external step 유래이고 layer ID를 그대로 유지한다. Trench fill mode는 external이다. Recipe는 모두 `assumed_demo`이며 qualified가 아니다.

Follow 토글을 켜면 단계가 바뀔 때 해당 장비가 선택되고 카메라가 이동한다. QA 캡처는 Follow를 끈다.

## Identity 규칙

- Carrier ID(FOUP-01)와 wafer ID(W-01)는 반송과 공정 중 바뀌지 않는다.
- `presented_holder`는 source station, gripper, destination station 중 하나이며 engage 끝(lift 시작)과 seat 순간(release 시작)에 원자적으로 바뀐다.
- Wafer holder는 carrier_slot, internal_transfer, process_stage, load_cup, cmp_head, clean_module, dry_module 중 하나이고, 한 시각에 wafer를 표시하는 장비는 최대 하나다.
- 복귀 예약 slot(reservedSlot)은 현재 holder와 별도 정보다.
- Wafer의 frontsideNormalLocal은 holder마다 기록한다(head 아래에서는 -Y).
