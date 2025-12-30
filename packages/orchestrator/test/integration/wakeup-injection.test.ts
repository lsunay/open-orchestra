import { describe, expect, test } from "bun:test";
import { builtInProfiles } from "../../src/config/profiles";
import { createOrchestratorContext } from "../../src/context/orchestrator-context";
import { injectSessionNotice } from "../../src/ux/wakeup";
import type { OrchestratorConfig } from "../../src/types";

const baseConfig: OrchestratorConfig = {
  basePort: 14096,
  autoSpawn: false,
  startupTimeout: 30000,
  healthCheckInterval: 30000,
  profiles: builtInProfiles,
  spawn: [],
  ui: { wakeupInjection: true },
};

describe("wakeup injection", () => {
  test("injects no-reply notices when enabled", async () => {
    const prompts: any[] = [];
    const client = {
      session: {
        prompt: async (args: any) => {
          prompts.push(args);
          return { data: true };
        },
      },
    };

    const context = createOrchestratorContext({
      directory: "/tmp",
      projectId: "project-1",
      config: baseConfig,
      client: client as any,
    });

    await injectSessionNotice(context, "session-1", "hello");

    expect(prompts.length).toBe(1);
    expect(prompts[0]?.body?.noReply).toBe(true);
    expect(prompts[0]?.body?.parts?.[0]?.text).toBe("hello");
  });

  test("does not inject when disabled", async () => {
    const prompts: any[] = [];
    const client = {
      session: {
        prompt: async (args: any) => {
          prompts.push(args);
          return { data: true };
        },
      },
    };

    const context = createOrchestratorContext({
      directory: "/tmp",
      projectId: "project-1",
      config: { ...baseConfig, ui: { wakeupInjection: false } },
      client: client as any,
    });

    await injectSessionNotice(context, "session-1", "hello");

    expect(prompts.length).toBe(0);
  });
});
