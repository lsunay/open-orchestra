import { createMemo, createSignal, For, Show } from "solid-js";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ToolPermissions } from "@/types/agent";

const FILESYSTEM_OPTIONS = ["", "full", "read", "none"] as const;
const EXECUTION_OPTIONS = ["", "full", "sandboxed", "none"] as const;
const NETWORK_OPTIONS = ["", "full", "localhost", "none"] as const;

const formatPaths = (paths?: string[]) => (paths ?? []).join("\n");
const parsePaths = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

type PermissionCategory = NonNullable<ToolPermissions["categories"]>;

export function PermissionsConfig(props: { value: ToolPermissions; onChange: (v: ToolPermissions) => void }) {
  const categories = createMemo(() => props.value.categories ?? {});
  const skillPermissions = createMemo(() => props.value.skill ?? {});
  const categoryOptions: Record<keyof PermissionCategory, readonly string[]> = {
    filesystem: FILESYSTEM_OPTIONS,
    execution: EXECUTION_OPTIONS,
    network: NETWORK_OPTIONS,
  };
  const [newPattern, setNewPattern] = createSignal("");
  const [newMode, setNewMode] = createSignal<"allow" | "ask" | "deny">("allow");

  const updateCategory = (key: keyof PermissionCategory, value: string) => {
    const isValid = categoryOptions[key].includes(value);
    const nextValue = isValid && value ? (value as PermissionCategory[typeof key]) : undefined;
    props.onChange({
      ...props.value,
      categories: {
        ...(props.value.categories ?? {}),
        [key]: nextValue,
      },
    });
  };

  const updatePaths = (key: "allowed" | "denied", value: string) => {
    const parsed = parsePaths(value);
    props.onChange({
      ...props.value,
      paths: {
        ...(props.value.paths ?? {}),
        [key]: parsed.length ? parsed : undefined,
      },
    });
  };

  const updateSkillPermission = (pattern: string, value: "allow" | "ask" | "deny") => {
    const next = {
      ...(props.value.skill ?? {}),
      [pattern]: value,
    };
    props.onChange({ ...props.value, skill: next });
  };

  const removeSkillPermission = (pattern: string) => {
    const next = { ...(props.value.skill ?? {}) };
    delete next[pattern];
    props.onChange({ ...props.value, skill: Object.keys(next).length ? next : undefined });
  };

  const addSkillPermission = () => {
    const pattern = newPattern().trim();
    if (!pattern) return;
    updateSkillPermission(pattern, newMode());
    setNewPattern("");
    setNewMode("allow");
  };

  return (
    <div class="space-y-4">
      <div class="grid gap-3 md:grid-cols-3">
        <label class="flex flex-col gap-2 text-xs text-muted-foreground">
          <span class="font-medium text-foreground">Filesystem</span>
          <select
            class={cn(
              "flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            )}
            value={categories().filesystem ?? ""}
            onChange={(e) => updateCategory("filesystem", e.currentTarget.value)}
          >
            {FILESYSTEM_OPTIONS.map((option) => (
              <option value={option}>{option || "inherit"}</option>
            ))}
          </select>
        </label>

        <label class="flex flex-col gap-2 text-xs text-muted-foreground">
          <span class="font-medium text-foreground">Execution</span>
          <select
            class={cn(
              "flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            )}
            value={categories().execution ?? ""}
            onChange={(e) => updateCategory("execution", e.currentTarget.value)}
          >
            {EXECUTION_OPTIONS.map((option) => (
              <option value={option}>{option || "inherit"}</option>
            ))}
          </select>
        </label>

        <label class="flex flex-col gap-2 text-xs text-muted-foreground">
          <span class="font-medium text-foreground">Network</span>
          <select
            class={cn(
              "flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            )}
            value={categories().network ?? ""}
            onChange={(e) => updateCategory("network", e.currentTarget.value)}
          >
            {NETWORK_OPTIONS.map((option) => (
              <option value={option}>{option || "inherit"}</option>
            ))}
          </select>
        </label>
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <label class="flex flex-col gap-2 text-xs text-muted-foreground">
          <span class="font-medium text-foreground">Allowed Paths</span>
          <Textarea
            rows={4}
            value={formatPaths(props.value.paths?.allowed)}
            onInput={(e) => updatePaths("allowed", e.currentTarget.value)}
          />
        </label>

        <label class="flex flex-col gap-2 text-xs text-muted-foreground">
          <span class="font-medium text-foreground">Denied Paths</span>
          <Textarea
            rows={4}
            value={formatPaths(props.value.paths?.denied)}
            onInput={(e) => updatePaths("denied", e.currentTarget.value)}
          />
        </label>
      </div>

      <div class="rounded-md border border-border/60 p-3">
        <div class="flex items-center justify-between">
          <div class="text-xs font-medium text-foreground">Skill Permissions</div>
          <span class="text-[10px] text-muted-foreground">pattern → allow | ask | deny</span>
        </div>
        <div class="mt-3 space-y-2">
          <Show when={Object.keys(skillPermissions()).length > 0} fallback={<div class="text-xs text-muted-foreground">No skill overrides.</div>}>
            <For each={Object.entries(skillPermissions()).sort(([a], [b]) => a.localeCompare(b))}>
              {([pattern, value]) => (
                <div class="flex items-center gap-2">
                  <Input value={pattern} readOnly class="flex-1" />
                  <select
                    class={cn(
                      "flex h-9 rounded-md border border-input bg-background px-2 text-xs",
                      "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                    )}
                    value={value}
                    onChange={(e) => updateSkillPermission(pattern, e.currentTarget.value as "allow" | "ask" | "deny")}
                  >
                    <option value="allow">allow</option>
                    <option value="ask">ask</option>
                    <option value="deny">deny</option>
                  </select>
                  <Button variant="ghost" size="sm" onClick={() => removeSkillPermission(pattern)}>
                    Remove
                  </Button>
                </div>
              )}
            </For>
          </Show>

          <div class="flex items-center gap-2 pt-2 border-t border-border/60">
            <Input
              placeholder="pattern (e.g. docs-*)"
              value={newPattern()}
              onInput={(e) => setNewPattern(e.currentTarget.value)}
              class="flex-1"
            />
            <select
              class={cn(
                "flex h-9 rounded-md border border-input bg-background px-2 text-xs",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              )}
              value={newMode()}
              onChange={(e) => setNewMode(e.currentTarget.value as "allow" | "ask" | "deny")}
            >
              <option value="allow">allow</option>
              <option value="ask">ask</option>
              <option value="deny">deny</option>
            </select>
            <Button size="sm" onClick={addSkillPermission}>
              Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
