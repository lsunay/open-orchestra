import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { logger } from "./logger";

function getUserConfigDir(): string {
  if (process.platform === "win32") {
    return process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  }
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    // EPERM means the process exists but we don't have permission to signal it.
    if (err && typeof err === "object" && "code" in err && (err as any).code === "EPERM") return true;
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

export function getWorkerProfileLockPath(profileId: string): string {
  return join(getUserConfigDir(), "opencode", "orchestrator-locks", `${sanitizeKey(profileId)}.lock.json`);
}

type LockFile = { pid: number; createdAt: number; updatedAt: number; key: string };

async function readLockFile(path: string): Promise<LockFile | undefined> {
  if (!existsSync(path)) return undefined;
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as Partial<LockFile>;
    if (typeof raw.pid !== "number") return undefined;
    if (typeof raw.createdAt !== "number") return undefined;
    if (typeof raw.updatedAt !== "number") return undefined;
    if (typeof raw.key !== "string") return undefined;
    return raw as LockFile;
  } catch {
    return undefined;
  }
}

async function writeLockFileAtomic(path: string, file: LockFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true }).catch(() => {});
  const tmp = join(tmpdir(), `opencode-orch-lock-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  await writeFile(tmp, JSON.stringify(file, null, 2), "utf8");
  await rename(tmp, path).catch(async () => {
    // Fallback for cross-device rename issues.
    await writeFile(path, JSON.stringify(file, null, 2), "utf8");
    await unlink(tmp).catch(() => {});
  });
}

export async function withWorkerProfileLock<T>(
  profileId: string,
  options: { timeoutMs?: number; pollMs?: number } | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const lockPath = getWorkerProfileLockPath(profileId);
  const timeoutMs = options?.timeoutMs ?? 45_000;
  const maxAgeMs = Math.max(timeoutMs, 60_000);
  const pollMs = options?.pollMs ?? 75;
  const started = Date.now();
  let attempts = 0;

  logger.debug(`[profile-lock] Acquiring lock for "${profileId}", pid=${process.pid}, timeoutMs=${timeoutMs}`);

  while (true) {
    attempts++;
    // Attempt to acquire by creating a fresh lockfile. We don't rely on OS file locks for portability.
    const now = Date.now();
    const existing = await readLockFile(lockPath);

    if (!existing || !isProcessAlive(existing.pid) || now - existing.createdAt > maxAgeMs) {
      logger.debug(
        `[profile-lock] Lock available for "${profileId}" (existing=${!!existing}, alive=${existing ? isProcessAlive(existing.pid) : "n/a"}), attempt=${attempts}`
      );
      await unlink(lockPath).catch(() => {});
      const next: LockFile = { pid: process.pid, createdAt: now, updatedAt: now, key: profileId };
      await writeLockFileAtomic(lockPath, next);

      // Confirm we own it (last-writer wins if multiple raced to "acquire").
      const confirm = await readLockFile(lockPath);
      if (confirm?.pid === process.pid) {
        logger.debug(
          `[profile-lock] Lock ACQUIRED for "${profileId}", pid=${process.pid}, attempts=${attempts}, elapsed=${Date.now() - started}ms`
        );
        break;
      } else {
        logger.debug(
          `[profile-lock] Lock RACE LOST for "${profileId}", winner pid=${confirm?.pid}, our pid=${process.pid}`
        );
      }
    } else {
      if (now - started > timeoutMs) {
        logger.debug(
          `[profile-lock] Lock TIMEOUT for "${profileId}", held by pid=${existing.pid}, attempts=${attempts}`
        );
        throw new Error(`Timed out waiting for worker profile lock "${profileId}" (held by pid ${existing.pid})`);
      }
      if (attempts % 20 === 0) {
        // Log every 20 attempts (~1.5 seconds)
        logger.debug(
          `[profile-lock] Waiting for lock "${profileId}", held by pid=${existing.pid}, attempts=${attempts}, elapsed=${Date.now() - started}ms`
        );
      }
      await sleep(pollMs);
    }
  }

  try {
    return await fn();
  } finally {
    const cur = await readLockFile(lockPath).catch(() => undefined);
    if (cur?.pid === process.pid) {
      logger.debug(`[profile-lock] Lock RELEASED for "${profileId}", pid=${process.pid}`);
      await unlink(lockPath).catch(() => {});
    } else {
      logger.debug(
        `[profile-lock] Lock NOT released for "${profileId}" - not owner (cur pid=${cur?.pid}, our pid=${process.pid})`
      );
    }
  }
}
