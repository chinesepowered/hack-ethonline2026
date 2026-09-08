/**
 * Enhanced Access Control in action (CLI): the SERVICE's own key updates the one text
 * record it was delegated — `x402.pricing` — and is refused on any other key.
 *
 * Usage: pnpm ens:service-update api "whales 0.02+0.005/protocol; ..."   (env: ENS_SERVICE_EVM_PRIVATE_KEY)
 */
import { eacDemo } from "./lib/eac.ts";

const argv = process.argv.filter((a) => a !== "--");
const label = argv[2];
const value = argv[3];
if (!label || !value) throw new Error('usage: pnpm ens:service-update <label> "<new x402.pricing value>"');

await eacDemo(label, value, (s) => console.log(`  ${s.ok ? "✓" : "✗"} ${s.step}: ${s.detail}${s.tx ? `\n      ${s.tx}` : ""}`));
