import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { env } from "@rugradar/shared";

export const rpc = () => http(env("SEPOLIA_RPC_URL", "https://ethereum-sepolia-rpc.publicnode.com"));
export const publicClient = createPublicClient({ chain: sepolia, transport: rpc() });

export function admin() {
  const account = privateKeyToAccount(env("ENS_DEPLOYER_PRIVATE_KEY") as Hex);
  const wallet = createWalletClient({ account, chain: sepolia, transport: rpc() });
  return { account, wallet };
}

export async function sendAndWait(label: string, hashPromise: Promise<Hex>) {
  const hash = await hashPromise;
  process.stdout.write(`  ${label}… ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted (${hash})`);
  console.log(`  ✓ block ${receipt.blockNumber}`);
  return receipt;
}

export const etherscan = (addr: string) => `https://sepolia.etherscan.io/address/${addr}`;
