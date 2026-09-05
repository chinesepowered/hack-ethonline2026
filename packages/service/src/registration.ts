/**
 * ERC-8004 (Trustless Agents) registration file for the service, served at
 * /.well-known/agent-registration.json and referenced from the ENS record
 * `erc8004.registration`. The on-chain agentId is filled in when the operator
 * registers with an Identity Registry (ERC8004_AGENT_ID / ERC8004_REGISTRY env).
 */
import { envOptional, loadEnsDeployment } from "@rugradar/shared";
import { FACILITATOR_URL, NETWORK, PAY_TO, audit } from "./x402.ts";

export function registrationFile(serviceUrl: string) {
  const ens = loadEnsDeployment();
  const serviceName = envOptional("ENS_SERVICE_NAME") ?? (ens ? `api.${ens.parentName}` : null);
  const agentId = envOptional("ERC8004_AGENT_ID");
  const registry = envOptional("ERC8004_REGISTRY");
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Rug Radar",
    description:
      "x402-metered DeFi drain and whale intelligence. Cross-protocol data from The Graph standardized subgraphs and Substreams, settled per request on Hedera via Blocky402.",
    image: `${serviceUrl}/radar.svg`,
    services: [
      { name: "x402", endpoint: `${serviceUrl}/v1`, version: "2" },
      { name: "catalog", endpoint: `${serviceUrl}/v1/catalog` },
      { name: "web", endpoint: serviceUrl },
      ...(serviceName ? [{ name: "ens", endpoint: `ens://${serviceName}` }] : []),
    ],
    x402Support: true,
    active: true,
    payment: { network: NETWORK, payTo: PAY_TO, facilitator: FACILITATOR_URL, audit: audit.topicId ? { hcsTopic: audit.topicId } : null },
    registrations: agentId && registry ? [{ agentId: Number(agentId), agentRegistry: registry }] : [],
    supportedTrust: ["reputation"],
  };
}
