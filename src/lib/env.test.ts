import { describe, expect, it } from "vitest";
import { appUrl } from "./env";

describe("appUrl", () => {
  it("uses APP_URL when it's set, without a trailing slash", () => {
    expect(appUrl({ APP_URL: "https://bowerbird-xyz.vercel.app/" })).toBe(
      "https://bowerbird-xyz.vercel.app",
    );
  });

  it("uses the branch address on Vercel previews", () => {
    const env = {
      VERCEL_ENV: "preview",
      VERCEL_BRANCH_URL: "bowerbird-git-bud-8-blake.vercel.app",
      VERCEL_URL: "bowerbird-abc123.vercel.app",
    };
    expect(appUrl(env)).toBe("https://bowerbird-git-bud-8-blake.vercel.app");
  });

  it("falls back to localhost", () => {
    expect(appUrl({})).toBe("http://localhost:3000");
  });
});
