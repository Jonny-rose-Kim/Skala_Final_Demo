/**
 * Validates the geometry configuration and equipment template without a browser.
 *   npm run validate:config
 */
import { GEOMETRY_CONFIG, validateGeometryConfig } from "../src/config/geometry.ts";
import { CCP_CHAMBER_TEMPLATE, validateTemplate } from "../src/domain/ccpChamberTemplate.ts";

const geo = validateGeometryConfig(GEOMETRY_CONFIG);
const tpl = validateTemplate(CCP_CHAMBER_TEMPLATE);
console.log(`geometry ${GEOMETRY_CONFIG.geometry_revision}: ${geo.errors.length} error(s), ${geo.warnings.length} warning(s)`);
for (const e of geo.errors) console.log(`  ERROR   ${e}`);
for (const w of geo.warnings) console.log(`  WARNING ${w}`);
console.log(`template ${CCP_CHAMBER_TEMPLATE.templateId} rev ${CCP_CHAMBER_TEMPLATE.templateRevision}: ${tpl.length} error(s)`);
for (const e of tpl) console.log(`  ERROR   ${e}`);
if (geo.errors.length || tpl.length) process.exit(1);
