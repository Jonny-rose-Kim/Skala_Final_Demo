/**
 * Template pieces of the shared wafer-handling station (CCP / Remote): assemblies, components, joints,
 * ports and connections. Identity follows the existing ids (load_port, efem_enclosure, load_lock,
 * slit_valve) and adds the new functional components (robot links, load-lock doors and pins, vacuum
 * blade, door opener, process enclosure). Semantic parents (parentAssetId) describe what belongs to
 * what; motion parents (JointDef.parentJointId) describe what moves with what. They are kept separate.
 */
import type { AssemblyDef, ComponentDef, ConnectionDef, JointDef, PortDef } from "../../domain/types";
import { scaraRobotComponents, scaraRobotJoints } from "./robotParts";
import { EFEM_FLOOR_RAISE, STATION_IDS as I, STATION_JOINTS as J, atmRobotSpec, type ProcessEnclosureSpec } from "./stationParts";
import { SLIT_GATE_INSET, stationPoint, type HandlingStationLayout } from "./stationLayout";

const mm = (label: string, valueM: number) => ({ label, valueM });

export function stationAssemblies(order0: number): AssemblyDef[] {
  return [
    { id: "station_interface", name: "Load port / EFEM", description: "FOUP load port(dock plate, door opener), EFEM panel assembly, FFU, HMI. OHT는 load port 위의 FOUP만 다룬다", order: order0 },
    { id: "atm_robot", name: "EFEM atmospheric robot", description: "Base, Z lift, shoulder, elbow, wrist, backside fork. FOUP slot과 load lock 사이에서 face-up dry wafer를 옮긴다", order: order0 + 1 },
    { id: "load_lock_module", name: "Load lock / vacuum transfer", description: "Load lock chamber, atmospheric door, support pins, 2단 telescopic vacuum blade와 sealed drive, slit gate valve", order: order0 + 2 },
    { id: "tool_enclosure", name: "Tool enclosure / facility", description: "Process enclosure panel assembly(점검용 cover, viewing window)와 후면 facility interface(gas, RF, exhaust, coolant, power)", order: order0 + 3 },
  ];
}

/** Load port joints (dock plate, door opener) for a load port at station radius r1 with lateral center qc. */
export function loadPortJoints(az: number, p: { seatR: number; deckTopY: number; r1: number; openingCenterY: number; qc: number; dockStroke: number; doorPull: number; doorLower: number }): JointDef[] {
  const u: [number, number] = [Math.cos(az), Math.sin(az)];
  const P = (r: number, y: number, q: number) => stationPoint({ u, p: [-Math.sin(az), Math.cos(az)] }, r, y, q);
  const toTool: [number, number, number] = [-u[0], 0, -u[1]];
  return [
    { jointId: J.dock, name: "Load port dock plate", kind: "prismatic", origin: P(p.seatR, p.deckTopY, p.qc), axis: toTool, range: [0, p.dockStroke], unit: "m", homeNote: "0 = undocked seat (OHT 인계 위치), stroke = FOUP door가 port door에 닿는 docked 위치" },
    { jointId: J.doorPull, name: "Door opener pull", kind: "prismatic", origin: P(p.r1, p.openingCenterY, p.qc), axis: toTool, range: [0, p.doorPull], unit: "m", homeNote: "0 = port door가 opening에 닫힘, 양수 = FOUP door를 잡고 EFEM 안쪽으로 당김" },
    { jointId: J.doorLower, name: "Door opener lower", parentJointId: J.doorPull, kind: "prismatic", origin: [0, 0, 0], axis: [0, -1, 0], range: [0, p.doorLower], unit: "m", homeNote: "0 = opening 높이, 양수 = 아래로 내려 opening을 비움" },
  ];
}

