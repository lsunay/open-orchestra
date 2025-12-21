import { inspect } from "node:util";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
  at: number;
  level: LogLevel;
  message: string;
};

const entries: LogEntry[] = [];
let bufferSize = 200;
let debugEnabled = isEnvDebug();

function isEnvDebug(): boolean {
  const raw = String(process.env.OPENCODE_ORCH_DEBUG ?? "").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  try {
    return inspect(arg, { depth: 3, breakLength: 120 });
  } catch {
    return String(arg);
  }
}

function pushLog(level: LogLevel, message: string) {
  entries.push({ at: Date.now(), level, message });
  if (entries.length > bufferSize) {
    entries.splice(0, entries.length - bufferSize);
  }
}

function shouldEmit(level: LogLevel): boolean {
  if (level === "warn" || level === "error") return true;
  return debugEnabled;
}

function emit(level: LogLevel, args: unknown[]) {
  const message = args.map(formatArg).join(" ");
  pushLog(level, message);
  if (!shouldEmit(level)) return;
  if (level === "error") console.error(message);
  else if (level === "warn") console.warn(message);
  else console.log(message);
}

export function setLoggerConfig(input: { debug?: boolean; bufferSize?: number }) {
  if (typeof input.bufferSize === "number" && Number.isFinite(input.bufferSize) && input.bufferSize > 0) {
    bufferSize = Math.floor(input.bufferSize);
  }
  if (typeof input.debug === "boolean") {
    debugEnabled = input.debug || isEnvDebug();
  } else {
    debugEnabled = isEnvDebug();
  }
}

export function getLogBuffer(limit?: number): LogEntry[] {
  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    return entries.slice(-Math.floor(limit));
  }
  return [...entries];
}

export const logger = {
  debug: (...args: unknown[]) => emit("debug", args),
  info: (...args: unknown[]) => emit("info", args),
  warn: (...args: unknown[]) => emit("warn", args),
  error: (...args: unknown[]) => emit("error", args),
};
