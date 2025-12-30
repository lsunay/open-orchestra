import { tool, type ToolDefinition } from "@opencode-ai/plugin";
import type { OrchestratorContext } from "../context/orchestrator-context";
import { getOrchestratorContext } from "./state";
import { renderMarkdownTable } from "./markdown";
import {
  listSkills,
  loadSkillConfig,
  resolveSkillPermission,
  resolveSkillPermissionMap,
  resolveSkillToolEnabled,
  validateSkills,
} from "../skills/preflight";

type SkillTools = {
  listSkillsTool: ToolDefinition;
  validateSkillsTool: ToolDefinition;
};

export function createSkillTools(context: OrchestratorContext): SkillTools {
  const listSkillsTool: ToolDefinition = tool({
    description: "List discoverable OpenCode skills (filesystem discovery + basic validation).",
    args: {
      format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
      includeGlobal: tool.schema.boolean().optional().describe("Include global skill locations (default: true)"),
    },
    async execute(args) {
      const format: "markdown" | "json" = args.format ?? context.defaultListFormat;
      const config = await loadSkillConfig(context);
      const permissionMap = resolveSkillPermissionMap(config);
      const toolEnabled = resolveSkillToolEnabled(config);
      const items = await listSkills({
        directory: context.directory,
        worktree: context.worktree,
        includeGlobal: args.includeGlobal ?? true,
      });
      const rows = items.map((item) => ({
        ...item,
        permission: toolEnabled ? resolveSkillPermission(item.name, permissionMap) : "deny",
        status: toolEnabled ? item.status : "disabled",
      }));

      if (format === "json") return JSON.stringify(rows, null, 2);
      const table = rows.map((row) => [
        row.name,
        row.source ?? "unknown",
        row.status,
        row.permission ?? "-",
        row.path ?? "-",
      ]);
      return renderMarkdownTable(["Name", "Source", "Status", "Permission", "Path"], table);
    },
  });

  const validateSkillsTool: ToolDefinition = tool({
    description: "Validate required skills exist and are not denied by permission settings.",
    args: {
      skills: tool.schema.array(tool.schema.string()).describe("Skill names to validate"),
      includeGlobal: tool.schema.boolean().optional().describe("Include global skill locations (default: true)"),
      format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
    },
    async execute(args) {
      const config = await loadSkillConfig(context);
      const permissionMap = resolveSkillPermissionMap(config);
      const toolEnabled = resolveSkillToolEnabled(config);
      const result = await validateSkills({
        requiredSkills: args.skills,
        directory: context.directory,
        worktree: context.worktree,
        includeGlobal: args.includeGlobal ?? true,
        permissionMap,
        toolEnabled,
      });

      const format: "markdown" | "json" = args.format ?? context.defaultListFormat;
      if (format === "json") return JSON.stringify(result, null, 2);

      if (result.skills.length === 0) return "No skills requested.";
      const rows = result.skills.map((skill) => [
        skill.name,
        skill.status,
        skill.permission ?? "-",
        skill.source ?? "-",
        skill.path ?? "-",
      ]);
      const table = renderMarkdownTable(["Skill", "Status", "Permission", "Source", "Path"], rows);
      if (result.ok) return `${table}\n\nAll required skills are available.`;
      return `${table}\n\nMissing or denied skills:\n- ${result.errors.join("\n- ")}`;
    },
  });

  return { listSkillsTool, validateSkillsTool };
}
const defaultTools = createSkillTools(getOrchestratorContext());
export const listSkillsTool: ToolDefinition = defaultTools.listSkillsTool;
export const validateSkillsTool: ToolDefinition = defaultTools.validateSkillsTool;
