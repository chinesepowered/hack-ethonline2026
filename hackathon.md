# ETHOnline 2026 — Bounty Reference & Strategy

Date: 2026-09-04. We are a **new project (Start Fresh)**, so every "Continuity" prize is out of reach. Max **3 bounties** per project. Judged by **demo video (2–5 min) + README + public repo**; judges are sponsor staff.

---

## 0. Decision (TL;DR)

**Build: "Meter" — an x402 agent-to-service marketplace for live onchain intelligence.**

| Side | What it is | Sponsor it serves |
|---|---|---|
| **Provider** | HTTP API that sells live cross-protocol DeFi analytics (whale flows, pool risk, protocol TVL/health) computed from **The Graph** standardized subgraphs. Every endpoint is **x402-gated on Hedera** (settled via Blocky402), priced per call / per row, with an **HCS audit log** of every payment and an **ERC-8004 / HCS-14** identity. | Hedera, The Graph |
| **Consumer** | An LLM agent with a Hedera wallet and a budget. It **discovers** services (ENSv2 subname registry on Sepolia = agent directory), **pays** per call via x402, **reasons** over the Graph data, and produces a decision (e.g. "exit this LP position", "this pool is being drained"). | Hedera, The Graph, ENS |
| **Directory** | `*.meter.eth` (Sepolia, ENSv2): each service/agent gets a subname whose Permissioned Resolver text records hold the x402 endpoint, price, chain, and ERC-8004 id. Enhanced Access Control lets a service edit *only its own* records. | ENS |

**Bounties (3):**
1. Hedera — 🤖 AI & Agentic Payments on Hedera ($6,000, up to 3 × $2,000)
2. The Graph — 🤖 Best AI Tooling or AI Use Case (From Scratch) ($5,000: 2.5k / 1.5k / 1k)
3. ENS — 🧬 Best Use of ENSv2 ($4,500: 1.5k / 1.5k / 1k / 0.5k)
   *Fallback if ENSv2 beta is too rough by mid-event: Bazantic 👨‍🍳 Agentify a new API ($1,000, 3 places) — wrap our provider API in a Bazantic gateway + recipe. ~1 day of work.*

Total addressable: **$15,500** across **10 prize slots**. Rough EV ≈ $2,500–3,500 (see §2).

---

## 1. Why this project

- **It is the meta-theme of this hackathon.** x402 / agentic payments appear in Hedera, Arc, The Graph, Ledger, and Bazantic prize text. Sponsors are explicitly asking for it, so it reads as "mainnet-relevant" to every judge.
- **Each sponsor is load-bearing, not cosmetic.** Hedera = payment rail + identity + audit. The Graph = the only data source. ENS = the discovery layer. Remove any one and the demo breaks. Judges check exactly this.
- **Demo is a single linear story** that fits 3 minutes: agent gets a task → resolves ENS name → hits 402 → pays HBAR/USDC → receives Graph-derived data → makes a decision → HashScan shows the settlement + HCS log. Every step has a visible artifact.
- **Hits most Hedera "extra points":** metered (not flat) pricing, ERC-8004/HCS-14 identity, discovery directory, HTS token in settlement path (USDC), HCS audit trail. Optionally Scheduled Transactions for a streaming/subscription mode.
- **Starter code exists.** `hedera-dev/x402-inference-pay-per-request-poc` is Express + `@x402/express` + `@x402/hedera` + Hedera Agent Kit, already wired to Blocky402 (mainnet) and x402.org (testnet), toggling HBAR/USDC. We swap "LLM inference" for "Graph data endpoints" and add the agent brain.

## 2. EV table (Start-Fresh eligible prizes only)

P(win) is a gut estimate assuming we ship a polished, working demo. "Slots" = number of prizes awarded.

