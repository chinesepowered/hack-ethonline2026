/**
 * Demo UI server: one page that shows discovery (ENSv2), pay-per-call (x402 on Hedera),
 * the agent's live reasoning, and the standardized-subgraph fan-out. Everything is
 * streamed to the browser over Server-Sent Events as it happens; nothing is pre-rendered.
 * Usage: pnpm ui   → http://localhost:3001
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import { normalize } from "viem/ens";
import { eacDemo } from "@rugradar/ens/eac";
import {
  DEX_PROTOCOLS,
  ENSV2_SEPOLIA,
  LENDING_PROTOCOLS,
  RECORD_KEYS,
  env,
  envOptional,
  ethRegistryAbi,
  fetchDexWhales,
  fetchLendingHealth,
  hashscanAccount,
  hashscanTopic,
  labelId,
  loadEnsDeployment,
  userRegistryAbi,
} from "@rugradar/shared";
import { runAgent } from "./agent.ts";
import { resolveRecords, sepoliaClient } from "./discovery.ts";
import { createPayingFetch, describe402 } from "./x402.ts";

const PORT = Number(env("UI_PORT", "3001"));
const here = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.static(join(here, "../public")));

const q = (req: Request, name: string, fallback = ""): string => {
  const v = req.query[name];
  return (Array.isArray(v) ? String(v[0]) : v === undefined ? fallback : String(v)) || fallback;
};

function sse(req: Request, res: Response) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  let open = true;
  req.on("close", () => (open = false));
  return {
    send: (event: string, data: unknown) => {
      if (open) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end: () => {
      if (open) res.end();
      open = false;
    },
    isOpen: () => open,
  };
}

const serviceName = () => envOptional("ENS_SERVICE_NAME") ?? `api.${loadEnsDeployment()?.parentName ?? "rugradar.eth"}`;

async function serviceEndpoint(): Promise<string> {
  const override = envOptional("SERVICE_URL_OVERRIDE");
  if (override) return `${override.replace(/\/$/, "")}/v1`;
  const records = await resolveRecords(serviceName(), [RECORD_KEYS.endpointX402]);
  const ep = records[RECORD_KEYS.endpointX402];
  if (!ep) throw new Error(`${serviceName()} has no ${RECORD_KEYS.endpointX402} record`);
  return ep.replace(/\/$/, "");
}

// ── context: who am I, where is everything ──
app.get("/api/context", async (_req, res) => {
  const deployment = loadEnsDeployment();
  const wallet = env("HEDERA_AGENT_ACCOUNT_ID");
  const name = serviceName();
  let records: Record<string, string> = {};
  let endpoint: string | null = null;
  let catalog: unknown = null;
  let health: unknown = null;
  try {
    records = await resolveRecords(name);
    endpoint = records[RECORD_KEYS.endpointX402] ?? null;
    if (endpoint) {
      // Render's free tier may be asleep (~60 s wake); poll briefly, the page re-checks on its own.
      const base = endpoint.replace(/\/v1\/?$/, "");
      const get = (path: string) => fetch(`${base}${path}`, { signal: AbortSignal.timeout(25_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      [catalog, health] = await Promise.all([get("/v1/catalog"), get("/health")]);
    }
  } catch (err) {
    records = { error: err instanceof Error ? err.message : String(err) };
  }
  res.json({
    wallet,
    walletUrl: hashscanAccount(wallet),
    network: `hedera:${env("HEDERA_NETWORK", "testnet")}`,
    budgetHbar: Number(env("AGENT_BUDGET_HBAR", "1")),
    model: env("LLM_MODEL", "Qwen/Qwen3.8-27B"),
    topics: {
      service: records[RECORD_KEYS.hcsAudit] ?? envOptional("HCS_SERVICE_TOPIC_ID") ?? null,
      agent: envOptional("HCS_AGENT_TOPIC_ID") ?? null,
      serviceUrl: (records[RECORD_KEYS.hcsAudit] ?? envOptional("HCS_SERVICE_TOPIC_ID")) ? hashscanTopic(records[RECORD_KEYS.hcsAudit] ?? envOptional("HCS_SERVICE_TOPIC_ID")!) : null,
      agentUrl: envOptional("HCS_AGENT_TOPIC_ID") ? hashscanTopic(envOptional("HCS_AGENT_TOPIC_ID")!) : null,
    },
    ens: {
      name,
      agentName: deployment ? `scout.${deployment.parentName}` : null,
      explorer: `https://sepolia.app.ens.domains/${name}`,
      registry: deployment?.userRegistry ?? null,
      resolver: deployment?.resolver ?? null,
      universalResolver: ENSV2_SEPOLIA.universalResolver,
      records,
    },
    service: { endpoint, catalog, health },
    protocols: { dex: DEX_PROTOCOLS.map((p) => p.key), lending: LENDING_PROTOCOLS.map((p) => p.key) },
  });
});

// ── ENS: records + registry hierarchy, live from Sepolia ──
app.get("/api/ens", async (req, res) => {
  const name = q(req, "name", serviceName());
  const client = sepoliaClient();
  const [label, parent] = name.split(".");
  try {
    const records = await resolveRecords(name);
    const addr = await client.getEnsAddress({ name: normalize(name), universalResolverAddress: ENSV2_SEPOLIA.universalResolver }).catch(() => null);
    const subregistry = await client.readContract({ address: ENSV2_SEPOLIA.ethRegistry, abi: ethRegistryAbi, functionName: "getSubregistry", args: [parent] });
    let hierarchy: Record<string, unknown> = { ethRegistry: ENSV2_SEPOLIA.ethRegistry, subregistry };
    if (subregistry !== "0x0000000000000000000000000000000000000000") {
      const [resolver, expiry, owner] = await Promise.all([
        client.readContract({ address: subregistry, abi: userRegistryAbi, functionName: "getResolver", args: [label] }),
        client.readContract({ address: subregistry, abi: userRegistryAbi, functionName: "getExpiry", args: [labelId(label)] }),
        client.readContract({ address: subregistry, abi: userRegistryAbi, functionName: "getOwner", args: [labelId(label)] }),
      ]);
      const transferable = await client.readContract({ address: subregistry, abi: userRegistryAbi, functionName: "hasRoles", args: [labelId(label), (1n << 28n) << 128n, owner] });
      hierarchy = { ...hierarchy, resolver, owner, expiry: new Date(Number(expiry) * 1000).toISOString(), transferable };
    }
    res.json({ name, addr, records, hierarchy, universalResolver: ENSV2_SEPOLIA.universalResolver });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── one paid call, streamed: quote → payment → result ──
app.get("/api/pay", async (req, res) => {
  const s = sse(req, res);
  const path = q(req, "path", "/v1/catalog");
  try {
    const base = (await serviceEndpoint()).replace(/\/v1$/, "");
    const url = `${base}${path}`;
    s.send("request", { url });
    const pay = createPayingFetch((e) => s.send(e.kind, e));
    const t0 = Date.now();
    const { res: r, payment } = await pay.paidFetch(url);
    const text = await r.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep text */
    }
    s.send("result", { status: r.status, ms: Date.now() - t0, body, payment, reason: r.status === 402 ? describe402(r) : null });
  } catch (err) {
    s.send("error", { message: err instanceof Error ? err.message : String(err) });
  }
  s.send("done", {});
  s.end();
});

