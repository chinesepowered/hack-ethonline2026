# Submission notes (paste-ready)

Repo: https://github.com/chinesepowered/hack-ethonline2026 · Track: Start Fresh
Live: service `https://rugradar-vibj.onrender.com/v1/catalog` · ENS `api.rugradar.eth` (Sepolia) · HCS topics `0.0.10372243` / `0.0.10372244` (Hedera testnet)

---

## Hedera — AI & Agentic Payments on Hedera

**Why we're eligible**

Rug Radar is a live x402-gated data service on Hedera testnet, settled through the Blocky402 facilitator, and an autonomous agent that discovers it, pays for it, and completes real paid requests end to end (example settlement: https://hashscan.io/testnet/transaction/0.0.7162784%401788663313.356227872). Pricing is metered, not flat: per protocol scanned, per lookback day, and per 15-second window for the streamed whale wire (streamed micropayments: pay a window, re-request to extend). Every route accepts HBAR or HTS USDC. Every settlement is written to a Hedera Consensus Service topic by the service, and the agent writes every payment plus its final decision to its own HCS topic, giving a verifiable audit trail. The agent holds its own ECDSA Hedera account and checks a hard HBAR budget before signing; if upstream data fails, the handler returns non-2xx and the x402 middleware cancels the payment. The service publishes an ERC-8004 registration file and is discoverable through an ENSv2 directory, so the agent learns the endpoint, prices and pay-to account with no API key or subscription.

**Code link**

https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/service/src/x402.ts

(Blocky402 facilitator, Hedera `exact` scheme registration, metered dynamic pricing with HBAR + HTS USDC, and the `onAfterSettle` → HCS audit hook are all in this file. The paying agent side is `packages/agent/src/x402.ts`.)

---

## The Graph — Best Use of Composable or Standardized Graph Products

**Why we're eligible**

The entire data layer is built on Messari Standardized Subgraphs, consumed live from The Graph Network gateway with a Subgraph Studio API key (no mocks, no local data). One query string runs across every protocol of a type: the `dex-amm` schema for Uniswap v3, Uniswap v2, SushiSwap and Curve, and the `lending` schema for Aave v3, Compound v3 and Spark. Three query strings serve seven protocols; the only divergence between schema majors (event actor `from` in 1.3 vs `account { id }` in 4.0) is handled by a one-line switch, and adding a protocol is one JSON entry. We also compose two Graph products: the live whale wire streams ERC-20 transfers through the reusable `ethereum-common` Substreams package (`filtered_events` with an `evt_sig:` query) and prices them with `lastPriceUSD` from the standardized Uniswap v3 subgraph. The standards leverage is shown directly in the demo: one button runs the identical query on all seven protocols and prints per-protocol results and timings.

**Code link**

https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/shared/src/graph.ts

(One gateway function and three standardized query strings shared by all seven protocols, including the `actorField` one-liner for the 1.3/4.0 schema difference and the cross-DEX `inputTokens_contains` pool search. The Substreams composition is `packages/service/src/substreams.ts`; the protocol registry is `packages/shared/src/protocols.ts`.)

---

## ENS — Best Use of ENSv2

**Why we're eligible**

ENSv2 on Sepolia is the discovery and permission layer of the product. `rugradar.eth` was registered on the ENSv2 ETH Registrar (commit → reveal) with its subregistry pointed at our own PermissionedRegistry and its resolver at our own PermissionedResolver, both deployed through the VerifiableFactory. Services are expiring (30-day), non-transferable (no `ROLE_CAN_TRANSFER_ADMIN`) and revocable (`unregister`) subnames in that registry. Their x402 endpoint, price list, pay-to account, catalog and HCS audit topic are text records using ENSIP-26 keys (`agent-endpoint[x402]`, `agent-context`) plus `x402.*`, `hcs.*` and `erc8004.*` keys. Enhanced Access Control delegates exactly one text key (`x402.pricing`) to the service's own key with `authorizeTextRoles`; the demo proves live that this key can update the price and is refused on any other record. The agent has its own subname (`scout.rugradar.eth`) carrying its Hedera account and spend-ledger topic. The consumer is fully dynamic: it enumerates the registry from `LabelRegistered` logs and resolves records through the Universal Resolver, so nothing about the paid API is hard-coded. Live: https://sepolia.app.ens.domains/api.rugradar.eth

**Code link**

https://github.com/chinesepowered/hack-ethonline2026/blob/main/packages/ens/src/register-service.ts

(Registers an expiring, non-transferable subname in our PermissionedRegistry, publishes ENSIP-26 and x402 records on our PermissionedResolver, and delegates a single text key via Enhanced Access Control. Namespace deployment and `.eth` registration are in `packages/ens/src/deploy-namespace.ts`; the EAC proof in `packages/ens/src/lib/eac.ts`; Universal Resolver discovery in `packages/agent/src/discovery.ts`.)
