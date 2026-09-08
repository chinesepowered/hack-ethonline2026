# Submission notes — per-sponsor eligibility and code links

Repo: https://github.com/chinesepowered/hack-ethonline2026 · Track: **Start Fresh** (everything built during ETHOnline 2026)
Live: service on Render `https://rugradar-vibj.onrender.com/v1/catalog` · ENS `api.rugradar.eth` (Sepolia) · HCS topics `0.0.10372243` / `0.0.10372244` (Hedera testnet)

`B` = `https://github.com/chinesepowered/hack-ethonline2026/blob/main`

---

## Hedera — 🤖 AI & Agentic Payments on Hedera

**Why we're eligible.** Rug Radar is a live x402-gated data service on Hedera testnet, settled through the Blocky402 facilitator, plus an autonomous agent that discovers it, pays for it, and completes real paid requests end to end. Every requirement in the track is met with real transactions, and most of the extra-points items are implemented:

- **Live x402 service on Hedera settled via Blocky402** — the Express service registers the Hedera `exact` scheme with the Blocky402 facilitator; every `/v1/*` route is behind x402. Example settlement: [`0.0.7162784@1788663313.356227872`](https://hashscan.io/testnet/transaction/0.0.7162784%401788663313.356227872).
- **Agent that consumes it** — an LLM agent with its own ECDSA Hedera account (`0.0.10372230`) signs Hedera transfers via `@x402/hedera`, with a hard budget checked *before* signing.
- **Metered, not flat pricing** — per protocol scanned, per lookback day, per 15-second stream window (x402 dynamic pricing).
- **Streamed micropayments** — the whale wire is an SSE endpoint paid per 15 s window; re-request to extend.
- **HTS token in the settlement path** — every route accepts HBAR *or* HTS USDC (`0.0.429274`).
- **Verifiable payment audit trail on HCS** — the service writes every settlement to an HCS topic; the agent writes every payment and its final decision to its own topic.
- **On-chain agent identity / discovery** — ERC-8004 registration file served by the service; discovery directory via ENSv2 (the agent learns endpoint, price and pay-to from ENS records).
- **Never charge for nothing** — if upstream data fails the handler returns non-2xx and the x402 middleware cancels the payment.

**Code.**

| What | Link |
|---|---|
| Blocky402 facilitator URL (testnet/mainnet) | [packages/service/src/x402.ts#L15](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/service/src/x402.ts#L15) |
| x402 resource server + Hedera `exact` scheme registration | [packages/service/src/x402.ts#L88](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/service/src/x402.ts#L88) |
| Metered quote functions (per protocol / per stream window) | [packages/service/src/x402.ts#L43-L54](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/service/src/x402.ts#L43-L54) |
| Two `accepts` per route: HBAR and HTS USDC, dynamic price | [packages/service/src/x402.ts#L62-L63](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/service/src/x402.ts#L62-L63) |
| `onAfterSettle` → HCS audit record `x402.settled` | [packages/service/src/x402.ts#L90-L101](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/service/src/x402.ts#L90-L101) |
| x402 middleware applied to all paid routes | [packages/service/src/server.ts#L30](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/service/src/server.ts#L30) |
| Streamed micropayments: paid SSE window, renew to extend | [packages/service/src/stream.ts#L15-L64](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/service/src/stream.ts#L15-L64) |
| Payment cancelled when every upstream query fails | [packages/service/src/handlers.ts#L47](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/service/src/handlers.ts#L47) |
| ERC-8004 registration file | [packages/service/src/registration.ts#L16-L22](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/service/src/registration.ts#L16-L22) |
| HCS `TopicMessageSubmitTransaction` helper | [packages/shared/src/hedera.ts#L61](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/shared/src/hedera.ts#L61) |
| HTS USDC token ids | [packages/shared/src/hedera.ts#L97](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/shared/src/hedera.ts#L97) |
| Agent: Hedera signer + `ExactHederaScheme` client | [packages/agent/src/x402.ts#L56-L61](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/agent/src/x402.ts#L56-L61) |
| Agent: budget guard before signing (`BudgetExceeded`) | [packages/agent/src/x402.ts#L71-L112](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/agent/src/x402.ts#L71-L112) |
| Agent: decode `PAYMENT-RESPONSE`, record `x402.paid` on HCS | [packages/agent/src/x402.ts#L127-L146](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/agent/src/x402.ts#L127-L146) |
| Agent: final verdict anchored on HCS (`agent.decision`) | [packages/agent/src/agent.ts#L104](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/agent/src/agent.ts#L104) |
| Agent wallet creation (`AccountCreateTransaction`, ECDSA) | [packages/service/scripts/create-agent-account.ts#L17](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/service/scripts/create-agent-account.ts#L17) |

---

## The Graph — 🧩 Best Use of Composable or Standardized Graph Products

**Why we're eligible.** The whole data layer is built on **Messari Standardized Subgraphs** consumed live from The Graph Network gateway with a Subgraph Studio API key — no mocks, no local data. One query string runs across every protocol of a type: the `dex-amm` schema for Uniswap v3, Uniswap v2, SushiSwap and Curve; the `lending` schema for Aave v3, Compound v3 and Spark. Three query strings serve seven protocols; the only schema divergence we hit (event actor `from` in 1.3 vs `account { id }` in 4.0) is handled by a one-line switch, and adding a protocol is one JSON entry. We also **compose two Graph products**: the live whale wire streams ERC-20 transfers through the reusable `ethereum-common` Substreams package (`filtered_events` with an `evt_sig:` query) and prices them with `lastPriceUSD` from the standardized Uniswap v3 subgraph. The standards leverage is visible in the demo: the "Run the same query on 7 protocols" panel and `pnpm graph:smoke` execute the identical query per protocol and print per-protocol results and timings.

**Code.**

| What | Link |
|---|---|
| Protocol registry: 7 Messari standardized subgraph IDs (dex-amm + lending) | [packages/shared/src/protocols.ts#L24-L53](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/shared/src/protocols.ts#L24-L53) |
| Gateway client (`gateway.thegraph.com`, Studio API key) — one function for every protocol | [packages/shared/src/graph.ts#L5-L17](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/shared/src/graph.ts#L5-L17) |
| The one schema-version divergence, handled in one line | [packages/shared/src/graph.ts#L46](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/shared/src/graph.ts#L46) |
| Standardized DEX whale query (swaps + withdraws), same for every DEX | [packages/shared/src/graph.ts#L53](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/shared/src/graph.ts#L53) |
| Standardized pool-risk query (pool, snapshots, withdraws, deposits, swaps) | [packages/shared/src/graph.ts#L117](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/shared/src/graph.ts#L117) |
| Cross-DEX pool search with the standardized `inputTokens_contains` filter | [packages/shared/src/graph.ts#L226](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/shared/src/graph.ts#L226) |
| Standardized lending query (markets + liquidates), same for every lender | [packages/shared/src/graph.ts#L251](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/shared/src/graph.ts#L251) |
| Fan-out: the same query to N protocols in parallel | [packages/service/src/handlers.ts#L38](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/service/src/handlers.ts#L38) |
| Risk score computed purely from standardized fields | [packages/shared/src/risk.ts#L17](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/shared/src/risk.ts#L17) |
| Substreams: `ethereum-common` package, `filtered_events` param, `BlockEmitter` | [packages/service/src/substreams.ts#L18-L69](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/service/src/substreams.ts#L18-L69) |
| Composition: Substreams events priced with the standardized subgraph | [packages/service/src/substreams.ts#L127](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/service/src/substreams.ts#L127) |
| Smoke test: identical query across every DEX and lender | [packages/shared/scripts/smoke.ts#L11](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/shared/scripts/smoke.ts#L11) |

---

## ENS — 🧬 Best Use of ENSv2

**Why we're eligible.** ENSv2 on Sepolia is the discovery and permission layer of the product, not a label. `rugradar.eth` was registered on the ENSv2 ETH Registrar (commit → reveal, MockUSDC) with its subregistry pointed at **our own PermissionedRegistry** and its resolver at **our own PermissionedResolver**, both deployed through the VerifiableFactory. Services are **expiring (30 d), non-transferable (no `ROLE_CAN_TRANSFER_ADMIN`), revocable (`unregister`) subnames** in that registry. Their x402 endpoint, price list, pay-to account, catalog and HCS audit topic are **text records** using ENSIP-26 keys (`agent-endpoint[x402]`, `agent-context`) plus namespaced `x402.*` / `hcs.*` / `erc8004.*` keys. **Enhanced Access Control** delegates exactly one text key (`x402.pricing`) to the service's own key via `authorizeTextRoles`; the demo proves live that this key can update the price and is refused on any other record. The **agent has its own subname** (`scout.rugradar.eth`) carrying its Hedera account and spend-ledger topic. The consumer side is fully dynamic: the agent enumerates the registry (`LabelRegistered` logs) and resolves records through the **Universal Resolver**; nothing about the paid API is hard-coded. Live: [`api.rugradar.eth`](https://sepolia.app.ens.domains/api.rugradar.eth), registry [`0x8ff7…Aa36`](https://sepolia.etherscan.io/address/0x8ff7afe6ad9ED3D06caDFD487fdf059c1938Aa36), resolver [`0x1321…E0Ee`](https://sepolia.etherscan.io/address/0x132145725Cf0553E226B9e83C461C5F42250E0Ee).

**Code.**

| What | Link |
|---|---|
| ENSv2 Sepolia addresses, EAC role bitmaps, ABI fragments | [packages/shared/src/ens.ts#L9](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/shared/src/ens.ts#L9) |
| Service subname roles: renew + set-resolver only → non-transferable | [packages/shared/src/ens.ts#L90](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/shared/src/ens.ts#L90) |
| `authorizeTextRoles` ABI (per-key EAC delegation) | [packages/shared/src/ens.ts#L128](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/shared/src/ens.ts#L128) |
| ENSIP-26 record keys (`agent-endpoint[x402]`, `agent-context`) + `x402.*` keys | [packages/shared/src/ens.ts#L178](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/shared/src/ens.ts#L178) |
| Deploy our PermissionedRegistry + PermissionedResolver via VerifiableFactory | [packages/ens/src/deploy-namespace.ts#L42-L67](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/ens/src/deploy-namespace.ts#L42-L67) |
| Register `rugradar.eth` on the ENSv2 ETH Registrar (makeCommitment → commit → register) | [packages/ens/src/deploy-namespace.ts#L110-L127](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/ens/src/deploy-namespace.ts#L110-L127) |
| Register an expiring, non-transferable service subname in our registry | [packages/ens/src/register-service.ts#L69](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/ens/src/register-service.ts#L69) |
| Publish text records on our PermissionedResolver | [packages/ens/src/register-service.ts#L110](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/ens/src/register-service.ts#L110) |
| EAC: delegate only `x402.pricing` to the service key | [packages/ens/src/register-service.ts#L133](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/ens/src/register-service.ts#L133) |
| EAC proof: service key allowed on `x402.pricing`, refused on `agent-context` | [packages/ens/src/lib/eac.ts#L48-L61](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/ens/src/lib/eac.ts#L48-L61) |
| Revocation (`unregister`) by the namespace admin | [packages/ens/src/revoke-service.ts#L14](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/ens/src/revoke-service.ts#L14) |
| Agent discovery: Universal Resolver `getEnsText` on ENSv2 | [packages/agent/src/discovery.ts#L38](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/agent/src/discovery.ts#L38) |
| Agent discovery: enumerate subnames from registry `LabelRegistered` logs | [packages/agent/src/discovery.ts#L63-L68](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/agent/src/discovery.ts#L63-L68) |
| Registry hierarchy walk shown in the UI (`getSubregistry`, expiry, `hasRoles` transferable check) | [packages/agent/src/web.ts#L127-L135](https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/agent/src/web.ts#L127-L135) |
