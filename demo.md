# Rug Radar — demo runbook

Target: a 3–4 minute screen recording. Everything below is real (Hedera testnet, ENSv2 Sepolia, The Graph Network). Rehearse once; the paid calls cost fractions of an HBAR.

## 0. Before you hit record (10 min)

1. **Service is up and public.** Either the Render deployment (`https://rugradar.onrender.com`) or a local run + tunnel:
   ```bash
   pnpm service          # terminal A
   pnpm tunnel           # terminal B → copy the https://*.trycloudflare.com URL
   ```
   Render's free tier sleeps after 15 min idle and takes ~60 s to wake, so **open `<SERVICE_URL>/health` in a browser first** and wait for JSON.
2. **ENS records point at that URL.** Only needed if the URL changed:
   ```bash
   pnpm ens:register api --url <SERVICE_URL>      # ~2 min, a dozen Sepolia txs
   pnpm ens:resolve api.rugradar.eth              # confirm agent-endpoint[x402]
   ```
3. **Wallets funded.** Agent `0.0.10372230` needs a few HBAR (check https://hashscan.io/testnet/account/0.0.10372230). Sepolia admin `0x6Bd0…78B2` needs a little ETH only if you re-register.
4. **Browser tabs ready** (in this order):
   - https://sepolia.app.ens.domains/api.rugradar.eth
   - https://hashscan.io/testnet/topic/0.0.10372243 (service settlement audit)
   - https://hashscan.io/testnet/topic/0.0.10372244 (agent spend ledger)
   - `<SERVICE_URL>/v1/catalog`
5. **Terminal**: big font, dark theme, repo root, `.env` filled. Run `pnpm graph:smoke` once so the gateway is warm.

## 1. Script (what to say, what to run)

### Slide 1 — Problem (0:00–0:20)
"LPs find out about a drain after the fact. An agent can watch pools 24/7, but it needs data it can *buy* per call — no API keys, no subscriptions. Rug Radar is that: an x402-metered intelligence service on Hedera, computed from The Graph's standardized subgraphs, discoverable through ENSv2."

### Discovery — ENSv2 (0:20–0:55)
```bash
pnpm ens:resolve api.rugradar.eth
```
Point at: `agent-endpoint[x402]` (the URL), `x402.pricing`, `hcs.audit`; then the **registry hierarchy** lines: `ETHRegistry.getSubregistry("rugradar") → our registry`, `getResolver("api") → our resolver`, `expires …`, `transferable by owner: false`.

Say: "`rugradar.eth` runs its own ENSv2 registry and resolver. Services are expiring, non-transferable subnames. Nothing about the API is hard-coded in the agent — it all comes from these records."

Optional 15 s flex (pre-run it, just show the output): `pnpm ens:service-update api "…"` — the service's own key can edit **only** `x402.pricing`; it is refused on `agent-context`. That's Enhanced Access Control.

### Pay — Hedera x402 (0:55–1:55)
```bash
pnpm demo:curl "/v1/pool-risk?tokens=WETH,USDC"
```
Narrate the lines as they appear: "ENS resolved the endpoint → GET → **402** → the agent signs a 0.03 HBAR transfer → Blocky402 verifies and settles → 200 with the risk score → settlement id." Click the HashScan link. Switch to the **settlement audit topic** tab and show the newest `x402.settled` message.

Say: "Metered, not flat — this scan is priced per protocol, pool risk per lookback day, the stream per 15-second window. Settlement is on Hedera in about a second; the facilitator is the fee payer, so the agent only holds HBAR for the price. USDC is accepted too."

### Reason — the agent (1:55–3:00)
```bash
pnpm agent "Is the WETH/USDC pool on Uniswap v3 being drained right now? Should an LP exit?"
```
While it runs (60–90 s): "It discovers through ENS, reads the catalog for prices, and spends against a hard budget it checks *before* signing. Every payment goes to its own HCS spend ledger."

When the verdict prints, read the first line aloud and point at the **Evidence** numbers (TVL change, withdrawals vs deposits, largest actor). Then the payments list. Open the **spend ledger** tab: show `x402.paid` records and the final `agent.decision` record.

### Standards leverage — The Graph (3:00–3:30)
```bash
pnpm graph:smoke
```
"One query string. Four DEXes, three lenders, same schema — Messari's standardized subgraphs. The only thing that ever differed between schema versions is one field name." Show `packages/shared/src/graph.ts` line with `actorField`. Mention the live whale wire composes Substreams (`ethereum-common`) with the same subgraph for prices.

### Close (3:30–3:50)
"Mainnet is a config flip: `HEDERA_NETWORK=mainnet`, mainnet facilitator, same code. ENSv2 records move with the name. This is the pattern for any paid data service an agent should be able to find and pay for on its own."

## 2. Fallbacks

| If… | Do |
|---|---|
| Render is cold and the first call 402-loops | hit `/health` in the browser, wait 60 s, rerun |
| gateway is slow (>30 s) | use `?protocols=curve` for the whale scan; pool-risk on `0x88e6…5640` is warm after one call |
| Qwen rambles or skips tools | rerun with the question above verbatim; temperature is 0.2 |
| Sepolia RPC flakes on resolve | set `SEPOLIA_RPC_URL` to another public endpoint in `.env` |
| you only have local | `SERVICE_URL_OVERRIDE=http://localhost:4021 pnpm demo:curl …` skips ENS (don't do this on camera) |

## 3. Pre-generated evidence (if something dies mid-take)

- ENS registration of `rugradar.eth`: tx `0x81c5442f815c9f578961ca55683f728cfae63d1677bd4c3d62b9811ed61996df`
- EAC delegation tx: `0xaeeb0d0b18fb3efb4075fc8cce1b5e660fa74160d4c2a6ab41b19a4d9a1b7f15`
- A settled x402 payment: https://hashscan.io/testnet/transaction/0.0.7162784%401788663313.356227872
- An anchored agent decision: https://hashscan.io/testnet/transaction/0.0.10372230%401788663436.746860424
- Full agent transcript: README → "A real run"