| Sponsor | Prize | Pool | Slots | Competition | Effort | Fit w/ plan | P(any) | EV |
|---|---|---|---|---|---|---|---|---|
| Hedera | AI & Agentic Payments (x402) | $6,000 | 3 × $2k | Low–Med (narrow spec: Blocky402) | Med | Core | 35% | ~$700 |
| The Graph | AI Use Case (From Scratch) | $5,000 | 3 | High (Graph is easy to add) | Med | Core | 20% | ~$330 |
| ENS | Best Use of ENSv2 | $4,500 | 4 | Low–Med (beta, contract-heavy) | Med–High | Good | 30% | ~$340 |
| Bazantic | Agentify a new API | $1,000 | 3 | Very low | Low | Good | 45% | ~$150 |
| Bazantic | Recipe w/ sponsor APIs | $1,000 | 3 | Very low | Low | Good | 40% | ~$130 |
| Arc | Launch on Arc Testnet → Mainnet | $3,500 | 2 | Med–High | Med (2nd chain) | Good (x402 on Arc) | 15% | ~$260 |
| Arc | Agentic Economy (Agent Stack) | $1,667 | 1 | High | Med | Good | 10% | ~$170 |
| Arc | DeFi/Onchain Finance | $1,667 | 1 | High | High | Weak | 5% | ~$80 |
| Hedera | Tokenization (ATS) | $6,000 | 3 × $2k | Low (painful SDK) | High | Different project | 30% | ~$600 |
| Hedera | Improve the Harness | $2,000 | 2 × $1k | Low | Med | Different work | 25% | ~$250 |
| The Graph | Composable/Standardized | $5,000 | 3 | Med | Med | Good (same data layer) | 20% | ~$330 |
| Chainlink | CRE Confidential Workflow | $2,500 | 2 | Low–Med (new, TEE) | High | Possible (private budget in TEE) | 20% | ~$250 |
| Uniswap | Stack Contribution | $3,000 | 3 × $1k | Very high (anything counts) | Med | Weak | 8% | ~$80 |
| Privy | B2B financial product | $2,500 | 1 | High | Med | Possible (agent spend policies) | 8% | ~$200 |
| Privy | Best financial flow | $2,500 | 1 | High | Med | Weak | 5% | ~$125 |
| Ledger | AI Agents x Ledger | $3,500 | 3 | Low | Med–High | Good, **but likely needs a physical Ledger** | 25%* | ~$300* |
| World | Selfie Check | $3,500 | ? | Med | Med | Weak; needs sandbox access form + feedback doc | 10% | ~$100 |
| 1inch | Build an Aqua App | $5,000 | 3 | Low but strong teams (Solidity/SwapVM) | Very high | Different project | 10% | ~$170 |

\* Only if someone on the team owns a Ledger device.

**Reading the table:** Hedera x402 is the single best bet (flat $2k × 3, narrow requirements that scare off casual entries, and we can nail every extra-point item). The Graph AI is crowded but the "From Scratch" pool halves the field and the data layer is cheap to add. ENSv2 has the most slots (4) and a beta that few will touch. Bazantic is the cheapest insurance policy.

## 3. Alternatives considered

**B. Institutional RWA on Hedera:** Hedera Tokenization ATS ($6k/3) + Privy B2B ($2.5k) + Chainlink CRE Confidential ($2.5k/2). Tokenized bond with coupons via Scheduled Tx, Privy org wallet w/ quorum approvals, CRE for NAV pricing in a TEE. Comparable EV, but three heavy, unfamiliar SDKs, a less visual demo, and no reuse between sponsors. Rejected.

**C. Same as A but swap ENS for Arc "Launch to Mainnet" ($3.5k/2):** make the provider accept x402 on Arc (USDC) as a second rail, agent picks the cheaper rail. Strong story ("multi-rail agent payments"), but requires a second chain + Circle facilitator work + "deployment-ready on Arc mainnet by Sep 30". Keep as a stretch if we finish early; ENS is more slots for less risk.

