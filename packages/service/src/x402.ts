/**
 * x402 resource server for Hedera, settled through the Blocky402 facilitator.
 *
 * Pricing is metered, not flat: whale scans price per protocol, pool risk per
 * lookback window, the live stream per 15-second window. Every settled payment
 * is appended to a Hedera Consensus Service topic as a verifiable audit trail.
 */
import { HTTPFacilitatorClient, x402ResourceServer, type HTTPTransportContext, type RouteConfig, type RoutesConfig } from "@x402/core/server";
import type { HTTPRequestContext } from "@x402/core/server";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { HBAR_ASSET, USDC_ASSET, auditLogger, caip2, env, hbarToTinybar, hederaNetwork, tinybarToHbar } from "@rugradar/shared";

export const FACILITATOR_URL = env(
  "X402_FACILITATOR_URL",
  hederaNetwork() === "mainnet" ? "https://api.blocky402.com" : "https://api.testnet.blocky402.com",
);
export const PAY_TO = env("HEDERA_SERVICE_ACCOUNT_ID");
export const NETWORK = caip2();
export const USDC = USDC_ASSET[hederaNetwork()];

/** Price table in HBAR. Exposed in /v1/catalog and in the ENS `x402.pricing` record. */
export const PRICING = {
  whalesBase: 0.01,
  whalesPerProtocol: 0.005,
  poolRiskBase: 0.03,
  poolRiskPerExtraDay: 0.01,
  protocolHealth: 0.02,
  streamPer15s: 0.02,
  streamMaxSeconds: 120,
} as const;

/** 1 HBAR ≈ $0.10 is only used to quote a USDC alternative; HBAR is canonical. */
const HBAR_USD = 0.1;

const hbarOption = (hbar: number) => ({ asset: HBAR_ASSET, amount: hbarToTinybar(hbar) });
const usdcOption = (hbar: number) => ({ asset: USDC, amount: String(Math.max(1, Math.round(hbar * HBAR_USD * 1e6))) });

const q = (ctx: HTTPRequestContext, name: string): string | undefined => {
  const v = ctx.adapter.getQueryParam?.(name);
  return Array.isArray(v) ? v[0] : v;
};

export function quoteWhales(protocolsParam: string | undefined): number {
  const n = !protocolsParam || protocolsParam === "all" ? 6 : protocolsParam.split(",").filter(Boolean).length;
  return PRICING.whalesBase + PRICING.whalesPerProtocol * n;
}
export function quotePoolRisk(lookbackSeconds: number): number {
  const extraDays = Math.max(0, Math.ceil(lookbackSeconds / 86_400) - 1);
  return PRICING.poolRiskBase + PRICING.poolRiskPerExtraDay * extraDays;
}
export function quoteStream(seconds: number): number {
  const s = Math.min(PRICING.streamMaxSeconds, Math.max(15, seconds));
  return PRICING.streamPer15s * Math.ceil(s / 15);
}

/** Two `accepts` entries per route: HBAR (canonical) and USDC (HTS token). */
function metered(quote: (ctx: HTTPRequestContext) => number, description: string): RouteConfig {
  return {
    description,
    mimeType: "application/json",
    accepts: [
      { scheme: "exact", network: NETWORK, payTo: PAY_TO, price: (ctx) => hbarOption(quote(ctx)) },
      { scheme: "exact", network: NETWORK, payTo: PAY_TO, price: (ctx) => usdcOption(quote(ctx)) },
    ],
  };
}

export const routes: RoutesConfig = {
  "GET /v1/whales": metered(
    (ctx) => quoteWhales(q(ctx, "protocols")),
    "Cross-protocol whale swaps & LP withdrawals from Messari standardized subgraphs. Priced per protocol scanned.",
  ),
  "GET /v1/pool-risk": metered(
    (ctx) => quotePoolRisk(Number(q(ctx, "lookback") ?? 86_400)),
    "Drain-risk score for one liquidity pool (TVL drawdown, withdrawal pressure, concentration). Priced per lookback day.",
  ),
  "GET /v1/protocol-health": metered(() => PRICING.protocolHealth, "Lending protocol stress: utilization and liquidations across markets."),
  "GET /v1/stream/whales": {
    ...metered((ctx) => quoteStream(Number(q(ctx, "seconds") ?? 15)), "Live whale wire (Substreams). Streamed micropayments: pay per 15-second window."),
    mimeType: "text/event-stream",
  },
};

export const audit = auditLogger("service");

export function createResourceServer(): x402ResourceServer {
  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const server = new x402ResourceServer(facilitator).register("hedera:*", new ExactHederaScheme({}));

  server.onAfterSettle(async (ctx) => {
    const transport = ctx.transportContext as HTTPTransportContext | undefined;
    const path = transport?.request?.path ?? "?";
    const amount = String(ctx.requirements.amount);
    const asset = String(ctx.requirements.asset);
    const human = asset === HBAR_ASSET ? `${tinybarToHbar(amount)} HBAR` : `${Number(amount) / 1e6} USDC`;
    console.log(`[x402] settled ${human} from ${ctx.result.payer ?? "?"} for ${path} → tx ${ctx.result.transaction}`);
    const consensusTx = await audit.log({
      v: 1,
      kind: "x402.settled",
      at: new Date().toISOString(),
      path,
      network: ctx.result.network,
      payer: ctx.result.payer ?? null,
      payTo: PAY_TO,
      asset,
      amount,
      settlementTx: ctx.result.transaction,
    });
    if (consensusTx) console.log(`[hcs] audit record ${consensusTx} on topic ${audit.topicId}`);
  });

  server.onSettleFailure(async (ctx) => {
    console.warn(`[x402] settlement failed: ${ctx.error.message}`);
  });

  return server;
}
