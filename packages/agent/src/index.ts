/**
 * CLI entry: pnpm agent "Is the WETH/USDC pool on Uniswap v3 being drained right now?"
 * For the web UI: pnpm ui
 */
import { hashscanTopic } from "@rugradar/shared";
import { runAgent } from "./agent.ts";

const question =
  process.argv
    .slice(2)
    .filter((a) => a !== "--")
    .join(" ")
    .trim() || "Which DEX pools show drain risk in the last 24 hours, and is anything unusual happening right now?";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

await runAgent(question, (e) => {
  switch (e.kind) {
    case "start":
      console.log(`\n🛰  Rug Radar agent · wallet ${e.wallet} on ${e.network} · budget ${e.budgetHbar} HBAR · model ${e.model}`);
      if (e.ledgerTopic) console.log(`   spend ledger: ${hashscanTopic(e.ledgerTopic)}`);
      console.log(`\n❓ ${e.question}\n`);
      break;
    case "log":
      console.log(dim(e.line));
      break;
    case "tool_call":
      console.log(dim(`⚙ ${e.name}(${JSON.stringify(e.args).slice(0, 160)})`));
      break;
    case "quote":
      console.log(dim(`  402 → quote ${e.quote.hbar} HBAR (payTo ${e.quote.payTo}, feePayer ${e.quote.feePayer})`));
      break;
    case "budget_exceeded":
      console.log(dim(`  ✗ ${e.message}`));
      break;
    case "final": {
      console.log("\n" + "─".repeat(72) + "\n");
      console.log(e.text);
      console.log("\n" + "─".repeat(72));
      console.log(`\n💸 Spent ${e.budget.spentHbar} HBAR of ${e.budget.budgetHbar} across ${e.budget.payments} paid call(s):`);
      for (const p of e.payments) console.log(`   ${p.hbar} HBAR  ${p.url}\n      ${p.hashscan}${p.auditTx ? `\n      HCS audit tx ${p.auditTx}` : ""}`);
      if (e.decisionUrl) console.log(`\n🧾 Decision anchored on HCS: ${e.decisionUrl}`);
      break;
    }
    default:
      break;
  }
}).catch((err) => {
  console.error("\n✗ agent failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
process.exit(0); // Hedera SDK keeps gRPC channels open; exit explicitly
