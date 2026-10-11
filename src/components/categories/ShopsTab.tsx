"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { colourVar, cx, Icon, SegmentedControl, Well } from "@/components/ui";
import { APP_NAME } from "@/config/app";
import type { ShopRow } from "@/lib/access";
import { formatShortDate, type PlainDate } from "@/lib/money";
import { SHOP_NAME_MAX } from "@/lib/sorting/merchants/limits";
import { nameShop } from "./actions";
import { colourOf, transactionsText } from "./look";
import styles from "./Manage.module.css";

type Filter = "all" | "you" | "auto";

const failed = "Couldn't save that. Check your connection and try again.";

/**
 * One shop's name, saved when the person leaves the field or presses Enter. A name that's the
 * same as before, or empty, saves nothing.
 */
function ShopName({ shop, onSaved }: { shop: ShopRow; onSaved: () => void }) {
  const [name, setName] = useState(shop.name);
  const [saved, setSaved] = useState(shop.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function save() {
    const tidy = name.replace(/\s+/g, " ").trim();
    if (!tidy) {
      setName(saved);
      return;
    }
    if (tidy === saved) return;
    setError(null);
    start(async () => {
      const result = await nameShop({
        id: crypto.randomUUID(),
        merchantId: shop.id,
        name: tidy,
      }).catch(() => null);
      if (!result?.ok) {
        setError(result?.error ?? failed);
        return;
      }
      setName(result.name);
      setSaved(result.name);
      onSaved();
    });
  }

  return (
    <div className={styles.shopField}>
      <label className={cx(styles.find, styles.nameInput, error && styles.invalid)}>
        <input
          type="text"
          value={name}
          maxLength={SHOP_NAME_MAX}
          aria-label={`Shop name for ${shop.bankText}`}
          aria-invalid={error ? true : undefined}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            }
            if (event.key === "Escape") setName(saved);
          }}
        />
        <Icon name="pencil" size="sm" />
      </label>
      {error && (
        <span className={cx("tiny", styles.errorText)} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

const how = (shop: ShopRow) => (shop.renamed ? "Renamed by you" : "Cleaned up for you");

/** The Shop names part: what the bank sent, then the name the household sees, editable. */
export function ShopsTab({ shops, today }: { shops: readonly ShopRow[]; today: PlainDate }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const renamed = shops.filter((shop) => shop.renamed).length;
  const words = search.trim().toLowerCase();
  const shown = shops.filter(
    (shop) =>
      (filter === "all" || shop.renamed === (filter === "you")) &&
      (!words ||
        shop.name.toLowerCase().includes(words) ||
        shop.bankText.toLowerCase().includes(words)),
  );
  const example = shops.find((shop) => !shop.renamed) ?? shops[0];
  const refresh = () => router.refresh();
  const last = (date: string) => (date === today ? "Today" : formatShortDate(date));
  const options = [
    { value: "all" as const, label: `All ${shops.length}` },
    { value: "you" as const, label: `Renamed by you ${renamed}` },
    { value: "auto" as const, label: `Cleaned up ${shops.length - renamed}` },
  ];
  const intro = `Banks send messy text. ${APP_NAME} cleans it into a shop name. Change a name and it sticks for every new one.`;
  const find = (
    <label className={styles.find}>
      <Icon name="search" size="sm" />
      <input
        type="search"
        placeholder="Find a shop"
        aria-label="Find a shop"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
    </label>
  );
  const none = (
    <div className={cx("muted small", styles.empty)}>
      {shops.length === 0
        ? "Shop names show here once transactions come in."
        : "No shops match. Try another name."}
    </div>
  );

  return (
    <div className={styles.flow}>
      <div className={cx(styles.main, styles.w2)}>
        {/* Phone */}
        <div className={styles.phoneOnly}>
          <p className={cx("sub small", styles.intro)}>{intro}</p>
          {find}
          <section className={cx(styles.card, styles.rows)} aria-label="Shop names">
            {shown.map((shop) => (
              <div key={shop.id} className={styles.shopRow}>
                <div className={cx("mono ellipsis", styles.bankText)}>{shop.bankText}</div>
                <div className={styles.shopLine}>
                  <Icon name="arrow-down-right" size="sm" />
                  <ShopName shop={shop} onSaved={refresh} />
                </div>
                <div className={cx("muted tiny tnum", styles.shopMeta)}>
                  <Icon name={shop.renamed ? "pencil" : "wand"} size="sm" />
                  <span>
                    {how(shop)} · {transactionsText(shop.seen)}
                  </span>
                </div>
              </div>
            ))}
            {shown.length === 0 && none}
          </section>
        </div>

        {/* Desktop */}
        <section className={cx(styles.card, styles.desktopOnly)} aria-labelledby="shops-title">
          <div className={styles.cardHead}>
            <div className={styles.cardTitle}>
              <h2 id="shops-title" className="h2">
                Shop names
              </h2>
              <span className="muted small">Bank text, then the name you see</span>
            </div>
          </div>
          <div className={styles.toolbar}>
            <SegmentedControl
              label="Show shop names"
              options={options}
              value={filter}
              onChange={setFilter}
              size="sm"
            />
            {find}
          </div>
          <div className={styles.scrollX}>
            <table className={cx(styles.table, styles.shopTable)} aria-label="Shop names">
              <thead>
                <tr>
                  <th scope="col">Bank text</th>
                  <th scope="col" aria-hidden="true" />
                  <th scope="col">Shop name</th>
                  <th scope="col" className={styles.num}>
                    Seen
                  </th>
                  <th scope="col">Last seen</th>
                  <th scope="col">Rule</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((shop) => (
                  <tr key={shop.id}>
                    <td className={cx("mono", styles.bankCell)} title={shop.bankText}>
                      {shop.bankText}
                    </td>
                    <td aria-hidden="true" className="muted">
                      <Icon name="arrow-right" size="sm" />
                    </td>
                    <td>
                      <ShopName shop={shop} onSaved={refresh} />
                      <span className={cx("tiny", styles.how, shop.renamed && styles.howYou)}>
                        <Icon name={shop.renamed ? "pencil" : "wand"} size="sm" />
                        {how(shop)}
                      </span>
                    </td>
                    <td className={cx(styles.num, "tnum sub")}>
                      {shop.seen.toLocaleString("en-AU")}
                    </td>
                    <td className="sub small">{last(shop.lastSeen)}</td>
                    <td className="small">
                      {shop.rule ? (
                        <span className={styles.nameLine}>
                          <span
                            className={styles.key}
                            style={{ background: colourVar(colourOf(shop.rule)) }}
                          />
                          <span className="sub">{shop.rule.name}</span>
                        </span>
                      ) : (
                        <Link
                          href={`/activity?q=${encodeURIComponent(shop.name)}`}
                          className={styles.link}
                          aria-label={`Make a rule for ${shop.name}: pick a category on one of its transactions`}
                        >
                          Make a rule
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length === 0 && none}
          </div>
        </section>
      </div>

      <div className={cx(styles.side, styles.w1, styles.desktopOnly)}>
        <section className={cx(styles.card, styles.panel)} aria-labelledby="cleaned-title">
          <div className={styles.editor}>
            <h2 id="cleaned-title" className="h2">
              How names get cleaned
            </h2>
            {example && (
              <Well className={styles.example}>
                <span className="mono">{example.bankText}</span>
                <Icon name="arrow-down" size="sm" />
                <span className={styles.bold}>{example.name}</span>
              </Well>
            )}
            {[
              [
                "Codes and numbers come off",
                "Store numbers, towns and card reader codes like SQ * are dropped.",
              ],
              [
                "One shop, one name",
                "Every Woolworths store shows as Woolworths, so rules and reports keep them together.",
              ],
              [
                "Your change sticks",
                "Rename a shop once, like GYG to Guzman y Gomez, and every new one with the same bank text gets your name.",
              ],
            ].map(([title, text], i) => (
              <div key={title} className={styles.step}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <div className={cx("small", styles.bold)}>{title}</div>
                  <div className="muted small">{text}</div>
                </div>
              </div>
            ))}
            <div className={styles.divider} />
            <div className={cx("small muted", styles.pinNote)}>
              <Icon name="info" size="sm" />
              <span>
                The bank text is kept as it came, so you can always see what the bank sent.
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
