/**
 * Live whale wire from Substreams (The Graph): streams ERC-20 Transfer events on
 * Ethereum mainnet via the reusable `ethereum-common` package's `filtered_events`
 * module, filtered to the watched tokens, priced with `lastPriceUSD` from the
 * Messari standardized Uniswap v3 subgraph. Composition of two Graph products.
 *
 * Requires SUBSTREAMS_API_TOKEN (Pinax or StreamingFast). Without it the SSE
 * endpoint falls back to polling the standardized subgraphs (see stream.ts).
 */
import { EventEmitter } from "node:events";
import { applyParams, createRegistry, createRequest } from "@substreams/core";
import { readPackage } from "@substreams/manifest";
import { BlockEmitter } from "@substreams/node";
import { createNodeTransport } from "@substreams/node/createNodeTransport";
import { toEventSelector } from "viem";
import { PROTOCOLS, WATCHED_TOKENS, envOptional, fetchTokenPrices, type WhaleEvent } from "@rugradar/shared";

const SPKG = "https://spkg.io/streamingfast/ethereum-common-v0.3.0.spkg";
const MODULE = "filtered_events";
const TRANSFER_TOPIC0 = toEventSelector("Transfer(address,address,uint256)");

export interface WhaleWireStatus {
  mode: "substreams" | "disabled";
  endpoint?: string;
  package?: string;
  module?: string;
  lastBlock?: number;
  eventsSeen: number;
  whalesEmitted: number;
  error?: string;
}

interface RawEvent {
  log?: { address?: string; topics?: string[]; data?: string; blockIndex?: number };
  txHash?: string;
}

class WhaleWire extends EventEmitter {
  status: WhaleWireStatus = { mode: "disabled", eventsSeen: 0, whalesEmitted: 0 };
  private prices: Record<string, number> = {};
  private started = false;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const token = envOptional("SUBSTREAMS_API_TOKEN");
    if (!token) {
      this.status = { mode: "disabled", eventsSeen: 0, whalesEmitted: 0, error: "SUBSTREAMS_API_TOKEN not set" };
      return;
    }
    const endpoint = envOptional("SUBSTREAMS_ENDPOINT") ?? "https://eth.substreams.pinax.network:443";
    await this.refreshPrices();
    setInterval(() => void this.refreshPrices(), 60_000).unref();

    const pkg = await readPackage(SPKG);
    if (!pkg.modules) throw new Error("ethereum-common: no modules in package");
    // Query-string param drives both the block index and the event filter.
    applyParams([`${MODULE}=evt_sig:${TRANSFER_TOPIC0}`], pkg.modules.modules);
    const registry = createRegistry(pkg);
    const headers = new Headers({ "X-User-Agent": "rugradar/0.1", "X-Api-Key": token });
    const transport = createNodeTransport(endpoint, token, registry, headers);
    const request = createRequest({
      substreamPackage: pkg,
      outputModule: MODULE,
      productionMode: true,
      startBlockNum: -1, // negative = relative to chain head: start live
    });

    const emitter = new BlockEmitter(transport, request, registry);
    this.status = { mode: "substreams", endpoint, package: SPKG, module: MODULE, eventsSeen: 0, whalesEmitted: 0 };

    emitter.on("anyMessage", (message, _cursor, clock) => {
      const events = ((message as { events?: RawEvent[] }).events ?? []) as RawEvent[];
      this.status.lastBlock = Number(clock.number);
      const ts = clock.timestamp ? Number(clock.timestamp.seconds) : Math.floor(Date.now() / 1000);
      for (const ev of events) this.consider(ev, ts);
    });
    emitter.on("fatalError", (err) => {
      this.status.error = err.reason ?? "fatal";
      console.error("[substreams] fatal:", err.reason);
    });
    emitter.on("close", (err) => {
      if (err) {
        this.status.error = err.message;
        console.warn("[substreams] closed:", err.message, "— reconnecting in 5s");
        setTimeout(() => emitter.start(), 5_000).unref();
      }
    });
    emitter.start();
    console.log(`[substreams] streaming ${MODULE} from ${SPKG} via ${endpoint}`);
  }

  private consider(ev: RawEvent, ts: number): void {
    this.status.eventsSeen++;
    const log = ev.log;
    if (!log?.address || !log.topics || log.topics.length < 3) return;
    const address = normalizeHex(log.address);
    const token = WATCHED_TOKENS[address];
    if (!token) return;
    const value = hexToBigInt(log.data ?? "");
    const amount = Number(value) / 10 ** token.decimals;
    const price = token.stable ? 1 : (this.prices[address] ?? 0);
    const usd = amount * price;
    if (usd < Number(envOptional("STREAM_MIN_USD") ?? 1_000_000)) return;
    const from = "0x" + normalizeHex(log.topics[1]).slice(-40);
    const to = "0x" + normalizeHex(log.topics[2]).slice(-40);
    const hash = normalizeHex(ev.txHash ?? "");
    const whale: WhaleEvent = {
      protocol: "ethereum:erc20",
      kind: "transfer",
      hash,
      timestamp: ts,
      from,
      amountUsd: usd,
      detail: `${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${token.symbol} (~$${Math.round(usd).toLocaleString("en-US")}) → ${to}`,
      explorer: `https://etherscan.io/tx/${hash}`,
    };
    this.status.whalesEmitted++;
    this.emit("whale", whale);
  }

  private async refreshPrices(): Promise<void> {
    try {
      const ids = Object.entries(WATCHED_TOKENS)
        .filter(([, t]) => !t.stable)
        .map(([a]) => a);
      this.prices = await fetchTokenPrices(PROTOCOLS["uniswap-v3"], ids);
    } catch (err) {
      console.warn("[substreams] price refresh failed:", err instanceof Error ? err.message : err);
    }
  }
}

/** Protobuf JSON encodes `bytes` as base64; some codecs emit 0x-hex. Normalize to 0x-hex lowercase. */
function normalizeHex(v: string): string {
  if (v.startsWith("0x")) return v.toLowerCase();
  return "0x" + Buffer.from(v, "base64").toString("hex").toLowerCase();
}
function hexToBigInt(v: string): bigint {
  const hex = normalizeHex(v).slice(2);
  return hex.length ? BigInt("0x" + hex) : 0n;
}

export const whaleWire = new WhaleWire();
