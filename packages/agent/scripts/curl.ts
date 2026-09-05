/**
 * "curl with a wallet": one paid request without the LLM, for demos and debugging.
 * Usage: pnpm demo:curl "/v1/whales?protocols=uniswap-v3,curve&minUsd=500000"
 *        pnpm demo:curl "/v1/pool-risk?tokens=WETH,USDC"
 * Resolves the service base URL from ENS (ENS_SERVICE_NAME) unless SERVICE_URL_OVERRIDE is set.
 */
import { RECORD_KEYS, envOptional, hashscanTx } from "@rugradar/shared";
import { resolveRecords } from "../src/discovery.ts";
import { createPayingFetch, describe402 } from "../src/x402.ts";

// Git Bash on Windows rewrites a leading "/v1/..." into a filesystem path; recover the API path.
const rawPath = process.argv[2] ?? "/v1/catalog";
const path = "/" + rawPath.replace(/^.*?(?=\/?(v1|\.well-known|health)\b)/, "").replace(/^\/+/, "");
let base = envOptional("SERVICE_URL_OVERRIDE");
if (!base) {
  const name = envOptional("ENS_SERVICE_NAME");
  if (!name) throw new Error("Set ENS_SERVICE_NAME (or SERVICE_URL_OVERRIDE for a local run)");
  const records = await resolveRecords(name, [RECORD_KEYS.endpointX402]);
  const endpoint = records[RECORD_KEYS.endpointX402];
  if (!endpoint) throw new Error(`${name} has no ${RECORD_KEYS.endpointX402} record`);
  base = endpoint.replace(/\/v1\/?$/, "");
  console.log(`ENS ${name} → ${endpoint}`);
}

const pay = createPayingFetch();
const url = `${base}${path}`;
console.log(`GET ${url}`);
const t0 = Date.now();
const { res, payment } = await pay.paidFetch(url);
console.log(`HTTP ${res.status} in ${Date.now() - t0} ms`);
if (res.status === 402) console.log(`payment not accepted: ${describe402(res)}`);
if (payment) {
  console.log(`paid ${payment.hbar} HBAR · settlement ${payment.settlementTx}\n${hashscanTx(payment.settlementTx)}`);
  if (payment.auditTx) console.log(`HCS spend ledger tx ${payment.auditTx}`);
}
const text = await res.text();
console.log(text.length > 4000 ? text.slice(0, 4000) + "\n…" : text);
