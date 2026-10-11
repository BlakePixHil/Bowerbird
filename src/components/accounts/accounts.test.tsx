import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { signInWords } from "@/lib/auth/device";
import { AccountsList, type AccountItem } from "./AccountsList";
import { Passkeys } from "./Passkeys";
import { accountLine, categoriesLine, importLine, roleLine } from "./words";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("./actions", () => ({ saveAccount: vi.fn(), forgetPasskey: vi.fn() }));
vi.mock("@/lib/auth/actions", () => ({
  finishAddPasskey: vi.fn(),
  signOut: vi.fn(),
  startAddPasskey: vi.fn(),
}));

describe("the words on Accounts and sharing", () => {
  it("says who you are and how you sign in", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
    expect(roleLine("owner", signInWords(iphone))).toBe("Owner · signs in with Face ID");
    expect(roleLine("partner", signInWords("Mozilla/5.0 (Macintosh)"))).toBe(
      "Member · signs in with Touch ID",
    );
    expect(signInWords("Mozilla/5.0 (Linux; Android 15)")).toBe("a passkey");
  });

  it("says whose an account is, where it's from and how it comes in", () => {
    const base = { isJoint: false, institution: "Westpac", live: true, manual: false };
    expect(accountLine({ ...base, includeInBudgets: true })).toBe("Yours · Westpac · live sync");
    expect(
      accountLine({
        ...base,
        isJoint: true,
        live: false,
        institution: null,
        includeInBudgets: false,
      }),
    ).toBe("Joint · bank files · not in budgets");
  });

  it("sums up the last import as the board does", () => {
    expect(importLine({ filename: "westpac-sep.csv", rows: 214, skipped: 12 })).toBe(
      "westpac-sep.csv, 214 rows, 12 skipped because they were already here",
    );
    expect(importLine({ filename: "a.ofx", rows: 1, skipped: 1 })).toBe(
      "a.ofx, 1 row, 1 skipped because it was already here",
    );
    expect(importLine({ filename: "b.qif", rows: 1_500, skipped: 0 })).toBe("b.qif, 1,500 rows");
  });

  it("counts categories and rules", () => {
    expect(categoriesLine(15, 12)).toBe("15 categories, 12 rules, cleaned-up shop names");
    expect(categoriesLine(1, 0)).toBe("1 category, no rules yet, cleaned-up shop names");
  });
});

const item = (over: Partial<AccountItem>): AccountItem => ({
  id: "00000000-0000-4000-8000-000000000b01",
  name: "Everyday",
  line: "Yours · live sync",
  icon: "bank",
  balanceCents: 2_184_00,
  includeInBudgets: true,
  archived: false,
  live: true,
  ...over,
});

describe("AccountsList", () => {
  const html = renderToStaticMarkup(
    <AccountsList
      accounts={[
        item({}),
        item({
          id: "00000000-0000-4000-8000-000000000b02",
          name: "Joint saver",
          balanceCents: null,
          includeInBudgets: false,
        }),
        item({ id: "00000000-0000-4000-8000-000000000b03", name: "Old card", archived: true }),
      ]}
    />,
  );

  it("shows each account's balance and whether it counts toward budgets", () => {
    expect(html).toContain("$2,184");
    expect(html).toContain("No balance yet");
    expect(html).toContain('aria-label="Everyday counts toward budgets" checked=""');
    expect(html).toMatch(/aria-label="Joint saver counts toward budgets"(?! checked)/);
  });

  it("offers to rename or archive each open account, and to bring back archived ones", () => {
    expect(html).toContain('aria-label="Rename or archive Everyday"');
    expect(html).not.toContain('aria-label="Rename or archive Old card"');
    expect(html).toContain('aria-label="Bring back Old card"');
  });

  it("has no sharing control while it's just you", () => {
    expect(html).not.toContain("Balance only");
    expect(html).not.toContain("Private");
  });
});

describe("Passkeys", () => {
  const keys = [
    { id: "k1", label: "iPhone", detail: "Added Sat 10 Oct · Last used Sun 11 Oct" },
    { id: "k2", label: "Mac", detail: "Added Sun 11 Oct · Not used yet" },
  ];

  it("lets you remove one of several", () => {
    const html = renderToStaticMarkup(<Passkeys keys={keys} />);
    expect(html).toContain('aria-label="Remove the passkey on iPhone"');
    expect(html).toContain('aria-label="Remove the passkey on Mac"');
    expect(html).toContain("Add a passkey on this device");
    expect(html).toContain("Sign out");
  });

  it("never offers to remove the last one", () => {
    const html = renderToStaticMarkup(<Passkeys keys={keys.slice(0, 1)} />);
    expect(html).not.toContain("Remove the passkey");
    expect(html).toContain("This is your only passkey");
  });
});
