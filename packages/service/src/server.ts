import express from "express";
import { paymentMiddleware } from "@x402/express";
import { env, hashscanTopic } from "@rugradar/shared";
import { FACILITATOR_URL, NETWORK, PAY_TO, audit, createResourceServer, routes } from "./x402.ts";
import { catalog, poolRisk, protocolHealth, whales } from "./handlers.ts";
import { streamWhales } from "./stream.ts";
import { registrationFile } from "./registration.ts";
import { whaleWire } from "./substreams.ts";

const PORT = Number(env("PORT", "4021"));
const SERVICE_URL = env("SERVICE_URL", `http://localhost:${PORT}`);

const app = express();
app.use(express.json());

// Free, discoverable surface
app.get("/", (_req, res) => {
  res.json({ name: "Rug Radar", catalog: `${SERVICE_URL}/v1/catalog`, registration: `${SERVICE_URL}/.well-known/agent-registration.json` });
});
app.get("/health", (_req, res) => res.json({ ok: true, network: NETWORK, facilitator: FACILITATOR_URL, wire: whaleWire.status }));
app.get("/v1/catalog", catalog(SERVICE_URL));
app.get("/.well-known/agent-registration.json", (_req, res) => res.json(registrationFile(SERVICE_URL)));
app.get("/radar.svg", (_req, res) => {
  res.type("image/svg+xml").send(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#0b1020"/><circle cx="32" cy="32" r="20" fill="none" stroke="#3ddc97" stroke-width="2"/><circle cx="32" cy="32" r="10" fill="none" stroke="#3ddc97" stroke-width="2"/><path d="M32 32 L32 4" stroke="#3ddc97" stroke-width="3"/><circle cx="44" cy="22" r="3" fill="#ff5c5c"/></svg>`,
  );
});

// Paid surface: x402 on Hedera, settled by Blocky402
app.use(paymentMiddleware(routes, createResourceServer()));
app.get("/v1/whales", whales);
app.get("/v1/pool-risk", poolRisk);
app.get("/v1/protocol-health", protocolHealth);
app.get("/v1/stream/whales", streamWhales);

app.listen(PORT, () => {
  console.log(`\n📡 Rug Radar service on ${SERVICE_URL}`);
  console.log(`   x402: ${NETWORK} → payTo ${PAY_TO} via ${FACILITATOR_URL}`);
  console.log(`   HCS audit: ${audit.topicId ? hashscanTopic(audit.topicId) : "disabled (set HCS_SERVICE_TOPIC_ID)"}`);
  console.log(`   catalog: ${SERVICE_URL}/v1/catalog\n`);
  whaleWire.start().catch((err) => console.warn("[substreams] not started:", err instanceof Error ? err.message : err));
});