**D. Ledger instead of ENS:** best narrative fit (agent pays via x402 with device-secured key, human-in-the-loop for big spends), only if a Ledger device is on hand. Verify with `wallet-cli` docs first.

## 4. Build plan (order matters — each step is a demoable checkpoint)

1. **Provider API (Hedera x402)** — fork the Hedera PoC structure. Express + `@x402/express`, Blocky402 facilitator, Hedera testnet, HBAR + USDC (HTS). 3 endpoints, metered pricing (price scales with rows/lookback). *Checkpoint: curl → 402 → paid → JSON.*
2. **Graph data layer** — Messari standardized subgraphs via Subgraph Studio API key (Uniswap v3, Aave v3, Curve, etc. share one schema) so one query pattern spans protocols. Endpoints: `/whales`, `/pool-risk`, `/protocol-health`. *Checkpoint: live numbers, not mocks.*
3. **Agent** — Claude with tools: `resolve_service` (ENS), `pay_and_fetch` (x402), `budget`. Hedera Agent Kit for wallet. Task examples: "Am I about to get rugged on pool X?", "Rebalance advice for my LP positions". Log every payment to an HCS topic. *Checkpoint: end-to-end paid request driven by the agent.*
4. **ENSv2 directory (Sepolia)** — deploy a subname registry under a parent, Permissioned Resolver per service with text records (`x402.endpoint`, `x402.price`, `x402.chain`, `erc8004.id`), EAC role so a service key can only edit its own records. Agent resolves via Universal Resolver V2. *Checkpoint: registering a new service makes it discoverable to the agent with zero config.*
5. **Identity + extras** — ERC-8004 registration (or HCS-14), optional Scheduled Transactions "subscription" mode.
6. **Polish** — README with architecture diagram, payment-flow sequence diagram, HashScan links, one-command setup. Bazantic gateway + recipe if time remains (fallback bounty).
7. **Video (3–4 min):** 20s problem → 30s architecture → 2 min live run (terminal + HashScan + ENS explorer side by side) → 30s "why mainnet-ready".

## 5. Hard requirements checklist (must all be true at submission)

**Hedera x402**
- [ ] Live x402-gated service on Hedera testnet/mainnet, settled through Blocky402
- [ ] Agent completes ≥1 real paid request end to end
- [ ] README: setup, architecture, payment flow
- [ ] Video ≤ 5 min showing the paid request executing

**The Graph (From Scratch)**
- [ ] Graph is load-bearing (only data source for the agent)
- [ ] Live data via Subgraph Studio API key (no mocks / static datasets)
- [ ] Meaningful reasoning/decision on the data, not raw query printing
- [ ] README/SKILL.md good enough for judges to run it; video 2–4 min
- [ ] Select "Start Fresh" pool in submission

**ENSv2**
- [ ] Built on ENSv2 Sepolia; features central (registry hierarchy, Permissioned Resolver, EAC)
- [ ] Functional demo, no hard-coded values
- [ ] Video and/or live demo link; open-source repo

**General**
- [ ] Real commit history throughout the event (1inch wants it, everyone likes it)
- [ ] Mark clearly which bounty each part of the README addresses

---

## 6. Full bounty catalog (Start-Fresh eligible only; continuity prizes omitted)

### The Graph — $15,000 total
**🧩 Best Use of Composable or Standardized Graph Products — $5,000 (2.5k / 1.5k / 1k)**
Compose ≥2 Graph products (Subgraphs, Substreams, Subgraph MCP, Amp) or build on a standardized schema (Messari Standardized Subgraphs). Live data from a Graph provider; no mocks. Querying one subgraph alone doesn't qualify. Show what got easier because of the standard. Repo + 2–4 min video.
Links: Messari standard subgraphs docs; Agent0/ERC-8004 subgraphs; streamingfast/substreams-chain-modules; pinax-network/substreams-evm.

