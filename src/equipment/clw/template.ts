/**
 * Cleanway CLW-08v2 based OHT template. Kinematics and mechanism identity (rail, bogies, hoist drive, belts,
 * gripper plate, fingers, obstruction sensor) are the shared OHT ones; the vehicle shell and the carrier-bay
 * end walls come from the Blender GLB. Internal wheel / belt counts and drives are representative.
 */
import type { ComponentDef, EquipmentTemplate, ReferenceNote } from "../../domain/types";
import { buildOhtTemplate } from "../oht/template";
import type { OhtLayout } from "../oht/layout";

export const CLW_TEMPLATE_ID = "clw08v2_oht";
export const CLW_TEMPLATE_REVISION = "1.0.0";

const DAIFUKU: ReferenceNote = { basis: "official_public", scope: "model", sourceUrls: ["https://www.daifuku.com/sustainability/ecoproducts/"], dimensionBasis: "Silhouette from the public photo; dimensions are representative assumptions." };

export function buildClwTemplate(L: OhtLayout): EquipmentTemplate<OhtLayout> {
  const base = buildOhtTemplate(L);
  const components: ComponentDef<OhtLayout>[] = base.components.map((c) =>
    c.assetId === "vehicle_body"
      ? { ...c, name: "Vehicle shell (CLW-08v2 style, representative)", description: "Rail 아래 vehicle 외장: 상부 drive / hoist housing과 carrier bay 앞뒤 end wall. 옆면이 열려 운반 중인 FOUP가 보인다. Blender GLB 외장이며 OEM CAD가 아니다.", materialNote: "White painted shell (가정)", shell: true, scope: { activity: "active" } }
      : { ...c, scope: { activity: "active" } },
  );
  components.push({
    assetId: "carrier_bay_guard",
    nodeKey: "vehicle.carrier_bay_guard",
    name: "Carrier bay end walls / retention lips",
    kind: "vehicle",
    assembly: "vehicle",
    parentAssetId: "vehicle_body",
    description: "Hoist가 끝까지 올라간 FOUP를 앞뒤에서 감싸는 end wall과 안쪽 lip. FOUP 수직 경로 밖에 있어 hoist를 막지 않는다. 실제 낙하 방지 기구의 형식은 확인하지 않았다(대표).",
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
