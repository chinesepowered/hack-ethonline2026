/**
 * Service discovery through ENSv2 on Sepolia.
 * The agent walks the namespace registry (LabelRegistered events on the parent's
 * UserRegistry) and resolves each subname's text records through the Universal
 * Resolver. Nothing about the paid API is hard-coded in the agent: URL, network,
 * payTo, pricing and the catalog link all come from ENS records.
 */
import { createPublicClient, http, parseAbiItem } from "viem";
import { normalize } from "viem/ens";
import { sepolia } from "viem/chains";
import { ENSV2_SEPOLIA, RECORD_KEYS, SERVICE_RECORD_KEYS, env, envOptional, loadEnsDeployment } from "@rugradar/shared";

export interface DiscoveredService {
  name: string;
  records: Record<string, string>;
  endpoint: string | null;
  catalog: string | null;
  network: string | null;
  payTo: string | null;
  expiry: number | null;
}

export function sepoliaClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http(env("SEPOLIA_RPC_URL", "https://ethereum-sepolia-rpc.publicnode.com"), { retryCount: 3, retryDelay: 400, timeout: 20_000 }),
    batch: { multicall: false },
  });
}

/** Public RPCs rate-limit bursts; resolve a few keys at a time and retry each once. */
export async function resolveRecords(name: string, keys: string[] = SERVICE_RECORD_KEYS, concurrency = 3): Promise<Record<string, string>> {
  const client = sepoliaClient();
  const records: Record<string, string> = {};
  const queue = [...keys];
  const one = async (key: string, attempt = 1): Promise<void> => {
    try {
      const v = await client.getEnsText({ name: normalize(name), key, universalResolverAddress: ENSV2_SEPOLIA.universalResolver });
      if (v) records[key] = v;
    } catch {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 300 * attempt));
        return one(key, attempt + 1);
      }
    }
  };
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) await one(queue.shift()!);
  });
  await Promise.all(workers);
  return records;
}

export async function discoverServices(): Promise<DiscoveredService[]> {
  const deployment = loadEnsDeployment();
  const names = new Set<string>();
  const pinned = envOptional("ENS_SERVICE_NAME");
  if (pinned) names.add(pinned);

  if (deployment) {
    const client = sepoliaClient();
    try {
      const logs = await client.getLogs({
        address: deployment.userRegistry,
        event: parseAbiItem(
          "event LabelRegistered(uint256 indexed tokenId, bytes32 indexed labelHash, string label, address owner, uint64 expiry, address indexed sender)",
        ),
        fromBlock: BigInt(deployment.deployBlock || 0),
        toBlock: "latest",
      });
      for (const log of logs) {
        if (log.args.label) names.add(`${log.args.label}.${deployment.parentName}`);
      }
    } catch (err) {
      console.warn("[ens] registry log scan failed, using pinned name only:", err instanceof Error ? err.message.split("\n")[0] : err);
    }
  }

  const out: DiscoveredService[] = [];
  for (const name of names) {
    const records = await resolveRecords(name);
    if (!records[RECORD_KEYS.endpointX402]) continue; // not an x402 service (e.g. the agent's own name)
    out.push({
      name,
      records,
      endpoint: records[RECORD_KEYS.endpointX402] ?? null,
      catalog: records[RECORD_KEYS.x402Catalog] ?? null,
      network: records[RECORD_KEYS.x402Network] ?? null,
      payTo: records[RECORD_KEYS.x402PayTo] ?? null,
      expiry: null,
    });
  }
  return out;
}
