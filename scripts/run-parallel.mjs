#!/usr/bin/env node
/**
 * Run `pnpm --dir <subdir> dev` for each argument concurrently. Prefix output
 * with `[<subdir>]` in a unique color per child. Forward Ctrl-C / SIGTERM to
 * all children; if any child exits, kill the rest and propagate the exit code.
 *
 * Usage: node scripts/run-parallel.mjs <dir1> [<dir2> ...]
 */

import { spawn } from "node:child_process";
import process from "node:process";

export const COLORS = ["\x1b[36m", "\x1b[35m", "\x1b[33m", "\x1b[32m"];
const RESET = "\x1b[0m";

export function parseArgs(argv) {
  return argv.slice(2);
}

export function formatPrefix(name, index) {
  const color = COLORS[index % COLORS.length];
  return `${color}[${name}]${RESET} `;
}

function pipeWithPrefix(stream, sink, prefix) {
  let buf = "";
  stream.on("data", (chunk) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) sink.write(prefix + line + "\n");
  });
  stream.on("end", () => {
    if (buf) sink.write(prefix + buf + "\n");
  });
}

function main() {
  const dirs = parseArgs(process.argv);
  if (dirs.length === 0) {
    console.error("Usage: node scripts/run-parallel.mjs <dir1> [<dir2> ...]");
    process.exit(1);
  }

  const isWindows = process.platform === "win32";
  const pnpmCmd = isWindows ? "pnpm.cmd" : "pnpm";

  const procs = dirs.map((dir, i) => {
    const prefix = formatPrefix(dir, i);
    const child = spawn(pnpmCmd, ["--dir", dir, "dev"], {
      stdio: ["inherit", "pipe", "pipe"],
      shell: false,
    });
    pipeWithPrefix(child.stdout, process.stdout, prefix);
    pipeWithPrefix(child.stderr, process.stderr, prefix);
    return { dir, child };
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const { child } of procs) {
      if (!child.killed) child.kill(signal);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  let exitCode = 0;
  let remaining = procs.length;
  for (const { dir, child } of procs) {
    child.on("exit", (code, signal) => {
      remaining -= 1;
      const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
      console.log(`[run-parallel] ${dir} exited (${reason}); shutting down others...`);
      if (code != null && code !== 0) exitCode = code;
      if (!shuttingDown) shutdown("SIGTERM");
      if (remaining === 0) process.exit(exitCode);
    });
  }
}

// Only run main when invoked directly (not when imported by tests)
const invokedAsScript = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (invokedAsScript) {
  main();
}
