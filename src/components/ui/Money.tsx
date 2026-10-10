import { formatMoney, type FormatMoneyOptions } from "@/lib/money";
import { cx } from "./cx";

type MoneyProps = FormatMoneyOptions & {
  cents: number;
  /**
   * none keeps the text colour, which is right for almost every amount. change colours a rise
   * green and a fall red, for numbers that compare with before, such as "+$120 on last month".
   */
  colour?: "none" | "change";
  className?: string;
};

/** An amount of money in Australian format with tabular figures, such as −$86.20. */
export function Money({ cents, colour = "none", decimals, sign, className }: MoneyProps) {
  const change = colour === "change";
  const tone = change && cents !== 0 ? (cents > 0 ? "up" : "down") : undefined;
  // A change always shows its sign, so a rise reads as +$120 and not just $120.
  const text = formatMoney(cents, { decimals, sign: sign ?? (change ? "always" : "auto") });
  return <span className={cx("amt", tone, className)}>{text}</span>;
}