/** Station joints (load port, load lock, blade, slit gate) + atmospheric robot joints, in the instance frame. */
export function stationJoints(S: HandlingStationLayout, slitGateTravel: number): JointDef[] {
  const P = (r: number, y: number, q = 0) => stationPoint(S, r, y, q);
  const toChamber: [number, number, number] = [-S.u[0], 0, -S.u[1]];
  const ll = S.ll;
  const lp = S.loadPort;
  const joints: JointDef[] = [
    ...loadPortJoints(S.az, { seatR: lp.seatR, deckTopY: lp.deckTopY, r1: S.efem.r1, openingCenterY: lp.opening.centerY, qc: 0, dockStroke: lp.dockStroke, doorPull: lp.doorPull, doorLower: lp.doorLower }),
    { jointId: J.llDoor, name: "Load lock atmospheric door", kind: "prismatic", origin: P(S.atmDoor.planeR, S.atmDoor.centerY), axis: [0, -1, 0], range: [0, S.atmDoor.gateTravel], unit: "m", homeNote: "0 = 닫힘(seal), travel = opening 아래로 완전히 열림" },
    { jointId: J.llPins, name: "Load lock support pins", kind: "prismatic", origin: P(ll.centerR, ll.pinDropTop), axis: [0, 1, 0], range: [0, ll.pinStroke], unit: "m", homeNote: "0 = pin top이 blade 면 아래(blade가 wafer를 가짐), stroke = robot fork가 들어갈 높이로 상승" },
    ...(S.tc
      ? [
          { jointId: J.shuttle, name: "Vacuum blade shuttle", kind: "prismatic" as const, origin: P(S.blade.stageRestR0, S.blade.stageY0), axis: toChamber, range: [0, S.blade.shuttleMax] as [number, number], unit: "m" as const, homeNote: "0 = blade 전체가 load lock 안, 양수 = transfer chamber를 지나 chamber 쪽으로 이동" },
          { jointId: J.bladeS1, name: "Vacuum blade stage 1", parentJointId: J.shuttle, kind: "prismatic" as const, origin: [0, 0, 0] as [number, number, number], axis: toChamber, range: [0, S.blade.s1max] as [number, number], unit: "m" as const, homeNote: "Shuttle 위 첫 번째 telescopic stage" },
        ]
      : [{ jointId: J.bladeS1, name: "Vacuum blade stage 1", kind: "prismatic" as const, origin: P(S.blade.stageRestR0, S.blade.stageY0), axis: toChamber, range: [0, S.blade.s1max] as [number, number], unit: "m" as const, homeNote: "0 = load lock 안으로 후퇴, 양수 = chamber 방향 신장" }]),
    { jointId: J.bladeS2, name: "Vacuum blade carriage", parentJointId: J.bladeS1, kind: "prismatic", origin: [0, 0, 0], axis: toChamber, range: [0, S.blade.s2max], unit: "m", homeNote: "Stage 1 위 carriage. 두 단 합계가 load lock 중심에서 chamber 축까지의 이송 거리" },
    { jointId: J.slitGate, name: "Slit valve gate", kind: "prismatic", origin: P(S.slit.valveR1 - SLIT_GATE_INSET, S.slit.centerY), axis: [0, -1, 0], range: [0, slitGateTravel], unit: "m", homeNote: "0 = 닫힘(slit seal), travel = slit 아래로 후퇴" },
  ];
  const spec = atmRobotSpec(S, S.floorY + EFEM_FLOOR_RAISE);
  return [...joints, ...scaraRobotJoints(spec)];
}

export interface EfemDims {
  depth: number;
  width: number;
  height: number;
  ffuHeight: number;
  deckHeight: number;
  deckDepth: number;
  openingW: number;
  openingH: number;
  dockStroke: number;
  doorPull: number;
  doorLower: number;
}

