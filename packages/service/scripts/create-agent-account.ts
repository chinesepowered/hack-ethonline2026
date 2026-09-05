/**
 * Creates a fresh ECDSA Hedera account for the agent, funded from the service account.
 * (x402 needs distinct payer and payee accounts.) Prints env lines to paste into .env.
 * Usage: pnpm hedera:agent-account [initialHbar=20]
 */
import { AccountCreateTransaction, Hbar, PrivateKey } from "@hiero-ledger/sdk";
import { env, envOptional, hashscanAccount, hederaClient, keyTypeFor } from "@rugradar/shared";

if (envOptional("HEDERA_AGENT_ACCOUNT_ID")) {
  console.log(`HEDERA_AGENT_ACCOUNT_ID already set (${envOptional("HEDERA_AGENT_ACCOUNT_ID")}); nothing to do.`);
  process.exit(0);
}
const initial = Number(process.argv[2] ?? 20);
const client = hederaClient(env("HEDERA_SERVICE_ACCOUNT_ID"), env("HEDERA_SERVICE_PRIVATE_KEY"), keyTypeFor("service"));
const agentKey = PrivateKey.generateECDSA();

const tx = await new AccountCreateTransaction()
  .setECDSAKeyWithAlias(agentKey)
  .setInitialBalance(new Hbar(initial))
  .setAccountMemo("rugradar agent wallet")
  .execute(client);
const receipt = await tx.getReceipt(client);
const accountId = receipt.accountId?.toString();
if (!accountId) throw new Error("no accountId in receipt");
console.log(`✓ created ${accountId} with ${initial} HBAR — ${hashscanAccount(accountId)}\n`);
console.log(`HEDERA_AGENT_ACCOUNT_ID=${accountId}`);
console.log(`HEDERA_AGENT_PRIVATE_KEY=0x${agentKey.toStringRaw()}`);
console.log(`HEDERA_AGENT_KEY_TYPE=ecdsa`);
client.close();
