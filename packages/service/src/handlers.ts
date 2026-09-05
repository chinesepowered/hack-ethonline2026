import type { Request, Response } from "express";
import {
  DEX_PROTOCOLS,
  LENDING_PROTOCOLS,
  envOptional,
  fetchDexWhales,
  fetchLendingHealth,
  fetchPoolRisk,
  findPools,
  getProtocol,
  loadEnsDeployment,
  parseProtocolList,
  scoreLending,
  scorePool,
  type Catalog,
  type WhalesResponse,
} from "@rugradar/shared";
import { FACILITATOR_URL, NETWORK, PAY_TO, PRICING, USDC, audit } from "./x402.ts";
import { whaleWire } from "./substreams.ts";

const str = (v: unknown): string | undefined => (Array.isArray(v) ? String(v[0]) : v === undefined ? undefined : String(v));

function fail(res: Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

export async function whales(req: Request, res: Response): Promise<void> {
  try {
    const minUsd = Number(str(req.query.minUsd) ?? 250_000);
    const lookback = Math.min(7 * 86_400, Math.max(300, Number(str(req.query.lookback) ?? 86_400)));
    const limit = Math.min(50, Math.max(1, Number(str(req.query.limit) ?? 15)));
    const protocols = parseProtocolList(str(req.query.protocols), "dex-amm");
    const since = Math.floor(Date.now() / 1000) - lookback;

    const results = await Promise.allSettled(protocols.map((p) => fetchDexWhales(p, minUsd, since, limit)));
    const perProtocolErrors: Record<string, string> = {};
    const events = results.flatMap((r, i) => {
      if (r.status === "fulfilled") return r.value;
      perProtocolErrors[protocols[i].key] = r.reason instanceof Error ? r.reason.message : String(r.reason);
      return [];
    });
    events.sort((a, b) => b.amountUsd - a.amountUsd);
    const body: WhalesResponse = {
      generatedAt: new Date().toISOString(),
      source: "the-graph:messari-standardized-subgraphs",
      minUsd,
      lookbackSeconds: lookback,
      protocols: protocols.map((p) => p.key),
      events: events.slice(0, limit * 2),
      perProtocolErrors,
    };
    res.json(body);
  } catch (err) {
    fail(res, 400, err instanceof Error ? err.message : String(err));
  }
}

export async function poolRisk(req: Request, res: Response): Promise<void> {
  try {
    const protocolKey = str(req.query.protocol);
    const lookback = Math.min(7 * 86_400, Math.max(3600, Number(str(req.query.lookback) ?? 86_400)));
    let poolId = str(req.query.pool);
    const tokens = str(req.query.tokens);
    let protocol = protocolKey ? getProtocol(protocolKey) : undefined;

    if (!poolId) {
      if (!tokens) return fail(res, 400, "pass ?pool=0x... (with ?protocol=) or ?tokens=WETH,USDC");
      const matches = await findPools(tokens.split(","), protocol ? [protocol] : DEX_PROTOCOLS);
      if (!matches.length) return fail(res, 404, `no pool found for tokens ${tokens}`);
      const best = matches.sort((a, b) => b.tvlUsd - a.tvlUsd)[0];
      poolId = best.id;
      protocol = getProtocol(best.protocol);
    }
    if (!protocol) return fail(res, 400, "?protocol= is required when passing ?pool=");
    if (protocol.schema !== "dex-amm") return fail(res, 400, `${protocol.key} is a lending protocol; use /v1/protocol-health`);

    const since = Math.floor(Date.now() / 1000) - lookback;
    const pool = await fetchPoolRisk(protocol, poolId, since);
    if (!pool) return fail(res, 404, `pool ${poolId} not found on ${protocol.key}`);
    res.json(scorePool(protocol.key, pool, lookback));
  } catch (err) {
    fail(res, 400, err instanceof Error ? err.message : String(err));
  }
}

export async function protocolHealth(req: Request, res: Response): Promise<void> {
  try {
    const protocol = getProtocol(str(req.query.protocol) ?? "aave-v3");
    if (protocol.schema !== "lending") return fail(res, 400, `${protocol.key} is a DEX; use /v1/pool-risk`);
    const lookback = Math.min(7 * 86_400, Math.max(3600, Number(str(req.query.lookback) ?? 86_400)));
    const since = Math.floor(Date.now() / 1000) - lookback;
    const data = await fetchLendingHealth(protocol, since);
    res.json(scoreLending(protocol.key, data, lookback));
  } catch (err) {
    fail(res, 400, err instanceof Error ? err.message : String(err));
  }
}

export function catalog(serviceUrl: string) {
  return (_req: Request, res: Response) => {
    const ens = loadEnsDeployment();
    const body: Catalog = {
      name: "Rug Radar",
      version: "0.1.0",
      ens: envOptional("ENS_SERVICE_NAME") ?? (ens ? `api.${ens.parentName}` : null),
      network: NETWORK,
      payTo: PAY_TO,
      assets: [`HBAR (0.0.0)`, `USDC (${USDC})`],
      facilitator: FACILITATOR_URL,
      hcsAuditTopic: audit.topicId,
      registration: `${serviceUrl}/.well-known/agent-registration.json`,
      endpoints: [
        {
          path: "/v1/whales",
          method: "GET",
          description: "Largest swaps and LP withdrawals across DEXes (one standardized query per protocol).",
          pricing: `${PRICING.whalesBase} HBAR + ${PRICING.whalesPerProtocol} HBAR per protocol`,
          params: {
            protocols: `comma list or "all" (${DEX_PROTOCOLS.map((p) => p.key).join(",")})`,
            minUsd: "USD threshold (default 250000)",
            lookback: "seconds, 300..604800 (default 86400)",
            limit: "per protocol, 1..50 (default 15)",
          },
        },
        {
          path: "/v1/pool-risk",
          method: "GET",
          description: "Drain-risk score 0..100 with factor evidence for one liquidity pool.",
          pricing: `${PRICING.poolRiskBase} HBAR + ${PRICING.poolRiskPerExtraDay} HBAR per extra lookback day`,
          params: {
            protocol: "dex key (required with pool)",
            pool: "pool address",
            tokens: "alternative to pool: e.g. WETH,USDC → deepest matching pool across DEXes",
            lookback: "seconds, 3600..604800 (default 86400)",
          },
        },
        {
          path: "/v1/protocol-health",
          method: "GET",
          description: "Lending stress score: utilization, hot markets, liquidations.",
          pricing: `${PRICING.protocolHealth} HBAR`,
          params: { protocol: `lending key (${LENDING_PROTOCOLS.map((p) => p.key).join(",")})`, lookback: "seconds (default 86400)" },
        },
        {
          path: "/v1/stream/whales",
          method: "GET",
          description: `Server-Sent Events whale wire (${whaleWire.status.mode === "substreams" ? "Substreams live" : "subgraph poll"}). Pay per window, re-request to extend.`,
          pricing: `${PRICING.streamPer15s} HBAR per 15 s, max ${PRICING.streamMaxSeconds} s per payment`,
          params: { seconds: "15..120 (default 15)", minUsd: "USD threshold (default 1000000)" },
        },
      ],
    };
    res.json(body);
  };
}
