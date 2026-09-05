/**
 * Associates the USDC HTS token with the service and agent accounts so payments can
 * settle in USDC as well as HBAR. HBAR needs no association.
 * Usage: pnpm hedera:associate-usdc
 */
import { TokenAssociateTransaction, TokenId } from "@hiero-ledger/sdk";
import { USDC_ASSET, env, envOptional, hederaClient, hederaNetwork, keyTypeFor } from "@rugradar/shared";

const token = TokenId.fromString(USDC_ASSET[hederaNetwork()]);
const targets = [
  ["service", env("HEDERA_SERVICE_ACCOUNT_ID"), env("HEDERA_SERVICE_PRIVATE_KEY")],
  ["agent", envOptional("HEDERA_AGENT_ACCOUNT_ID"), envOptional("HEDERA_AGENT_PRIVATE_KEY")],
] as const;

for (const [role, id, key] of targets) {
  if (!id || !key) continue;
  const client = hederaClient(id, key, keyTypeFor(role));
  try {
    const tx = await new TokenAssociateTransaction().setAccountId(id).setTokenIds([token]).execute(client);
    const receipt = await tx.getReceipt(client);
    console.log(`✓ ${role} ${id} associated with USDC ${token.toString()} (${receipt.status.toString()})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(msg.includes("TOKEN_ALREADY_ASSOCIATED") ? `• ${role} ${id} already associated` : `✗ ${role}: ${msg}`);
  } finally {
    client.close();
  }
}
console.log(`Fund USDC at https://faucet.circle.com (Hedera ${hederaNetwork()})`);
