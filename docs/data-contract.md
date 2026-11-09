# Data contract — assets, sensors, versions, future API

## Identity and structure (V1, implemented in TypeScript/JSON)

- `EquipmentTemplate` (`templateId`, `templateRevision`): `assemblies[]`, `components[]`, `ports[]`, `connections[]`.
- `ComponentDef`: `assetId` (stable), `nodeKey` (semantic scene key), `name` (English), `kind`, `assembly`, optional `parentAssetId`, `description` (Korean), `materialRef`, `selectable`, `explode`, `cutaway` behavior, `azimuthDeg`, `dimensions(layout)`.
- Relations are kept separate: **hierarchy** (assembly/parent), **topology** (`PortDef` with medium gas/vacuum/rf/electrical/thermal/mechanical/wafer + `ConnectionDef` from/to port), **spatial layout** (derived from geometry config), **scene mapping** (`mesh.metadata = { instanceId, assetId, decorative, azimuth, isCap, isGlass, isPlasma }`).
- `EquipmentInstanceDef` (`config/equipment/instances.json`): `instanceId`, `templateId`, `displayName`, `position`, `rotationYDeg`, `detailLevel`. Adding another instance of an existing template is configuration only.

## Sensors (V1: definitions + unbound)

- `SensorInstanceDef` (installed instrument, `mountAssetId` in the equipment local frame)
- `MeasurementChannelDef` (`channelId`, quantity, unit, payloadType scalar|vector|spectrum|waveform|image, `measurementPointId`)
- `MeasurementPointDef` (what/where is measured; distinct from the body mount and from label positions)
- `ChannelBinding` (`source: "unbound"` for every channel in V1, `installationRevision`)
- Observations: none are generated. UI shows "Unbound / 연결된 데이터 없음".

## Versions

| Version | Meaning | V1 value |
| --- | --- | --- |
| `geometry_revision` | geometry config revision | `ccp-pecvd-300-v1.1.0` |
| `templateRevision` | equipment template revision | `1.1.0` |
| `config_revision` | instance configuration | `instances-v1` |
| visual scenario id | scripted presentation | `ccp-illustrative-cycle-v1` |
| `schema_version`, API/message version, `model_version` | backend DB / API / physics model | not applicable yet |

## Asset manifest (GLB replacement path)

`assets/manifests/ccp-pecvd-300.manifest.json` maps each `assetId`/`nodeKey` to its current source (`procedural`) and the
optional GLB node name to use when a GLB is supplied. Loading a GLB must preserve `assetId`, materials are mapped by
`materialRef`, and the plasma effect stays a Babylon ShaderMaterial (never baked into GLB).

## Future Operational API (not implemented)

- REST: commands (`command_id`, `run_id`, `target_asset_id`, `action`, `payload`) → accepted/applied/rejected + reason code; queries for templates, instances, runs.
- WebSocket: full snapshot on connect/reconnect, then updates with `run_id`, `snapshot_seq`, `sim_time`, `source`; channel sample sequences separate from snapshot sequences; stale/disconnected flags.
- Pydantic contracts and TypeScript types must be generated or contract-tested together; DB columns are never exposed directly.
- Storage: `asset_templates`, `assets`, `ports`, `connections`, `measurement_points`, `sensor_channels`, `channel_bindings`, `observation_streams`, `observations`, `simulation_runs`, `commands`, `events`, `recorded_snapshots` (rows per sensor, never per-sensor columns).
