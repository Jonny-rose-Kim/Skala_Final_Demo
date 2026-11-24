/**
 * Registers every equipment bundle, its scene effects and its scenarios. Imported once by the scene host
 * and by the UI (side-effect module). Order defines the scenario list order.
 */
import { registerBundle } from "../domain/registry";
import { registerScenario } from "../presentation/scenarioRegistry";
import { registerEffects } from "../scene/effectsRegistry";
import { CCP_BUNDLE, CCP_TEMPLATE_ID } from "./ccp/index";
import { createCcpEffects } from "./ccp/effects";
import { CCP_HANDLING_SCENARIO, CCP_STANDALONE_SCENARIO } from "./ccp/scenario";
import { REMOTE_BUNDLE, REMOTE_TEMPLATE_ID } from "./remote/index";
import { createRemoteEffects } from "./remote/effects";
import { REMOTE_HANDLING_SCENARIO, REMOTE_STANDALONE_SCENARIO } from "./remote/scenario";
import { CMP_BUNDLE, CMP_TEMPLATE_ID } from "./cmp/index";
import { createCmpEffects } from "./cmp/effects";
import { CMP_STANDALONE_SCENARIO } from "./cmp/scenario";
import { OHT_BUNDLE, OHT_TEMPLATE_ID } from "./oht/index";
import { createOhtEffects } from "./oht/effects";
import { OHT_STANDALONE_SCENARIO } from "./oht/scenario";
import { FOUP_BUNDLE } from "./foup/index";
import { PRODUCER_BUNDLE, PRODUCER_TEMPLATE_ID } from "./producer/index";
import { PRODUCER_HANDLING_SCENARIO } from "./producer/scenario";
import { TACTRAS_BUNDLE, TACTRAS_TEMPLATE_ID } from "./tactras/index";
import { createTactrasEffects } from "./tactras/effects";
import { TACTRAS_HANDLING_SCENARIO } from "./tactras/scenario";
import { CELLESTA_BUNDLE, CELLESTA_TEMPLATE_ID } from "./cellesta/index";
import { createCellestaEffects } from "./cellesta/effects";
import { CELLESTA_STANDALONE_SCENARIO } from "./cellesta/scenario";
import { ROUTE_A_SCENARIO, ROUTE_B_SCENARIO } from "./routes/index";

let registered = false;

export function registerAllEquipment(): void {
  if (registered) return;
  registered = true;
  registerBundle(CCP_BUNDLE);
  registerEffects(CCP_TEMPLATE_ID, createCcpEffects);
  registerBundle(REMOTE_BUNDLE);
  registerEffects(REMOTE_TEMPLATE_ID, createRemoteEffects);
  registerBundle(CMP_BUNDLE);
  registerEffects(CMP_TEMPLATE_ID, createCmpEffects);
  registerBundle(OHT_BUNDLE);
  registerEffects(OHT_TEMPLATE_ID, (ctx) => createOhtEffects(ctx, ctx.stationMarkers ?? []));
  registerBundle(FOUP_BUNDLE);
  registerBundle(PRODUCER_BUNDLE);
  registerEffects(PRODUCER_TEMPLATE_ID, createCcpEffects);
  registerBundle(TACTRAS_BUNDLE);
  registerEffects(TACTRAS_TEMPLATE_ID, createTactrasEffects);
  registerBundle(CELLESTA_BUNDLE);
  registerEffects(CELLESTA_TEMPLATE_ID, createCellestaEffects);
  registerScenario(PRODUCER_HANDLING_SCENARIO);
  registerScenario(TACTRAS_HANDLING_SCENARIO);
  registerScenario(CELLESTA_STANDALONE_SCENARIO);
  registerScenario(CCP_STANDALONE_SCENARIO);
  registerScenario(CCP_HANDLING_SCENARIO);
  registerScenario(REMOTE_STANDALONE_SCENARIO);
  registerScenario(REMOTE_HANDLING_SCENARIO);
  registerScenario(CMP_STANDALONE_SCENARIO);
  registerScenario(OHT_STANDALONE_SCENARIO);
  registerScenario(ROUTE_A_SCENARIO);
  registerScenario(ROUTE_B_SCENARIO);
}

registerAllEquipment();
