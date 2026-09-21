import { liveEnabled } from "./access.js";
import { createConnectorClients } from "../packages/core/src/connectors.js";
import type { Connectors } from "../packages/core/src/conversation.js";
export { createConnectorClients } from "../packages/core/src/connectors.js";
export {
  executeTurn,
  evaluateCase,
  type Connectors,
} from "../packages/core/src/conversation.js";

export function serverConnectors(
  keys: { jev?: string; openai?: string } = {
    ...(process.env.TYPESAFE_API_KEY
      ? { jev: process.env.TYPESAFE_API_KEY }
      : {}),
    ...(process.env.OPENAI_API_KEY
      ? { openai: process.env.OPENAI_API_KEY }
      : {}),
  },
): Connectors {
  if (!liveEnabled()) return {};
  return createConnectorClients(keys);
}
