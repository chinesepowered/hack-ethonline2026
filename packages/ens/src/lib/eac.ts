/**
 * Enhanced Access Control demo, reusable by the CLI (service-update.ts) and the web UI:
 * the SERVICE's own key updates the one text record it was delegated (`x402.pricing`)
 * and is refused on any other key.
 */
import { createPublicClient, createWalletClient, formatEther, http, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { RECORD_KEYS, env, loadEnsDeployment, nodeOf, permissionedResolverAbi } from "@rugradar/shared";

export interface EacStep {
  step: string;
  ok: boolean;
  detail: string;
  tx?: string;
}

export async function eacDemo(label: string, newPricing: string, onStep: (s: EacStep) => void = () => {}): Promise<EacStep[]> {
  const deployment = loadEnsDeployment();
  if (!deployment) throw new Error("No namespace yet — run pnpm ens:deploy first");
  const transport = http(env("SEPOLIA_RPC_URL", "https://ethereum-sepolia-rpc.publicnode.com"));
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const service = privateKeyToAccount(env("ENS_SERVICE_EVM_PRIVATE_KEY") as Hex);
  const serviceWallet = createWalletClient({ account: service, chain: sepolia, transport });
  const name = `${label}.${deployment.parentName}`;
  const node = nodeOf(name);
  const steps: EacStep[] = [];
  const push = (s: EacStep) => {
    steps.push(s);
    onStep(s);
  };

  // Gas for the service key (Sepolia ETH) — top up from the admin if empty.
  const bal = await publicClient.getBalance({ address: service.address });
  if (bal < parseEther("0.002")) {
    const adminAccount = privateKeyToAccount(env("ENS_DEPLOYER_PRIVATE_KEY") as Hex);
    const admin = createWalletClient({ account: adminAccount, chain: sepolia, transport });
    const hash = await admin.sendTransaction({ to: service.address, value: parseEther("0.01") });
    await publicClient.waitForTransactionReceipt({ hash });
    push({ step: "fund service key", ok: true, detail: `${service.address} topped up with 0.01 Sepolia ETH`, tx: hash });
  }
  push({ step: "service key", ok: true, detail: `${service.address} · ${formatEther(await publicClient.getBalance({ address: service.address })).slice(0, 6)} ETH · acting on ${name}` });

  // 1. allowed: the delegated key
  const hash = await serviceWallet.writeContract({
    address: deployment.resolver,
    abi: permissionedResolverAbi,
    functionName: "setText",
    args: [node, RECORD_KEYS.x402Pricing, newPricing],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const now = await publicClient.readContract({ address: deployment.resolver, abi: permissionedResolverAbi, functionName: "text", args: [node, RECORD_KEYS.x402Pricing] });
  push({ step: `setText ${RECORD_KEYS.x402Pricing}`, ok: receipt.status === "success", detail: `ALLOWED (delegated key) → "${now}"`, tx: hash });

  // 2. denied: any other key on the same name
  try {
    await publicClient.simulateContract({
      account: service,
      address: deployment.resolver,
      abi: permissionedResolverAbi,
      functionName: "setText",
      args: [node, RECORD_KEYS.agentContext, "hijacked"],
    });
    push({ step: `setText ${RECORD_KEYS.agentContext}`, ok: false, detail: "unexpected: service key could edit agent-context" });
  } catch (err) {
    push({ step: `setText ${RECORD_KEYS.agentContext}`, ok: true, detail: `REFUSED by Enhanced Access Control: ${(err as Error).message.split("\n")[0].slice(0, 110)}` });
  }
  return steps;
}
