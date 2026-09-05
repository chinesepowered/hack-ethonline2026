/** List every subname ever registered in our namespace registry (LabelRegistered events). */
import { parseAbiItem } from "viem";
import { labelId, loadEnsDeployment, userRegistryAbi } from "@rugradar/shared";
import { publicClient } from "./clients.ts";

const deployment = loadEnsDeployment();
if (!deployment) throw new Error("No namespace yet — run pnpm ens:deploy first");

const logs = await publicClient.getLogs({
  address: deployment.userRegistry,
  event: parseAbiItem(
    "event LabelRegistered(uint256 indexed tokenId, bytes32 indexed labelHash, string label, address owner, uint64 expiry, address indexed sender)",
  ),
  fromBlock: BigInt(deployment.deployBlock || 0),
  toBlock: "latest",
});
console.log(`\n${deployment.parentName} namespace (${deployment.userRegistry}): ${logs.length} registration(s)\n`);
for (const log of logs) {
  const label = log.args.label!;
  const status = await publicClient.readContract({ address: deployment.userRegistry, abi: userRegistryAbi, functionName: "getStatus", args: [labelId(label)] });
  const expiry = await publicClient.readContract({ address: deployment.userRegistry, abi: userRegistryAbi, functionName: "getExpiry", args: [labelId(label)] });
  const state = status === 2 ? "registered" : status === 1 ? "reserved" : "available (revoked/expired)";
  console.log(`  ${label}.${deployment.parentName}`.padEnd(36) + ` ${state}  expires ${new Date(Number(expiry) * 1000).toISOString()}  owner ${log.args.owner}`);
}
