import type { OrchestratorContext } from "../context/orchestrator-context";
import { workerJobs } from "../core/jobs";
import { normalizeForMemory } from "../memory/text";
import { createMemoryTask, failMemoryTask, isMemoryTaskPending } from "../memory/tasks";
import { extractImages, formatVisionAnalysis, hasImages, replaceImagesWithAnalysis } from "../vision/analyzer";
import { getWorkflow } from "./engine";
import { resolveWorkflowLimits, runWorkflowWithContext } from "./runner";
import type { WorkflowRunResult } from "./types";

type ToastFn = (message: string, variant: "success" | "info" | "warning" | "error") => Promise<void>;
type WorkflowTriggerOptions = {
  visionTimeoutMs: number;
  processedMessageIds?: Set<string>;
  showToast?: ToastFn;
  runWorkflow?: (input: {
    workflowId: string;
    task: string;
    attachments?: any[];
    autoSpawn?: boolean;
    limits?: ReturnType<typeof resolveWorkflowLimits>;
  }, options?: { sessionId?: string }) => Promise<WorkflowRunResult>;
};

type TriggerConfig = {
  enabled?: boolean;
  workflowId?: string;
  autoSpawn?: boolean;
  blocking?: boolean;
};

function resolveTriggerConfig(overrides: TriggerConfig | undefined, defaults: TriggerConfig): Required<TriggerConfig> {
  const workflowId =
    typeof overrides?.workflowId === "string" && overrides.workflowId.trim().length > 0
      ? overrides.workflowId
      : defaults.workflowId ?? "unknown";
  return {
    enabled: overrides?.enabled ?? defaults.enabled ?? true,
    workflowId,
    autoSpawn: overrides?.autoSpawn ?? defaults.autoSpawn ?? true,
    blocking: overrides?.blocking ?? defaults.blocking ?? false,
  };
}

function extractTextFromParts(parts: any[]): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p) => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

function extractTextFromMessage(msg: any): string {
  if (!msg) return "";
  if (typeof msg.message === "string") return msg.message;
  if (typeof msg.content === "string") return msg.content;
  if (typeof msg.text === "string") return msg.text;
  const parts = Array.isArray(msg.parts) ? msg.parts : Array.isArray(msg.content?.parts) ? msg.content.parts : [];
  return extractTextFromParts(parts);
}

function extractSectionItems(text: string, headings: string[], limit = 6): string[] {
  const lines = text.split(/\r?\n/);
  const normalizedHeadings = headings.map((h) => h.toLowerCase());
  const items: string[] = [];
  let collecting = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (collecting) break;
      continue;
    }

    const lower = trimmed.toLowerCase();
    const headingIndex = normalizedHeadings.findIndex((h) => lower === h || lower.startsWith(`${h}:`));
    if (headingIndex >= 0) {
      collecting = true;
      const inline = trimmed.split(":").slice(1).join(":").trim();
      if (inline) {
        inline.split(/[;,]/).forEach((item) => {
          const cleaned = item.trim();
          if (cleaned) items.push(cleaned);
        });
      }
      continue;
    }

    if (!collecting) continue;

    if (/^[A-Za-z][A-Za-z\s-]{1,20}:\s*$/.test(trimmed)) break;

    const cleaned = trimmed.replace(/^[-*•]\s*/, "").trim();
    if (cleaned) items.push(cleaned);
  }

  const deduped = [...new Set(items)];
  return deduped.slice(0, limit);
}

function selectWorkflowWorker(context: OrchestratorContext, workflowId: string, fallback: string): string {
  const workflow = getWorkflow(workflowId);
  const workerId = workflow?.steps[0]?.workerId ?? fallback;
  if (context.profiles[workerId]) return workerId;
  return workflow?.steps[0]?.workerId ?? fallback;
}

function buildVisionPlaceholder(
  workerName: string,
  workerModel: string,
  jobId: string
): string {
  const workerInfo = `${workerName} (${workerModel})`;
  const awaitCall = `await_worker_job({ jobId: "${jobId}" })`;
  const boxWidth = Math.max(60, workerInfo.length + 12, jobId.length + 12, awaitCall.length + 4);
  const hr = "─".repeat(boxWidth - 2);
  const pad = (s: string) => s.padEnd(boxWidth - 4);

  return [
    `┌${hr}┐`,
    `│ 🖼  [VISION ANALYSIS PENDING]${" ".repeat(boxWidth - 34)}│`,
    `├${hr}┤`,
    `│ Worker: ${pad(workerInfo)}│`,
    `│ Job ID: ${pad(jobId)}│`,
    `├${hr}┤`,
    `│ ${pad("⏳ Analyzing image content...")}│`,
    `│ ${pad(awaitCall)}│`,
    `└${hr}┘`,
  ].join("\n");
}

