import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  Avatar,
  BarMeter,
  Button,
  ButtonLink,
  Card,
  ChartTooltip,
  Checkbox,
  Chip,
  Icon,
  IconButton,
  ICONS,
  Kbd,
  Kpi,
  KpiGrid,
  ListRow,
  Logo,
  LogoMark,
  Money,
  NavItem,
  NavSection,
  Pill,
  SegmentedControl,
  Sidebar,
  StackedBar,
  Switch,
  TabBar,
  Table,
  Tag,
  Td,
  TextField,
  TextLink,
  Th,
  Tile,
  WarningBanner,
  Well,
  type IconName,
} from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { devPagesAllowed } from "@/lib/env";
import styles from "../dev.module.css";
import { SheetDemo } from "./SheetDemo";

export const metadata: Metadata = {
  title: "Components",
  robots: { index: false, follow: false },
};

type Theme = "dark" | "light";

/** Swatch groups from the Design system board: name, token, dark hex, light hex. */
const COLOURS: Array<[string, Array<[string, string, string, string]>]> = [
  [
    "Surfaces",
    [
      ["Page", "--bg", "#08090B", "#F5F5F7"],
      ["Card", "--surface", "#0F1013", "#FFFFFF"],
      ["Well", "--surface-2", "#15161A", "#F3F3F5"],
      ["Raised", "--surface-3", "#1C1D22", "#EAEAEE"],
      ["Line", "--line", "#1E2025", "#E6E6EA"],
    ],
  ],
  [
    "Text and accent",
    [
      ["Text", "--text", "#EDEEF0", "#111216"],
      ["Secondary", "--text-2", "#A4A7AF", "#55585F"],
      ["Muted", "--text-3", "#80838C", "#6B6E76"],
      ["Accent", "--accent", "#3987E5", "#2A78D6"],
    ],
  ],
  [
    "Money",
    [
      ["Money in", "--in", "#3BB04E", "#2EA043"],
      ["Money out", "--out", "#C22929", "#B42323"],
      ["Left over", "--left", "#3BB04E", "#2EA043"],
    ],
  ],
  [
    "Whose money",
    [
      ["You", "--you", "#3987E5", "#2A78D6"],
      ["Partner", "--partner", "#D55181", "#E87BA4"],
      ["Shared", "--shared", "#C98500", "#EDA100"],
    ],
  ],
  [
    "Categories",
    [
      ["Housing", "--c1", "#14A3B8", "#0A8AA6"],
      ["Groceries", "--c2", "#D95926", "#EB6834"],
      ["Bills", "--c3", "#199E70", "#1BAF7A"],
      ["Eating out", "--c4", "#C98500", "#EDA100"],
      ["Transport", "--c5", "#D55181", "#E87BA4"],
      ["Shopping", "--c6", "#008300", "#008300"],
      ["Travel", "--c7", "#3987E5", "#2A78D6"],
      ["Other", "--c-other", "#4A4D56", "#C4C6CC"],
    ],
  ],
  [
    "Parts of a whole",
    [
      ["Biggest", "--seq1", "#93DCA0", "#134F22"],
      ["Second", "--seq2", "#3BB04E", "#1F7A33"],
      ["Third", "--seq3", "#2A8439", "#2EA043"],
      ["Fourth", "--seq4", "#1F6129", "#6CC07A"],
      ["Home loan", "--debt1", "#E07070", "#B42323"],
      ["Card", "--debt2", "#8A2020", "#E58585"],
    ],
  ],
  [
    "Status",
    [
      ["Good", "--good", "#0CA30C", "#0CA30C"],
      ["Heads up", "--warn", "#FAB219", "#FAB219"],
      ["Problem", "--crit", "#D03B3B", "#D03B3B"],
    ],
  ],
];