**🤖 Best AI Tooling or AI Use Case (From Scratch) — $5,000 (2.5k / 1.5k / 1k)**
Either tooling that makes The Graph usable from AI envs (MCP servers, SKILLs, x402 payment tooling, A2A, plugins) or agents/apps using The Graph as live data (research assistants, trading agents, portfolio copilots, risk monitors). Graph must be load-bearing; live data via Studio API key or The Graph Market; do meaningful work with the data. Featured challenge: one-prompt Substreams deployment via Substreams SKILLs. Repo + 2–4 min video. Select Start Fresh pool.
Links: Subgraph MCP docs; graphprotocol/subgraphs-skills; streamingfast/substreams-skills.

### Hedera — $15,000 total
**🤖 AI & Agentic Payments on Hedera — $6,000 (up to 3 × $2,000)**
Stand up a real x402-gated service on Hedera (testnet or mainnet) settled through the **Blocky402 facilitator**, and build the agent/platform that pays for it. Ideas: pay-per-call inference, metered data feed, agent marketplace, micropayment streaming. Repo w/ README (setup, architecture, payment flow) + video ≤5 min.
Extra points: metered (not flat) pricing; multi-agent negotiation (A2A/ACP); ERC-8004 or HCS-14 identity; discovery via UCP or a directory; HTS tokens / custom fee schedules in settlement; HCS audit trails; Scheduled Transactions for recurring/streamed payments.
Links: hedera-dev/hedera-code-snippets; blocky402.com; hedera-dev/x402-inference-pay-per-request-poc; hashgraph/hedera-agent-kit-js; hedera-dev/scaffold-hbar; x402-foundation/x402.
Verified: Blocky402 hosts Hedera Testnet + Hedera Mainnet (also Polygon Amoy, Solana Devnet on testnet); npm `@x402/fetch`, `@x402/core`, `@x402/hedera`, `@x402/express`; testnet needs no API key.

**🛠️ Open Source — Improve the Hedera Harness — $2,000 (up to 2 × $1,000)**
Meaningful PR to hedera-dev/hedera-harness (open PR fine) or a new harness inspired by it. Extra: new service coverage, port to another language, local dev/testing mode, before/after DX evidence. Video ≤5 min.

**🪙 Tokenization of Anything — $6,000 (up to 3 × $2,000)**
Enterprise finance app using Asset Tokenization Studio (ERC-3643 / ERC-1400, compliance, corporate actions, coupons). Deploy on Hedera testnet, contracts verified on HashScan. Video ≤5 min showing issuance + config + ≥1 lifecycle op. Extra: secondary market, KYC/freeze/pause controls, fee schedules/coupons, oracle NAV, Scheduled Tx for vesting/maturity, upstream contributions.

### Arc (Circle) — $10,000 total
All Arc tracks require: working frontend + backend, **architecture diagram**, video + presentation, repo link, and stating which track you submit to.
**🏆 Best DeFi/Onchain Finance Application — $1,667 (1 winner).** Stablecoin-native DeFi on Arc with USDC: lending, swaps, FX, yield, payments, treasury. Products: Arc, USDC, App Kits, Circle Wallets, Circle Contracts, CCTP, Gateway, StableFX.
**🏆 Best Agentic Economy App w/ Circle Agent Stack — $1,667 (1 winner).** Agents holding wallets, paying, settling in USDC; Agent Stack, Nanopayments, Paymaster, App Kits.
**🏆 Launch on Arc Testnet & Push to Mainnet — $3,500 (2.5k / 1k).** Add a working Arc integration ready for mainnet: USDC/EURC payment flows, cross-chain/unified balance, agentic payments in an agent or API-monetization tool, escrow/settlement. **Must be deployed or deployment-ready on Arc mainnet by Sept 30.**
Links: docs.arc.io; docs.arc.io/app-kit; developers.circle.com; circlefin/agent-stack-starter-kits.

