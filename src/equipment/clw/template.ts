/**
 * Cleanway CLW-08v2 based OHT template. Kinematics and mechanism identity (rail, bogies, hoist drive, belts,
 * gripper plate, fingers, obstruction sensor) are the shared OHT ones; the vehicle shell and the carrier-bay
 * end walls come from the Blender GLB. Internal wheel / belt counts and drives are representative.
 */
import type { ComponentDef, EquipmentTemplate, ReferenceNote } from "../../domain/types";
import { buildOhtTemplate } from "../oht/template";
import type { OhtLayout } from "../oht/layout";

export const CLW_TEMPLATE_ID = "clw08v2_oht";
export const CLW_TEMPLATE_REVISION = "1.1.0"; // 1.1.0: SK hynix livery shell, face fittings asset, GLB sensor windows

const DAIFUKU: ReferenceNote = { basis: "official_public", scope: "model", sourceUrls: ["https://www.daifuku.com/sustainability/ecoproducts/"], dimensionBasis: "Silhouette from the public photo; dimensions are representative assumptions." };

export function buildClwTemplate(L: OhtLayout): EquipmentTemplate<OhtLayout> {
  const base = buildOhtTemplate(L);
  const components: ComponentDef<OhtLayout>[] = base.components.map((c) =>
    c.assetId === "vehicle_body"
      ? { ...c, name: "Vehicle housing (CLW-08v2 style, SK hynix livery, representative)", description: "Rail 아래 vehicle 상부 housing: 옆판, hoist 창이 있는 바닥판, 검은 상단 cap, 옆면 호기 번호. 옆 아래가 열려 운반 중인 FOUP가 보인다. 공개 사진을 참고한 Blender GLB 외장이며 OEM CAD가 아니다.", materialNote: "Glossy white paint with clear coat, black cap (가정)", shell: true, scope: { activity: "active" } }
      : { ...c, scope: { activity: "active" } },
  );
  components.push({
    assetId: "carrier_bay_guard",
    nodeKey: "vehicle.carrier_bay_guard",
    name: "End shells (front / rear) / retention lips",
    kind: "vehicle",
    assembly: "vehicle",
    parentAssetId: "vehicle_body",
    description: "앞뒤의 둥근 흰색 end shell(옆면으로 감겨 들어감)과 아래 ledge, 안쪽 retention lip. Hoist가 끝까지 올라간 FOUP를 앞뒤에서 감싸며 FOUP 수직 경로 밖에 있다. 실제 낙하 방지 기구의 형식은 확인하지 않았다(대표).",
    materialRef: "painted_offwhite",
    materialNote: "Painted shell (가정)",
    selectable: true,
    shell: true,
    explode: { dir: [0, 0, 1], distance: 0.3 },
    cutaway: "keep",
    jointId: "travel",
    dimensions: () => [],
    scope: { activity: "active" },
  });
  components.push({
    assetId: "vehicle_face_fittings",
    nodeKey: "vehicle.face_fittings",
    name: "Vehicle face fittings (windows, status display, E-stop, labels)",
    kind: "vehicle",
    assembly: "vehicle",
    parentAssetId: "carrier_bay_guard",
    description: "앞뒤 end face의 센서 창, 2줄 LED 상태 표시창, 비상정지 버튼, 명판, breaker, 운영사 로고와 호기 번호, 경고 라벨. 배치는 SK hynix 팹 OHT 공개 사진을 따른 대표 구성이다. 표시창은 호기 식별만 보여 주며 운행 값을 표시하지 않는다.",
    materialRef: "painted_dark",
    materialNote: "Acrylic sensor windows, LED display, decals (가정)",
    selectable: true,
    explode: { dir: [0, 0, 1], distance: 0.36 },
    cutaway: "keep",
    jointId: "travel",
    dimensions: () => [],
    scope: { activity: "active" },
  });
  return {
    ...base,
    templateId: CLW_TEMPLATE_ID,
    templateRevision: CLW_TEMPLATE_REVISION,
    displayName: "Cleanway CLW-08v2 OHT (representative)",
    title: "Cleanway CLW-08v2 based overhead hoist transport vehicle (representative mechanism)",
    components,
    lifecycle: "current",
    reference: { ...DAIFUKU, vendor: "Daifuku", model: "Cleanway CLW-08v2", configurationKo: "공개 model명과 외형 사진을 참고한 대표 vehicle. Bogie, 감속기, pulley·belt, gripper 내부는 대표 기구이며 속도는 시연 timing이다." },
    facts: [
      { label: "Model", value: "Cleanway CLW-08v2 (public model name)", note: "공개 설명: 경량화, motor control 개선, 주행 속도 200 -> 300 m/min. 시연 속도는 이 값을 재현하지 않는다" },
      { label: "Degrees of freedom", value: "Rail travel, vertical hoist, gripper open / close", note: "Lateral transfer와 yaw는 구현하지 않았다" },
      { label: "Carrier", value: "Closed FOUP only", note: "운반 중 FOUP door는 닫혀 있고 OHT는 wafer를 직접 집지 않는다" },
      ...base.facts.filter((f) => f.label !== "Degrees of freedom"),
    ],
  };
}
