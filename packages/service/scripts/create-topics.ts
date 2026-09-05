/**
 * Creates the two HCS audit topics (service-side settlements, agent-side spend ledger).
 * Prints env lines to paste into .env.  Usage: pnpm hedera:topics
 */
import { createTopic, env, envOptional, hashscanTopic, hederaClient, keyTypeFor } from "@rugradar/shared";

const svc = hederaClient(env("HEDERA_SERVICE_ACCOUNT_ID"), env("HEDERA_SERVICE_PRIVATE_KEY"), keyTypeFor("service"));
const serviceTopic = envOptional("HCS_SERVICE_TOPIC_ID") ?? (await createTopic(svc, "rugradar:x402-settlements"));
console.log(`HCS_SERVICE_TOPIC_ID=${serviceTopic}   # ${hashscanTopic(serviceTopic)}`);
svc.close();

const agentId = envOptional("HEDERA_AGENT_ACCOUNT_ID");
const agentKey = envOptional("HEDERA_AGENT_PRIVATE_KEY");
if (agentId && agentKey) {
  const ag = hederaClient(agentId, agentKey, keyTypeFor("agent"));
  const agentTopic = envOptional("HCS_AGENT_TOPIC_ID") ?? (await createTopic(ag, "rugradar:agent-spend-ledger"));
  console.log(`HCS_AGENT_TOPIC_ID=${agentTopic}   # ${hashscanTopic(agentTopic)}`);
  ag.close();
} else {
  console.log("# Agent wallet not configured; skipping HCS_AGENT_TOPIC_ID");
}
