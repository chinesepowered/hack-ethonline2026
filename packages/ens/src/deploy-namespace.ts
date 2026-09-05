/**
 * One-shot ENSv2 (Sepolia beta) namespace bootstrap:
 *   1. deploy our own PermissionedRegistry (UserRegistry proxy) via the VerifiableFactory
 *   2. deploy our own PermissionedResolver proxy (per-record EAC, aliasing)
 *   3. register <label>.eth on the ENSv2 ETH Registrar (MockUSDC, commit → wait → reveal),
 *      pointing the name's subregistry at (1) and resolver at (2)
 *   4. write ens.deployment.json so the service and agent can find the namespace
 *
 * Usage: pnpm ens:deploy   (env: ENS_DEPLOYER_PRIVATE_KEY, ENS_PARENT_LABEL, SEPOLIA_RPC_URL)
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { encodeFunctionData, keccak256, parseEventLogs, stringToBytes, toHex, zeroAddress, zeroHash, type Address, type Hex } from "viem";
import {
  ENSV2_SEPOLIA,
  REGISTRY_ADMIN_BITMAP,
  RESOLVER_ADMIN_BITMAP,
  REPO_ROOT,
  env,
  envOptional,
  ethRegistrarAbi,
  ethRegistryAbi,
  labelId,
  loadEnsDeployment,
  mockUsdcAbi,
  permissionedResolverAbi,
  userRegistryAbi,
  verifiableFactoryAbi,
} from "@rugradar/shared";
import { admin, etherscan, publicClient, sendAndWait } from "./clients.ts";

const label = env("ENS_PARENT_LABEL", "rugradar");
const { account, wallet } = admin();
const existing = loadEnsDeployment();

console.log(`\nENSv2 Sepolia namespace bootstrap for ${label}.eth as ${account.address}\n`);

async function deployProxy(name: string, implementation: Address, initData: Hex): Promise<{ address: Address; block: bigint }> {
  const salt = BigInt(keccak256(stringToBytes(`${name}:${label}:${Date.now()}`)));
  const receipt = await sendAndWait(
    `deploy ${name} proxy`,
    wallet.writeContract({ address: ENSV2_SEPOLIA.verifiableFactory, abi: verifiableFactoryAbi, functionName: "deployProxy", args: [implementation, salt, initData] }),
  );
  const [log] = parseEventLogs({ abi: verifiableFactoryAbi, eventName: "ProxyDeployed", logs: receipt.logs });
  if (!log) throw new Error("ProxyDeployed event missing");
  console.log(`    ${name}: ${log.args.proxyAddress}  ${etherscan(log.args.proxyAddress)}`);
  return { address: log.args.proxyAddress, block: receipt.blockNumber };
}

// 1 + 2: our registry and resolver (reused if already deployed and env/ file agree)
let userRegistry = existing?.userRegistry as Address | undefined;
let resolver = existing?.resolver as Address | undefined;
let deployBlock = existing?.deployBlock ?? 0;

if (!userRegistry) {
  const r = await deployProxy(
    "UserRegistry",
    ENSV2_SEPOLIA.userRegistryImpl,
    encodeFunctionData({ abi: userRegistryAbi, functionName: "initialize", args: [account.address, REGISTRY_ADMIN_BITMAP] }),
  );
  userRegistry = r.address;
  deployBlock = Number(r.block);
} else console.log(`  reuse UserRegistry ${userRegistry}`);

if (!resolver) {
  const r = await deployProxy(
    "PermissionedResolver",
    ENSV2_SEPOLIA.permissionedResolverImpl,
    encodeFunctionData({ abi: permissionedResolverAbi, functionName: "initialize", args: [account.address, RESOLVER_ADMIN_BITMAP, []] }),
  );
  resolver = r.address;
} else console.log(`  reuse PermissionedResolver ${resolver}`);

// 3: register <label>.eth on ENSv2's ETH Registrar
const owner = await publicClient.readContract({ address: ENSV2_SEPOLIA.ethRegistry, abi: ethRegistryAbi, functionName: "getOwner", args: [labelId(label)] });
if (owner.toLowerCase() === account.address.toLowerCase()) {
  console.log(`  ${label}.eth already owned by admin; ensuring subregistry/resolver pointers`);
  const currentSub = await publicClient.readContract({ address: ENSV2_SEPOLIA.ethRegistry, abi: ethRegistryAbi, functionName: "getSubregistry", args: [label] });
  if (currentSub.toLowerCase() !== userRegistry.toLowerCase()) {
    await sendAndWait("setSubregistry", wallet.writeContract({ address: ENSV2_SEPOLIA.ethRegistry, abi: ethRegistryAbi, functionName: "setSubregistry", args: [labelId(label), userRegistry] }));
  }
  const currentRes = await publicClient.readContract({ address: ENSV2_SEPOLIA.ethRegistry, abi: ethRegistryAbi, functionName: "getResolver", args: [label] });
  if (currentRes.toLowerCase() !== resolver.toLowerCase()) {
    await sendAndWait("setResolver", wallet.writeContract({ address: ENSV2_SEPOLIA.ethRegistry, abi: ethRegistryAbi, functionName: "setResolver", args: [labelId(label), resolver] }));
  }
} else {
  const available = await publicClient.readContract({ address: ENSV2_SEPOLIA.ethRegistrar, abi: ethRegistrarAbi, functionName: "isAvailable", args: [label] });
  if (!available) throw new Error(`${label}.eth is taken by ${owner}; pick another ENS_PARENT_LABEL`);

  const duration = BigInt(365 * 24 * 3600);
  const [base, premium] = await publicClient.readContract({
    address: ENSV2_SEPOLIA.ethRegistrar,
    abi: ethRegistrarAbi,
    functionName: "getRegisterPrice",
    args: [label, duration, ENSV2_SEPOLIA.mockUsdc],
  });
  const price = base + premium;
  console.log(`  price for 1y: ${Number(price) / 1e6} MockUSDC`);

  const balance = await publicClient.readContract({ address: ENSV2_SEPOLIA.mockUsdc, abi: mockUsdcAbi, functionName: "balanceOf", args: [account.address] });
  if (balance < price) {
    await sendAndWait("mint MockUSDC", wallet.writeContract({ address: ENSV2_SEPOLIA.mockUsdc, abi: mockUsdcAbi, functionName: "mint", args: [account.address, price * 2n] }));
  }
  await sendAndWait("approve registrar", wallet.writeContract({ address: ENSV2_SEPOLIA.mockUsdc, abi: mockUsdcAbi, functionName: "approve", args: [ENSV2_SEPOLIA.ethRegistrar, price] }));

  const secret = (envOptional("ENS_COMMIT_SECRET") as Hex | undefined) ?? keccak256(toHex(`${label}:${account.address}:${Date.now()}`));
  const commitment = await publicClient.readContract({
    address: ENSV2_SEPOLIA.ethRegistrar,
    abi: ethRegistrarAbi,
    functionName: "makeCommitment",
    args: [label, account.address, secret, userRegistry, resolver, duration, zeroHash],
  });
  const committedAt = await publicClient.readContract({ address: ENSV2_SEPOLIA.ethRegistrar, abi: ethRegistrarAbi, functionName: "commitmentAt", args: [commitment] });
  if (committedAt === 0n) {
    await sendAndWait("commit", wallet.writeContract({ address: ENSV2_SEPOLIA.ethRegistrar, abi: ethRegistrarAbi, functionName: "commit", args: [commitment] }));
  }
  const minAge = await publicClient.readContract({ address: ENSV2_SEPOLIA.ethRegistrar, abi: ethRegistrarAbi, functionName: "MIN_COMMITMENT_AGE" });
  const waitSec = Number(minAge) + 5;
  console.log(`  waiting ${waitSec}s for MIN_COMMITMENT_AGE (${minAge}s)…`);
  await new Promise((r) => setTimeout(r, waitSec * 1000));

  await sendAndWait(
    `register ${label}.eth`,
    wallet.writeContract({
      address: ENSV2_SEPOLIA.ethRegistrar,
      abi: ethRegistrarAbi,
      functionName: "register",
      args: [label, account.address, secret, userRegistry, resolver, duration, ENSV2_SEPOLIA.mockUsdc, zeroHash],
    }),
  );
}

// Link our registry back to its parent (lets tooling walk up the hierarchy).
try {
  await sendAndWait("setParent on UserRegistry", wallet.writeContract({ address: userRegistry, abi: userRegistryAbi, functionName: "setParent", args: [ENSV2_SEPOLIA.ethRegistry, label] }));
} catch (err) {
  console.log(`  (setParent skipped: ${err instanceof Error ? err.message.split("\n")[0] : err})`);
}

// 4: persist
const out = {
  parentLabel: label,
  parentName: `${label}.eth`,
  userRegistry,
  resolver,
  deployBlock,
  admin: account.address,
  chainId: ENSV2_SEPOLIA.chainId,
  ethRegistry: ENSV2_SEPOLIA.ethRegistry,
  universalResolver: ENSV2_SEPOLIA.universalResolver,
  deployedAt: new Date().toISOString(),
};
writeFileSync(resolve(REPO_ROOT, "ens.deployment.json"), JSON.stringify(out, null, 2));
console.log(`\n✓ wrote ens.deployment.json\n${JSON.stringify(out, null, 2)}`);
console.log(`\nNext: pnpm ens:register api --url ${envOptional("SERVICE_URL") ?? "http://localhost:4021"}`);
void zeroAddress;
