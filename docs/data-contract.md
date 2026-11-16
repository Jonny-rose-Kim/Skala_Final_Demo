# 데이터 구조

부품, 계측, carrier, 시나리오의 식별 구조와 버전을 정리한 문서다. 모두 TypeScript와 versioned JSON으로 구현되어 있고 DB나 API는 아직 없다.

## 장비 템플릿과 인스턴스

- `EquipmentTemplate`(`templateId`, `templateRevision`, `family`, `displayName`): `assemblies[]`, `components[]`, `ports[]`, `connections[]`, `joints[]`, `facts[]`, 선택적 `station`.
- `ComponentDef`: `assetId`(불변 식별자), `nodeKey`, `kind`, `assembly`, `parentAssetId`, `materialRef`, `explode`, `cutaway`, `azimuthDeg`, `jointId`(따라가는 joint), `axisXZ`(회전 부품의 sector 축), `shell`, `alwaysOpaque`, `dimensions(layout)`, `structuralBasis`, `assumptions`.
- `JointDef`: `jointId`, `kind`(revolute, prismatic, path), `origin`, `axis`, `range`, `unit`, `homeNote`, `freezeInCutaway`.
- `StationInterfaceDef`: load port asset, FOUP seat frame과 door 방향, 불투명 transfer enclosure, wafer 표시 asset 목록.
- `EquipmentInstanceDef`(`config/equipment/instances.json`): `instanceId`, `templateId`, `position`, `rotationYDeg`, `role`, `mobile`. Station ID는 `LP.<instanceId>`로 파생한다.
- 관계는 종류별로 나눈다. Containment(assembly, parent), Connection(port와 connection, 매체 gas, vacuum, rf, electrical, thermal, mechanical, wafer, liquid, pneumatic, optical, carrier, coolant), Layout(instance pose, joint origin), Route(`materialFlow.ts`), SceneBinding(mesh metadata `instanceId`, `assetId`).

## 계측 (`src/domain/measurement.ts`)

| 객체 | 주요 필드 | 비고 |
| --- | --- | --- |
| `InstrumentDef` | instrumentId, type, principle, installationStatus | integrated_instrument는 drive 내장 feedback |
| `InstrumentInstallationDef` | instrumentId, mountedOnAssetId, mountFrameJointId, mountPosition, placementBasis, revision | 본체 위치 |
| `MeasurementPointDefV2` | pointId, targetAssetId, frameJointId, pointKind(point, region, optical_path, line_reference, axis_reference), geometry, quantity, reference, coverageKo, candidate, resolver | 측정 대상 위치와 범위 |
| `MeasurementChannelDefV2` | channelId, instrumentId(derived면 null), quantity, canonicalUnit, dataShape, channelRole(measurement, status, derived_estimate, model_output), derivedFrom | |
| `ChannelPointBindingDef` | channelId, pointId, role, configurationRevision | channel당 primary 하나 |
| `ChannelSourceBindingDef` | providerKind, providerId, sourceKey, timeDomain, adapterRevision | V1에는 없음 |
| `CalibrationRevisionDef` | status unknown | 가짜 보정 날짜 없음 |
| `Observation` | 타입만 정의 | 프론트엔드가 만들지 않음 |

`QUANTITY_UNITS`가 허용 단위를 정하고 `validateMeasurementSeed`가 검증한다. Inspector는 Mount, Point linked, Data unbound를 각각 표시한다.

계측을 추가하거나 옮기는 방법: 템플릿의 `src/equipment/<장비>/measurement.ts`에 Instrument, Installation, Point, Channel, Binding을 적고 `npm run validate:config`를 돌린다. 존재하는 component와 joint, 지원하는 quantity와 unit만 연결된다. UI 편집기는 없다.

## Carrier, wafer, route (`src/domain/materialFlow.ts`)

- `CarrierDef` FOUP-01(25 slot), `WaferDef` W-01, `DEMO_RESERVED_SLOT` slot-13.
- `IncomingStackDef` `sti-prepared-v1`: substrate, pad oxide, SiN stop, liner, trench fill, surface oxide. 외부 공정 유래이며 layer ID를 유지한다. 이번 증착은 `demo_overcoat` layer다.
- `RecipeRevisionDef`: operation, equipmentTemplateId, filmMaterial, intendedRole, configurationRevision, incomingStackId, validationStatus(`assumed_demo`), preconditions.
- `RouteDef` A, B: deposition instance, CMP, OHT, carrier, source와 destination station, steps.

## PreviewState (`src/presentation/preview.ts`)

InstancePreview(joints, effects, flags, presentedWaferId), CarrierPreview(holder station 또는 gripper, doorOpen, slots), WaferPreview(holder, reservedSlot, frontsideNormalLocal, IllustrativeFilmState). 모두 scripted presentation이며 measurement나 simulation state가 아니다.

## 버전

| 버전 | V1 값 |
| --- | --- |
| geometry_revision | `ccp-pecvd-300-v1.2.0`, `remote-icp-pecvd-300-v1.0.0`, `sti-cmp-rotary-300-v1.0.0`, `oht-bay-v1.0.0` |
| templateRevision | CCP 1.2.0, Remote 1.0.0, CMP 1.0.0, OHT 1.0.0, FOUP 1.0.0 |
| config_revision(instances) | `instances-v3` |
| measurement seedRevision | `ccp-meas-seed-2`, `remote-meas-seed-1`, `cmp-meas-seed-1`, `oht-meas-seed-1` |
| scenario id | `ccp-illustrative-cycle-v1`, `remote-icp-cycle-v1`, `sti-cmp-cycle-v1`, `oht-transfer-v1`, `route-a-linked-v1`, `route-b-linked-v1` |
| schema_version, API 버전, model_version, calibration_revision | 해당 없음(백엔드 없음) |

## 이후 저장 경계 (미구현)

asset_templates, template_revisions, assets, coordinate_frames, ports, connections, instruments, instrument_installations, measurement_points, measurement_channels, channel_point_bindings, channel_source_bindings, calibration_revisions, observation_streams, observations, carriers, carrier_slots, wafers, wafer_locations, recipe_revisions, route_definitions, execution_records. 센서마다 column을 늘리지 않고 행으로 저장한다. 실제 Run이 생기면 사용한 revision을 고정한다.

## 에셋 매니페스트

`assets/manifests/ccp-pecvd-300.manifest.json`은 CCP용이다. 새 템플릿은 모두 procedural이며 GLB 교체 시 같은 방식으로 `assetId`를 유지하면 된다.
