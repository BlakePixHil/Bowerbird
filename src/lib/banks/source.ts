import type { PlainDate } from "@/lib/money";

/**
 * Every way bank data comes in implements BankSource: SimpleFIN through Redbark today, CoinSpot
 * later. Swapping a provider must not touch the rest of the app.
 */
export interface BankSource {
  /** Every account the connection can read, with its latest balance. */
  listAccounts(): Promise<SourceAccount[]>;
  /** An account's transactions dated from `from` up to and including `to`, oldest first. */
  fetchTransactions(account: string, from: PlainDate, to: PlainDate): Promise<SourceTransaction[]>;
  /** An account's latest balance. */
  fetchBalance(account: string): Promise<SourceBalance>;
}

export type SourceBalance = {
  /** Signed cents. Negative for money owed, as on a credit card or loan. */
  balanceCents: number;
  /** What can be spent now, when the bank says. */
  availableCents: number | null;
  /** The day the bank gave the balance for, in the household's time zone. */
  date: PlainDate;
};

export type SourceAccount = SourceBalance & {
  /** The source's id for the account. Stays the same between syncs. */
  externalId: string;
  name: string;
  /** The bank's name as the source gives it, or null. Only ever shown as the person's own data. */
  institution: string | null;
  /** ISO 4217, for example AUD. */
  currency: string;
};

export type SourceTransaction = {
  /** The source's id for the transaction, unique within the account. */
  externalId: string;
  /** The day it happened, in the household's time zone. */
  date: PlainDate;
  /** Signed cents. Negative means money out. */
  amountCents: number;
  description: string;
  pending: boolean;
};

/** Why a source couldn't be read, so the connection can show a plain message and the right status. */
export type SourceErrorKind =
  /** The access was cut or the link is wrong: reconnect. */
  | "auth"
  /** The provider wants payment before it sends more data. */
  | "payment"
  /** The provider didn't answer in time or couldn't be reached. Try again later. */
  | "network"
  /** The provider answered with something that isn't what the protocol says. */
  | "bad_response";

/** A failure with a message in plain words. Never carries a token, link or bank data. */
export class SourceError extends Error {
  constructor(
    readonly kind: SourceErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "SourceError";
  }
}
