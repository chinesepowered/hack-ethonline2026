/**
 * GET /v1/stream/whales?seconds=15&minUsd=1000000
 * Server-Sent Events, paid per 15-second window via x402 (client re-pays to extend —
 * that is the "settle every few seconds" streaming pattern). Source is the Substreams
 * whale wire when a token is configured, otherwise a live poll of the standardized
 * subgraphs so the stream is never mocked.
 */
import type { Request, Response } from "express";
import { DEX_PROTOCOLS, envOptional, fetchDexWhales, type WhaleEvent } from "@rugradar/shared";
import { PRICING, quoteStream } from "./x402.ts";
import { whaleWire } from "./substreams.ts";

const seen = new Set<string>();

export async function streamWhales(req: Request, res: Response): Promise<void> {
  const seconds = Math.min(PRICING.streamMaxSeconds, Math.max(15, Number(req.query.seconds ?? 15)));
  const minUsd = Number(req.query.minUsd ?? envOptional("STREAM_MIN_USD") ?? 1_000_000);
  if (whaleWire.status.mode !== "substreams" && !envOptional("GRAPH_API_KEY")) {
    // No live source configured: fail before streaming so the x402 payment is cancelled.
    res.status(503).json({ error: "whale wire unavailable: set SUBSTREAMS_API_TOKEN or GRAPH_API_KEY" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const mode = whaleWire.status.mode === "substreams" ? "substreams" : "subgraph-poll";
  send("window", { seconds, minUsd, mode, pricedHbar: quoteStream(seconds), expiresAt: new Date(Date.now() + seconds * 1000).toISOString() });

  const onWhale = (w: WhaleEvent) => {
    if (w.amountUsd >= minUsd) send("whale", w);
  };

  let poll: NodeJS.Timeout | undefined;
  if (mode === "substreams") {
    whaleWire.on("whale", onWhale);
  } else {
    const since = () => Math.floor(Date.now() / 1000) - 300;
    const tick = async () => {
      const results = await Promise.allSettled(DEX_PROTOCOLS.map((p) => fetchDexWhales(p, minUsd, since(), 10)));
      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        for (const w of r.value.sort((a, b) => a.timestamp - b.timestamp)) {
          const key = `${w.protocol}:${w.hash}:${w.kind}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (seen.size > 5000) seen.delete(seen.values().next().value as string);
          send("whale", w);
        }
      }
    };
    void tick();
    poll = setInterval(() => void tick(), 5_000);
  }

  const heartbeat = setInterval(() => send("heartbeat", { at: new Date().toISOString(), wire: whaleWire.status }), 5_000);
  const end = () => {
    clearInterval(heartbeat);
    if (poll) clearInterval(poll);
    whaleWire.off("whale", onWhale);
    send("window_closed", { reason: "paid window elapsed", renew: `${req.path}?seconds=${seconds}` });
    res.end();
  };
  const timer = setTimeout(end, seconds * 1000);
  req.on("close", () => {
    clearTimeout(timer);
    clearInterval(heartbeat);
    if (poll) clearInterval(poll);
    whaleWire.off("whale", onWhale);
  });
}
