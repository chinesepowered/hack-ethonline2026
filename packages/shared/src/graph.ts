import { env } from "./env.ts";
import { DEX_PROTOCOLS, type ProtocolDef } from "./protocols.ts";
import type { WhaleEvent } from "./types.ts";

const GATEWAY = "https://gateway.thegraph.com/api/subgraphs/id";

export class GraphError extends Error {
  constructor(
    message: string,
    public readonly protocol: string,
  ) {
    super(message);
  }
}

/** One query string, many protocols — the point of a standardized schema. */
export async function querySubgraph<T>(protocol: ProtocolDef, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${GATEWAY}/${protocol.subgraphId}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env("GRAPH_API_KEY")}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new GraphError(`gateway HTTP ${res.status} for ${protocol.key}: ${(await res.text()).slice(0, 200)}`, protocol.key);
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new GraphError(`${protocol.key}: ${json.errors.map((e) => e.message).join("; ")}`, protocol.key);
  }
  if (!json.data) throw new GraphError(`${protocol.key}: empty data`, protocol.key);
  return json.data;
}

export const explorerTx = (hash: string) => `https://etherscan.io/tx/${hash}`;
export const num = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

/**
 * The one place the standard drifted between major versions: event actors are
 * `from` (dex-amm 1.3.x) vs `account { id }` (dex-amm 4.x). Everything else in the
 * queries below is identical across every protocol.
 */
const isV4 = (p: ProtocolDef) => p.schemaVersion.startsWith("4.");
const actorField = (p: ProtocolDef) => (isV4(p) ? "account { id }" : "from");
type Actor = { from?: string; account?: { id: string } };
const actorOf = (e: Actor) => e.from ?? e.account?.id ?? "";
const idLiteral = (id: string) => JSON.stringify(id.toLowerCase());

// ───────────────────────────── DEX: whales ──────────────────────────────

const dexWhalesQuery = (p: ProtocolDef) => /* GraphQL */ `
  query Whales($minUsd: BigDecimal!, $since: BigInt!, $limit: Int!) {
    swaps(first: $limit, orderBy: amountInUSD, orderDirection: desc,
          where: { amountInUSD_gt: $minUsd, timestamp_gt: $since }) {
      hash timestamp ${actorField(p)} amountInUSD amountOutUSD
      tokenIn { symbol } tokenOut { symbol }
      pool { id name }
    }
    withdraws(first: $limit, orderBy: amountUSD, orderDirection: desc,
              where: { amountUSD_gt: $minUsd, timestamp_gt: $since }) {
      hash timestamp ${actorField(p)} amountUSD
      pool { id name }
    }
  }
`;

interface DexWhalesData {
  swaps: Array<
    Actor & {
      hash: string;
      timestamp: string;
      amountInUSD: string;
      amountOutUSD: string;
      tokenIn: { symbol: string };
      tokenOut: { symbol: string };
      pool: { id: string; name: string | null };
    }
  >;
  withdraws: Array<Actor & { hash: string; timestamp: string; amountUSD: string; pool: { id: string; name: string | null } }>;
}

export async function fetchDexWhales(protocol: ProtocolDef, minUsd: number, sinceUnix: number, limit: number): Promise<WhaleEvent[]> {
  const data = await querySubgraph<DexWhalesData>(protocol, dexWhalesQuery(protocol), {
    minUsd: minUsd.toString(),
    since: sinceUnix.toString(),
    limit,
  });
  const swaps: WhaleEvent[] = data.swaps.map((s) => ({
    protocol: protocol.key,
    kind: "swap",
    hash: s.hash,
    timestamp: Number(s.timestamp),
    from: actorOf(s),
    amountUsd: num(s.amountInUSD),
    pool: s.pool,
    detail: `${s.tokenIn.symbol} → ${s.tokenOut.symbol} ($${fmt(num(s.amountInUSD))})`,
    explorer: explorerTx(s.hash),
  }));
  const withdraws: WhaleEvent[] = data.withdraws.map((w) => ({
    protocol: protocol.key,
    kind: "withdraw",
    hash: w.hash,
    timestamp: Number(w.timestamp),
    from: actorOf(w),
    amountUsd: num(w.amountUSD),
    pool: w.pool,
    detail: `LP withdraw $${fmt(num(w.amountUSD))} from ${w.pool.name ?? w.pool.id}`,
    explorer: explorerTx(w.hash),
  }));
  return [...swaps, ...withdraws];
}

// ───────────────────────────── DEX: pool risk ───────────────────────────

const poolRiskQuery = (p: ProtocolDef, poolId: string) => /* GraphQL */ `
  query PoolRisk($since: BigInt!) {
    liquidityPool(id: ${idLiteral(poolId)}) {
      id name symbol totalValueLockedUSD cumulativeVolumeUSD createdTimestamp
      inputTokens { symbol lastPriceUSD }
      dailySnapshots(first: 8, orderBy: timestamp, orderDirection: desc) {
        timestamp totalValueLockedUSD dailyVolumeUSD
      }
      withdraws(first: 100, orderBy: amountUSD, orderDirection: desc, where: { timestamp_gt: $since }) {
        hash timestamp ${actorField(p)} amountUSD
      }
      deposits(first: 100, orderBy: amountUSD, orderDirection: desc, where: { timestamp_gt: $since }) {
        amountUSD
      }
      swaps(first: 50, orderBy: amountInUSD, orderDirection: desc, where: { timestamp_gt: $since }) {
        hash timestamp ${actorField(p)} amountInUSD tokenIn { symbol } tokenOut { symbol }
      }
    }
  }
`;

