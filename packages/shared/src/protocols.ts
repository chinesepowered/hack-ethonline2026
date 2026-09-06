/**
 * Messari Standardized Subgraphs on The Graph Network (Ethereum mainnet).
 *
 * Every DEX entry exposes the same `dex-amm` schema (LiquidityPool / Swap /
 * Deposit / Withdraw / LiquidityPoolDailySnapshot) and every lending entry the
 * same `lending` schema (Market / Liquidate / Withdraw). That is the leverage:
 * one query string, N protocols. IDs come from messari/subgraphs
 * deployment/deployment.json (decentralized-network query-id).
 *
 * Verified live on 2026-09-06 (`pnpm graph:smoke`): all entries below are at chain head.
 * Dropped: balancer-v2-ethereum (indexers report indexing_error) and
 * pancakeswap-v3-ethereum (no allocations on the network).
 */
export type Schema = "dex-amm" | "lending";

export interface ProtocolDef {
  key: string;
  name: string;
  schema: Schema;
  schemaVersion: string;
  subgraphId: string;
}

export const PROTOCOLS: Record<string, ProtocolDef> = {
  "uniswap-v3": {
    key: "uniswap-v3",
    name: "Uniswap v3",
    schema: "dex-amm",
    schemaVersion: "4.0.0",
    subgraphId: "4cKy6QQMc5tpfdx8yxfYeb9TLZmgLQe44ddW1G7NwkA6",
  },
  "uniswap-v2": {
    key: "uniswap-v2",
    name: "Uniswap v2",
    schema: "dex-amm",
    schemaVersion: "1.3.2",
    subgraphId: "3onEbd9MLfXTTWAfP91yqsKr7C68VCT2ZiF7EoQiQAFj",
  },
  sushiswap: {
    key: "sushiswap",
    name: "SushiSwap",
    schema: "dex-amm",
    schemaVersion: "1.3.2",
    subgraphId: "77jZ9KWeyi3CJ96zkkj5s1CojKPHt6XJKjLFzsDCd8Fd",
  },
  curve: {
    key: "curve",
    name: "Curve",
    schema: "dex-amm",
    schemaVersion: "1.3.0",
    subgraphId: "3fy93eAT56UJsRCEht8iFhfi6wjHWXtZ9dnnbQmvFopF",
  },
  "aave-v3": {
    key: "aave-v3",
    name: "Aave v3",
    schema: "lending",
    schemaVersion: "3.1.0",
    subgraphId: "JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk",
  },
  "compound-v3": {
    key: "compound-v3",
    name: "Compound v3",
    schema: "lending",
    schemaVersion: "3.1.0",
    subgraphId: "AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9",
  },
  "spark-lend": {
    key: "spark-lend",
    name: "Spark",
    schema: "lending",
    schemaVersion: "3.1.0",
    subgraphId: "GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si",
  },
};

export const DEX_PROTOCOLS = Object.values(PROTOCOLS).filter((p) => p.schema === "dex-amm");
export const LENDING_PROTOCOLS = Object.values(PROTOCOLS).filter((p) => p.schema === "lending");

export function getProtocol(key: string): ProtocolDef {
  const p = PROTOCOLS[key];
  if (!p) {
    throw new Error(`Unknown protocol "${key}". Known: ${Object.keys(PROTOCOLS).join(", ")}`);
  }
  return p;
}

export function parseProtocolList(raw: string | undefined, schema: Schema): ProtocolDef[] {
  const all = Object.values(PROTOCOLS).filter((p) => p.schema === schema);
  if (!raw || raw === "all") return all;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((k) => {
      const p = getProtocol(k);
      if (p.schema !== schema) throw new Error(`Protocol ${k} is ${p.schema}, expected ${schema}`);
      return p;
    });
}

/** Ethereum mainnet tokens watched by the Substreams whale wire. */
export const WATCHED_TOKENS: Record<string, { symbol: string; decimals: number; stable: boolean }> = {
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { symbol: "USDC", decimals: 6, stable: true },
  "0xdac17f958d2ee523a2206206994597c13d831ec7": { symbol: "USDT", decimals: 6, stable: true },
  "0x6b175474e89094c44da98b954eedeac495271d0f": { symbol: "DAI", decimals: 18, stable: true },
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": { symbol: "WETH", decimals: 18, stable: false },
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": { symbol: "WBTC", decimals: 8, stable: false },
};
