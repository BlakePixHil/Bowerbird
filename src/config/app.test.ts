import { describe, expect, it } from "vitest";
import { APP_NAME, APP_SHORT_NAME, DEFAULT_TIMEZONE } from "./app";

describe("app config", () => {
  it("names the app Bowerbird", () => {
    expect(APP_NAME).toBe("Bowerbird");
    expect(APP_SHORT_NAME).toBe("Bowerbird");
  });

  it("defaults to Sydney time", () => {
    expect(DEFAULT_TIMEZONE).toBe("Australia/Sydney");
  });
});
