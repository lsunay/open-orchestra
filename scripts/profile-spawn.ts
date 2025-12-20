import type { WorkerProfile } from "../src/types";
import { spawnWorkers } from "../src/workers/spawner";
import { shutdownAllWorkers } from "../src/core/runtime";
import { formatBytes, listOpencodeServeProcesses } from "../src/core/process-metrics";
import { parseArg, sleep, toNumber } from "../src/helpers/format";

const model = parseArg("model") ?? process.env.OPENCODE_ORCH_PROFILE_MODEL ?? "opencode/gpt-5-nano";
const profilesArg = parseArg("profiles");
const profiles = profilesArg
  ? profilesArg
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : ["docs"];

const parallel = (parseArg("parallel") ?? "false") === "true";
const durationMs = toNumber(parseArg("durationMs"), 20_000);
const intervalMs = toNumber(parseArg("intervalMs"), 1000);
const timeoutMs = toNumber(parseArg("timeoutMs"), 60_000);

const directory = process.cwd();

const workerProfiles: WorkerProfile[] = profiles.map((id) => ({
  id,
  name: `Profile ${id}`,
  model,
  purpose: "profiling",
  whenToUse: "profiling",
}));

const samples: Array<{ t: number; opencodeServe: { count: number; rssBytesTotal: number } }> = [];
const startedAt = Date.now();

const shutdown = async () => {
  await shutdownAllWorkers().catch(() => {});
};

process.once("SIGINT", () => {
  void shutdown().finally(() => process.exit(130));
});
process.once("SIGTERM", () => {
  void shutdown().finally(() => process.exit(143));
});

try {
  const spawnRes = await spawnWorkers(workerProfiles, {
    basePort: 0,
    timeout: timeoutMs,
    directory,
    sequential: !parallel,
  });

  const endAt = startedAt + durationMs;
  while (Date.now() < endAt) {
    const procs = await listOpencodeServeProcesses().catch(() => []);
    const rssBytesTotal = procs.reduce((sum, p) => sum + (p.rssBytes ?? 0), 0);
    samples.push({
      t: Date.now() - startedAt,
      opencodeServe: { count: procs.length, rssBytesTotal },
    });
    await sleep(intervalMs);
  }

  await shutdown();

  const last = samples[samples.length - 1];
  const out = {
    config: { model, profiles, parallel, durationMs, intervalMs, timeoutMs, directory },
    spawned: { succeeded: spawnRes.succeeded.map((w) => w.profile.id), failed: spawnRes.failed },
    summary: {
      finalOpencodeServeCount: last?.opencodeServe.count ?? 0,
      finalOpencodeServeRss: formatBytes(last?.opencodeServe.rssBytesTotal ?? 0),
    },
    samples,
  };

  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
} catch (e) {
  await shutdown().catch(() => {});
  throw e;
}

