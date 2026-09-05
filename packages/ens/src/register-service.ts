/**
 * Register (or update) a service subname under the namespace and publish its
 * x402 records, then delegate per-key edit rights to the service's own key.
 *
 * Usage:
 *   pnpm ens:register api --url https://radar.example.com --service-key 0x<evm key or address> [--days 30]
 *   pnpm ens:register scout --agent --hedera 0.0.1234 --hcs 0.0.5678      (an agent identity, no endpoint)
 *
 * ENSv2 features exercised: our own PermissionedRegistry (subnames), expiring +
 * non-transferable subnames (no ROLE_CAN_TRANSFER_ADMIN), PermissionedResolver text/addr
 * records, and Enhanced Access Control delegation of exactly one text key.
 */
import { privateKeyToAddress } from "viem/accounts";
import { isAddress, type Address, type Hex } from "viem";
import { publicClient as _pc } from "./clients.ts";
import {
  RECORD_KEYS,
  SERVICE_SUBNAME_BITMAP,
  dnsName,
  envOptional,
  labelId,
  loadEnsDeployment,
  nodeOf,
  permissionedResolverAbi,
  userRegistryAbi,
} from "@rugradar/shared";
import { admin, sendAndWait } from "./clients.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const label = process.argv[2];
if (!label || label.startsWith("--")) throw new Error("usage: pnpm ens:register <label> --url <serviceUrl> [--service-key 0x..] [--days 30]");
const deployment = loadEnsDeployment();
if (!deployment) throw new Error("No namespace yet — run pnpm ens:deploy first");

const { account, wallet } = admin();
const name = `${label}.${deployment.parentName}`;
const node = nodeOf(name);
const days = Number(arg("days") ?? 30);
const isAgent = flag("agent");
const url = (arg("url") ?? envOptional("SERVICE_URL") ?? "http://localhost:4021").replace(/\/$/, "");

// The service's EVM identity for ENS (record ownership + EAC delegation). An ED25519 Hedera key
// is not a secp256k1 key, so prefer a dedicated ENS_SERVICE_EVM_PRIVATE_KEY.
const rawKey =
  arg("service-key") ??
  envOptional("ENS_SERVICE_EVM_PRIVATE_KEY") ??
  ((envOptional("HEDERA_SERVICE_KEY_TYPE") ?? "ecdsa") === "ecdsa" ? envOptional("HEDERA_SERVICE_PRIVATE_KEY") : undefined);
const serviceAddress: Address | undefined = rawKey ? (isAddress(rawKey) ? (rawKey as Address) : privateKeyToAddress(rawKey as Hex)) : undefined;
const network = `hedera:${envOptional("HEDERA_NETWORK") ?? "testnet"}`;
const payTo = envOptional("HEDERA_SERVICE_ACCOUNT_ID") ?? "";
const hcs = arg("hcs") ?? envOptional(isAgent ? "HCS_AGENT_TOPIC_ID" : "HCS_SERVICE_TOPIC_ID") ?? "";

console.log(`\nRegistering ${name} on ENSv2 Sepolia (${isAgent ? "agent identity" : "x402 service"})\n`);

// 1. subname in OUR registry: expiring (days) and non-transferable (no transfer admin role)
const status = await _pc.readContract({ address: deployment.userRegistry, abi: userRegistryAbi, functionName: "getStatus", args: [labelId(label)] });
const expiry = BigInt(Math.floor(Date.now() / 1000) + days * 86_400);
if (status === 0) {
  await sendAndWait(
    `register ${name} (expires in ${days}d, non-transferable)`,
    wallet.writeContract({
      address: deployment.userRegistry,
      abi: userRegistryAbi,
      functionName: "register",
      args: [label, serviceAddress ?? account.address, "0x0000000000000000000000000000000000000000", deployment.resolver, SERVICE_SUBNAME_BITMAP, expiry],
    }),
  );
} else {
  console.log(`  ${name} already registered; renewing to +${days}d and updating records`);
  try {
    await sendAndWait("renew", wallet.writeContract({ address: deployment.userRegistry, abi: userRegistryAbi, functionName: "renew", args: [labelId(label), expiry] }));
  } catch (err) {
    console.log(`  (renew skipped: ${err instanceof Error ? err.message.split("\n")[0] : err})`);
  }
}

