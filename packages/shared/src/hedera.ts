import {
  AccountId,
  Client,
  PrivateKey,
  TopicCreateTransaction,
  TopicId,
  TopicMessageSubmitTransaction,
} from "@hiero-ledger/sdk";
import { env, envOptional } from "./env.ts";

export type HederaNetwork = "testnet" | "mainnet";

export function hederaNetwork(): HederaNetwork {
  return env("HEDERA_NETWORK", "testnet") === "mainnet" ? "mainnet" : "testnet";
}

export const caip2 = (n: HederaNetwork = hederaNetwork()) => `hedera:${n}` as const;

export type HederaKeyType = "ecdsa" | "ed25519";

/** Parse a raw or DER hex private key of the given curve (Hedera portal issues both kinds). */
export function parsePrivateKey(privateKey: string, keyType: HederaKeyType = "ecdsa"): PrivateKey {
  return keyType === "ed25519" ? PrivateKey.fromStringED25519(privateKey) : PrivateKey.fromStringECDSA(privateKey);
}

export function keyTypeFor(role: "service" | "agent"): HederaKeyType {
  const v = (envOptional(role === "service" ? "HEDERA_SERVICE_KEY_TYPE" : "HEDERA_AGENT_KEY_TYPE") ?? "ecdsa").toLowerCase();
  return v === "ed25519" ? "ed25519" : "ecdsa";
}

export function hederaClient(accountId: string, privateKey: string, keyType: HederaKeyType = "ecdsa"): Client {
  const client = hederaNetwork() === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(AccountId.fromString(accountId), parsePrivateKey(privateKey, keyType));
  return client;
}

/** HashScan accepts the SDK transaction id format `0.0.X@sec.nanos` as-is. */
export function hashscanTx(txId: string, n: HederaNetwork = hederaNetwork()): string {
  return `https://hashscan.io/${n}/transaction/${encodeURIComponent(txId)}`;
}

export const hashscanTopic = (topicId: string, n: HederaNetwork = hederaNetwork()) => `https://hashscan.io/${n}/topic/${topicId}`;
export const hashscanAccount = (id: string, n: HederaNetwork = hederaNetwork()) => `https://hashscan.io/${n}/account/${id}`;

export async function createTopic(client: Client, memo: string): Promise<string> {
  const tx = await new TopicCreateTransaction().setTopicMemo(memo).execute(client);
  const receipt = await tx.getReceipt(client);
  if (!receipt.topicId) throw new Error("Topic creation returned no topicId");
  return receipt.topicId.toString();
}

export interface AuditRecord {
  v: 1;
  kind: "x402.settled" | "x402.paid" | "agent.decision";
  at: string;
  [k: string]: unknown;
}

/** Append a JSON record to an HCS topic; returns the consensus transaction id. */
export async function submitAudit(client: Client, topicId: string, record: AuditRecord): Promise<string> {
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(topicId))
    .setMessage(JSON.stringify(record))
    .execute(client);
  await tx.getReceipt(client);
  return tx.transactionId?.toString() ?? "";
}

/** Fire-and-forget audit that never breaks the request path. */
export function auditLogger(role: "service" | "agent") {
  const topic = envOptional(role === "service" ? "HCS_SERVICE_TOPIC_ID" : "HCS_AGENT_TOPIC_ID");
  const accountId = envOptional(role === "service" ? "HEDERA_SERVICE_ACCOUNT_ID" : "HEDERA_AGENT_ACCOUNT_ID");
  const key = envOptional(role === "service" ? "HEDERA_SERVICE_PRIVATE_KEY" : "HEDERA_AGENT_PRIVATE_KEY");
  if (!topic || !accountId || !key) {
    return {
      enabled: false as const,
      topicId: null,
      log: async (_r: AuditRecord): Promise<string | null> => null,
    };
  }
  const client = hederaClient(accountId, key, keyTypeFor(role));
  return {
    enabled: true as const,
    topicId: topic,
    log: async (r: AuditRecord): Promise<string | null> => {
      try {
        return await submitAudit(client, topic, r);
      } catch (err) {
        console.warn(`[hcs:${role}] audit submit failed:`, err instanceof Error ? err.message : err);
        return null;
      }
    },
  };
}

export const HBAR_ASSET = "0.0.0";
export const USDC_ASSET: Record<HederaNetwork, string> = { testnet: "0.0.429274", mainnet: "0.0.456858" };
export const TINYBAR = 100_000_000n;
export const hbarToTinybar = (hbar: number) => BigInt(Math.round(hbar * 1e8)).toString();
export const tinybarToHbar = (tiny: bigint | string | number) => Number(tiny) / 1e8;
