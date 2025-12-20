import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

function runLockChild(input: { xdgConfigHome: string; profileId: string; holdMs: number }) {
  return new Promise<{ pid: number; profileId: string; lockedAt: number; releasedAt: number }>((resolve, reject) => {
    const child = spawn("bun", ["test/helpers/lock-child.ts"], {
      env: {
        ...process.env,
        XDG_CONFIG_HOME: input.xdgConfigHome,
        LOCK_PROFILE_ID: input.profileId,
        LOCK_HOLD_MS: String(input.holdMs),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`child exited ${code}: ${stderr || stdout}`));
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (e) {
        reject(new Error(`failed to parse child output: ${stdout}\n${stderr}\n${e}`));
      }
    });
  });
}

describe("profile lock", () => {
  test(
    "serializes concurrent acquires across processes",
    async () => {
    const xdg = await mkdtemp(join(tmpdir(), "opencode-orch-lock-"));
    const profileId = "docs";

    // Start child A; start child B shortly after. B should only enter after A releases.
    const aP = runLockChild({ xdgConfigHome: xdg, profileId, holdMs: 350 });
    await new Promise((r) => setTimeout(r, 40));
    const bP = runLockChild({ xdgConfigHome: xdg, profileId, holdMs: 50 });

    const [a, b] = await Promise.all([aP, bP]);
    expect(a.profileId).toBe(profileId);
    expect(b.profileId).toBe(profileId);
    expect(b.lockedAt).toBeGreaterThanOrEqual(a.releasedAt);
    },
    30_000
  );
});
