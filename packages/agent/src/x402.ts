/**
 * Paying fetch for the agent: wraps fetch with x402 (Hedera exact scheme),
 * enforces a hard HBAR budget *before* signing, and records every settled
 * payment (from the PAYMENT-RESPONSE header) to the agent's HCS spend ledger.
 */
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { PrivateKey, createClientHederaSigner } from "@x402/hedera";
import { HBAR_ASSET, auditLogger, caip2, env, hashscanTx, hbarToTinybar, tinybarToHbar } from "@rugradar/shared";

export interface Payment {
  at: string;
  url: string;
  asset: string;
  amount: string;
  hbar: number;
  payer: string | null;
  settlementTx: string;
  hashscan: string;
  auditTx: string | null;
}

export class BudgetExceeded extends Error {}

/** Human-readable reason for a 402 that survived a payment attempt (e.g. facilitator rejected the signature). */
export function describe402(res: Response): string {
  const header = res.headers.get("PAYMENT-REQUIRED");
  if (!header) return "402 without PAYMENT-REQUIRED header";
  try {
    const pr = decodePaymentRequiredHeader(header) as { error?: string; accepts?: Array<{ amount?: string; asset?: string; network?: string }> };
    const quote = pr.accepts?.map((a) => `${a.amount} of ${a.asset} on ${a.network}`).join(" | ");
    return `${pr.error ?? "payment required"}${quote ? ` (quote: ${quote})` : ""}`;
  } catch {
    return "402 with undecodable PAYMENT-REQUIRED header";
  }
}

type PaymentRequired402 = { accepts?: Array<{ asset?: string; amount?: string; network?: string }> };

export function createPayingFetch() {
  const accountId = env("HEDERA_AGENT_ACCOUNT_ID");
  const key = PrivateKey.fromStringECDSA(env("HEDERA_AGENT_PRIVATE_KEY"));
  const network = caip2();
  const signer = createClientHederaSigner(accountId, key, { network });

  // Prefer HBAR when a resource accepts several assets; our own budget guard below
  // replaces the SDK's generic spend controls (which do not know HBAR decimals).
  const client = x402Client.fromConfig({
    schemes: [{ network, client: new ExactHederaScheme(signer) }],
    policies: [
      (_version, requirements) => {
        const hbar = requirements.filter((r) => r.network === network && r.asset === HBAR_ASSET);
        return hbar.length ? hbar : requirements;
      },
    ],
    spendControls: false,
  });

  const budgetTinybar = BigInt(hbarToTinybar(Number(env("AGENT_BUDGET_HBAR", "1"))));
  let spentTinybar = 0n;
  let lastQuote = 0n;
  const payments: Payment[] = [];
  const audit = auditLogger("agent");

  const quoteFor = (body: PaymentRequired402): bigint => {
    const opt = body.accepts?.find((a) => a.network === network && a.asset === HBAR_ASSET) ?? body.accepts?.[0];
    return opt?.amount ? BigInt(opt.amount) : 0n;
  };

  const hasPaymentHeader = (input: RequestInfo | URL, init?: RequestInit): boolean => {
    const h = input instanceof Request ? input.headers : init?.headers ? new Headers(init.headers) : undefined;
    return !!h && (h.has("PAYMENT-SIGNATURE") || h.has("X-PAYMENT"));
  };

  // Inner fetch: see the 402 first, enforce budget, then let x402 retry with a signed payment.
  const guardedFetch: typeof fetch = async (input, init) => {
    const res = await globalThis.fetch(input, init);
    if (res.status === 402 && !hasPaymentHeader(input, init)) {
      // x402 v2 puts the quote in the PAYMENT-REQUIRED header (v1 used the JSON body).
      const header = res.headers.get("PAYMENT-REQUIRED");
      const body: PaymentRequired402 = header
        ? (decodePaymentRequiredHeader(header) as PaymentRequired402)
        : ((await res.clone().json().catch(() => ({}))) as PaymentRequired402);
      lastQuote = quoteFor(body);
      if (spentTinybar + lastQuote > budgetTinybar) {
        throw new BudgetExceeded(
          `quote ${tinybarToHbar(lastQuote)} HBAR would exceed budget (${tinybarToHbar(budgetTinybar)} HBAR, spent ${tinybarToHbar(spentTinybar)} HBAR)`,
        );
      }
    }
    return res;
  };

  const payingFetch = wrapFetchWithPayment(guardedFetch, client);

  async function paidFetch(url: string, init?: RequestInit): Promise<{ res: Response; payment: Payment | null }> {
    lastQuote = 0n;
    const res = await payingFetch(url, init);
    let payment: Payment | null = null;
    const header = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
    if (header) {
      try {
        const settle = decodePaymentResponseHeader(header);
        // Facilitators may omit `amount` in the settle response; fall back to the quoted price.
        const amount = settle.amount ? BigInt(settle.amount) : lastQuote;
        spentTinybar += amount;
        payment = {
          at: new Date().toISOString(),
          url,
          asset: HBAR_ASSET,
          amount: amount.toString(),
          hbar: tinybarToHbar(amount),
          payer: settle.payer ?? null,
          settlementTx: settle.transaction,
          hashscan: hashscanTx(settle.transaction),
          auditTx: null,
        };
        payment.auditTx = await audit.log({
          v: 1,
          kind: "x402.paid",
          at: payment.at,
          url,
          network: settle.network,
          payer: payment.payer,
          amount: payment.amount,
          asset: HBAR_ASSET,
          settlementTx: settle.transaction,
        });
        payments.push(payment);
      } catch (err) {
        console.warn("[x402] could not decode PAYMENT-RESPONSE:", err instanceof Error ? err.message : err);
      }
    }
    return { res, payment };
  }

  return {
    accountId,
    network,
    paidFetch,
    payments,
    audit,
    budget: () => ({
      budgetHbar: tinybarToHbar(budgetTinybar),
      spentHbar: tinybarToHbar(spentTinybar),
      remainingHbar: tinybarToHbar(budgetTinybar - spentTinybar),
      payments: payments.length,
    }),
  };
}

export type PayingFetch = ReturnType<typeof createPayingFetch>;