/** EFEM, FFU, HMI and load port (frame plate, dock plate, door opener) components. `out` points from the tool toward the aisle. */
export function efemComponents<L>(d: (L: L) => EfemDims, out: [number, number, number], basis: string): ComponentDef<L>[] {
  const ex = (dist: number) => ({ dir: out, distance: dist });
  const UP = (dist: number) => ({ dir: [0, 1, 0] as [number, number, number], distance: dist });
  return [
    {
      assetId: I.loadPort,
      nodeKey: "station.load_port",
      name: "Load port (frame plate, deck)",
      kind: "station",
      assembly: "station_interface",
      description: "EFEM 전면에 붙는 load port module. Deck 위 dock plate에 FOUP이 놓이고, frame plate의 opening을 통해 door opener가 FOUP door를 연다. OHT는 이 deck의 FOUP만 다룬다.",
      materialRef: "painted_offwhite",
      materialNote: "Painted frame plate, stainless deck (가정)",
      selectable: true,
      explode: ex(0.9),
      cutaway: "keep",
      dimensions: (L) => [mm("Deck height above floor", d(L).deckHeight), mm("Deck depth", d(L).deckDepth), mm("Opening width", d(L).openingW), mm("Opening height", d(L).openingH)],
      assumptions: ["Deck 높이 900 mm는 흔한 load port 높이 범위의 대표값이며 특정 규격 인증을 뜻하지 않는다.", "E84 신호, carrier ID reader, mapping sensor는 구현하지 않았다."],
      structuralBasis: basis,
      label: { text: "Load port", priority: 3 },
    },
    { assetId: I.dock, nodeKey: "station.load_port.dock_plate", name: "Load port dock plate + kinematic pins", kind: "station", assembly: "station_interface", parentAssetId: I.loadPort, description: "FOUP 바닥의 coupling groove에 맞물리는 3개 kinematic pin과 clamp. OHT가 내려놓은 undocked 위치에서 port door 쪽으로 dock stroke만큼 이동한다.", materialRef: "aluminum_anodized", materialNote: "Anodized plate, stainless pins (가정)", selectable: true, explode: UP(0.12), cutaway: "keep", jointId: J.dock, dimensions: (L) => [mm("Dock stroke", d(L).dockStroke)] },
    { assetId: I.opener, nodeKey: "station.load_port.door_opener", name: "FOUP door opener (port door)", kind: "access", assembly: "station_interface", parentAssetId: I.loadPort, description: "Latch key로 FOUP door를 잡아 EFEM 안쪽으로 당긴 뒤 아래로 내리는 port door. FOUP door는 이 동작과 함께 움직인다(같은 scripted 값).", materialRef: "painted_offwhite", materialNote: "Port door with latch keys (가정)", selectable: true, explode: ex(-0.25), cutaway: "keep", jointId: J.doorLower, dimensions: (L) => [mm("Pull", d(L).doorPull), mm("Lower", d(L).doorLower)] },
    {
      assetId: I.efem,
      nodeKey: "station.efem",
      name: "EFEM enclosure (frame + panels)",
      kind: "enclosure",
      assembly: "station_interface",
      description: "Load port와 공정 쪽 사이의 대기측 wafer handling 공간. Aluminum frame, 뒤쪽 transfer opening이 있는 벽, 앞쪽 load port bay, 점검용 side cover(창 포함). Cover 제거는 표시상 조작이며 실제 door 상태가 아니다.",
      materialRef: "painted_offwhite",
      materialNote: "Off-white powder-coated panels on an anodized frame (가정)",
      selectable: true,
      shell: true,
      explode: ex(0.55),
      cutaway: "keep",
      dimensions: (L) => [mm("Depth", d(L).depth), mm("Width", d(L).width), mm("Height above floor", d(L).height)],
      structuralBasis: basis,
      label: { text: "EFEM", priority: 2 },
    },
    { assetId: I.ffu, nodeKey: "station.efem.ffu", name: "EFEM fan filter unit", kind: "enclosure", assembly: "station_interface", parentAssetId: I.efem, description: "EFEM 상부 FFU. 청정 공기 down-flow를 만든다는 구조만 표현하며 유속 값은 없다.", materialRef: "painted_offwhite", materialNote: "FFU housing with grille (가정)", selectable: true, explode: UP(0.3), cutaway: "keep", dimensions: (L) => [mm("Height", d(L).ffuHeight)] },
    { assetId: I.hmi, nodeKey: "station.efem.hmi", name: "Operator HMI", kind: "access", assembly: "station_interface", parentAssetId: I.efem, description: "Operator aisle 쪽 swing arm의 touch panel. 화면 내용은 표시하지 않는다(backend 없음).", materialRef: "painted_offwhite", materialNote: "Monitor on an arm (가정)", selectable: true, explode: ex(0.2), cutaway: "keep", dimensions: () => [mm("Screen width", 0.38)] },
  ];
}

