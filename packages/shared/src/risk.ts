import { explorerTx, fmt, num, type LendingHealthData, type PoolRiskPool } from "./graph.ts";
import type { PoolRiskResponse, ProtocolHealthResponse, RiskFactor, WhaleEvent } from "./types.ts";

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export function levelFor(score: number): "calm" | "watch" | "elevated" | "critical" {
  if (score >= 75) return "critical";
  if (score >= 50) return "elevated";
  if (score >= 25) return "watch";
  return "calm";
}

/**
 * Deterministic drain score for a liquidity pool, from standardized-subgraph data only.
 * Weights sum to 1. Each factor is scored 0..100 then weighted.
 */
export function scorePool(protocol: string, pool: PoolRiskPool, lookbackSeconds: number): PoolRiskResponse {
  const now = Math.floor(Date.now() / 1000);
  const tvlNow = num(pool.totalValueLockedUSD);
  const snaps = [...pool.dailySnapshots].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const oldest = snaps.length >= 2 ? snaps[0] : undefined;
  const tvl7dAgo = oldest ? num(oldest.totalValueLockedUSD) : null;
  const tvlChange7dPct = tvl7dAgo && tvl7dAgo > 0 ? ((tvlNow - tvl7dAgo) / tvl7dAgo) * 100 : null;

  const withdraws = pool.withdraws.map((w) => num(w.amountUSD));
  const deposits = pool.deposits.map((d) => num(d.amountUSD));
  const withdraws24h = withdraws.reduce((a, b) => a + b, 0);
  const deposits24h = deposits.reduce((a, b) => a + b, 0);
  const largestWithdraw = withdraws.length ? Math.max(...withdraws) : 0;
  const largestShare = withdraws24h > 0 ? largestWithdraw / withdraws24h : 0;
  const withdrawToTvl = tvlNow > 0 ? (withdraws24h / tvlNow) * 100 : withdraws24h > 0 ? 100 : 0;
  const volume24h = snaps.length ? num(snaps[snaps.length - 1].dailyVolumeUSD) : 0;
  const bigSwaps = pool.swaps.filter((s) => num(s.amountInUSD) >= 100_000).length;
  const ageDays = (now - Number(pool.createdTimestamp)) / 86_400;

  const factors: RiskFactor[] = [
    {
      name: "TVL drawdown (7d)",
      weight: 0.3,
      score: tvlChange7dPct === null ? 10 : clamp(-tvlChange7dPct * 2.5), // -40% => 100
      evidence:
        tvlChange7dPct === null
          ? "insufficient snapshots"
          : `TVL ${tvlChange7dPct >= 0 ? "+" : ""}${tvlChange7dPct.toFixed(1)}% over ${snaps.length - 1} daily snapshots ($${fmt(tvl7dAgo ?? 0)} → $${fmt(tvlNow)})`,
    },
    {
      name: "Withdrawal pressure (24h)",
      weight: 0.3,
      score: clamp(withdrawToTvl * 4), // 25% of TVL out in a day => 100
      evidence: `$${fmt(withdraws24h)} withdrawn = ${withdrawToTvl.toFixed(1)}% of TVL; net flow $${fmt(deposits24h - withdraws24h)}`,
    },
    {
      name: "Withdrawer concentration",
      weight: 0.2,
      score: withdraws24h > 50_000 ? clamp(largestShare * 100) : 0,
      evidence: withdraws.length
        ? `largest single withdraw $${fmt(largestWithdraw)} = ${(largestShare * 100).toFixed(0)}% of 24h outflow`
        : "no withdrawals in window",
    },
    {
      name: "Abnormal swap size",
      weight: 0.1,
      score: clamp(bigSwaps * 12.5),
      evidence: `${bigSwaps} swaps ≥ $100k in window; 24h volume $${fmt(volume24h)}`,
    },
    {
      name: "Pool age",
      weight: 0.1,
      score: ageDays < 7 ? 100 : ageDays < 30 ? 60 : ageDays < 180 ? 25 : 0,
      evidence: `${ageDays.toFixed(0)} days old`,
    },
  ];

  const score = Math.round(factors.reduce((acc, f) => acc + f.score * f.weight, 0));

  const toEvent = (kind: WhaleEvent["kind"], e: { hash: string; timestamp: string; from: string }, usd: number, detail: string): WhaleEvent => ({
    protocol,
    kind,
    hash: e.hash,
    timestamp: Number(e.timestamp),
    from: e.from,
    amountUsd: usd,
    pool: { id: pool.id, name: pool.name },
    detail,
    explorer: explorerTx(e.hash),
  });

  return {
    generatedAt: new Date().toISOString(),
    source: "the-graph:messari-standardized-subgraphs",
    protocol,
    pool: {
      id: pool.id,
      name: pool.name,
      symbol: pool.symbol,
      tokens: pool.inputTokens.map((t) => t.symbol),
      tvlUsd: tvlNow,
      cumulativeVolumeUsd: num(pool.cumulativeVolumeUSD),
      ageDays: Math.round(ageDays),
    },
    window: { lookbackSeconds, snapshotsDays: Math.max(0, snaps.length - 1) },
    metrics: {
      tvlNowUsd: tvlNow,
      tvl7dAgoUsd: tvl7dAgo,
      tvlChange7dPct: tvlChange7dPct === null ? null : Number(tvlChange7dPct.toFixed(2)),
      withdraws24hUsd: withdraws24h,
      deposits24hUsd: deposits24h,
      netFlow24hUsd: deposits24h - withdraws24h,
      withdraw24hToTvlPct: Number(withdrawToTvl.toFixed(2)),
      largestWithdrawUsd: largestWithdraw,
      largestWithdrawShare: Number(largestShare.toFixed(3)),
      volume24hUsd: volume24h,
      swapsAbove100kCount: bigSwaps,
    },
    score,
    level: levelFor(score),
    factors,
    recentWithdraws: pool.withdraws.slice(0, 10).map((w) => toEvent("withdraw", w, num(w.amountUSD), `LP withdraw $${fmt(num(w.amountUSD))}`)),
    recentSwaps: pool.swaps
      .slice(0, 10)
      .map((s) => toEvent("swap", s, num(s.amountInUSD), `${s.tokenIn.symbol} → ${s.tokenOut.symbol} ($${fmt(num(s.amountInUSD))})`)),
  };
}