export interface PoolRiskPool {
  id: string;
  name: string | null;
  symbol: string | null;
  totalValueLockedUSD: string;
  cumulativeVolumeUSD: string;
  createdTimestamp: string;
  inputTokens: Array<{ symbol: string; lastPriceUSD: string | null }>;
  dailySnapshots: Array<{ timestamp: string; totalValueLockedUSD: string; dailyVolumeUSD: string }>;
  withdraws: Array<{ hash: string; timestamp: string; from: string; amountUSD: string }>;
  deposits: Array<{ amountUSD: string }>;
  swaps: Array<{ hash: string; timestamp: string; from: string; amountInUSD: string; tokenIn: { symbol: string }; tokenOut: { symbol: string } }>;
}

type RawPool = Omit<PoolRiskPool, "withdraws" | "swaps"> & {
  withdraws: Array<Actor & { hash: string; timestamp: string; amountUSD: string }>;
  swaps: Array<Actor & { hash: string; timestamp: string; amountInUSD: string; tokenIn: { symbol: string }; tokenOut: { symbol: string } }>;
};

export async function fetchPoolRisk(protocol: ProtocolDef, poolId: string, sinceUnix: number): Promise<PoolRiskPool | null> {
  const data = await querySubgraph<{ liquidityPool: RawPool | null }>(protocol, poolRiskQuery(protocol, poolId), { since: sinceUnix.toString() });
  const p = data.liquidityPool;
  if (!p) return null;
  return {
    ...p,
    withdraws: p.withdraws.map((w) => ({ hash: w.hash, timestamp: w.timestamp, from: actorOf(w), amountUSD: w.amountUSD })),
    swaps: p.swaps.map((s) => ({ hash: s.hash, timestamp: s.timestamp, from: actorOf(s), amountInUSD: s.amountInUSD, tokenIn: s.tokenIn, tokenOut: s.tokenOut })),
  };
}

const TOP_POOLS_QUERY = /* GraphQL */ `
  query TopPools($limit: Int!) {
    liquidityPools(first: $limit, orderBy: totalValueLockedUSD, orderDirection: desc) {
      id name symbol totalValueLockedUSD inputTokens { symbol }
    }
  }
`;

export async function fetchTopPools(protocol: ProtocolDef, limit = 10) {
  const data = await querySubgraph<{
    liquidityPools: Array<{ id: string; name: string | null; symbol: string | null; totalValueLockedUSD: string; inputTokens: Array<{ symbol: string }> }>;
  }>(protocol, TOP_POOLS_QUERY, { limit });
  return data.liquidityPools.map((p) => ({
    protocol: protocol.key,
    id: p.id,
    name: p.name,
    symbol: p.symbol,
    tvlUsd: num(p.totalValueLockedUSD),
    tokens: p.inputTokens.map((t) => t.symbol),
  }));
}

/** Search pools by token symbols across every DEX with the same query. */
export async function findPools(symbols: string[], protocols: ProtocolDef[] = DEX_PROTOCOLS, perProtocol = 50) {
  const wanted = symbols.map((s) => s.trim().toUpperCase());
  const results = await Promise.allSettled(protocols.map((p) => fetchTopPools(p, perProtocol)));
  const pools = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  return pools.filter((p) => wanted.every((w) => p.tokens.some((t) => t.toUpperCase() === w)));
}

// ───────────────────────────── token prices ─────────────────────────────

export async function fetchTokenPrices(protocol: ProtocolDef, ids: string[]): Promise<Record<string, number>> {
  const query = /* GraphQL */ `{ tokens(where: { id_in: [${ids.map(idLiteral).join(",")}] }) { id symbol lastPriceUSD } }`;
  const data = await querySubgraph<{ tokens: Array<{ id: string; symbol: string; lastPriceUSD: string | null }> }>(protocol, query);
  const out: Record<string, number> = {};
  for (const t of data.tokens) out[t.id.toLowerCase()] = num(t.lastPriceUSD);
  return out;
}

// ───────────────────────────── lending: health ──────────────────────────

const LENDING_HEALTH_QUERY = /* GraphQL */ `
  query Health($since: BigInt!) {
    markets(first: 25, orderBy: totalValueLockedUSD, orderDirection: desc, where: { isActive: true }) {
      id name inputToken { symbol } totalValueLockedUSD totalDepositBalanceUSD totalBorrowBalanceUSD liquidationThreshold
    }
    liquidates(first: 50, orderBy: amountUSD, orderDirection: desc, where: { timestamp_gt: $since }) {
      hash timestamp amountUSD profitUSD liquidator { id } market { id name } asset { symbol }
    }
  }
`;

export interface LendingHealthData {
  markets: Array<{
    id: string;
    name: string | null;
    inputToken: { symbol: string };
    totalValueLockedUSD: string;
    totalDepositBalanceUSD: string;
    totalBorrowBalanceUSD: string;
    liquidationThreshold: string;
  }>;
  liquidates: Array<{
    hash: string;
    timestamp: string;
    amountUSD: string;
    profitUSD: string;
    liquidator: { id: string };
    market: { id: string; name: string | null };
    asset: { symbol: string };
  }>;
}

export async function fetchLendingHealth(protocol: ProtocolDef, sinceUnix: number): Promise<LendingHealthData> {
  return querySubgraph<LendingHealthData>(protocol, LENDING_HEALTH_QUERY, { since: sinceUnix.toString() });
}

export function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