export function stationComponents<L>(st: (L: L) => HandlingStationLayout, S: HandlingStationLayout, enclosureIds: { enclosure: string; facility: string } | null): ComponentDef<L>[] {
  const out: [number, number, number] = [S.u[0], 0, S.u[1]];
  const ex = (d: number) => ({ dir: out, distance: d });
  const UP = (d: number) => ({ dir: [0, 1, 0] as [number, number, number], distance: d });
  const NONE = { dir: [0, 0, 0] as [number, number, number], distance: 0 };
  const basis = "Generic EFEM / load port / single-wafer load lock 구조(대기측 robot, 진공측 blade, gate valve 2개). 특정 제조사 배치를 복제하지 않았다.";
  const comps: ComponentDef<L>[] = [
    ...efemComponents<L>((L) => {
      const T = st(L);
      return { depth: T.cfg.efem.depth, width: T.efem.width, height: T.cfg.efem.height_above_floor, ffuHeight: T.cfg.efem.ffu_height, deckHeight: T.loadPort.deckTopY - T.floorY, deckDepth: T.cfg.load_port.deck_depth, openingW: T.loadPort.opening.width, openingH: T.loadPort.opening.y1 - T.loadPort.opening.y0, dockStroke: T.loadPort.dockStroke, doorPull: T.loadPort.doorPull, doorLower: T.loadPort.doorLower };
    }, out, basis),
    ...scaraRobotComponents<L>(atmRobotSpec(S, S.floorY + EFEM_FLOOR_RAISE), mm, { basis }),
    {
      assetId: I.loadLock,
      nodeKey: "station.load_lock",
      name: "Load lock chamber (body, lid, adapter)",
      kind: "enclosure",
      assembly: "load_lock_module",
      description: "대기측 EFEM과 진공 process chamber를 나누는 단일 wafer load lock. 바닥, 벽, 창이 있는 lid(점검용 cover), slit valve 쪽 adapter, pump-down line, vent valve, stand를 포함한다. 300 mm wafer, retracted blade, support pin, gate 후퇴 공간을 수용하도록 config에서 길이를 늘렸다.",
      materialRef: "aluminum_machined",
      materialNote: "Machined aluminum vacuum body, quartz lid window (가정)",
      selectable: true,
      shell: true,
      explode: ex(0.25),
      cutaway: "keep",
      dimensions: (L) => [mm("Length", st(L).cfg.load_lock.length), mm("Width", st(L).ll.width), mm("Interior height", st(L).ll.innerTopY - st(L).ll.innerBottomY), mm("Wafer center from chamber axis", st(L).ll.centerR)],
      assumptions: ["Pump-down, vent, cooldown은 scripted 단계이며 압력·온도 값을 만들지 않는다.", "Load lock 압력 gauge는 이 template revision에 없다(설치 후보도 아님)."],
      structuralBasis: basis,
      label: { text: "Load lock", priority: 2 },
    },
    { assetId: I.atmDoor, nodeKey: "station.load_lock.atm_door", name: "Load lock atmospheric door", kind: "valve", assembly: "load_lock_module", parentAssetId: I.loadLock, description: "EFEM 쪽 slot door. 아래로 내려 열린다. Slit gate가 열려 있는 동안 열리지 않는다(sequence interlock, 표시용).", materialRef: "aluminum_machined", materialNote: "Gate plate with o-ring (가정)", selectable: true, explode: ex(0.35), cutaway: "keep", jointId: J.llDoor, dimensions: (L) => [mm("Opening width", st(L).atmDoor.width), mm("Opening height", st(L).atmDoor.y1 - st(L).atmDoor.y0), mm("Gate travel", st(L).atmDoor.gateTravel)] },
    { assetId: I.llSupport, nodeKey: "station.load_lock.support_pins", name: "Load lock support pins", kind: "support", assembly: "load_lock_module", parentAssetId: I.loadLock, description: "Floor를 관통하는 4개 support pin과 lift spider. 올라가면 robot fork가 들어갈 공간을, 내려가면 wafer를 blade에 넘긴다.", materialRef: "stainless", materialNote: "Stainless pins with PEEK tips (가정)", selectable: true, explode: UP(0.15), cutaway: "keep", jointId: J.llPins, dimensions: (L) => [mm("Pin stroke", st(L).ll.pinStroke), mm("Pin diameter", st(L).ll.pinRadius * 2)] },
    { assetId: I.waferLL, nodeKey: "station.load_lock.wafer", name: "Wafer on load-lock pins", kind: "wafer", assembly: "load_lock_module", parentAssetId: I.llSupport, description: "Load lock support pin 위 wafer의 표시. Holder가 loadlock_support일 때만 보인다.", materialRef: "silicon_wafer", materialNote: "Presentation of the wafer", selectable: true, explode: UP(0.2), cutaway: "keep", jointId: J.llPins, dimensions: () => [mm("Diameter", 0.3)] },
    { assetId: I.bladeDrive, nodeKey: "station.load_lock.blade_drive", name: "Vacuum blade guide + sealed drive", kind: "drive", assembly: "load_lock_module", parentAssetId: I.loadLock, description: "Load lock 바닥의 linear guide rail과 바닥 아래 motor. 회전은 magnetic-fluid 방식으로 가정한 sealed feedthrough를 통해 진공 안으로 전달된다.", materialRef: "stainless", materialNote: "Guide rail, sealed rotary feedthrough, servo motor (가정)", selectable: true, explode: { dir: [0, -1, 0], distance: 0.15 }, cutaway: "keep", dimensions: (L) => [mm("Total blade stroke", st(L).blade.stroke)] },
    { assetId: I.bladeStage, nodeKey: "station.load_lock.blade_stage", name: "Vacuum blade stage 1", kind: "drive", assembly: "load_lock_module", parentAssetId: I.bladeDrive, description: "Guide 위를 미끄러지는 첫 번째 telescopic stage. Slit을 지나 chamber 안까지 들어가며 stage 위에서 carriage가 다시 움직인다.", materialRef: "aluminum_anodized", materialNote: "Anodized slide (가정)", selectable: true, explode: UP(0.08), cutaway: "keep", jointId: J.bladeS1, dimensions: (L) => [mm("Stage length", st(L).cfg.vacuum_blade.stage_length), mm("Stage stroke", st(L).blade.s1max)] },
    { assetId: I.blade, nodeKey: "station.load_lock.blade", name: "Vacuum transfer blade", kind: "drive", assembly: "load_lock_module", parentAssetId: I.bladeStage, description: "Carriage와 얇은 ceramic blade. Wafer를 4개 pad로 받쳐 load lock과 chamber 사이를 옮긴다. Chamber에서는 lift pin, load lock에서는 support pin과 Z 방향으로 인계한다.", materialRef: "ceramic", materialNote: "Alumina blade, PEEK pads (가정)", selectable: true, explode: UP(0.12), cutaway: "keep", jointId: J.bladeS2, dimensions: (L) => [mm("Blade thickness", st(L).cfg.vacuum_blade.thickness), mm("Blade width", st(L).cfg.vacuum_blade.width), mm("Carriage stroke", st(L).blade.s2max)], label: { text: "Vacuum blade", priority: 2 } },
    { assetId: I.waferBlade, nodeKey: "station.load_lock.blade_wafer", name: "Wafer on vacuum blade", kind: "wafer", assembly: "load_lock_module", parentAssetId: I.blade, description: "Vacuum blade 위 wafer의 표시. Holder가 transfer_blade일 때만 보인다.", materialRef: "silicon_wafer", materialNote: "Presentation of the wafer", selectable: true, explode: UP(0.16), cutaway: "keep", jointId: J.bladeS2, dimensions: () => [mm("Diameter", 0.3)] },
    ...(S.tc
      ? [
          { assetId: I.tc, nodeKey: "station.transfer_chamber", name: "Vacuum transfer chamber", kind: "enclosure" as const, assembly: "load_lock_module", description: "Load lock과 process chamber slit valve 사이의 진공 transfer chamber. Blade stage를 실은 linear shuttle이 이 안을 지나 chamber로 들어간다. 바닥, 벽, 창이 있는 lid(점검용 cover), pump line, stand를 포함한다.", materialRef: "aluminum_machined" as const, materialNote: "Machined aluminum vacuum body (가정)", selectable: true, shell: true, explode: UP(0.3), cutaway: "keep" as const, dimensions: (L: L) => [mm("Length", st(L).cfg.transfer_chamber?.length ?? 0), mm("Width", st(L).tc?.width ?? 0)], assumptions: ["Transfer chamber 길이와 linear shuttle 방식은 대표 설계다. 실제 장비의 vacuum robot 형식(회전형 등)을 재현하지 않는다."], structuralBasis: basis, label: { text: "Transfer chamber", priority: 2 } },
          { assetId: I.shuttle, nodeKey: "station.transfer_chamber.shuttle", name: "Blade shuttle sled", kind: "drive" as const, assembly: "load_lock_module", parentAssetId: I.bladeDrive, description: "Transfer chamber 바닥의 두 side rail 위를 달리는 sled. Blade stage 전체를 load lock에서 chamber 쪽으로 옮긴다.", materialRef: "aluminum_anodized" as const, materialNote: "Anodized sled on stainless rails (가정)", selectable: true, explode: UP(0.06), cutaway: "keep" as const, jointId: J.shuttle, dimensions: (L: L) => [mm("Shuttle stroke", st(L).blade.shuttleMax)] },
        ]
      : []),
    { assetId: I.slitGate, nodeKey: "access.slit_valve.gate", name: "Slit valve gate", kind: "valve", assembly: "load_lock_module", parentAssetId: I.slitValve, description: "Slit valve 안에서 아래 bonnet으로 후퇴하는 gate plate. 닫히면 load lock 쪽에서 slit을 seal한다. Load lock atmospheric door와 동시에 열리지 않는다.", materialRef: "aluminum_machined", materialNote: "Gate plate with o-ring (가정)", selectable: true, explode: ex(0.3), cutaway: "hide-in-sector", azimuthDeg: (S.az * 180) / Math.PI, jointId: J.slitGate, dimensions: (L) => [mm("Slit width", st(L).slit.width), mm("Slit height", st(L).slit.height)] },
  ];
  if (enclosureIds) {
    comps.push(
      {
        assetId: enclosureIds.enclosure,
        nodeKey: "enclosure.process",
        name: "Process enclosure (frame + service panels)",
        kind: "enclosure",
        assembly: "tool_enclosure",
        description: "Process chamber와 주변 장치를 둘러싼 panel assembly. -Z 쪽에 viewing window, +Z 쪽에 maintenance panel 두 장, 후면에 facility cut-out이 있다. 점검 모드에서 cover를 표시상 제거해 내부를 본다.",
        materialRef: "painted_offwhite",
        materialNote: "Off-white powder-coated panels on an anodized frame (가정)",
        selectable: true,
        shell: true,
        explode: UP(0.0),
        cutaway: "keep",
        dimensions: () => [],
        assumptions: ["Enclosure 치수는 화면 이해를 위한 대표값이다. 실제 장비 footprint가 아니다."],
        label: { text: "Process enclosure", priority: 1 },
      },
      { assetId: enclosureIds.facility, nodeKey: "enclosure.facility_interface", name: "Facility interface (gas / RF / exhaust / coolant / power)", kind: "frame", assembly: "tool_enclosure", parentAssetId: enclosureIds.enclosure, description: "후면 bulkhead plate. Fab utility(gas line, RF/전원, cooling water, exhaust duct)가 장비로 들어오는 위치. 배관 사양과 유량은 정하지 않았다.", materialRef: "stainless", materialNote: "Bulkhead fittings (가정)", selectable: true, explode: { dir: [1, 0, 0], distance: 0.2 }, cutaway: "keep", dimensions: () => [] },
    );
  }
  void NONE;
  return comps;
}

