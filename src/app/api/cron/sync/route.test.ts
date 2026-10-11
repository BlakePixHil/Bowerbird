import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const call = (authorization?: string) =>
  GET(
    new Request("http://localhost/api/cron/sync", {
      headers: authorization ? { authorization } : {},
    }),
  );

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the daily sync route", () => {
  it("refuses calls without the secret", async () => {
    vi.stubEnv("CRON_SECRET", "a-long-random-cron-secret");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer guess")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
  });

  it("runs once a day, early in the Sydney morning", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../../../../vercel.json", import.meta.url), "utf8"),
    ) as { crons: { path: string; schedule: string }[] };
    expect(config.crons).toEqual([{ path: "/api/cron/sync", schedule: expect.any(String) }]);
    // A fixed minute and hour every day: the Hobby plan allows one run a day.
    const [minute, hour, ...rest] = config.crons[0].schedule.split(" ");
    expect(rest).toEqual(["*", "*", "*"]);
    expect(minute).toMatch(/^\d+$/);
    // 19:00 UTC is 5 am in Sydney in winter and 6 am in summer.
    const sydney = (Number(hour) + 10) % 24;
    expect(sydney).toBeGreaterThanOrEqual(4);
    expect(sydney).toBeLessThanOrEqual(6);
  });
});
