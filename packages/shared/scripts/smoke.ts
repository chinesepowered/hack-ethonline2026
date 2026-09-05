/**
 * Smoke test for The Graph layer: runs the SAME whale query across every DEX
 * protocol and the SAME health query across every lending protocol.
 * Usage: pnpm graph:smoke
 */
import { DEX_PROTOCOLS, LENDING_PROTOCOLS, fetchDexWhales, fetchLendingHealth, fmt } from "../src/index.ts";

const since = Math.floor(Date.now() / 1000) - 86_400;

console.log("One query, every DEX (Messari dex-amm schema):");
for (const p of DEX_PROTOCOLS) {
  try {
    const events = await fetchDexWhales(p, 250_000, since, 5);
    const top = events.sort((a, b) => b.amountUsd - a.amountUsd)[0];
    console.log(`  ✓ ${p.name.padEnd(16)} ${String(events.length).padStart(2)} events ≥ $250k in 24h${top ? `  (largest $${fmt(top.amountUsd)} ${top.detail})` : ""}`);
  } catch (err) {
    console.log(`  ✗ ${p.name.padEnd(16)} ${err instanceof Error ? err.message : err}`);
  }
}

console.log("\nOne query, every lender (Messari lending schema):");
for (const p of LENDING_PROTOCOLS) {
  try {
    const d = await fetchLendingHealth(p, since);
    const tvl = d.markets.reduce((a, m) => a + Number(m.totalValueLockedUSD), 0);
    console.log(`  ✓ ${p.name.padEnd(16)} TVL $${fmt(tvl)}  liquidations(24h)=${d.liquidates.length}`);
  } catch (err) {
    console.log(`  ✗ ${p.name.padEnd(16)} ${err instanceof Error ? err.message : err}`);
  }
}