// 2. records on OUR PermissionedResolver
const records: Record<string, string> = isAgent
  ? {
      [RECORD_KEYS.agentContext]: `Rug Radar scout agent. Autonomous DeFi risk analyst that pays for data with x402 on ${network}. Spend ledger on HCS topic ${hcs || "n/a"}.`,
      [RECORD_KEYS.hederaAccount]: arg("hedera") ?? envOptional("HEDERA_AGENT_ACCOUNT_ID") ?? "",
      [RECORD_KEYS.hcsAudit]: hcs,
    }
  : {
      [RECORD_KEYS.agentContext]: `Rug Radar: x402-metered DeFi drain & whale intelligence (The Graph standardized subgraphs + Substreams). Pay per call in HBAR or USDC on ${network}. Catalog: ${url}/v1/catalog`,
      [RECORD_KEYS.endpointX402]: `${url}/v1`,
      [RECORD_KEYS.endpointWeb]: url,
      [RECORD_KEYS.x402Network]: network,
      [RECORD_KEYS.x402PayTo]: payTo,
      [RECORD_KEYS.x402Assets]: "HBAR,USDC",
      [RECORD_KEYS.x402Catalog]: `${url}/v1/catalog`,
      [RECORD_KEYS.x402Pricing]: "whales 0.01+0.005/protocol; pool-risk 0.03+0.01/day; protocol-health 0.02; stream 0.02/15s (HBAR)",
      [RECORD_KEYS.hcsAudit]: hcs,
      [RECORD_KEYS.hederaAccount]: payTo,
      [RECORD_KEYS.erc8004Registration]: `${url}/.well-known/agent-registration.json`,
    };

for (const [key, value] of Object.entries(records)) {
  if (!value) continue;
  const current = await _pc.readContract({ address: deployment.resolver, abi: permissionedResolverAbi, functionName: "text", args: [node, key] });
  if (current === value) {
    console.log(`  = ${key} unchanged`);
    continue;
  }
  await sendAndWait(`setText ${key}`, wallet.writeContract({ address: deployment.resolver, abi: permissionedResolverAbi, functionName: "setText", args: [node, key, value] }));
}
if (serviceAddress) {
  const currentAddr = await _pc.readContract({ address: deployment.resolver, abi: permissionedResolverAbi, functionName: "addr", args: [node] });
  if (currentAddr.toLowerCase() !== serviceAddress.toLowerCase()) {
    await sendAndWait(`setAddr → ${serviceAddress}`, wallet.writeContract({ address: deployment.resolver, abi: permissionedResolverAbi, functionName: "setAddr", args: [node, serviceAddress] }));
  }
}

// 3. Enhanced Access Control: the service key may edit ONLY its pricing record (and nothing else).
if (serviceAddress && !isAgent) {
  const already = await _pc.readContract({
    address: deployment.resolver,
    abi: permissionedResolverAbi,
    functionName: "hasRootRoles",
    args: [1n << 4n, serviceAddress],
  });
  if (already) console.log("  service key already holds root text role (unexpected)");
  await sendAndWait(
    `authorizeTextRoles(${name}, "${RECORD_KEYS.x402Pricing}") → ${serviceAddress}`,
    wallet.writeContract({
      address: deployment.resolver,
      abi: permissionedResolverAbi,
      functionName: "authorizeTextRoles",
      args: [dnsName(name), RECORD_KEYS.x402Pricing, serviceAddress, true],
    }),
  );
}

console.log(`\n✓ ${name} is live. Verify with: pnpm ens:resolve ${name}`);
console.log(`  Explorer: https://sepolia.app.ens.domains/${name}`);
