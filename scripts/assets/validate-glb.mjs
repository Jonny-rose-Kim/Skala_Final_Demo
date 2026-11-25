// Validates the runtime GLBs: Khronos glTF-Validator (errors fail the run) + the semantic manifest check
// (every manifest node exists with the same extras, every extras node is in the manifest).
// The validator does not check dimensions, joints or handoffs; those are covered by the app tests.
import fs from "node:fs";
import path from "node:path";
import validator from "gltf-validator";

const DIR = "public/models";
let failed = false;
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".glb"))) {
  const id = path.basename(file, ".glb");
  const data = new Uint8Array(fs.readFileSync(path.join(DIR, file)));
  const rep = await validator.validateBytes(data, { maxIssues: 50 });
  const iss = rep.issues;
  const manifest = JSON.parse(fs.readFileSync(`assets/manifests/${id}.glb-manifest.json`, "utf8"));
  // semantic check against the JSON chunk
  const dv = new DataView(data.buffer);
  const jsonLen = dv.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(data.slice(20, 20 + jsonLen)));
  const byName = new Map(gltf.nodes.map((n) => [n.name, n]));
  const problems = [];
  for (const m of manifest.nodes) {
    const n = byName.get(m.node);
    if (!n) problems.push(`missing node ${m.node}`);
    else if (n.extras?.assetId !== m.assetId || n.extras?.partKey !== m.partKey) problems.push(`extras mismatch on ${m.node}`);
  }
  const tagged = gltf.nodes.filter((n) => n.extras?.assetId);
  if (tagged.length !== manifest.nodes.length) problems.push(`manifest lists ${manifest.nodes.length} nodes, GLB has ${tagged.length} tagged nodes`);
  const out = { templateId: id, validator: { version: rep.validatorVersion, errors: iss.numErrors, warnings: iss.numWarnings, infos: iss.numInfos, hints: iss.numHints, messages: iss.messages.slice(0, 20).map((m) => `${m.severity === 0 ? "E" : m.severity === 1 ? "W" : "I"} ${m.code} ${m.pointer ?? ""} ${m.message}`) }, semantic: { problems } };
  fs.writeFileSync(`assets/manifests/${id}.validation.json`, JSON.stringify(out, null, 2));
  console.log(`${id}: validator ${rep.validatorVersion} errors=${iss.numErrors} warnings=${iss.numWarnings} infos=${iss.numInfos}; semantic problems=${problems.length}`);
  if (iss.numErrors > 0 || problems.length) failed = true;
}
process.exit(failed ? 1 : 0);
