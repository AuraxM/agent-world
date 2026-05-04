import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("createLogger", () => {
  it("returns an object with info, warn, error methods", async () => {
    const { createLogger } = await import("./logger");
    const log = createLogger("test");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });

  it("does not throw when calling any method", async () => {
    const { createLogger } = await import("./logger");
    const log = createLogger("test");
    expect(() => log.info("hello")).not.toThrow();
    expect(() => log.warn("warning")).not.toThrow();
    expect(() => log.error("error")).not.toThrow();
  });

  it("accepts context objects", async () => {
    const { createLogger } = await import("./logger");
    const log = createLogger("test");
    expect(() =>
      log.info("msg", { key: "value", num: 42, bool: true }),
    ).not.toThrow();
  });

  it("suppresses info and warn when LOG_LEVEL=error", async () => {
    process.env.LOG_LEVEL = "error";
    const { createLogger, __resetConfigForTest } = await import("./logger");
    __resetConfigForTest();
    const consoleLogSpy = vi.spyOn(console, "log");
    const consoleWarnSpy = vi.spyOn(console, "warn");
    const consoleErrorSpy = vi.spyOn(console, "error");

    const log = createLogger("test");
    log.info("should not appear");
    log.warn("should not appear either");
    log.error("should appear");

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("disables console output when LOG_CONSOLE_ENABLED=false", async () => {
    process.env.LOG_CONSOLE_ENABLED = "false";
    const { createLogger, __resetConfigForTest } = await import("./logger");
    __resetConfigForTest();
    const consoleLogSpy = vi.spyOn(console, "log");
    const consoleErrorSpy = vi.spyOn(console, "error");

    const log = createLogger("test");
    log.info("hello");
    log.error("error");

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("formats context strings with quotes and numbers without", async () => {
    process.env.LOG_CONSOLE_ENABLED = "true";
    process.env.LOG_FILE_ENABLED = "false";
    const { createLogger, __resetConfigForTest } = await import("./logger");
    __resetConfigForTest();
    const consoleLogSpy = vi.spyOn(console, "log");

    const log = createLogger("test");
    log.info("test msg", { str: "hello", num: 42 });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const call = consoleLogSpy.mock.calls[0][0] as string;
    expect(call).toContain('str="hello"');
    expect(call).toContain("num=42");

    consoleLogSpy.mockRestore();
  });
});