export function scoreLending(protocol: string, data: LendingHealthData, lookbackSeconds: number): ProtocolHealthResponse {
  const markets = data.markets.map((m) => {
    const dep = num(m.totalDepositBalanceUSD);
    const bor = num(m.totalBorrowBalanceUSD);
    return {
      id: m.id,
      name: m.name,
      token: m.inputToken.symbol,
      tvlUsd: num(m.totalValueLockedUSD),
      depositsUsd: dep,
      borrowsUsd: bor,
      utilizationPct: dep > 0 ? Number(((bor / dep) * 100).toFixed(1)) : 0,
      liquidationThreshold: num(m.liquidationThreshold),
    };
  });
  const tvl = markets.reduce((a, m) => a + m.tvlUsd, 0);
  const dep = markets.reduce((a, m) => a + m.depositsUsd, 0);
  const bor = markets.reduce((a, m) => a + m.borrowsUsd, 0);
  const liqUsd = data.liquidates.reduce((a, l) => a + num(l.amountUSD), 0);
  const utilization = dep > 0 ? (bor / dep) * 100 : 0;
  const hotMarkets = markets.filter((m) => m.utilizationPct >= 90).length;

  const factors: RiskFactor[] = [
    {
      name: "Liquidation volume (24h)",
      weight: 0.45,
      score: clamp(tvl > 0 ? (liqUsd / tvl) * 100 * 200 : 0), // 0.5% of TVL liquidated in a day => 100
      evidence: `$${fmt(liqUsd)} liquidated across ${data.liquidates.length} events (${tvl > 0 ? ((liqUsd / tvl) * 100).toFixed(3) : "0"}% of TVL)`,
    },
    {
      name: "Aggregate utilization",
      weight: 0.35,
      score: clamp((utilization - 60) * 2.5), // 100% utilization => 100
      evidence: `${utilization.toFixed(1)}% borrowed of $${fmt(dep)} supplied`,
    },
    {
      name: "Markets at ≥90% utilization",
      weight: 0.2,
      score: clamp(hotMarkets * 25),
      evidence: `${hotMarkets} of ${markets.length} top markets`,
    },
  ];
  const score = Math.round(factors.reduce((acc, f) => acc + f.score * f.weight, 0));

  return {
    generatedAt: new Date().toISOString(),
    source: "the-graph:messari-standardized-subgraphs",
    protocol,
    window: { lookbackSeconds },
    totals: {
      tvlUsd: tvl,
      depositsUsd: dep,
      borrowsUsd: bor,
      utilizationPct: Number(utilization.toFixed(1)),
      liquidations24hUsd: liqUsd,
      liquidations24hCount: data.liquidates.length,
    },
    markets,
    liquidations: data.liquidates.slice(0, 15).map((l) => ({
      protocol,
      kind: "liquidation" as const,
      hash: l.hash,
      timestamp: Number(l.timestamp),
      from: l.liquidator.id,
      amountUsd: num(l.amountUSD),
      pool: { id: l.market.id, name: l.market.name },
      detail: `${l.asset.symbol} liquidation $${fmt(num(l.amountUSD))} (profit $${fmt(num(l.profitUSD))})`,
      explorer: explorerTx(l.hash),
    })),
    stress: { score, level: levelFor(score), factors },
  };
}
