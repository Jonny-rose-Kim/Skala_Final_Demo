/**
 * Reproducible geometry export: writes every procedural part of the representative chamber as
 * Wavefront OBJ (assembled state) so the geometry can be inspected or imported into Blender for
 * asset refinement. Output: assets/exports/<assetId>__<key>.obj plus a manifest.
 *   node --import tsx scripts/export-geometry-obj.ts [outDir]
 */
import fs from "node:fs";
import path from "node:path";
import { CHAMBER_LAYOUT, GEOMETRY_CONFIG, TAU } from "../src/config/geometry.ts";
import { buildChamberParts } from "../src/geometry/chamberParts.ts";

const outDir = process.argv[2] ?? "assets/exports";
fs.mkdirSync(outDir, { recursive: true });
const parts = buildChamberParts(CHAMBER_LAYOUT);
const manifest: { file: string; assetId: string; key: string; materialRef: string; vertices: number; triangles: number }[] = [];
for (const p of parts) {
  const md = p.build([{ start: 0, sweep: TAU }]);
  const lines: string[] = [`# PECVD FAB Twin procedural part ${p.assetId}/${p.key}`, `# geometry_revision ${GEOMETRY_CONFIG.geometry_revision}`, `o ${p.assetId}__${p.key}`];
  for (let i = 0; i < md.positions.length; i += 3) lines.push(`v ${md.positions[i].toFixed(6)} ${md.positions[i + 1].toFixed(6)} ${md.positions[i + 2].toFixed(6)}`);
  for (let i = 0; i < md.normals.length; i += 3) lines.push(`vn ${md.normals[i].toFixed(5)} ${md.normals[i + 1].toFixed(5)} ${md.normals[i + 2].toFixed(5)}`);
  for (let i = 0; i < md.uvs.length; i += 2) lines.push(`vt ${md.uvs[i].toFixed(5)} ${md.uvs[i + 1].toFixed(5)}`);
  for (let i = 0; i < md.indices.length; i += 3) {
    const a = md.indices[i] + 1;
    const b = md.indices[i + 1] + 1;
    const c = md.indices[i + 2] + 1;
    lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
  }
  const file = `${p.assetId}__${p.key}.obj`;
  fs.writeFileSync(path.join(outDir, file), lines.join("\n"));
  manifest.push({ file, assetId: p.assetId, key: p.key, materialRef: p.materialRef, vertices: md.positions.length / 3, triangles: md.indices.length / 3 });
}
fs.writeFileSync(path.join(outDir, "export-manifest.json"), JSON.stringify({ geometry_revision: GEOMETRY_CONFIG.geometry_revision, units: "m", up_axis: "+Y", handedness: "left (Babylon)", parts: manifest }, null, 2));
console.log(`exported ${manifest.length} parts to ${outDir}`);
