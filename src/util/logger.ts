import * as fs from "node:fs";
import * as path from "node:path";

type LogLevel = "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = { info: 0, warn: 1, error: 2 };

const COLORS: Record<LogLevel, string> = {
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

// ---- config ----

function readConfig() {
  const rawLevel = (process.env.LOG_LEVEL ?? "info") as LogLevel;
  if (!(rawLevel in LEVEL_PRIORITY)) throw new Error(`Invalid LOG_LEVEL: ${rawLevel}`);
  return {
    level: rawLevel,
    logDir: process.env.LOG_DIR ?? "data/logs",
    fileEnabled: process.env.LOG_FILE_ENABLED !== "false",
    consoleEnabled: process.env.LOG_CONSOLE_ENABLED !== "false",
    maxFileSizeBytes:
      (parseInt(process.env.LOG_FILE_MAX_SIZE_MB ?? "10", 10) || 10) * 1024 * 1024,
    retentionDays: parseInt(process.env.LOG_FILE_RETENTION_DAYS ?? "30", 10) || 30,
    consoleTimestamp: process.env.LOG_TIMESTAMP_IN_CONSOLE !== "false",
  };
}

const config = readConfig();

// ---- file stream state ----

let _stream: fs.WriteStream | null = null;
let _streamDay = "";
let _streamPath = "";
let _streamBytes = 0;
let _streamPart = 0;

function ensureDir() {
  if (!fs.existsSync(config.logDir)) {
    fs.mkdirSync(config.logDir, { recursive: true });
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function ts(): string {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

function timeShort(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function openStream(day: string): void {
  if (_stream) {
    _stream.end();
    _stream = null;
  }
  ensureDir();
  _streamDay = day;
  _streamPart = 0;
  _streamPath = path.join(config.logDir, `agent-world-${day}.log`);
  _stream = fs.createWriteStream(_streamPath, { flags: "a" });
  _streamBytes = fs.existsSync(_streamPath) ? fs.statSync(_streamPath).size : 0;
}

function getStream(): fs.WriteStream | null {
  if (!config.fileEnabled) return null;
  const day = today();
  if (day !== _streamDay || !_stream) {
    openStream(day);
  } else if (_streamBytes >= config.maxFileSizeBytes) {
    _streamPart++;
    _streamPath = path.join(
      config.logDir,
      `agent-world-${day}-${_streamPart + 1}.log`,
    );
    _stream.end();
    _stream = fs.createWriteStream(_streamPath, { flags: "a" });
    _streamBytes = 0;
  }
  return _stream;
}

function cleanupOldFiles(): void {
  if (!config.fileEnabled) return;
  ensureDir();
  const cutoff = Date.now() - config.retentionDays * 86400_000;
  let entries: string[];
  try { entries = fs.readdirSync(config.logDir); } catch { return; }
  for (const entry of entries) {
    if (!entry.startsWith("agent-world-") || !entry.endsWith(".log")) continue;
    const fullPath = path.join(config.logDir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(fullPath);
    }
  }
}

cleanupOldFiles();

// ---- format context ----

function formatContext(ctx?: Record<string, unknown>): string {
  if (!ctx || Object.keys(ctx).length === 0) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v === "string") parts.push(`${k}="${v}"`);
    else parts.push(`${k}=${v}`);
  }
  return " " + parts.join(" ");
}

// ---- flush on exit ----

function flush() {
  if (_stream) {
    _stream.end();
    _stream = null;
  }
}

process.on("exit", flush);
process.on("SIGINT", () => { flush(); process.exit(); });
process.on("SIGTERM", () => { flush(); process.exit(); });

// ---- public API ----

export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export function createLogger(component: string): Logger {
  function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[config.level]) return;

    const ctxStr = formatContext(context);

    if (config.consoleEnabled) {
      const prefix = config.consoleTimestamp ? `${timeShort()} ` : "";
      const levelTag = level.toUpperCase().padEnd(5);
      const line = `${prefix}${COLORS[level]}${BOLD}${levelTag}  [${component}]${RESET}  ${message}${ctxStr}`;
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.log(line);
    }

    const stream = getStream();
    if (stream) {
      const line = `${ts()} ${level.toUpperCase().padEnd(5)}  [${component}]  ${message}${ctxStr}\n`;
      stream.write(line);
      _streamBytes += Buffer.byteLength(line);
    }
  }

  return {
    info: (msg, ctx) => log("info", msg, ctx),
    warn: (msg, ctx) => log("warn", msg, ctx),
    error: (msg, ctx) => log("error", msg, ctx),
  };
}
