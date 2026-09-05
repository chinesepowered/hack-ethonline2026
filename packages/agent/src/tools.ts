import { z } from "zod";
import type OpenAI from "openai";
import { DEX_PROTOCOLS, LENDING_PROTOCOLS } from "@rugradar/shared";
import { discoverServices, type DiscoveredService } from "./discovery.ts";
import { BudgetExceeded, describe402, type PayingFetch } from "./x402.ts";

export interface AgentContext {
  pay: PayingFetch;
  services: DiscoveredService[];
  log: (line: string) => void;
}

/** Provider-agnostic tool: zod schema in, JSON string out. Exposed to the LLM as an OpenAI function tool. */
export interface AgentTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  inputSchema: S;
  run: (input: z.infer<S>) => Promise<string>;
}
const tool = <S extends z.ZodType>(t: AgentTool<S>): AgentTool<S> => t;

export function toOpenAITools(tools: AgentTool[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: z.toJSONSchema(t.inputSchema) as Record<string, unknown> },
  }));
}

export async function runTool(tools: AgentTool[], name: string, rawArgs: string): Promise<string> {
  const t = tools.find((x) => x.name === name);
  if (!t) return `Unknown tool ${name}`;
  let parsed: unknown = {};
  try {
    parsed = rawArgs.trim() ? JSON.parse(rawArgs) : {};
  } catch {
    return `Invalid JSON arguments for ${name}: ${rawArgs.slice(0, 200)}`;
  }
  const check = t.inputSchema.safeParse(parsed);
  if (!check.success) return `Invalid arguments for ${name}: ${check.error.message}`;
  try {
    return await t.run(check.data);
  } catch (err) {
    return `Tool ${name} failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

const pretty = (v: unknown) => JSON.stringify(v, null, 1);

function serviceBase(ctx: AgentContext, name?: string): string {
  const svc = name ? ctx.services.find((s) => s.name === name) : ctx.services[0];
  if (!svc?.endpoint) throw new Error(`No x402 service discovered${name ? ` named ${name}` : ""}. Run discover_services first.`);
  return svc.endpoint.replace(/\/$/, "");
}

async function paidJson(ctx: AgentContext, url: string): Promise<string> {
  ctx.log(`→ GET ${url}`);
  try {
    const { res, payment } = await ctx.pay.paidFetch(url);
    const text = await res.text();
    if (res.status === 402) return `PAYMENT_FAILED: ${describe402(res)}`;
    if (!res.ok) return `HTTP ${res.status}: ${text.slice(0, 500)}`;
    if (payment) ctx.log(`  paid ${payment.hbar} HBAR · settlement ${payment.settlementTx}${payment.auditTx ? ` · HCS ${payment.auditTx}` : ""}`);
    else ctx.log("  (no payment header — free route or cached)");
    return text;
  } catch (err) {
    if (err instanceof BudgetExceeded) {
      ctx.log(`  ✗ ${err.message}`);
      return `BUDGET_EXCEEDED: ${err.message}. Do not retry this request; answer with what you have.`;
    }
    throw err;
  }
}

export function buildTools(ctx: AgentContext): AgentTool[] {
  const discover = tool({
    name: "discover_services",
    description:
      "Discover x402-paid data services through ENSv2 (Sepolia): enumerates subnames of the namespace registry and reads their agent-endpoint[x402], x402.* and hcs.* text records. Returns endpoints and pricing. Call this first.",
    inputSchema: z.object({}),
    run: async () => {
      ctx.services = await discoverServices();
      ctx.log(`ENS discovery: ${ctx.services.length} service(s): ${ctx.services.map((s) => s.name).join(", ") || "none"}`);
      if (!ctx.services.length) return "No services found in ENS. Check ENS_SERVICE_NAME / ens.deployment.json.";
      return pretty(
        ctx.services.map((s) => ({
          name: s.name,
          endpoint: s.endpoint,
          network: s.network,
          payTo: s.payTo,
          catalog: s.catalog,
          pricing: s.records["x402.pricing"] ?? null,
          context: s.records["agent-context"] ?? null,
          hcsAudit: s.records["hcs.audit"] ?? null,
        })),
      );
    },
  });

  const catalog = tool({
    name: "read_catalog",
    description: "Read the free /v1/catalog of a discovered service: exact endpoint list, params and metered prices in HBAR.",
    inputSchema: z.object({ service: z.string().optional().describe("ENS name of the service; defaults to the first discovered") }),
    run: async ({ service }) => {
      const url = `${serviceBase(ctx, service)}/catalog`;
      ctx.log(`→ GET ${url} (free)`);
      const res = await fetch(url);
      return await res.text();
    },
  });

  const whales = tool({
    name: "scan_whales",
    description: `PAID (x402, HBAR). Largest swaps and LP withdrawals across DEXes in a lookback window, from The Graph standardized subgraphs. Price scales with number of protocols. DEX keys: ${DEX_PROTOCOLS.map((p) => p.key).join(", ")}.`,
    inputSchema: z.object({
      protocols: z.array(z.string()).optional().describe("subset of DEX keys; omit for all (costs more)"),
      minUsd: z.number().optional().describe("USD threshold, default 250000"),
      lookbackSeconds: z.number().optional().describe("300..604800, default 86400"),
      limit: z.number().optional().describe("per protocol, default 15"),
      service: z.string().optional(),
    }),
    run: async ({ protocols, minUsd, lookbackSeconds, limit, service }) => {
      const params = new URLSearchParams();
      if (protocols?.length) params.set("protocols", protocols.join(","));
      if (minUsd) params.set("minUsd", String(minUsd));
      if (lookbackSeconds) params.set("lookback", String(lookbackSeconds));
      if (limit) params.set("limit", String(limit));
      return paidJson(ctx, `${serviceBase(ctx, service)}/whales?${params}`);
    },
  });

  const poolRisk = tool({
    name: "pool_risk",
    description:
      "PAID (x402, HBAR). Drain-risk score 0..100 for one liquidity pool with factor evidence (7d TVL drawdown, 24h withdrawal pressure, withdrawer concentration, abnormal swaps, age). Pass either protocol+pool address, or tokens (e.g. ['WETH','USDC']) to auto-select the deepest matching pool across DEXes.",
    inputSchema: z.object({
      protocol: z.string().optional(),
      pool: z.string().optional().describe("pool address"),
      tokens: z.array(z.string()).optional(),
      lookbackSeconds: z.number().optional().describe("3600..604800, default 86400; extra days cost more"),
      service: z.string().optional(),
    }),
    run: async ({ protocol, pool, tokens, lookbackSeconds, service }) => {
      const params = new URLSearchParams();
      if (protocol) params.set("protocol", protocol);
      if (pool) params.set("pool", pool);
      if (tokens?.length) params.set("tokens", tokens.join(","));
      if (lookbackSeconds) params.set("lookback", String(lookbackSeconds));
      return paidJson(ctx, `${serviceBase(ctx, service)}/pool-risk?${params}`);
    },
  });

  const health = tool({
    name: "protocol_health",
    description: `PAID (x402, HBAR). Lending protocol stress: utilization, hot markets, 24h liquidations. Keys: ${LENDING_PROTOCOLS.map((p) => p.key).join(", ")}.`,
    inputSchema: z.object({ protocol: z.string().describe("lending key"), lookbackSeconds: z.number().optional(), service: z.string().optional() }),
    run: async ({ protocol, lookbackSeconds, service }) => {
      const params = new URLSearchParams({ protocol });
      if (lookbackSeconds) params.set("lookback", String(lookbackSeconds));
      return paidJson(ctx, `${serviceBase(ctx, service)}/protocol-health?${params}`);
    },
  });

  const stream = tool({
    name: "watch_whale_wire",
    description:
      "PAID (x402, HBAR, streamed). Subscribe to the live whale wire (Substreams ERC-20 transfers or live subgraph poll) for N seconds, paying per 15-second window. Returns the events observed. Use for 'right now' questions.",
    inputSchema: z.object({
      seconds: z.number().min(15).max(120).default(15),
      minUsd: z.number().optional().describe("default 1000000"),
      service: z.string().optional(),
    }),
    run: async ({ seconds, minUsd, service }) => {
      const params = new URLSearchParams({ seconds: String(seconds) });
      if (minUsd) params.set("minUsd", String(minUsd));
      const url = `${serviceBase(ctx, service)}/stream/whales?${params}`;
      ctx.log(`→ GET ${url} (SSE window ${seconds}s)`);
      try {
        const { res, payment } = await ctx.pay.paidFetch(url);
        if (res.status === 402) return `PAYMENT_FAILED: ${describe402(res)}`;
        if (!res.ok || !res.body) return `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
        if (payment) ctx.log(`  paid ${payment.hbar} HBAR for a ${seconds}s window · settlement ${payment.settlementTx}`);
        const events: unknown[] = [];
        let meta: unknown = null;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const ev = /^event: (.*)$/m.exec(chunk)?.[1];
            const data = /^data: (.*)$/m.exec(chunk)?.[1];
            if (!ev || !data) continue;
            const parsed = JSON.parse(data);
            if (ev === "window") meta = parsed;
            if (ev === "whale") {
              events.push(parsed);
              ctx.log(`  🐋 ${(parsed as { detail: string }).detail}`);
            }
          }
        }
        return pretty({ window: meta, observed: events.length, events: events.slice(0, 40) });
      } catch (err) {
        if (err instanceof BudgetExceeded) return `BUDGET_EXCEEDED: ${err.message}`;
        throw err;
      }
    },
  });

  const budget = tool({
    name: "budget_status",
    description: "Remaining HBAR budget and payments made so far in this run.",
    inputSchema: z.object({}),
    run: async () => pretty({ ...ctx.pay.budget(), account: ctx.pay.accountId, network: ctx.pay.network }),
  });

  return [discover, catalog, whales, poolRisk, health, stream, budget] as AgentTool[];
}
