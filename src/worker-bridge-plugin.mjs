import { tool } from "@opencode-ai/plugin";

function getBridgeConfig() {
  const url = process.env.OPENCODE_ORCH_BRIDGE_URL;
  const token = process.env.OPENCODE_ORCH_BRIDGE_TOKEN;
  const workerId = process.env.OPENCODE_ORCH_WORKER_ID;
  return { url, token, workerId };
}

async function postJson(path, body) {
  const { url, token } = getBridgeConfig();
  if (!url || !token) throw new Error("Missing orchestrator bridge env (OPENCODE_ORCH_BRIDGE_URL/OPENCODE_ORCH_BRIDGE_TOKEN)");
  const res = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bridge error ${res.status}: ${text || res.statusText}`);
  }
  return await res.json().catch(() => ({}));
}

async function getJson(path) {
  const { url, token } = getBridgeConfig();
  if (!url || !token) throw new Error("Missing orchestrator bridge env (OPENCODE_ORCH_BRIDGE_URL/OPENCODE_ORCH_BRIDGE_TOKEN)");
  const res = await fetch(`${url}${path}`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bridge error ${res.status}: ${text || res.statusText}`);
  }
  return await res.json().catch(() => ({}));
}

export const WorkerBridgePlugin = async () => {
  const messageTool = tool({
    description:
      "Send a report or inter-agent message back to the orchestrator. Use this at the END of your turn to provide a detailed report (summary, details, issues).",
    args: {
      kind: tool.schema.enum(["report", "message"]).describe("Whether this is a final report or a message to another agent"),
      jobId: tool.schema.string().optional().describe("Optional orchestrator job ID (if provided by the orchestrator)"),
      to: tool.schema.string().optional().describe("Recipient for kind=message (e.g. 'orchestrator' or another worker id)"),
      topic: tool.schema.string().optional().describe("Optional topic for kind=message"),
      text: tool.schema.string().describe("The full text content (final report or message)"),
      summary: tool.schema.string().optional().describe("Short summary (recommended for kind=report)"),
      details: tool.schema.string().optional().describe("More detailed writeup (recommended for kind=report)"),
      issues: tool.schema.array(tool.schema.string()).optional().describe("Issues encountered (recommended for kind=report)"),
    },
    async execute(args) {
      const { workerId } = getBridgeConfig();
      if (!workerId) return "Missing OPENCODE_ORCH_WORKER_ID; cannot attribute message.";

      if (args.kind === "message") {
        const to = args.to ?? "orchestrator";
        await postJson("/v1/message", { from: workerId, to, topic: args.topic, text: args.text });
        return `Message delivered to "${to}".`;
      }

      await postJson("/v1/report", {
        workerId,
        jobId: args.jobId,
        final: args.text,
        report: { summary: args.summary, details: args.details, issues: args.issues },
      });
      return "Report delivered to orchestrator.";
    },
  });

  const inboxTool = tool({
    description: "Fetch your inbox messages from the orchestrator message bus (for inter-agent communication).",
    args: {
      after: tool.schema.number().optional().describe("Only return messages after this unix-ms timestamp"),
      limit: tool.schema.number().optional().describe("Max messages to return (default: 20)"),
    },
    async execute(args) {
      const { workerId } = getBridgeConfig();
      if (!workerId) return "Missing OPENCODE_ORCH_WORKER_ID; cannot fetch inbox.";
      const after = typeof args.after === "number" ? args.after : 0;
      const limit = typeof args.limit === "number" ? args.limit : 20;
      const res = await getJson(`/v1/inbox?to=${encodeURIComponent(workerId)}&after=${encodeURIComponent(String(after))}&limit=${encodeURIComponent(String(limit))}`);
      return JSON.stringify(res.messages ?? [], null, 2);
    },
  });

  return {
    tool: {
      message_tool: messageTool,
      worker_inbox: inboxTool,
    },
  };
};

export default WorkerBridgePlugin;

