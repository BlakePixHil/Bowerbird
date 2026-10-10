import { describe, expect, it } from "vitest";
import { appUrl, devPagesAllowed } from "./env";

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

describe("devPagesAllowed", () => {
  it("allows developer pages locally and on previews", () => {
    expect(devPagesAllowed({ NODE_ENV: "development" })).toBe(true);
    expect(devPagesAllowed({ NODE_ENV: "production", VERCEL_ENV: "preview" })).toBe(true);
  });

  it("hides them on the live app and in a local production build", () => {
    expect(devPagesAllowed({ NODE_ENV: "production", VERCEL_ENV: "production" })).toBe(false);
    expect(devPagesAllowed({ NODE_ENV: "production" })).toBe(false);
  });
});
