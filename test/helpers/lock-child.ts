import { withWorkerProfileLock } from "../../src/core/profile-lock";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const profileId = process.env.LOCK_PROFILE_ID ?? "test";
const holdMs = Number(process.env.LOCK_HOLD_MS ?? "250");

let lockedAt = 0;
let releasedAt = 0;

await withWorkerProfileLock(profileId, { timeoutMs: 10_000, pollMs: 25 }, async () => {
  lockedAt = Date.now();
  await sleep(holdMs);
  releasedAt = Date.now();
});

process.stdout.write(JSON.stringify({ pid: process.pid, profileId, lockedAt, releasedAt }) + "\n");