// ── live whale wire: pay for one window, relay the service's SSE ──
app.get("/api/wire", async (req, res) => {
  const s = sse(req, res);
  const seconds = Math.min(120, Math.max(15, Number(q(req, "seconds", "15"))));
  const minUsd = q(req, "minUsd", "1000000");
  try {
    const base = (await serviceEndpoint()).replace(/\/v1$/, "");
    const url = `${base}/v1/stream/whales?seconds=${seconds}&minUsd=${minUsd}`;
    s.send("request", { url });
    const pay = createPayingFetch((e) => s.send(e.kind, e));
    const { res: r } = await pay.paidFetch(url);
    if (!r.ok || !r.body) {
      s.send("error", { message: r.status === 402 ? describe402(r) : `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` });
    } else {
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done || !s.isOpen()) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const ev = /^event: (.*)$/m.exec(chunk)?.[1];
          const data = /^data: (.*)$/m.exec(chunk)?.[1];
          if (ev && data) s.send(`wire:${ev}`, JSON.parse(data));
        }
      }
    }
  } catch (err) {
    s.send("error", { message: err instanceof Error ? err.message : String(err) });
  }
  s.send("done", {});
  s.end();
});

// ── the agent, streamed ──
let agentBusy = false;
app.get("/api/run", async (req, res) => {
  const s = sse(req, res);
  const question = q(req, "q", "Is the WETH/USDC pool on Uniswap v3 being drained right now? Should an LP exit?");
  if (agentBusy) {
    s.send("error", { message: "an agent run is already in progress" });
    s.send("done", {});
    return s.end();
  }
  agentBusy = true;
  try {
    await runAgent(question, (e) => s.send(e.kind, e));
  } catch (err) {
    s.send("error", { message: err instanceof Error ? err.message : String(err) });
  } finally {
    agentBusy = false;
  }
  s.send("done", {});
  s.end();
});

