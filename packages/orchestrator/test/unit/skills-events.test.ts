import { describe, expect, test } from "bun:test";
import {
  buildSkillCompletedPayload,
  buildSkillPermissionPayload,
  buildSkillRequestedPayload,
} from "../../src/skills/events";

describe("skills event payloads", () => {
  test("builds requested payload with worker + workflow context", () => {
    const payload = buildSkillRequestedPayload({
      sessionId: "session-1",
      callId: "call-1",
      args: { name: "docs-research" },
      context: {
        workerId: "docs",
        workerKind: "subagent",
        workflowRunId: "run-1",
        workflowStepId: "step-1",
        source: "in-process",
      },
      timestamp: 1700000000000,
    });

    expect(payload.skillName).toBe("docs-research");
    expect(payload.worker?.id).toBe("docs");
    expect(payload.worker?.kind).toBe("subagent");
    expect(payload.workflow?.runId).toBe("run-1");
    expect(payload.workflow?.stepId).toBe("step-1");
    expect(payload.source).toBe("in-process");
  });

  test("builds completed payload with output bytes + metadata", () => {
    const payload = buildSkillCompletedPayload({
      sessionId: "session-1",
      callId: "call-1",
      args: { name: "docs-research" },
      status: "success",
      durationMs: 1200,
      output: "hello",
      metadata: { ok: true },
    });

    expect(payload.status).toBe("success");
    expect(payload.outputBytes).toBe(5);
    expect(payload.metadata?.ok).toBe(true);
  });

  test("builds permission payload with status", () => {
    const payload = buildSkillPermissionPayload({
      sessionId: "session-1",
      permissionId: "perm-1",
      callId: "call-1",
      status: "deny",
      pattern: "docs-*",
      skillName: "docs-research",
      context: { workerId: "docs", workerKind: "agent", source: "server" },
      timestamp: 1700000001000,
    });

    expect(payload.status).toBe("deny");
    expect(payload.pattern).toBe("docs-*");
    expect(payload.worker?.kind).toBe("agent");
    expect(payload.source).toBe("server");
  });
});
