/**
 * Enhanced Access Control in action: the SERVICE's own key (not the namespace admin)
 * updates the one text record it was delegated — `x402.pricing` — and is refused on any other key.
 *
 * Usage: pnpm ens:service-update api "whales 0.02+0.005/protocol; ..."   (env: ENS_SERVICE_EVM_PRIVATE_KEY)
 */
import { createWalletClient, formatEther, http, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { RECORD_KEYS, env, loadEnsDeployment, nodeOf, permissionedResolverAbi } from "@rugradar/shared";
import { admin, publicClient, rpc, sendAndWait } from "./clients.ts";

const label = process.argv[2];
const value = process.argv[3];
if (!label || !value) throw new Error('usage: pnpm ens:service-update <label> "<new x402.pricing value>"');
const deployment = loadEnsDeployment();
if (!deployment) throw new Error("No namespace yet — run pnpm ens:deploy first");

const service = privateKeyToAccount(env("ENS_SERVICE_EVM_PRIVATE_KEY") as Hex);
const serviceWallet = createWalletClient({ account: service, chain: sepolia, transport: rpc() });
const name = `${label}.${deployment.parentName}`;
const node = nodeOf(name);

// Gas for the service key (Sepolia ETH) — top up from the admin if empty.
const bal = await publicClient.getBalance({ address: service.address });
if (bal < parseEther("0.002")) {
  const { wallet } = admin();
  await sendAndWait(`fund service key ${service.address} with 0.01 ETH`, wallet.sendTransaction({ to: service.address, value: parseEther("0.01") }));
}
console.log(`\nService key ${service.address} (${formatEther(await publicClient.getBalance({ address: service.address }))} ETH) on ${name}\n`);

// 1. allowed: the delegated key
await sendAndWait(
  `service sets ${RECORD_KEYS.x402Pricing}`,
  serviceWallet.writeContract({ address: deployment.resolver, abi: permissionedResolverAbi, functionName: "setText", args: [node, RECORD_KEYS.x402Pricing, value] }),
);
console.log(`  now: ${await publicClient.readContract({ address: deployment.resolver, abi: permissionedResolverAbi, functionName: "text", args: [node, RECORD_KEYS.x402Pricing] })}`);

// 2. denied: any other key on the same name
try {
  await publicClient.simulateContract({
    account: service,
    address: deployment.resolver,
    abi: permissionedResolverAbi,
    functionName: "setText",
    args: [node, RECORD_KEYS.agentContext, "hijacked"],
  });
  console.log("  ✗ unexpected: service key could edit agent-context");
} catch (err) {
  console.log(`  ✓ service key REFUSED on ${RECORD_KEYS.agentContext}: ${(err as Error).message.split("\n")[0].slice(0, 120)}`);
}