// ── Enhanced Access Control proof (writes one Sepolia tx with the service key) ──
app.get("/api/eac", async (req, res) => {
  const s = sse(req, res);
  const label = serviceName().split(".")[0];
  const pricing = q(req, "pricing", `whales 0.01+0.005/protocol; pool-risk 0.03+0.01/day; protocol-health 0.02; stream 0.02/15s (HBAR) — ${new Date().toISOString().slice(0, 16)}`);
  try {
    await eacDemo(label, pricing, (step) => s.send("step", step));
  } catch (err) {
    s.send("error", { message: err instanceof Error ? err.message : String(err) });
  }
  s.send("done", {});
  s.end();
});

// ── The Graph: the same query across every protocol ──
app.get("/api/smoke", async (req, res) => {
  const s = sse(req, res);
  const since = Math.floor(Date.now() / 1000) - 86_400;
  const minUsd = Number(q(req, "minUsd", "250000"));
  await Promise.all([
    ...DEX_PROTOCOLS.map(async (p) => {
      const t0 = Date.now();
      try {
        const events = await fetchDexWhales(p, minUsd, since, 5);
        const top = [...events].sort((a, b) => b.amountUsd - a.amountUsd)[0];
        s.send("row", { protocol: p.key, name: p.name, schema: `dex-amm ${p.schemaVersion}`, ok: true, ms: Date.now() - t0, summary: `${events.length} events ≥ $${minUsd.toLocaleString("en-US")} in 24h`, top: top ? { amountUsd: top.amountUsd, detail: top.detail, explorer: top.explorer } : null });
      } catch (err) {
        s.send("row", { protocol: p.key, name: p.name, schema: `dex-amm ${p.schemaVersion}`, ok: false, ms: Date.now() - t0, summary: err instanceof Error ? err.message.slice(0, 120) : String(err) });
      }
    }),
    ...LENDING_PROTOCOLS.map(async (p) => {
      const t0 = Date.now();
      try {
        const d = await fetchLendingHealth(p, since);
        const tvl = d.markets.reduce((a, m) => a + Number(m.totalValueLockedUSD), 0);
        s.send("row", { protocol: p.key, name: p.name, schema: `lending ${p.schemaVersion}`, ok: true, ms: Date.now() - t0, summary: `TVL $${Math.round(tvl).toLocaleString("en-US")} · ${d.liquidates.length} liquidations in 24h`, top: null });
      } catch (err) {
        s.send("row", { protocol: p.key, name: p.name, schema: `lending ${p.schemaVersion}`, ok: false, ms: Date.now() - t0, summary: err instanceof Error ? err.message.slice(0, 120) : String(err) });
      }
    }),
  ]);
  s.send("done", {});
  s.end();
});

app.listen(PORT, () => {
  console.log(`\n🖥  Rug Radar demo UI → http://localhost:${PORT}\n   service via ENS: ${serviceName()} · agent wallet ${env("HEDERA_AGENT_ACCOUNT_ID")}\n`);
});
