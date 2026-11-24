// Optimizes the raw Blender GLBs with an explicit, inspected transform list (never the blanket `optimize`):
//   dedup  - merge identical accessors / materials / textures (exterior parts share the palette)
//   weld   - merge vertices whose attributes are identical (keeps UV / normal seams)
// Not applied on purpose: flatten / join / prune / simplify (would lose semantic nodes, pivots or extras),
// meshopt quantization (thin parts, see docs/asset-pipeline.md) and KTX2 (textures are small JPEGs).
// Writes public/models/<templateId>.glb and compares the semantic node table before and after.
import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, weld } from "@gltf-transform/functions";

const RAW = "assets/source/glb-raw";
const OUT = "public/models";
fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const only = process.argv.slice(2);

function nodeTable(doc) {
  return doc.getRoot().listNodes().map((n) => ({ name: n.getName(), parent: n.getParentNode()?.getName() ?? null, extras: n.getExtras(), t: n.getTranslation().map((v) => +v.toFixed(6)), r: n.getRotation().map((v) => +v.toFixed(6)), s: n.getScale().map((v) => +v.toFixed(6)) }));
}
function stats(doc) {
  const r = doc.getRoot();
  let tris = 0;
  for (const m of r.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3;
  return { nodes: r.listNodes().length, meshes: r.listMeshes().length, materials: r.listMaterials().length, textures: r.listTextures().length, accessors: r.listAccessors().length, triangles: tris };
}

for (const file of fs.readdirSync(RAW).filter((f) => f.endsWith(".glb"))) {
  const id = path.basename(file, ".glb");
  if (only.length && !only.some((o) => id.includes(o))) continue;
  const doc = await io.read(path.join(RAW, file));
  const before = nodeTable(doc);
  const s0 = stats(doc);
  await doc.transform(dedup(), weld());
  const after = nodeTable(doc);
  const s1 = stats(doc);
  const same = JSON.stringify(before) === JSON.stringify(after);
  if (!same) {
    console.error(`${id}: semantic node table changed by the optimizer`);
    process.exit(1);
  }
  const out = path.join(OUT, file);
  await io.write(out, doc);
  const report = { templateId: id, transforms: ["dedup", "weld"], before: { ...s0, bytes: fs.statSync(path.join(RAW, file)).size }, after: { ...s1, bytes: fs.statSync(out).size }, semanticNodesUnchanged: same };
  fs.writeFileSync(`assets/manifests/${id}.optimize-report.json`, JSON.stringify(report, null, 2));
  console.log(`${id}: ${report.before.bytes} -> ${report.after.bytes} bytes, nodes ${s1.nodes}, materials ${s0.materials}->${s1.materials}, textures ${s0.textures}->${s1.textures}, semantic nodes unchanged`);
}
