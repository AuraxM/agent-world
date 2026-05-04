import { describe, it, expect } from "vitest";
import { createLogger } from "./logger";

describe("createLogger", () => {
  it("returns an object with info, warn, error methods", () => {
    const log = createLogger("test");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });

  it("does not throw when calling any method", () => {
    const log = createLogger("test");
    expect(() => log.info("hello")).not.toThrow();
    expect(() => log.warn("warning")).not.toThrow();
    expect(() => log.error("error")).not.toThrow();
  });

  it("accepts context objects", () => {
    const log = createLogger("test");
    expect(() =>
      log.info("msg", { key: "value", num: 42, bool: true }),
    ).not.toThrow();
  });
});
