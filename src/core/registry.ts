/**
 * Worker Registry - Manages all spawned worker instances
 */

import type { WorkerInstance, Registry, WorkerStatus } from "../types";

type SummaryOptions = {
  maxWorkers?: number;
};

export class WorkerRegistry implements Registry {
  workers: Map<string, WorkerInstance> = new Map();
  private listeners: Map<string, Set<(instance: WorkerInstance) => void>> = new Map();

  /**
   * Register a new worker instance
   */
  register(instance: WorkerInstance): void {
    this.workers.set(instance.profile.id, instance);
    this.emit("registered", instance);
  }

  /**
   * Unregister a worker
   */
  unregister(id: string): boolean {
    const instance = this.workers.get(id);
    if (instance) {
      this.workers.delete(id);
      this.emit("unregistered", instance);
      return true;
    }
    return false;
  }

  /**
   * Get a worker by ID
   */
  getWorker(id: string): WorkerInstance | undefined {
    return this.workers.get(id);
  }

  /**
   * Get all workers that match a capability (checks purpose field)
   */
  getWorkersByCapability(capability: string): WorkerInstance[] {
    const lowerCap = capability.toLowerCase();
    return Array.from(this.workers.values()).filter(
      (w) =>
        w.profile.purpose.toLowerCase().includes(lowerCap) ||
        w.profile.whenToUse.toLowerCase().includes(lowerCap) ||
        w.profile.id.toLowerCase().includes(lowerCap) ||
        (w.profile.tags?.some((t) => t.toLowerCase().includes(lowerCap)) ?? false)
    );
  }

  /**
   * Get workers by status
   */
  getWorkersByStatus(status: WorkerStatus): WorkerInstance[] {
    return Array.from(this.workers.values()).filter((w) => w.status === status);
  }

  /**
   * Get all active (ready or busy) workers
   */
  getActiveWorkers(): WorkerInstance[] {
    return Array.from(this.workers.values()).filter(
      (w) => w.status === "ready" || w.status === "busy"
    );
  }

  /**
   * Get workers that support vision
   */
  getVisionWorkers(): WorkerInstance[] {
    return Array.from(this.workers.values()).filter(
      (w) => w.profile.supportsVision && (w.status === "ready" || w.status === "busy")
    );
  }

  /**
   * Update worker status
   */
  updateStatus(id: string, status: WorkerStatus, error?: string): void {
    const instance = this.workers.get(id);
    if (instance) {
      instance.status = status;
      instance.lastActivity = new Date();
      if (error) instance.error = error;
      this.emit("updated", instance);
    }
  }

  /**
   * Get a summary of the registry for injection into worker context
   */
  getSummary(options: SummaryOptions = {}): string {
    const maxWorkers = options.maxWorkers ?? 12;
    const workers = Array.from(this.workers.values())
      .sort((a, b) => a.profile.id.localeCompare(b.profile.id))
      .slice(0, Math.max(0, maxWorkers));
    if (workers.length === 0) {
      return "No workers currently registered.";
    }

    const total = this.workers.size;
    const lines = ["## Available Workers", ""];
    if (total > workers.length) {
      lines.push(`(showing ${workers.length} of ${total})`, "");
    }
    for (const w of workers) {
      const status = w.status === "ready" ? "available" : w.status;
      lines.push(`### ${w.profile.name} (${w.profile.id})`);
      lines.push(`- **Status**: ${status}`);
      lines.push(`- **Model**: ${w.profile.model}`);
      lines.push(`- **Purpose**: ${w.profile.purpose}`);
      lines.push(`- **When to use**: ${w.profile.whenToUse}`);
      if (w.profile.supportsVision) lines.push(`- **Supports Vision**: Yes`);
      if (w.profile.supportsWeb) lines.push(`- **Supports Web**: Yes`);
      lines.push(`- **Port**: ${w.port}`);
      lines.push("");
    }

    lines.push("## How to Use Workers");
    lines.push("Use the `ask_worker` tool to send messages to any worker by their ID.");
    lines.push("Example: ask_worker({ workerId: 'vision', message: 'Describe this image', attachments: [...] })");
    lines.push("");

    return lines.join("\n");
  }

  /**
   * Get registry as JSON (for tools/API)
   */
  toJSON(): Record<string, unknown>[] {
    return Array.from(this.workers.values()).map((w) => ({
      id: w.profile.id,
      name: w.profile.name,
      model: w.profile.model,
      purpose: w.profile.purpose,
      whenToUse: w.profile.whenToUse,
      status: w.status,
      port: w.port,
      pid: w.pid,
      serverUrl: w.serverUrl,
      supportsVision: w.profile.supportsVision ?? false,
      supportsWeb: w.profile.supportsWeb ?? false,
      lastActivity: w.lastActivity?.toISOString(),
      currentTask: w.currentTask,
      warning: w.warning,
      lastResult: w.lastResult
        ? {
            at: w.lastResult.at.toISOString(),
            jobId: w.lastResult.jobId,
            durationMs: w.lastResult.durationMs,
            response: w.lastResult.response,
            report: w.lastResult.report,
          }
        : undefined,
    }));
  }

  /**
   * Event handling
   */
  on(event: string, callback: (instance: WorkerInstance) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (instance: WorkerInstance) => void): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, instance: WorkerInstance): void {
    this.listeners.get(event)?.forEach((cb) => cb(instance));
  }
}

// Singleton instance
export const registry = new WorkerRegistry();
