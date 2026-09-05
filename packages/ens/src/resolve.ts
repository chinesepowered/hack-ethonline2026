/**
 * Resolve a name the way any ENSv2-aware app would: through the Universal Resolver,
 * which walks root → eth → <parent> → <label> across registries. Also shows the raw
 * registry hierarchy for the judges.
 * Usage: pnpm ens:resolve api.rugradar.eth
 */
import { normalize } from "viem/ens";
import { ENSV2_SEPOLIA, SERVICE_RECORD_KEYS, ethRegistryAbi, labelId, loadEnsDeployment, userRegistryAbi } from "@rugradar/shared";
import { publicClient } from "./clients.ts";

const name = process.argv[2];
if (!name) throw new Error("usage: pnpm ens:resolve <name.eth>");
const labels = name.split(".");
const deployment = loadEnsDeployment();

console.log(`\nUniversal Resolver (${ENSV2_SEPOLIA.universalResolver}) → ${name}`);
const addr = await publicClient.getEnsAddress({ name: normalize(name), universalResolverAddress: ENSV2_SEPOLIA.universalResolver }).catch(() => null);
console.log(`  addr: ${addr ?? "(none)"}`);
for (const key of SERVICE_RECORD_KEYS) {
  const v = await publicClient.getEnsText({ name: normalize(name), key, universalResolverAddress: ENSV2_SEPOLIA.universalResolver }).catch(() => null);
  if (v) console.log(`  ${key.padEnd(24)} ${v}`);
}

if (labels.length === 3 && labels[2] === "eth") {
  const [label, parent] = labels;
  console.log(`\nRegistry hierarchy:`);
  const sub = await publicClient.readContract({ address: ENSV2_SEPOLIA.ethRegistry, abi: ethRegistryAbi, functionName: "getSubregistry", args: [parent] });
  console.log(`  ETHRegistry.getSubregistry("${parent}") = ${sub}`);
  if (sub !== "0x0000000000000000000000000000000000000000") {
    const resolver = await publicClient.readContract({ address: sub, abi: userRegistryAbi, functionName: "getResolver", args: [label] });
    const expiry = await publicClient.readContract({ address: sub, abi: userRegistryAbi, functionName: "getExpiry", args: [labelId(label)] });
    const owner = await publicClient.readContract({ address: sub, abi: userRegistryAbi, functionName: "getOwner", args: [labelId(label)] });
    console.log(`  UserRegistry.getResolver("${label}") = ${resolver}`);
    console.log(`  owner ${owner} · expires ${new Date(Number(expiry) * 1000).toISOString()}`);
    if (deployment) {
      const transferable = await publicClient.readContract({
        address: sub,
        abi: userRegistryAbi,
        functionName: "hasRoles",
        args: [labelId(label), (1n << 28n) << 128n, owner],
      });
      console.log(`  transferable by owner: ${transferable} (ROLE_CAN_TRANSFER_ADMIN)`);
    }
  }
}
