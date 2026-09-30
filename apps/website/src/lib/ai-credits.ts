/**
 * AI credits on the client: the shapes the server sends, and the small event
 * bus that lets any AI request anywhere in the app ask the person before
 * spending a lot of credits.
 *
 * The server decides every number here. The app only shows them: it never
 * works out a price, a balance or whether a payment went through.
 */

export interface CreditBalance {
  daily_free_remaining: number;
  daily_free_limit: number;
  purchased_balance: number;
  total_available: number;
  held: number;
  used_today: number;
  /** Platform executives are not charged. */
  unlimited: boolean;
  low_balance: boolean;
  low_balance_threshold: number;
  exhausted: boolean;
  next_reset_at: string;
  timezone: string;
  confirm_above_credits: number;
  purchases_enabled: boolean;
  currency: string;
  min_purchase_credits: number;
  max_purchase_credits: number;
}

export interface CreditEstimate {
  credits: number;
  input_tokens: number;
  output_tokens: number;
  complexity: string;
  feature: string;
}

export interface CreditTransaction {
  id: string;
  kind: "DAILY_FREE" | "DAILY_EXPIRY" | "AI_USAGE" | "PURCHASE" | "REFUND" | "BONUS" | "ADMIN_ADJUSTMENT";
  kind_label: string;
  amount: number;
  free_delta: number;
  purchased_delta: number;
  balance_after: number;
  free_balance_after: number;
  purchased_balance_after: number;
  feature: string;
  feature_label: string;
  description: string;
  reference_id: string;
  created_at: string;
}

export interface CreditQuote {
  purchases_enabled: boolean;
  currency: string;
  min_purchase_credits: number;
  max_purchase_credits: number;
  credits?: number;
  price?: number;
  price_per_credit?: number;
  minimum_payment?: number;
  payable?: boolean;
  message?: string;
}

export interface CreditPurchase {
  transaction_id: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED";
  processed: boolean;
  credits: number;
  amount: number;
  currency: string;
  reason: string;
  created_at: string | null;
  balance: CreditBalance;
}

export interface CreditUsageSummary {
  window_days: number;
  total_credits: number;
  requests: number;
  by_feature: { feature: string; label: string; credits: number; requests: number; share_percent: number }[];
  daily: { date: string; credits: number; requests: number }[];
  balance: CreditBalance;
}

/** "2,572" - credits are always whole numbers, grouped for reading. */
export function formatCredits(value: number | null | undefined): string {
  return Math.round(Number(value) || 0).toLocaleString("en-US");
}

export function formatFcfa(value: number | null | undefined): string {
  const amount = Number(value) || 0;
  // AI costs are often fractions of a franc; prices and revenue are whole.
  const digits = Math.abs(amount) < 100 && !Number.isInteger(amount) ? 2 : 0;
  return `${amount.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} FCFA`;
}

// ---------------------------------------------------------------------------
// Asking before heavy work, and saying when there is not enough
// ---------------------------------------------------------------------------

export type CreditPrompt =
  | { type: "confirm"; estimate: CreditEstimate; balance: CreditBalance; resolve: (proceed: boolean) => void }
  | { type: "insufficient"; required: number; available: number; balance?: CreditBalance | null };

type Listener = (prompt: CreditPrompt) => void;
const listeners = new Set<Listener>();

/** The dialog host registers here; there is one per signed-in layout. */
export function onCreditPrompt(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Show the cost of a heavy request and wait for the person's answer.
 *
 * With no dialog on the page (a screen outside the dashboard), the browser's
 * own confirm box asks instead, so nothing expensive ever starts unasked.
 */
export function requestCreditConfirmation(estimate: CreditEstimate, balance: CreditBalance): Promise<boolean> {
  if (listeners.size === 0) {
    if (typeof window === "undefined") return Promise.resolve(false);
    return Promise.resolve(
      window.confirm(
        `This request will use about ${formatCredits(estimate.credits)} AI credits. ` +
          `You have ${formatCredits(balance.total_available)}. Continue?`,
      ),
    );
  }
  return new Promise((resolve) => {
    let settled = false;
    const once = (proceed: boolean) => {
      if (settled) return;
      settled = true;
      resolve(proceed);
    };
    listeners.forEach((listener) => listener({ type: "confirm", estimate, balance, resolve: once }));
  });
}

export function announceInsufficientCredits(payload: {
  required?: number;
  available?: number;
  balance?: CreditBalance | null;
}) {
  const prompt: CreditPrompt = {
    type: "insufficient",
    required: Number(payload.required) || 0,
    available: Number(payload.available) || 0,
    balance: payload.balance ?? null,
  };
  listeners.forEach((listener) => listener(prompt));
}

// ---------------------------------------------------------------------------
// Keeping every balance on screen current
// ---------------------------------------------------------------------------

export const CREDITS_CHANGED_EVENT = "eduignite:ai-credits-changed";

/** Any AI work or purchase finished: balances on screen should re-read. */
export function announceCreditsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT));
}
