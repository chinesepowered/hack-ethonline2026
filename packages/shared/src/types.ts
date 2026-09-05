export interface WhaleEvent {
  protocol: string;
  kind: "swap" | "withdraw" | "liquidation" | "transfer";
  hash: string;
  timestamp: number;
  from: string;
  amountUsd: number;
  pool?: { id: string; name: string | null };
  detail: string;
  explorer: string;
}

export interface WhalesResponse {
  generatedAt: string;
  source: "the-graph:messari-standardized-subgraphs";
  minUsd: number;
  lookbackSeconds: number;
  protocols: string[];
  events: WhaleEvent[];
  perProtocolErrors: Record<string, string>;
}

export interface RiskFactor {
  name: string;
  score: number; // contribution 0..100
  weight: number;
  evidence: string;
}

export interface PoolRiskResponse {
  generatedAt: string;
  source: "the-graph:messari-standardized-subgraphs";
  protocol: string;
  pool: {
    id: string;
    name: string | null;
    symbol: string | null;
    tokens: string[];
    tvlUsd: number;
    cumulativeVolumeUsd: number;
    ageDays: number;
  };
  window: { lookbackSeconds: number; snapshotsDays: number };
  metrics: {
    tvlNowUsd: number;
    tvl7dAgoUsd: number | null;
    tvlChange7dPct: number | null;
    withdraws24hUsd: number;
    deposits24hUsd: number;
    netFlow24hUsd: number;
    withdraw24hToTvlPct: number;
    largestWithdrawUsd: number;
    largestWithdrawShare: number;
    volume24hUsd: number;
    swapsAbove100kCount: number;
  };
  score: number; // 0 (calm) .. 100 (drain in progress)
  level: "calm" | "watch" | "elevated" | "critical";
  factors: RiskFactor[];
  recentWithdraws: WhaleEvent[];
  recentSwaps: WhaleEvent[];
}

export interface ProtocolHealthResponse {
  generatedAt: string;
  source: "the-graph:messari-standardized-subgraphs";
  protocol: string;
  window: { lookbackSeconds: number };
  totals: {
    tvlUsd: number;
    depositsUsd: number;
    borrowsUsd: number;
    utilizationPct: number;
    liquidations24hUsd: number;
    liquidations24hCount: number;
  };
  markets: Array<{
    id: string;
    name: string | null;
    token: string;
    tvlUsd: number;
    depositsUsd: number;
    borrowsUsd: number;
    utilizationPct: number;
    liquidationThreshold: number;
  }>;
  liquidations: WhaleEvent[];
  stress: { score: number; level: "calm" | "watch" | "elevated" | "critical"; factors: RiskFactor[] };
}

export interface CatalogEndpoint {
  path: string;
  method: "GET";
  description: string;
  pricing: string;
  params: Record<string, string>;
}

export interface Catalog {
  name: string;
  version: string;
  ens: string | null;
  network: string;
  payTo: string;
  assets: string[];
  facilitator: string;
  hcsAuditTopic: string | null;
  registration: string;
  endpoints: CatalogEndpoint[];
}