### World — $7,000 total (only $3,500 Start-Fresh eligible)
**🤳 Selfie Check — $3,500.** Realistic Selfie Check flow (low-friction biometric credential) used as a risk / eligibility / fairness / abuse-prevention signal. Must use World ID Sandbox App (needs sandbox access form) and include a **feedback document** on docs, dev portal, sandbox states/errors. Working app.

### 1inch — $7,000 total ($5,000 Start-Fresh)
**💧 Build an Aqua App — $5,000 (2.5k / 1.5k / 1k).** Custom Aqua app implementing a sophisticated DeFi position; SwapVM usage scored higher (custom opcodes allowed). Official Aqua/SwapVM contracts; onchain token transfers shown in demo (local forks OK); **proper commit history, no single-commit dumps**.

### ENS — $5,000 total ($4,500 Start-Fresh)
**🧬 Best Use of ENSv2 — $4,500 (1.5k / 1.5k / 1k / 0.5k).** ENSv2 beta on Sepolia: hierarchical registry, wildcard resolution off parent resolver, deploy your own subname registry, Enhanced Access Control (role-based, e.g. account may edit only certain text records), Permissioned Resolver per subname, record aliasing / namespace aliasing, expiring/revocable/non-transferable subnames. **Bonus for AI agents as namespaces with their own identity & permissions.** Must be central, functional, no hard-coded values; video and/or live demo; open source.
Links: Permissioned Registry / Permissioned Resolver / EAC docs; contract-dev tutorial; ens-cli (agent-native); ENSIP-25 (agent registry name verification); ENSIP-26 (agent text records).
Verified: deployed on Sepolia with ENS Explorer; contracts "not yet final and may change".

### Uniswap Foundation — $5,000 total ($3,000 Start-Fresh)
**🦄 Best Uniswap Stack Contribution — $3,000 (up to 3 × $1,000).** Anything on the stack: Uniswap API, v2/v3/v4, CCA, v4 hooks, tooling. **Requires FEEDBACK.md + submitting the Uniswap Developer Feedback Form** linking to it; README must point to exact contracts/lines.

### Ledger — $5,000 total ($3,500 Start-Fresh)
**🤖 AI Agents x Ledger — $3,500 (2k / 1k / 0.5k).** Device-backed security central: agents using secrets they can't leak (Key Ring CLI hands out scoped capabilities), Key Ring on hosts without USB (VPS/CI/hosted agent), agents paying for APIs with Ledger-secured x402-style flows, human-in-the-loop device approval before irreversible actions. Must be built on the Ledger Agent Stack, esp. `wallet-cli ring`. Tools: `npm i -g @ledgerhq/wallet-cli`, `npx skills add ledgerhq/agent-skills`. Docs say "one device tap to set up" → assume physical device needed.

### Privy — $5,000 total
**🏢 Best B2B financial product — $2,500 (1 winner).** Org wallets, policies, team permissions, quorum approvals, intents, automated txs. Need ≥1 Privy wallet, ≥1 B2B workflow, ≥1 Privy control (policies/signers/key quorums/intents).
**💸 Best financial flow — $2,500 (1 winner).** Transfers, bridging, stablecoin conversion, swaps, Earn vaults, onramps. Privy Cards may be mocked but another live flow required.

### Chainlink — $3,000 total ($2,500 Start-Fresh)
**🔗 Best Confidential Workflow — $2,500 (up to 2 × $1,250).** CRE workflow using Confidential Workflows: register a TEE handler (`handlerInTee` TS / `cre.HandlerInTee` Go) that processes ≥1 secret/sensitive input inside the enclave, meaningfully integrated. Demonstrate via CRE CLI simulation or live deployment; include logs/terminal output/video. Use CRE, not Functions/Automation (deprecated).
Links: cre-templates (ai-audit-firewall, automated-liquidation-protection, hello-confidential-workflows); docs.chain.link/cre.

