/**
 * The agent loop, reusable by the CLI and the web UI. Any OpenAI-compatible
 * endpoint (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL — default Qwen 3.8).
 * Every step is reported through `onEvent` so a UI can render it live.
 */
import OpenAI from "openai";
import { env, hashscanTx } from "@rugradar/shared";
import { buildTools, runTool, toOpenAITools, type AgentContext } from "./tools.ts";
import { createPayingFetch, type PayEvent, type Payment } from "./x402.ts";

export type AgentEvent =
  | { kind: "start"; question: string; model: string; wallet: string; network: string; budgetHbar: number; ledgerTopic: string | null }
  | { kind: "log"; line: string }
  | { kind: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { kind: "tool_result"; id: string; name: string; ms: number; preview: string; data: unknown }
  | PayEvent
  | { kind: "final"; text: string; budget: { budgetHbar: number; spentHbar: number; remainingHbar: number; payments: number }; payments: Payment[]; decisionTx: string | null; decisionUrl: string | null }
  | { kind: "error"; message: string };

const MAX_ITERATIONS = 16;

export const SYSTEM = `You are Rug Radar, an autonomous DeFi risk analyst with your own Hedera wallet.

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

function tryJson(text: string): unknown {
  // Tool results may start with a "PAYMENT: …" line before the JSON body.
  const body = text.replace(/^PAYMENT:[^\n]*\n/, "");
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export async function runAgent(question: string, onEvent: (e: AgentEvent) => void): Promise<void> {
  const pay = createPayingFetch(onEvent);
  const ctx: AgentContext = { pay, services: [], log: (line) => onEvent({ kind: "log", line }) };
  const tools = buildTools(ctx);
  const client = new OpenAI({ baseURL: env("LLM_BASE_URL"), apiKey: env("LLM_API_KEY") });
  const model = env("LLM_MODEL", "Qwen/Qwen3.8-27B");

  onEvent({
    kind: "start",
    question,
    model,
    wallet: pay.accountId,
    network: pay.network,
    budgetHbar: pay.budget().budgetHbar,
    ledgerTopic: pay.audit.topicId,
  });

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: question },
  ];
  let text = "";

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const completion = await client.chat.completions.create({ model, messages, tools: toOpenAITools(tools), tool_choice: "auto", temperature: 0.2 });
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
      let args: Record<string, unknown> = {};
      try {
        args = call.function.arguments.trim() ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
      } catch {
        /* reported by runTool */
      }
      onEvent({ kind: "tool_call", id: call.id, name: call.function.name, args });
      const t0 = Date.now();
      const result = await runTool(tools, call.function.name, call.function.arguments);
      onEvent({ kind: "tool_result", id: call.id, name: call.function.name, ms: Date.now() - t0, preview: result.slice(0, 400), data: tryJson(result) });
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
    if (i === MAX_ITERATIONS - 1) {
      messages.push({ role: "user", content: "You are out of iterations. Give your final answer now using the data you already have." });
      const last = await client.chat.completions.create({ model, messages, temperature: 0.2 });
      text = last.choices[0]?.message.content ?? "";
    }
  }

  const budget = pay.budget();
  const decisionTx = await pay.audit.log({
    v: 1,
    kind: "agent.decision",
    at: new Date().toISOString(),
    question,
    model,
    spentHbar: budget.spentHbar,
    payments: pay.payments.map((p) => p.settlementTx),
    verdict: text.split("\n").find((l) => l.toLowerCase().includes("verdict"))?.slice(0, 280) ?? text.slice(0, 280),
  });
  onEvent({ kind: "final", text, budget, payments: pay.payments, decisionTx, decisionUrl: decisionTx ? hashscanTx(decisionTx) : null });
}
