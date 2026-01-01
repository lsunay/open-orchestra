import { describe, expect, test } from "bun:test";
import type { Config, Provider } from "@opencode-ai/sdk";
import type { WorkerProfile } from "../../src/types";
import { hydrateProfileModelsFromOpencode } from "../../src/models/hydrate";

const makeProvider = (input: {
  id: string;
  source: Provider["source"];
  models?: Record<string, unknown>;
  key?: string;
}): Provider => {
  return {
    id: input.id,
    source: input.source,
    models: input.models ?? {},
    key: input.key,
  } as Provider;
};

const createClient = (input: {
  config?: Config;
  providersConfig?: Provider[];
  providersList?: Provider[];
}) => {
  return {
    config: {
      get: async () => ({ data: input.config }),
      providers: async () => ({
        data: { providers: input.providersConfig ?? [], default: {} },
      }),
      model: async () => ({ data: {} }),
    },
    provider: {
      list: async () => ({ data: { providers: input.providersList ?? [] } }),
    },
  };
};

describe("hydrateProfileModelsFromOpencode", () => {
  test("uses configured providers for node:fast tags", async () => {
    const configured = makeProvider({
      id: "cfg",
      source: "config",
      models: { "fast-small": { name: "fast-small" } },
    });
    const api = makeProvider({
      id: "api",
      source: "api",
      key: "token",
      models: { "fast-ultra": { name: "fast-ultra" } },
    });

    const client = createClient({
      config: { model: "cfg/fast-small" } as Config,
      providersConfig: [configured],
      providersList: [configured, api],
    });

    const profiles: Record<string, WorkerProfile> = {
      fast: {
        id: "fast",
        name: "Fast",
        model: "node:fast",
        purpose: "Test",
        whenToUse: "Test",
      },
    };

    const result = await hydrateProfileModelsFromOpencode({
      client,
      directory: process.cwd(),
      profiles,
    });

    expect(result.profiles.fast.model).toBe("cfg/fast-small");
  });

  test("accepts explicit api provider models", async () => {
    const configured = makeProvider({
      id: "cfg",
      source: "config",
      models: { "fast-small": { name: "fast-small" } },
    });
    const api = makeProvider({
      id: "api",
      source: "api",
      key: "token",
      models: { "fast-ultra": { name: "fast-ultra" } },
    });

    const client = createClient({
      config: { model: "cfg/fast-small" } as Config,
      providersConfig: [configured],
      providersList: [configured, api],
    });

    const profiles: Record<string, WorkerProfile> = {
      fast: {
        id: "fast",
        name: "Fast",
        model: "api/fast-ultra",
        purpose: "Test",
        whenToUse: "Test",
      },
    };

    const result = await hydrateProfileModelsFromOpencode({
      client,
      directory: process.cwd(),
      profiles,
    });

    expect(result.profiles.fast.model).toBe("api/fast-ultra");
  });
});