async function injectOrchestratorNotice(
  context: OrchestratorContext,
  sessionId: string,
  text: string
): Promise<void> {
  if (!context.client?.session) return;
  try {
    await context.client.session.prompt({
      path: { id: sessionId },
      body: { noReply: true, parts: [{ type: "text", text }] as any },
      query: { directory: context.directory },
    } as any);
  } catch {
    // Ignore injection failures (session may have ended, etc.)
  }
}

function pickWorkflowResponse(result: WorkflowRunResult): { success: boolean; response?: string; error?: string } {
  const errorStep = result.steps.find((step) => step.status === "error");
  if (errorStep) {
    return { success: false, error: errorStep.error ?? "workflow step failed" };
  }
  const responseStep = [...result.steps].reverse().find((step) => typeof step.response === "string" && step.response.length > 0);
  if (!responseStep) {
    return { success: false, error: "workflow produced no response" };
  }
  return { success: true, response: responseStep.response };
}

export function createWorkflowTriggers(context: OrchestratorContext, options: WorkflowTriggerOptions) {
  const processedMessageIds = options.processedMessageIds ?? new Set<string>();
  const showToast = options.showToast ?? (async () => {});
  const runWorkflow = options.runWorkflow ?? ((input, runOptions) => runWorkflowWithContext(context, input, runOptions));

  const visionDefaults: TriggerConfig = { enabled: true, workflowId: "vision", autoSpawn: true, blocking: false };
  const memoryDefaults: TriggerConfig = { enabled: true, workflowId: "memory", autoSpawn: true, blocking: false };

  const handleVisionMessage = async (input: any, output: any): Promise<void> => {
    if (context.workflows?.enabled === false) return;
    const trigger = resolveTriggerConfig(context.workflows?.triggers?.visionOnImage, visionDefaults);
    if (!trigger.enabled) return;

    // CRITICAL: Use output.parts directly (like v0.2.3), NOT input.parts.
    // output.parts is what gets sent to the model - modifying it removes images from the prompt.
    // Using input.parts would extract from the wrong source and our modifications wouldn't take effect.
    const originalParts = Array.isArray(output.parts) ? output.parts : [];
    if (!hasImages(originalParts)) return;

    const messageId = typeof input.messageID === "string" ? input.messageID : undefined;
    if (messageId && processedMessageIds.has(messageId)) return;

    const agentId = typeof input.agent === "string" ? input.agent : undefined;
    const sessionId = typeof input.sessionID === "string" ? input.sessionID : undefined;
    if (!sessionId) return;
    const agentProfile = agentId ? context.profiles[agentId] : undefined;
    const agentSupportsVision = Boolean(agentProfile?.supportsVision) || agentId === "vision";
    if (agentSupportsVision) return;

    const alreadyInjected = originalParts.some(
      (p: any) => p?.type === "text" && typeof p.text === "string" && p.text.includes("[VISION ANALYSIS")
    );
    if (alreadyInjected) {
      if (messageId) processedMessageIds.add(messageId);
      return;
    }

    const workflowId = trigger.workflowId;
    if (!getWorkflow(workflowId)) return;

    const workerId = selectWorkflowWorker(context, workflowId, "vision");
    const workerProfile = context.profiles[workerId];

    const job = workerJobs.create({
      workerId,
      message: `workflow:${workflowId}`,
      sessionId,
      requestedBy: agentId,
    });
    if (messageId) processedMessageIds.add(messageId);

    // Inject placeholder immediately (like v0.2.3) so orchestrator can await the job
    const workerName = workerProfile?.name ?? "Vision Worker";
    const workerModel = workerProfile?.model ?? "vision model";
    const placeholder = buildVisionPlaceholder(workerName, workerModel, job.id);

    output.parts = replaceImagesWithAnalysis(originalParts, placeholder, {
      sessionID: sessionId,
      messageID: messageId,
    });

    const run = async () => {
      try {
        const attachments = await extractImages(originalParts);
        if (attachments.length === 0) {
          const error = "No valid image attachments found";
          workerJobs.setError(job.id, { error });

          // Inject wakeup message on error
          const wakeupMessage =
            `<orchestrator-internal kind="wakeup" workerId="${workerId}" reason="error" jobId="${job.id}">\n` +
            `[VISION ANALYSIS] ${error} (jobId: ${job.id}).\n` +
            `Check await_worker_job({ jobId: "${job.id}" }) for details.\n` +
            `</orchestrator-internal>`;
          void injectOrchestratorNotice(context, sessionId, wakeupMessage);
          await showToast(`Vision analysis failed: ${error}`, "warning");
          return;
        }

        const taskText = extractTextFromParts(originalParts) || "Analyze the attached image(s).";
        const limits = resolveWorkflowLimits(context, workflowId);
        const perStepTimeoutMs = Math.min(options.visionTimeoutMs, limits.perStepTimeoutMs);
        const result = await runWorkflow(
          {
            workflowId,
            task: taskText,
            attachments,
            autoSpawn: trigger.autoSpawn,
            limits: { ...limits, perStepTimeoutMs },
          },
          { sessionId }
        );

        const picked = pickWorkflowResponse(result);
        const analysisText = formatVisionAnalysis({
          success: picked.success,
          analysis: picked.response,
          error: picked.error,
          model: workerProfile?.model,
        });

        if (analysisText) {
          workerJobs.setResult(job.id, { responseText: analysisText });
        } else {
          workerJobs.setError(job.id, { error: picked.error ?? "Vision analysis failed" });
        }

        // Inject wakeup message when analysis completes (v0.2.3 behavior)
        const reason = picked.success ? "result_ready" : "error";
        const summary = picked.success ? "vision analysis complete" : (picked.error ?? "vision analysis failed");
        const wakeupMessage =
          `<orchestrator-internal kind="wakeup" workerId="${workerId}" reason="${reason}" jobId="${job.id}">\n` +
          `[VISION ANALYSIS] ${summary} (jobId: ${job.id}).\n` +
          `Check await_worker_job({ jobId: "${job.id}" }) for details.\n` +
          `</orchestrator-internal>`;
        void injectOrchestratorNotice(context, sessionId, wakeupMessage);

        if (!picked.success && picked.error) {
          await showToast(`Vision analysis failed: ${picked.error}`, "warning");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        workerJobs.setError(job.id, { error: msg });

        // Inject wakeup message on crash
        const wakeupMessage =
          `<orchestrator-internal kind="wakeup" workerId="${workerId}" reason="error" jobId="${job.id}">\n` +
          `[VISION ANALYSIS] ${msg} (jobId: ${job.id}).\n` +
          `Check await_worker_job({ jobId: "${job.id}" }) for details.\n` +
          `</orchestrator-internal>`;
        void injectOrchestratorNotice(context, sessionId, wakeupMessage);
        await showToast(`Vision analysis crashed: ${msg}`, "error");
      }
    };

    // Always run non-blocking - placeholder is injected synchronously above
    void run();
  };

  const handleMemoryTurnEnd = async (input: any, _output: any): Promise<void> => {
    if (context.workflows?.enabled === false) return;
    if (context.config.memory?.enabled === false || context.config.memory?.autoRecord === false) return;

    const trigger = resolveTriggerConfig(context.workflows?.triggers?.memoryOnTurnEnd, memoryDefaults);
    if (!trigger.enabled) return;

    if (!getWorkflow(trigger.workflowId)) return;

    const role = typeof input.role === "string" ? input.role : undefined;
    if (role !== "assistant") return;

    const agentId = typeof input.agent === "string" ? input.agent : undefined;
    const sessionId = typeof input.sessionID === "string" ? input.sessionID : undefined;
    if (!sessionId) return;
    const memoryWorkerId = selectWorkflowWorker(context, trigger.workflowId, "memory");
    if (agentId === memoryWorkerId) return;

    const text = extractTextFromMessage(input);
    if (!text) return;

    const summary = normalizeForMemory(text, context.config.memory?.maxChars ?? 2000);
    if (!summary) return;

    const decisions = extractSectionItems(text, ["decision", "decisions"]);
    const todos = extractSectionItems(text, ["todo", "todos", "action items", "next steps"]);
    const entities = extractSectionItems(text, ["entities", "entity", "people", "systems"]);

    const scope = (context.config.memory?.scope ?? "project") as "project" | "global";
    if (scope === "project" && !context.projectId) return;

    const payload = createMemoryTask({
      sessionId,
      projectId: context.projectId,
      scope,
      turn: {
        role,
        agent: agentId,
        messageId: typeof input.messageID === "string" ? input.messageID : undefined,
        summary,
        ...(decisions.length ? { decisions } : {}),
        ...(todos.length ? { todos } : {}),
        ...(entities.length ? { entities } : {}),
      },
    });

    const taskText = JSON.stringify(payload, null, 2);

    const run = async () => {
      try {
        const limits = resolveWorkflowLimits(context, trigger.workflowId);
        const result = await runWorkflow(
          {
            workflowId: trigger.workflowId,
            task: taskText,
            autoSpawn: trigger.autoSpawn,
            limits,
          },
          { sessionId }
        );

        const picked = pickWorkflowResponse(result);
        if (!picked.success && picked.error) {
          failMemoryTask(payload.taskId, picked.error);
          return;
        }

        if (isMemoryTaskPending(payload.taskId)) {
          // no-op
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failMemoryTask(payload.taskId, msg);
      }
    };

    if (trigger.blocking) {
      await run();
    } else {
      void run();
    }
  };

  return {
    handleVisionMessage,
    handleMemoryTurnEnd,
    processedMessageIds,
  };
}