### Bazantic — $3,000 total ($2,000 Start-Fresh)
Common reqs: bazantic.com account; create an x402/MPP Gateway for your project; screen recording; provide account username (email/GitHub).
**🍳 Best Recipe using Sponsor APIs — $1,000 (500 / 300 / 200).** Recipe chaining ≥2 services (yours + one already on Bazantic or from a sponsor) where the result depends on both.
**👨‍🍳 Agentify a new API — $1,000 (500 / 300 / 200).** Add an API not already on Bazantic and not from a sponsor, build a gateway, and a reusable recipe combining it with your project.

---

## 7. Idea shortlist (15) and revised pick

| # | Idea | Bounties (3) | Slots | Effort | Demo |
|---|---|---|---|---|---|
| 1 | Meter — x402 marketplace for Graph-derived analytics on Hedera, ENSv2 directory | Hedera x402, Graph AI, ENSv2 | 10 | Med | Good |
| 2 | Rug Radar — Substreams + standardized subgraphs, per-alert drain warnings sold via x402 | Hedera x402, Graph Composable, Bazantic Agentify | 9 | Med | Great |
| 3 | AgentDNS — ENSv2 agent registrar (expiring/revocable names, ERC-8004), MCP server, subgraph | ENSv2, Graph AI (tooling), Bazantic | 10 | Med-High | OK |
| 4 | Bond Desk — ATS bond, coupons via Scheduled Tx, NAV in CRE enclave, Privy quorum | Hedera ATS, Chainlink CRE, Privy B2B | 6 | High | OK |
| 5 | Repo Rail — tokenized treasuries as repo collateral on ATS, private haircuts in CRE | Hedera ATS, Chainlink CRE, Bazantic Recipe | 8 | Very high | OK |
| 6 | Vault Ranger — ERC-4626 Substreams module + agent routing deposits via Uniswap | Graph Composable, Uniswap, Privy flow | 7 | Med-High | OK |
| 7 | Blind Rebalancer — private allocations in CRE TEE, Graph data, Uniswap v4 execution | Chainlink CRE, Graph AI, Uniswap | 8 | High | OK |
| 8 | Ledger Sentinel — agent pays x402 with Ledger key, device tap above threshold | Ledger, Hedera x402, Graph AI | 9 | Med-High | Great (needs device) |
| 9 | One Human One Agent — Selfie Check gates agent creation (sybil), agents pay on Hedera | World Selfie, Hedera x402, ENSv2 | 8+ | Med | Good |
| 10 | Aqua Ladder — SwapVM custom opcode position managed by agent | 1inch Aqua, Graph AI, Uniswap | 9 | Very high | OK |
| 11 | Harness Plus — Python Hedera Harness port with x402 | Hedera Harness, Hedera x402, Bazantic | 8 | Med | Weak |
| 12 | Payroll Rail — Privy org wallet pays agents in USDC on Arc | Privy B2B, Arc Agentic, Arc Launch | 4 | Med | Good |
| 13 | Prompt-to-Pipeline — one-prompt Substreams deploy (Graph featured challenge), sold via x402 | Graph AI, Hedera x402, Bazantic | 9 | Med-High | Good |
| 14 | Trade Firewall — CRE confidential pre-trade audit before each x402 payment | Chainlink CRE, Hedera x402, Graph AI | 8 | High | OK |
| 15 | Whale Wire — cross-protocol whale feed streamed via x402 micropayments settled every few seconds | Hedera x402, Graph Composable, ENSv2 | 10 | Med | Great |

**Revised pick: #2 merged with #15.** A monitoring agent selling (a) per-alert drain/whale warnings and (b) a streamed feed settled every few seconds, both computed from Messari standardized subgraphs + a Substreams stream, with ENSv2 subnames as the service/subscriber directory.
Bounties: **Hedera x402, The Graph Composable, ENSv2** (10 slots). Swaps the crowded Graph AI pool for Composable, where "one schema across many protocols" is the literal criterion, and hits Hedera's streaming-settlement and metered-pricing extra points.
Second choice (if a Ledger device is available): #8. Third choice (contract-strong team, low competition): #4.