/** Ports of the station components (merged with the tool's own ports). */
export function stationPorts(enclosureIds: { enclosure: string; facility: string } | null): PortDef[] {
  const ports: PortDef[] = [
    { portId: "seat", assetId: I.loadPort, medium: "carrier", role: "bidirectional", name: "FOUP seating (bottom reference)" },
    { portId: "door", assetId: I.loadPort, medium: "wafer", role: "bidirectional", name: "FOUP door interface" },
    { portId: "pins", assetId: I.dock, medium: "carrier", role: "bidirectional", name: "Kinematic coupling pins" },
    { portId: "door", assetId: I.opener, medium: "carrier", role: "bidirectional", name: "Latch keys on the FOUP door" },
    { portId: "atm", assetId: I.efem, medium: "wafer", role: "bidirectional", name: "Atmospheric transfer space" },
    { portId: "vac", assetId: I.efem, medium: "wafer", role: "bidirectional", name: "Load lock side" },
    { portId: "atm", assetId: I.loadLock, medium: "wafer", role: "bidirectional", name: "Atmospheric side" },
    { portId: "vac", assetId: I.loadLock, medium: "wafer", role: "bidirectional", name: "Vacuum side (slit)" },
    { portId: "seal", assetId: I.atmDoor, medium: "vacuum", role: "bidirectional", name: "Door seal" },
    { portId: "wafer", assetId: I.robot.ee, medium: "wafer", role: "bidirectional", name: "Fork (backside support)" },
    { portId: "wafer", assetId: I.llSupport, medium: "wafer", role: "bidirectional", name: "Support pins" },
    { portId: "wafer", assetId: I.blade, medium: "wafer", role: "bidirectional", name: "Blade pads" },
    { portId: "drive", assetId: I.bladeDrive, medium: "mechanical", role: "outlet", name: "Sealed drive" },
    { portId: "slide", assetId: I.bladeStage, medium: "mechanical", role: "bidirectional", name: "Stage slide" },
    { portId: "carriage", assetId: I.blade, medium: "mechanical", role: "inlet", name: "Carriage" },
    { portId: "seal", assetId: I.slitGate, medium: "vacuum", role: "bidirectional", name: "Gate seal" },
    { portId: "arm", assetId: I.robot.base, medium: "mechanical", role: "outlet", name: "Z / shoulder drive" },
    { portId: "arm", assetId: I.robot.ee, medium: "mechanical", role: "inlet", name: "Wrist" },
  ];
  if (enclosureIds) {
    ports.push(
      { portId: "gas", assetId: enclosureIds.facility, medium: "gas", role: "outlet", name: "Facility gas supply" },
      { portId: "power", assetId: enclosureIds.facility, medium: "electrical", role: "outlet", name: "AC power / RF cable entry" },
      { portId: "exhaust", assetId: enclosureIds.facility, medium: "vacuum", role: "inlet", name: "House exhaust duct" },
    );
  }
  return ports;
}

