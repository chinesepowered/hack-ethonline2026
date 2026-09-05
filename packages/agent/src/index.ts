/**
 * Rug Radar agent: an LLM with a Hedera wallet and a hard budget that discovers
 * paid data services via ENSv2, pays per call with x402 (settled on Hedera through
 * Blocky402), reasons over The Graph data and returns a decision. Every payment is
 * mirrored to an HCS spend ledger, and the final decision is anchored there too.
 *
 * LLM: any OpenAI-compatible endpoint (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL — default Qwen 3.8).
 * Usage: pnpm agent "Is the WETH/USDC pool on Uniswap v3 being drained right now?"
 */
import OpenAI from "openai";
import { env, hashscanTopic, hashscanTx } from "@rugradar/shared";
import { buildTools, runTool, toOpenAITools, type AgentContext } from "./tools.ts";
import { createPayingFetch } from "./x402.ts";

const question = process.argv.slice(2).join(" ").trim() || "Which DEX pools show drain risk in the last 24 hours, and is anything unusual happening right now?";
const MAX_ITERATIONS = 16;

const SYSTEM = `You are Rug Radar, an autonomous DeFi risk analyst with your own Hedera wallet.

You buy live blockchain intelligence from x402-metered services that you discover through ENS. Every paid call costs HBAR from a hard budget, so:
- Call discover_services first, then read_catalog once to learn prices.
- Spend deliberately: narrow protocol lists cost less; only widen when evidence demands it.
- Prefer pool_risk for "is X being drained" questions, scan_whales for "who is moving size" questions, protocol_health for lending stress, and watch_whale_wire only for "right now" questions (it streams, paid per window).
- If a tool returns BUDGET_EXCEEDED or PAYMENT_FAILED, stop buying data and answer with what you have.

Final answer format (markdown):
1. **Verdict** — one sentence, with a risk level (calm / watch / elevated / critical) and a recommended action.
2. **Evidence** — bullet list citing concrete numbers from the data (TVL change, withdrawals, largest actors, tx links).
3. **What I paid for** — one line per paid call: endpoint, HBAR, and the Hedera settlement id.
Be precise, cite numbers, and never invent data you did not fetch.`;

async function main() {
  const pay = createPayingFetch();
  const ctx: AgentContext = { pay, services: [], log: (line) => console.log(`\x1b[2m${line}\x1b[0m`) };
  const tools = buildTools(ctx);
  const client = new OpenAI({ baseURL: env("LLM_BASE_URL"), apiKey: env("LLM_API_KEY") });
  const model = env("LLM_MODEL", "Qwen/Qwen3.8-27B");

  console.log(`\n🛰  Rug Radar agent · wallet ${pay.accountId} on ${pay.network} · budget ${pay.budget().budgetHbar} HBAR · model ${model}`);
  if (pay.audit.topicId) console.log(`   spend ledger: ${hashscanTopic(pay.audit.topicId)}`);
  console.log(`\n❓ ${question}\n`);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: question },
  ];
  let text = "";

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const completion = await client.chat.completions.create({
      model,
      messages,
      tools: toOpenAITools(tools),
      tool_choice: "auto",
      temperature: 0.2,
    });
    const msg = completion.choices[0]?.message;
    if (!msg) throw new Error("LLM returned no choices");
    const calls = msg.tool_calls ?? [];
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls.length ? calls : undefined });

    if (!calls.length) {
      text = msg.content ?? "";
      break;
    }
    for (const call of calls) {
      if (call.type !== "function") continue;
      ctx.log(`⚙ ${call.function.name}(${call.function.arguments.slice(0, 160)})`);
      const result = await runTool(tools, call.function.name, call.function.arguments);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
    if (i === MAX_ITERATIONS - 1) {
      messages.push({ role: "user", content: "You are out of iterations. Give your final answer now using the data you already have." });
      const last = await client.chat.completions.create({ model, messages, temperature: 0.2 });
      text = last.choices[0]?.message.content ?? "";
    }
  }

  console.log("\n" + "─".repeat(72) + "\n");
  console.log(text);
  console.log("\n" + "─".repeat(72));

  const b = pay.budget();
  console.log(`\n💸 Spent ${b.spentHbar} HBAR of ${b.budgetHbar} across ${b.payments} paid call(s):`);
  for (const p of pay.payments) console.log(`   ${p.hbar} HBAR  ${p.url}\n      ${p.hashscan}${p.auditTx ? `\n      HCS audit tx ${p.auditTx}` : ""}`);

  const decisionTx = await pay.audit.log({
    v: 1,
    kind: "agent.decision",
    at: new Date().toISOString(),
    question,
    model,
    spentHbar: b.spentHbar,
    payments: pay.payments.map((p) => p.settlementTx),
    verdict: text.split("\n").find((l) => l.toLowerCase().includes("verdict"))?.slice(0, 280) ?? text.slice(0, 280),
  });
  if (decisionTx) console.log(`\n🧾 Decision anchored on HCS: ${hashscanTx(decisionTx)}`);
}

main().catch((err) => {
  console.error("\n✗ agent failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
