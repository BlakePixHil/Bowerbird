import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IconButton } from "./Button";
import { Pill } from "./Chip";
import { Icon } from "./Icon";
import { BarMeter, StackedBar } from "./Meter";
import { Money } from "./Money";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("Money", () => {
  it("keeps plain amounts in the text colour with a real minus sign", () => {
    const out = html(<Money cents={-8620} />);
    expect(out).toContain("−$86.20");
    expect(out).not.toMatch(/\b(up|down)\b/);
  });

  it("colours a change and always shows its sign", () => {
    expect(html(<Money cents={12_000} colour="change" decimals="auto" />)).toMatch(
      /class="amt up">\+\$120</,
    );
    expect(html(<Money cents={-4550} colour="change" />)).toMatch(/class="amt down">−\$45\.50</);
    expect(html(<Money cents={0} colour="change" />)).toMatch(/class="amt">\$0\.00</);
  });
});

describe("Icon", () => {
  it("is hidden from screen readers unless it has a label", () => {
    expect(html(<Icon name="sync" />)).toContain('aria-hidden="true"');
    const labelled = html(<Icon name="sync" label="Synced" />);
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain('aria-label="Synced"');
  });
});

describe("IconButton", () => {
  it("is a real button named by its label", () => {
    const out = html(<IconButton icon="sync" label="Sync now" />);
    expect(out).toMatch(/^<button type="button" aria-label="Sync now"/);
  });
});

describe("Pill", () => {
  it("shows an icon with status words, never colour alone", () => {
    expect(html(<Pill tone="good">On pace</Pill>)).toContain("<svg");
    expect(html(<Pill tone="warn">Over pace</Pill>)).toContain("<svg");
    expect(html(<Pill tone="quiet">About usual</Pill>)).not.toContain("<svg");
  });
});

describe("BarMeter", () => {
  it("keeps the fill inside the track and tells screen readers the amount", () => {
    const out = html(
      <BarMeter label="Spent" value={3000} max={2000} valueText="$3,000 of $2,000" />,
    );
    expect(out).toContain('role="meter"');
    expect(out).toContain('aria-valuenow="2000"');
    expect(out).toContain('aria-valuetext="$3,000 of $2,000"');
    expect(out).toContain("width:100%");
  });
});

describe("StackedBar", () => {
  it("describes every part in its label", () => {
    const out = html(
      <StackedBar
        label="What you own"
        parts={[
          { label: "Home", value: 75, colour: "seq1" },
          { label: "Shares", value: 25, colour: "seq2" },
        ]}
      />,
    );
    expect(out).toContain('aria-label="What you own: Home 75%, Shares 25%"');
  });
});