const c = (connectionId: string, kind: ConnectionDef["kind"], from: [string, string], to: [string, string], description: string): ConnectionDef => ({ connectionId, kind, from: { assetId: from[0], portId: from[1] }, to: { assetId: to[0], portId: to[1] }, description });

/** Wafer path, boundaries and drives of the station. `stage` is the chamber's wafer stage asset. */
export function stationConnections(stageAssetId: string): ConnectionDef[] {
  return [
    c("wafer.loadport-efem", "wafer", [I.loadPort, "door"], [I.efem, "atm"], "FOUP door opening into the EFEM"),
    c("wafer.efem-loadlock", "wafer", [I.efem, "vac"], [I.loadLock, "atm"], "EFEM to load lock through the atmospheric door"),
    c("wafer.loadlock-slit", "wafer", [I.loadLock, "vac"], [I.slitValve, "transfer"], "Load lock to process chamber through the slit gate valve (and the transfer chamber, if present)"),
    c("wafer.loadport-robot", "wafer", [I.loadPort, "door"], [I.robot.ee, "wafer"], "FOUP slot to robot fork (pick / place)"),
    c("wafer.robot-llpins", "wafer", [I.robot.ee, "wafer"], [I.llSupport, "wafer"], "Robot fork to load-lock support pins (Z handoff)"),
    c("wafer.llpins-blade", "wafer", [I.llSupport, "wafer"], [I.blade, "wafer"], "Support pins to vacuum blade (pins pass the blade plane)"),
    c("wafer.blade-slit", "wafer", [I.blade, "wafer"], [I.slitValve, "transfer"], "Blade through the open slit"),
    c("carrier.dock-pins", "carrier", [I.loadPort, "seat"], [I.dock, "pins"], "Seat reference on the dock plate pins"),
    c("mech.blade-drive", "mechanical", [I.bladeDrive, "drive"], [I.bladeStage, "slide"], "Sealed drive moves stage 1"),
    c("mech.stage-carriage", "mechanical", [I.bladeStage, "slide"], [I.blade, "carriage"], "Stage 1 carries the blade carriage"),
    c("mech.robot-arm", "mechanical", [I.robot.base, "arm"], [I.robot.ee, "arm"], "Robot drive chain (Z, shoulder, elbow, wrist)"),
    c("wafer.slit-stage", "wafer", [I.slitValve, "transfer"], [stageAssetId, "transfer"], "Transfer path: slit opening to the lift pins at the transfer position"),
  ];
}

/** Wafer presentation assets of the station (plus the chamber stage wafer). */
export function stationWaferAssets(stageWaferAssetId: string): string[] {
  return [stageWaferAssetId, I.robot.wafer, I.waferLL, I.waferBlade];
}

export type { ProcessEnclosureSpec };
