import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { proxy } from "./proxy";

const BASE = "http://localhost:3000";

function visit(path: string, token?: string) {
  const request = new NextRequest(new URL(path, BASE));
  if (token) request.cookies.set(SESSION_COOKIE, token);
  return proxy(request);
}

describe("proxy", () => {
  it("sends a signed-out visit to sign in, then back to where it was going", () => {
    const response = visit("/activity?q=coffee");
    expect(response.status).toBe(307);
    const to = new URL(response.headers.get("location")!);
    expect(to.pathname).toBe("/sign-in");
    expect(to.searchParams.get("next")).toBe("/activity?q=coffee");
  });

  it("doesn't add a next for Home", () => {
    const response = visit("/");
    expect(response.headers.get("location")).toBe(`${BASE}/sign-in`);
  });

  it("answers 401 to a signed-out API call", async () => {
    const response = visit("/api/sync");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Sign in first" });
  });

  it.each(["/sign-in", "/setup", "/api/health", "/api/cron/sync", "/dev/ui"])(
    "lets %s through signed out",
    (path) => {
      const response = visit(path);
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    },
  );

  it("lets a visit with a session cookie through and keeps the cookie for 30 more days", () => {
    const response = visit("/budgets", "a-token");
    expect(response).toBeInstanceOf(NextResponse);
    if (!(response instanceof NextResponse)) return;
    expect(response.status).toBe(200);
    const cookie = response.cookies.get(SESSION_COOKIE);
    expect(cookie).toMatchObject({ value: "a-token", httpOnly: true, sameSite: "lax", path: "/" });
    expect(cookie?.maxAge).toBe(30 * 24 * 60 * 60);
  });
});
