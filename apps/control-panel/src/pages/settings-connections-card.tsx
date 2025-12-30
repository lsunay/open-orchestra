import { type Component, createEffect, createMemo, createSignal, Show } from "solid-js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useOpenCode } from "@/context/opencode";
import {
  OPENCODE_BASE_OVERRIDES,
  getSkillsApiBase,
  resolveOpenCodeBase,
  resolveOrchestratorEventsUrl,
  resolveSkillsBase,
} from "@/lib/opencode-base";

const DEFAULT_OPEN_CODE = "http://localhost:4096";

type StatusState = "connected" | "checking" | "error" | "disabled";

type StatusInfo = {
  state: StatusState;
  message?: string;
};

const getStatusBadge = (status: StatusInfo) => {
  if (status.state === "connected") return <Badge variant="ready">Connected</Badge>;
  if (status.state === "checking") return <Badge variant="secondary">Checking</Badge>;
  if (status.state === "disabled") return <Badge variant="outline">Not configured</Badge>;
  return <Badge variant="error">Error</Badge>;
};

const readOverride = (key: string): string => {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(key) ?? "";
};

const writeOverride = (key: string, value: string) => {
  if (typeof window === "undefined") return;
  const trimmed = value.trim();
  if (!trimmed) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, trimmed);
};

const checkEndpoint = async (url: string, options?: { headers?: Record<string, string> }): Promise<StatusInfo> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: options?.headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok ? { state: "connected" } : { state: "error", message: `HTTP ${res.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect";
    return { state: "error", message };
  } finally {
    clearTimeout(timeout);
  }
};

export const SettingsConnectionsCard: Component = () => {
  const { connected } = useOpenCode();
  const [openCodeOverride, setOpenCodeOverride] = createSignal(readOverride(OPENCODE_BASE_OVERRIDES.openCodeBase));
  const [skillsOverride, setSkillsOverride] = createSignal(readOverride(OPENCODE_BASE_OVERRIDES.skillsBase));
  const [eventsOverride, setEventsOverride] = createSignal(readOverride(OPENCODE_BASE_OVERRIDES.eventsUrl));

  const [skillsStatus, setSkillsStatus] = createSignal<StatusInfo>({ state: "checking" });
  const [eventsStatus, setEventsStatus] = createSignal<StatusInfo>({ state: "checking" });

  const openCodeBase = createMemo(() => resolveOpenCodeBase() ?? DEFAULT_OPEN_CODE);
  const skillsBase = createMemo(() => getSkillsApiBase(resolveSkillsBase()));
  const eventsUrl = createMemo(() => resolveOrchestratorEventsUrl());

  const refreshSkillsStatus = async () => {
    const base = skillsBase();
    if (!base) {
      setSkillsStatus({ state: "disabled" });
      return;
    }
    setSkillsStatus({ state: "checking" });
    const status = await checkEndpoint(`${base}/api/skills`);
    setSkillsStatus(status);
  };

  const refreshEventsStatus = async () => {
    const url = eventsUrl();
    if (!url) {
      setEventsStatus({ state: "disabled" });
      return;
    }
    setEventsStatus({ state: "checking" });
    const status = await checkEndpoint(url, { headers: { Accept: "text/event-stream" } });
    setEventsStatus(status);
  };

  createEffect(() => {
    void refreshSkillsStatus();
  });

  createEffect(() => {
    void refreshEventsStatus();
  });

  const saveOverride = (key: string, value: string) => {
    writeOverride(key, value);
    window.location.reload();
  };

  const clearOverride = (key: string) => {
    writeOverride(key, "");
    window.location.reload();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connections</CardTitle>
        <CardDescription>Configure base URLs and verify connectivity for the desktop shell.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4 text-sm">
        <div class="rounded-md border border-border/60 p-4">
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium text-foreground">OpenCode API</div>
              <div class="text-xs text-muted-foreground">Sessions, chat, and agent runtime.</div>
            </div>
            {getStatusBadge({ state: connected() ? "connected" : "error" })}
          </div>
          <div class="mt-3 text-xs text-muted-foreground">
            Resolved: <span class="font-mono">{openCodeBase()}</span>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <Input
              class="flex-1"
              placeholder="Override OpenCode base URL"
              value={openCodeOverride()}
              onInput={(e) => setOpenCodeOverride(e.currentTarget.value)}
            />
            <Button size="sm" onClick={() => saveOverride(OPENCODE_BASE_OVERRIDES.openCodeBase, openCodeOverride())}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => clearOverride(OPENCODE_BASE_OVERRIDES.openCodeBase)}>
              Clear
            </Button>
          </div>
          <div class="mt-2 text-xs text-muted-foreground">If missing, sessions and chats will not load.</div>
        </div>

        <div class="rounded-md border border-border/60 p-4">
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium text-foreground">Skills / Agents API</div>
              <div class="text-xs text-muted-foreground">Agent profiles, preferences, and desktop DB.</div>
            </div>
            {getStatusBadge(skillsStatus())}
          </div>
          <div class="mt-3 text-xs text-muted-foreground">
            Resolved: <span class="font-mono">{skillsBase()}</span>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <Input
              class="flex-1"
              placeholder="Override skills API base URL"
              value={skillsOverride()}
              onInput={(e) => setSkillsOverride(e.currentTarget.value)}
            />
            <Button size="sm" onClick={() => saveOverride(OPENCODE_BASE_OVERRIDES.skillsBase, skillsOverride())}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => clearOverride(OPENCODE_BASE_OVERRIDES.skillsBase)}>
              Clear
            </Button>
            <Button variant="outline" size="sm" onClick={refreshSkillsStatus}>
              Recheck
            </Button>
          </div>
          <Show when={skillsStatus().message}>
            {(message) => <div class="mt-2 text-xs text-destructive">{message()}</div>}
          </Show>
          <div class="mt-2 text-xs text-muted-foreground">If missing, agent profiles and preferences are read-only.</div>
        </div>

        <div class="rounded-md border border-border/60 p-4">
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium text-foreground">Orchestrator Events</div>
              <div class="text-xs text-muted-foreground">Workflow, worker, and skill telemetry stream.</div>
            </div>
            {getStatusBadge(eventsStatus())}
          </div>
          <div class="mt-3 text-xs text-muted-foreground">
            Resolved: <span class="font-mono">{eventsUrl() ?? "Not configured"}</span>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <Input
              class="flex-1"
              placeholder="Override orchestrator events URL"
              value={eventsOverride()}
              onInput={(e) => setEventsOverride(e.currentTarget.value)}
            />
            <Button size="sm" onClick={() => saveOverride(OPENCODE_BASE_OVERRIDES.eventsUrl, eventsOverride())}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => clearOverride(OPENCODE_BASE_OVERRIDES.eventsUrl)}>
              Clear
            </Button>
            <Button variant="outline" size="sm" onClick={refreshEventsStatus}>
              Recheck
            </Button>
          </div>
          <Show when={eventsStatus().message}>
            {(message) => <div class="mt-2 text-xs text-destructive">{message()}</div>}
          </Show>
          <div class="mt-2 text-xs text-muted-foreground">If missing, workflow and skill telemetry is unavailable.</div>
        </div>
      </CardContent>
    </Card>
  );
};
