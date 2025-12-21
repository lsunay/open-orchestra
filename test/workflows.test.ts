import { describe, expect, test } from "bun:test";
import { registerWorkflow, runWorkflow } from "../src/workflows/engine";

registerWorkflow({
  id: "test-flow",
  name: "Test Flow",
  description: "Test workflow",
  steps: [
    {
      id: "step-one",
      title: "Step One",
      workerId: "coder",
      prompt: "Task:\n{task}",
      carry: true,
    },
    {
      id: "step-two",
      title: "Step Two",
      workerId: "architect",
      prompt: "Carry:\n{carry}",
      carry: true,
    },
  ],
});

const limits = {
  maxSteps: 4,
  maxTaskChars: 1000,
  maxCarryChars: 1000,
  perStepTimeoutMs: 10_000,
};

describe("workflow engine", () => {
  test("runs steps sequentially and carries output", async () => {
    const seenMessages: string[] = [];
    const result = await runWorkflow(
      { workflowId: "test-flow", task: "do the thing", limits },
      {
        resolveWorker: async (workerId) => workerId,
        sendToWorker: async (_workerId, message) => {
          seenMessages.push(message);
          return { success: true, response: `response-${seenMessages.length}` };
        },
      }
    );

    expect(result.steps.length).toBe(2);
    expect(result.steps[0]?.status).toBe("success");
    expect(result.steps[1]?.status).toBe("success");
    expect(seenMessages[1]).toContain("### Step One");
    expect(seenMessages[1]).toContain("response-1");
  });

  test("enforces task length limits", async () => {
    const longTask = "x".repeat(2000);
    await expect(
      runWorkflow(
        { workflowId: "test-flow", task: longTask, limits },
        {
          resolveWorker: async (workerId) => workerId,
          sendToWorker: async () => ({ success: true, response: "ok" }),
        }
      )
    ).rejects.toThrow("maxTaskChars");
  });
});
