import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  DailyBars,
  InOutBars,
  Meter,
  NetWorthLine,
  ProgressRing,
  RunningTotalChart,
  StackedBar,
} from "@/components/charts";
import { Card, Logo, Pill } from "@/components/ui";
import { devPagesAllowed } from "@/lib/env";
import styles from "../dev.module.css";
import { InOutDemo } from "./InOutDemo";
import {
  fortnight,
  netWorth,
  OCT_END,
  OCT_START,
  pace,
  payday,
  PLAN,
  reportMonths,
  TODAY,
} from "./samples";

export const metadata: Metadata = {
  title: "Charts",
  robots: { index: false, follow: false },
};

type Theme = "dark" | "light";

function Section({
  title,
  note,
  wide,
  children,
}: {
  title: string;
  note?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card as="section" className={`${styles.section} ${wide ? styles.wide : ""}`}>
      <div className={styles.header}>
        <h2 className="h2">{title}</h2>
        {note && <span className="small muted">{note}</span>}
      </div>
      {children}
    </Card>
  );
}

function Showcase({ theme }: { theme: Theme }) {
  return (
    <div data-theme={theme} className={styles.panel}>
      <header className={styles.header}>
        <div>
          <div className="mono muted">{theme === "dark" ? "DARK · THE DEFAULT" : "LIGHT"}</div>
          <h1 className="h1" style={{ marginTop: 6 }}>
            Charts
          </h1>
        </div>
        <Logo fontSize={18} />
      </header>

      <div className={styles.grid}>
        <Section title="Spending pace" note="Everyday spending" wide>
          <RunningTotalChart
            label="Everyday spending in October"
            start={OCT_START}
            end={OCT_END}
            today={TODAY}
            tone="neg"
            height={160}
            actual={pace.actual}
            previous={pace.previous}
            plan={pace.plan}
            forecast={pace.forecast}
            guides={[{ cents: PLAN, label: "Plan $2,220" }]}
            callouts={[{ date: TODAY, cents: 70_100, label: "$701", strong: true }]}
            ticks={["2026-10-15"]}
          />
        </Section>

        <Section title="Until payday" note="Joint account" wide>
          <RunningTotalChart
            label="Joint account balance until payday"
            start={OCT_START}
            end={OCT_END}
            today={TODAY}
            tone="pos"
            height={200}
            actual={payday.actual}
            forecast={payday.forecast}
            range={payday.range}
            events={payday.events}
            markers={payday.markers}
            guides={[{ cents: payday.alert, label: "Alert $1,000", alert: true }]}
            callouts={[
              { date: TODAY, cents: 394_000, label: "Today $3,940", below: true },
              ...payday.callouts,
            ]}
          />
        </Section>

        <Section title="Each month" note="Tap a month" wide>
          <InOutDemo />
        </Section>

        <Section title="Money in, money out" note="Reports card">
          <InOutBars
            label="Money in and out, November 2025 to October 2026"
            months={reportMonths}
            height={92}
          />
        </Section>

        <Section title="Spent this week">
          <div className={styles.header}>
            <span className="big tnum">$560</span>
            <Pill tone="warn" icon="arrow-up-right">
              $74 more than usual
            </Pill>
          </div>
          <DailyBars
            label="Everyday spending, last two weeks"
            days={fortnight}
            today={TODAY}
            typical={{ cents: 6900, label: "Typical day $69" }}
          />
        </Section>

        <Section title="Net worth" note="Last 12 months" wide>
          <NetWorthLine
            label="Net worth, last 12 months"
            points={netWorth}
            height={200}
            yTicks={4}
            endLabel="Today $270,945"
          />
        </Section>

        <Section title="Small charts" note="Tiles on Home">
          <div className={styles.wrapRow} style={{ alignItems: "stretch", gap: 12 }}>
            <Card className={styles.section} style={{ flex: "1 1 140px", padding: 14 }}>
              <span className="eyebrow">Net worth</span>
              <span className="mid tnum">$270,945</span>
              <NetWorthLine label="Net worth trend" points={netWorth} compact height={44} />
            </Card>
            <Card className={styles.section} style={{ flex: "1 1 140px", padding: 14 }}>
              <span className="eyebrow">Bali 2027</span>
              <div className={styles.wrapRow} style={{ gap: 12 }}>
                <ProgressRing
                  fraction={0.62}
                  size={64}
                  stroke={6}
                  colour="pos"
                  label="Bali 2027: $4,960 saved of $8,000, 62%"
                >
                  <span className="tnum" style={{ fontSize: 14, fontWeight: 600 }}>
                    62%
                  </span>
                </ProgressRing>
                <span className="small">
                  <span className="tnum" style={{ fontWeight: 600 }}>
                    $4,960
                  </span>
                  <br />
                  <span className="muted tnum">of $8,000</span>
                </span>
              </div>
            </Card>
          </div>
        </Section>

        <Section title="Plan vs reality" note="Budgets">
          <div className={styles.wrapRow} style={{ gap: 18, flexWrap: "nowrap" }}>
            <ProgressRing
              fraction={3112 / 5180}
              expected={3263 / 5180}
              label="Spent $3,112 of $5,180. Expected by today: $3,263."
            >
              <span className="mid tnum">$2,068</span>
              <span className="muted tiny">left</span>
            </ProgressRing>
            <div className={styles.stack} style={{ gap: 10 }}>
              <Pill tone="good">$151 under pace</Pill>
              <span className="small sub">
                Spent $3,112 of $5,180. The tick is where you&apos;d expect to be today.
              </span>
            </div>
          </div>
          <Meter
            label="Groceries spent so far"
            value={890}
            max={1100}
            valueText="$890 of $1,100"
            today={0.32}
          />
          <StackedBar
            label="What you own"
            parts={[
              { label: "Home", value: 46, colour: "seq1" },
              { label: "Super", value: 28, colour: "seq2" },
              { label: "Savings", value: 16, colour: "seq3" },
              { label: "Shares", value: 10, colour: "seq4" },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}

/** Every chart with sample data, in both themes. Never on the live app. */
export default function DevChartsPage() {
  if (!devPagesAllowed()) notFound();
  return (
    <main className={styles.page}>
      <Showcase theme="dark" />
      <Showcase theme="light" />
    </main>
  );
}
