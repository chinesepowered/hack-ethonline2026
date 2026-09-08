# Demo (3–4 min, one browser tab)

## Setup (5 min before recording)

1. `pnpm ui` → open http://localhost:3001 (boots in ~1 min).
2. Wait for the **service dot** in the header to turn **green** (Render wakes in ~1 min; the page rechecks itself).
3. Click **Pool risk · WETH/USDC** once, off camera, then reload the page. (Warms the cache so the on-camera call takes ~10 s.)

That's it. Everything else is buttons on that page. HashScan / ENS links open in new tabs when you want proof on screen.

## Record

| Click | Say |
|---|---|
| *(nothing yet, point at the header)* | "LPs find out about a drain after the fact. An agent can watch 24/7 — if it can buy live data per call, with no API keys and a receipt it can prove. This is Rug Radar." |
| **1 · Resolve live** | "The agent knows nothing about the API. It resolves `api.rugradar.eth` on ENSv2 — our own registry and resolver — and reads the endpoint, prices and audit topic from the records. The name expires and can't be transferred." |
| **1 · Prove Enhanced Access Control** *(optional, ~30 s)* | "The service's own key can edit exactly one record, its price, and is refused on everything else." |
| **2 · Pool risk · WETH/USDC** | "402 with a metered quote. The wallet signs a Hedera transfer, Blocky402 verifies and settles — it even pays the fee — and back comes a drain score with evidence." Click the **settlement** link, then **HCS settlements** in the header. |
| **2 · Whale wire · 15 s window** *(optional)* | "Streamed micropayments: pay per 15-second window, re-request to extend." |
| **3 · Run agent** | While it runs: "It discovers through ENS, reads prices, checks its budget *before* signing, and mirrors every payment to its own HCS ledger." When the verdict shows: read the verdict line, point at the gauge and two numbers, click **decision anchored on HCS**. |
| **4 · Run the same query on 7 protocols** | "One query string, seven protocols — Messari standardized subgraphs on The Graph. The whale wire composes Substreams with the same subgraphs." |
| *(close)* | "Mainnet is a config flip. The ENS name and records come along. This is how agents should find and pay for data." |

## If something goes wrong

- **Dot stays red** → open https://rugradar-vibj.onrender.com/health in a tab, wait for JSON, reload.
- **A call takes > 40 s** → The Graph gateway is slow; it will finish. **Whales · 2 DEXes** is the fastest button.
- **Agent verdict is thin** → click **Clear**, run again with the same question.

Backup proof if a take dies: a settled payment https://hashscan.io/testnet/transaction/0.0.7162784%401788663313.356227872 · an anchored decision https://hashscan.io/testnet/transaction/0.0.10372230%401788663436.746860424 · `slides.html` for intro/outro.