const TYPE: Array<[string, string, string]> = [
  ["46 · 600", "hero tnum", "$1,519"],
  ["28 · 600", "big tnum", "$270,945"],
  ["26 · 600", "h1", "October so far"],
  ["20 · 600", "mid tnum", "$358 a month"],
  ["15 · 600", "h2", "Spending pace"],
  ["14 · 400", "", "Everything up to 8 Oct is still here."],
  ["12.5 · 400", "small sub", "of $2,220 · about $72 a day"],
  ["MONO 11", "mono", "SYNCED 12 MIN AGO"],
];

const TABS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/activity", label: "Activity", icon: "list" },
  { href: "/budgets", label: "Budgets", icon: "pie" },
  { href: "/goals", label: "Goals", icon: "flag-goal" },
  { href: "/reports", label: "Reports", icon: "bars" },
] as const;

const REPORTS: Array<[string, IconName]> = [
  ["Money in, money out", "in-out"],
  ["What's left over", "box"],
  ["What we own and owe", "scales"],
  ["Until payday", "calendar"],
];

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
  const dark = theme === "dark";
  return (
    <div data-theme={theme} className={styles.panel}>
      <header className={styles.header}>
        <div>
          <div className="mono muted">{dark ? "DARK · THE DEFAULT" : "LIGHT · ITS OWN STEPS"}</div>
          <h1 className="h1" style={{ marginTop: 6 }}>
            Components
          </h1>
        </div>
        <Logo fontSize={18} />
      </header>

      <div className={styles.grid}>
        <Section title="Colours" note={dark ? "Dark values" : "Light values"} wide>
          {COLOURS.map(([group, swatches]) => (
            <div key={group} className={styles.swatchGroup}>
              <span className="small" style={{ fontWeight: 500 }}>
                {group}
              </span>
              <div className={styles.swatches}>
                {swatches.map(([name, token, darkHex, lightHex]) => (
                  <div key={token} className={styles.swatch}>
                    <span className={styles.chip} style={{ background: `var(${token})` }} />
                    <div className="tiny ellipsis" style={{ marginTop: 5 }}>
                      {name}
                    </div>
                    <div className="mono muted" style={{ fontSize: 9.5 }}>
                      {dark ? darkHex : lightHex}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Section>

        <Section title="Type" note="Geist and Geist Mono">
          <div>
            {TYPE.map(([spec, className, sample]) => (
              <div key={spec} className={styles.typeRow}>
                <span className="mono muted">{spec}</span>
                <span className={`${className} ellipsis`}>{sample}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Buttons" note="36px, large 44px">
          <Button variant="primary" size="lg">
            Mark September as done
          </Button>
          <div className={styles.wrapRow}>
            <Button icon="upload">Import a file</Button>
            <Button variant="ghost">Just this once</Button>
            <IconButton icon="sync" label="Sync now" boxed />
            <IconButton icon="more" label="More options" />
          </div>
          <div className={styles.wrapRow}>
            <Button disabled>Not yet</Button>
            <ButtonLink href="/dev/ui" variant="primary">
              A link that looks like a button
            </ButtonLink>
          </div>
          <Button size="lg" block>
            Full width
          </Button>
          <TextLink href="/dev/ui" icon="chevron-right">
            See all
          </TextLink>
        </Section>

        <Section title="Inputs">
          <TextField
            label="Search"
            hideLabel
            icon="search"
            placeholder="Search Woolworths, $86, Bali"
            trailing={<Kbd>/</Kbd>}
          />
          <TextField
            label="Email"
            type="email"
            placeholder="you@example.com"
            hint="We'll send a sign-in link."
          />
          <TextField
            label="Amount"
            inputMode="decimal"
            defaultValue="12.345"
            error="Use at most two decimal places."
          />
          <div className={styles.wrapRow} style={{ gap: 16 }}>
            <Switch defaultChecked>Alerts on</Switch>
            <Checkbox defaultChecked>Also change 23 earlier</Checkbox>
          </div>
        </Section>

        <Section title="Choices" wide>
          <span className="h3">Whose money</span>
          <SegmentedControl
            label="Whose money"
            defaultValue="household"
            options={[
              { value: "mine", label: "Mine" },
              { value: "partner", label: "Partner's" },
              { value: "shared", label: "Shared" },
              { value: "household", label: "Household" },
            ]}
          />
          <span className="h3">Who can see an account</span>
          <SegmentedControl
            label="Who can see an account"
            defaultValue="shared"
            options={[
              { value: "shared", label: "Shared", icon: "users" },
              { value: "balance_only", label: "Balance only", icon: "eye" },
              { value: "private", label: "Private", icon: "lock" },
            ]}
          />
          <span className="h3">People</span>
          <div className={styles.wrapRow} style={{ gap: 16 }}>
            <span
              className="small"
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <Avatar owner="you" initials="Y" label="You" size="lg" />
              You
            </span>
            <span
              className="small"
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <Avatar owner="partner" initials="P" label="Partner" size="lg" />
              Partner
            </span>
            <span
              className="small"
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <Avatar owner="shared" initials="S" label="Shared" size="lg" />
              Shared
            </span>
          </div>
        </Section>

        <Section title="Status, filters and tags">
          <div className={styles.wrapRow}>
            <Pill tone="good">On pace</Pill>
            <Pill tone="warn">{formatMoney(4800, { decimals: "auto" })} over pace</Pill>
            <Pill tone="crit">Over by {formatMoney(2600, { decimals: "auto" })}</Pill>
            <Pill tone="accent">Ready</Pill>
            <Pill tone="quiet">About usual</Pill>
          </div>
          <div className={styles.wrapRow}>
            <Chip on>12 months</Chip>
            <Chip>This financial year</Chip>
            <Chip icon="filter">Filters</Chip>
          </div>
          <div className={styles.wrapRow} style={{ gap: 6 }}>
            <Tag>Pending</Tag>
            <Tag icon="plane">Bali 2027</Tag>
            <Tag>Not counted</Tag>
          </div>
          <span className="small sub">
            Press <Kbd>/</Kbd> to search.
          </span>
        </Section>

        <Section title="Rows and alerts">
          <Well className={styles.wellRows}>
            <ListRow
              leading={<Tile icon="cart" size="sm" />}
              title="Woolworths"
              detail="Groceries · Joint account"
              trailing={
                <>
                  <Avatar owner="shared" initials="S" label="Shared" size="sm" />
                  <Money cents={-8620} />
                </>
              }
            />
            <ListRow
              leading={<Tile icon="income" size="sm" tone="good" />}
              title="Pay"
              detail="Income · Everyday"
              href="/dev/ui"
              trailing={<Money cents={326_000} />}
            />
          </Well>
          <WarningBanner title="Reconnect your bank.">Consent expired.</WarningBanner>
          <Well className={styles.note}>
            <Icon name="spark" size="sm" className={styles.spark} />
            <span className="small">
              AI notes are marked with this spark and only appear when you&apos;ve added your own
              Claude key.
            </span>
          </Well>
        </Section>

        <Section title="Meters" note="Today is a 2px tick">
          <BarMeter
            label="Groceries spent so far"
            value={890}
            max={2220}
            valueText="$890 of $2,220"
            today={0.52}
          />
          <BarMeter
            label="Bali 2027 saved"
            value={3400}
            max={6000}
            valueText="$3,400 of $6,000"
            colour="pos"
            size="lg"
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
          <div className={styles.wrapRow} style={{ gap: 16 }}>
            <Money cents={12_000} colour="change" decimals="auto" />
            <Money cents={-4_550} colour="change" />
            <Money cents={-8620} />
            <Money cents={123_456} decimals="never" />
          </div>
        </Section>

        <Section title="Headline numbers" wide>
          <KpiGrid>
            <Kpi
              label="Left to spend"
              href="/dev/ui"
              badge={<Pill tone="good">On pace</Pill>}
              value={<Money cents={118_000} decimals="never" />}
              detail="of $2,220 · about $72 a day"
            >
              <BarMeter label="Spent so far" value={1040} max={2220} today={0.52} />
            </Kpi>
            <Kpi
              label="Money in"
              value={<Money cents={652_000} decimals="never" />}
              detail={
                <>
                  <Money cents={12_000} colour="change" decimals="never" /> on last month
                </>
              }
            />
            <Kpi
              label="Left over"
              badge={<Pill tone="warn">Lower than usual</Pill>}
              value={<Money cents={124_000} decimals="never" />}
              detail="19% of what came in"
            />
          </KpiGrid>
        </Section>

        <Section title="Table" note="Number columns line up">
          <Table caption="Spending by category this month">
            <thead>
              <tr>
                <Th>Category</Th>
                <Th num>Spent</Th>
                <Th num>Plan</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>Groceries</Td>
                <Td num>
                  <Money cents={-89_040} />
                </Td>
                <Td num>$1,100.00</Td>
              </tr>
              <tr>
                <Td>Eating out</Td>
                <Td num>
                  <Money cents={-31_250} />
                </Td>
                <Td num>$300.00</Td>
              </tr>
              <tr>
                <Td>Transport</Td>
                <Td num>
                  <Money cents={-6_400} />
                </Td>
                <Td num>$250.00</Td>
              </tr>
            </tbody>
          </Table>
        </Section>

        <Section title="Chart tooltip">
          <div className={styles.tipFrame}>
            <ChartTooltip
              title="Sat 10 Oct"
              style={{ left: 0 }}
              rows={[
                { label: "This month", value: "$1,040", colour: "neg", line: true },
                { label: "Last month", value: "$1,180", colour: "ghost", line: true },
                { label: "Plan", value: "$1,150" },
              ]}
            />
          </div>
        </Section>

        <Section title="Bottom sheet">
          <span className="small sub">A real dialog: Escape or a tap outside closes it.</span>
          <SheetDemo />
        </Section>

        <Section title="Bottom tab bar" note="Phone">
          <TabBar items={TABS} floating={false} current="/" />
        </Section>

        <Section title="Desktop sidebar" note="A scrolling row on a phone">
          <div className={styles.sideFrame}>
            <Sidebar
              footer={
                <NavItem href="/settings" icon="sliders">
                  Settings
                </NavItem>
              }
            >
              <NavItem href="/" icon="home" current>
                Home
              </NavItem>
              <NavItem href="/activity" icon="list" count={12}>
                Activity
              </NavItem>
              <NavItem href="/budgets" icon="pie">
                Budgets
              </NavItem>
              <NavSection title="Reports">
                {REPORTS.map(([label, icon]) => (
                  <NavItem key={label} href={`/reports/${icon}`} icon={icon} hideOnPhone>
                    {label}
                  </NavItem>
                ))}
              </NavSection>
            </Sidebar>
          </div>
        </Section>

        <Section title="Logo and app icon">
          <div className={styles.logos}>
            <LogoMark size={76} label="Bowerbird app icon" />
            <LogoMark size={40} />
            <LogoMark size={32} />
            <LogoMark size={16} />
          </div>
          <Logo fontSize={32} />
        </Section>

        <Section
          title="Icons"
          note={`${Object.keys(ICONS).length} in the design's stroke style`}
          wide
        >
          <div className={styles.icons}>
            {(Object.keys(ICONS) as IconName[]).map((name) => (
              <div key={name} className={styles.iconCell}>
                <Icon name={name} />
                <span className={styles.iconName}>{name}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

/** Every component in both themes, for checking against the design canvas. Never on the live app. */
export default function DevUiPage() {
  if (!devPagesAllowed()) notFound();
  return (
    <main className={styles.page}>
      <Showcase theme="dark" />
      <Showcase theme="light" />
    </main>
  );
}
