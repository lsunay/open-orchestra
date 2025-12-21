import { describe, expect, test } from "bun:test";
import { registry } from "../src/core/registry";
import type { WorkerInstance } from "../src/types";

describe("registry ownership", () => {
  test("tracks and clears session ownership", () => {
    const worker: WorkerInstance = {
      profile: {
        id: "worker-a",
        name: "Worker A",
        model: "node",
        purpose: "test",
        whenToUse: "test",
      },
      status: "ready",
      port: 0,
      startedAt: new Date(),
    };

    registry.register(worker);
    registry.trackOwnership("session-1", worker.profile.id);

    expect(registry.getWorkersForSession("session-1")).toContain("worker-a");

    registry.unregister(worker.profile.id);
    expect(registry.getWorkersForSession("session-1")).not.toContain("worker-a");

    registry.trackOwnership("session-1", "worker-a");
    registry.clearSessionOwnership("session-1");
    expect(registry.getWorkersForSession("session-1")).toEqual([]);
  });
});
