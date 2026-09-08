# Rug Radar — demo runbook (one tab)

Target: a 3–4 minute screen recording from **one browser tab**: the demo UI at `http://localhost:3001`. Every button on it does the real thing (Hedera testnet, ENSv2 Sepolia, The Graph Network). HashScan / ENS links open in new tabs when you want proof on screen.

## 0. Before you hit record (5 min)

```bash
pnpm ui                      # → http://localhost:3001   (takes ~1 min to boot)
```

Then, in the page:

1. Wait for the **service dot** in the header to turn green. The service runs on Render's free tier and sleeps after 15 min idle; the page re-checks every 15 s while it wakes (~1 min). If it stays red, open `https://rugradar-vibj.onrender.com/health` in another tab.
2. Click **Pool risk · WETH/USDC** once off-camera. The first token-pair lookup fans out to every DEX (5–60 s depending on The Graph gateway); the service caches the pick so the on-camera call is ~10 s.
3. Click **Clear** under the agent, and reload the page so the pay panel is empty.

Wallet check: the agent wallet `0.0.10372230` needs a few HBAR (header pill links to HashScan). A full demo costs about 0.15 HBAR.

If the service URL ever changes (new Render service, tunnel), republish the ENS records once: `pnpm ens:register api --url <url>`. The UI reads everything from ENS, so nothing else changes.

## 1. Script (what to click, what to say)

### Open — the problem (0:00–0:20)
Page is loaded. Point at the header pills: service name, agent wallet, budget, HCS links.

> "LPs find out about a drain after the fact. An agent can watch pools 24/7 — but only if it can *buy* live data per call: no API keys, no subscriptions, and a receipt it can prove. Rug Radar is that service, and the agent that uses it."

### 1 · Discover — ENSv2 (0:20–0:55)
Click **Resolve live** in panel 1.

> "The agent knows nothing about the API. It resolves `api.rugradar.eth` through the ENSv2 Universal Resolver. `rugradar.eth` runs its *own* registry and resolver — you can see the hierarchy: ETHRegistry → our PermissionedRegistry → our PermissionedResolver. The records carry the x402 endpoint, prices, the pay-to account, the audit topic. The name expires in 30 days and is non-transferable."

Optional (+20 s, one Sepolia tx): click **Prove Enhanced Access Control**.
> "The service's own key can edit exactly one record — its price — and is refused on everything else. That's Enhanced Access Control, delegated per key."

### 2 · Pay — x402 on Hedera (0:55–1:50)
Click **Pool risk · WETH/USDC** in panel 2. Read the lines as they appear:

> "402 Payment Required, with a metered quote: 0.03 HBAR, or the same in USDC. The wallet signs a Hedera transfer. Blocky402 verifies it, the service computes, the facilitator settles — the facilitator even pays the network fee. 200: a drain score with the evidence behind it."

Click the **settlement** link → HashScan tab: show the transfer. Click **HCS settlements** in the header: show the newest `x402.settled` record. Back to the tab.

> "Prices scale with what you ask for — per protocol, per lookback day, per 15-second stream window."

Optional (+20 s): **Whale wire · 15 s window** — "streamed micropayments: pay per window, re-request to extend."

### 3 · Reason — the agent (1:50–3:00)
Click **Run agent** (question is prefilled). While it runs (60–90 s) narrate the feed:

> "It discovers the service through ENS, reads the catalog for prices, then decides what to buy. Every 402 goes through a hard budget check *before* signing. Each payment is mirrored to the agent's own HCS spend ledger."

When the verdict appears: read the verdict line, point at the gauge and two or three evidence numbers, then the payments row.

> "The verdict is anchored on HCS too — click through and you get the question, the model, the spend, and the settlement ids."

Click **decision anchored on HCS ↗** if time allows.

### 4 · Standards — The Graph (3:00–3:30)
Click **Run the same query on 7 protocols**.

> "One query string, seven protocols — Messari's standardized subgraphs on The Graph Network: four DEXes on the dex-amm schema, three lenders on the lending schema. The only thing that ever differed between schema versions is a single field name. The live whale wire composes the ethereum-common Substreams package with the same subgraphs for prices."

### Close (3:30–3:50)
> "Mainnet is a config flip — `HEDERA_NETWORK=mainnet` and the mainnet facilitator; the ENS name and records come along. This is the pattern for any data an agent should find and pay for on its own."

## 2. Fallbacks

| If… | Do |
|---|---|
| service dot stays red | open `https://rugradar-vibj.onrender.com/health` in a tab, wait for JSON, reload the UI |
| a paid call takes > 40 s | The Graph gateway is slow; say so, it will complete. Whales · 2 DEXes is the fastest button |
| agent verdict is thin | rerun with the prefilled question; temperature is 0.2 |
| Sepolia RPC flakes (records missing) | set `SEPOLIA_RPC_URL` in `.env` to another public endpoint, restart `pnpm ui` |
| you need the terminal version | `pnpm demo:curl "/v1/pool-risk?tokens=WETH,USDC"` and `pnpm agent "…"` do the same things in text |

## 3. Pre-generated evidence (if something dies mid-take)

- ENS registration of `rugradar.eth`: tx `0x81c5442f815c9f578961ca55683f728cfae63d1677bd4c3d62b9811ed61996df`
- EAC delegation tx: `0xaeeb0d0b18fb3efb4075fc8cce1b5e660fa74160d4c2a6ab41b19a4d9a1b7f15`
- A settled x402 payment: https://hashscan.io/testnet/transaction/0.0.7162784%401788663313.356227872
- An anchored agent decision: https://hashscan.io/testnet/transaction/0.0.10372230%401788663436.746860424
- Full agent transcript: README → "A real run"
- Pitch deck for the intro/outro shots: open `slides.html` (arrow keys)
