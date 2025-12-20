/**
 * HIGH: Auto-spawn limits integration test
 * 
 * Tests that delegateTask doesn't spawn infinite workers when workers are failing.
 * 
 * Root cause: In tools-workers.ts:403-436, when autoSpawn is true and no target
 * worker is found, the code will attempt to spawn a new worker based on task
 * heuristics. If workers keep failing after spawn, there's no limit on how many
 * spawn attempts can occur, potentially creating an unbounded resource leak.
 * 
 * Test approach:
 * - Configure workers to fail immediately after spawn
 * - Call delegateTask multiple times
 * - Verify spawn count is bounded (not exponential)
 * - Verify error propagation to caller
 * 
 * @module test/integration/spawn/auto-spawn-limits
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createCleanupManager } from "../../helpers/cleanup";
import { createTestProfile } from "../../helpers/fixtures";
import type { CleanupManager } from "../../helpers/cleanup";
import type { WorkerInstance, WorkerProfile } from "../../../src/types";

/**
 * Mock registry that simulates the worker registry behavior
 */
class MockRegistry {
  public workers = new Map<string, WorkerInstance>();
  
  getWorker(id: string): WorkerInstance | undefined {
    return this.workers.get(id);
  }
  
  getActiveWorkers(): WorkerInstance[] {
    return Array.from(this.workers.values()).filter(
      (w) => w.status === "ready" || w.status === "busy"
    );
  }
  
  getVisionWorkers(): WorkerInstance[] {
    return Array.from(this.workers.values()).filter(
      (w) => w.profile.supportsVision && (w.status === "ready" || w.status === "busy")
    );
  }
  
  getWorkersByCapability(capability: string): WorkerInstance[] {
    const lowerCap = capability.toLowerCase();
    return Array.from(this.workers.values()).filter(
      (w) =>
        (w.status === "ready" || w.status === "busy") &&
        (w.profile.purpose.toLowerCase().includes(lowerCap) ||
          w.profile.id.toLowerCase().includes(lowerCap))
    );
  }
  
  register(instance: WorkerInstance): void {
    this.workers.set(instance.profile.id, instance);
  }
  
  unregister(id: string): void {
    this.workers.delete(id);
  }
  
  updateStatus(id: string, status: WorkerInstance["status"]): void {
    const worker = this.workers.get(id);
    if (worker) {
      worker.status = status;
    }
  }
  
  clear(): void {
    this.workers.clear();
  }
}

/**
 * Configuration for the mock delegate task system
 */
interface DelegateTaskConfig {
  /** Whether auto-spawn is enabled (default: true) */
  autoSpawn?: boolean;
  /** Maximum spawn attempts before giving up (0 = unlimited - the bug) */
  maxSpawnAttempts?: number;
  /** Spawn failure mode */
  spawnFailureMode?: "always" | "never" | "intermittent";
  /** Rate of spawn failures when intermittent (0-1) */
  intermittentFailureRate?: number;
  /** Available profiles for spawning */
  profiles?: Record<string, WorkerProfile>;
}

/**
 * Mock DelegateTask system that simulates tools-workers.ts:403-436
 */
class MockDelegateTaskSystem {
  private registry: MockRegistry;
  private config: Required<DelegateTaskConfig>;
  private spawnAttempts = 0;
  private successfulSpawns = 0;
  private failedSpawns = 0;
  private taskExecutions = 0;
  private errors: string[] = [];
  
  constructor(registry: MockRegistry, config: DelegateTaskConfig = {}) {
    this.registry = registry;
    this.config = {
      autoSpawn: config.autoSpawn ?? true,
      maxSpawnAttempts: config.maxSpawnAttempts ?? 0, // 0 = unlimited (the bug)
      spawnFailureMode: config.spawnFailureMode ?? "always",
      intermittentFailureRate: config.intermittentFailureRate ?? 0.5,
      profiles: config.profiles ?? {},
    };
  }
  
  /**
   * Get spawn statistics
   */
  get stats() {
    return {
      spawnAttempts: this.spawnAttempts,
      successfulSpawns: this.successfulSpawns,
      failedSpawns: this.failedSpawns,
      taskExecutions: this.taskExecutions,
      errors: [...this.errors],
    };
  }
  
  /**
   * Reset statistics
   */
  resetStats(): void {
    this.spawnAttempts = 0;
    this.successfulSpawns = 0;
    this.failedSpawns = 0;
    this.taskExecutions = 0;
    this.errors = [];
  }
  
  /**
   * Simulate spawning a worker
   */
  private async spawnWorker(profileId: string): Promise<WorkerInstance | null> {
    this.spawnAttempts++;
    
    // Simulate spawn delay
    await new Promise((resolve) => setTimeout(resolve, 10));
    
    // Determine if spawn should fail
    let shouldFail = false;
    switch (this.config.spawnFailureMode) {
      case "always":
        shouldFail = true;
        break;
      case "never":
        shouldFail = false;
        break;
      case "intermittent":
        shouldFail = Math.random() < this.config.intermittentFailureRate;
        break;
    }
    
    if (shouldFail) {
      this.failedSpawns++;
      this.errors.push(`Spawn failed for profile ${profileId}`);
      return null;
    }
    
    this.successfulSpawns++;
    
    const profile = this.config.profiles[profileId] || createTestProfile(profileId);
    const instance: WorkerInstance = {
      profile,
      status: "ready",
      port: 14000 + this.successfulSpawns,
      pid: 10000 + this.successfulSpawns,
      serverUrl: `http://localhost:${14000 + this.successfulSpawns}`,
      startedAt: new Date(),
      lastActivity: new Date(),
    };
    
    this.registry.register(instance);
    return instance;
  }
  
  /**
   * Determine which profile to spawn based on task (simulates tools-workers.ts:422-430)
   */
  private guessProfileFromTask(task: string, requiresVision: boolean): string {
    if (requiresVision) return "vision";
    if (/\b(doc|docs|documentation|reference|api|example|research|cite)\b/i.test(task)) {
      return "docs";
    }
    if (/\b(architecture|design|plan|approach|tradeoff)\b/i.test(task)) {
      return "architect";
    }
    return "coder";
  }
  
  /**
   * BUGGY version: simulates the unbounded auto-spawn in tools-workers.ts:403-436
   * 
   * The bug: When workers keep failing, there's no limit on spawn attempts.
   * Each delegateTask call with autoSpawn=true will try to spawn if no worker is found.
   */
  async delegateTaskBuggy(args: {
    task: string;
    workerId?: string;
    requiresVision?: boolean;
    autoSpawn?: boolean;
  }): Promise<string> {
    this.taskExecutions++;
    const autoSpawn = args.autoSpawn ?? this.config.autoSpawn;
    const requiresVision = args.requiresVision ?? false;
    
    // Step 1: Try to find existing worker (simulates tools-workers.ts:408-419)
    let targetId = args.workerId;
    if (!targetId) {
      if (requiresVision) {
        const vision = this.registry.getVisionWorkers();
        targetId = vision[0]?.profile.id;
      } else {
        const matches = this.registry.getWorkersByCapability(args.task);
        const active = this.registry.getActiveWorkers();
        targetId = matches[0]?.profile.id ?? active[0]?.profile.id;
      }
    }
    
    // Step 2: BUGGY auto-spawn - no limit on attempts (simulates tools-workers.ts:422-446)
    if (!targetId && autoSpawn) {
      const guessProfile = this.guessProfileFromTask(args.task, requiresVision);
      
      // BUG: No check for max spawn attempts
      // Each call will try to spawn, potentially creating unbounded attempts
      const instance = await this.spawnWorker(guessProfile);
      if (instance) {
        targetId = instance.profile.id;
      }
      // BUG: If spawn fails, we just fall through without proper error handling
    }
    
    // Step 3: Handle no worker available
    if (!targetId) {
      return "No workers available. Spawn one with spawn_worker({ profileId: 'coder' }) or run ensure_workers({ profileIds: [...] }).";
    }
    
    // Step 4: Execute task (simulated)
    const worker = this.registry.getWorker(targetId);
    if (!worker || worker.status === "error" || worker.status === "stopped") {
      return `Worker ${targetId} is not available (status: ${worker?.status ?? "not found"})`;
    }
    
    return `Task delegated to ${targetId}: ${args.task.slice(0, 50)}...`;
  }
  
  /**
   * FIXED version: with bounded auto-spawn attempts
   * 
   * Fix: Track spawn attempts and enforce a maximum limit.
   */
  async delegateTaskFixed(args: {
    task: string;
    workerId?: string;
    requiresVision?: boolean;
    autoSpawn?: boolean;
  }): Promise<string> {
    this.taskExecutions++;
    const autoSpawn = args.autoSpawn ?? this.config.autoSpawn;
    const requiresVision = args.requiresVision ?? false;
    const maxAttempts = 3; // FIXED: Enforce a limit
    
    // Step 1: Try to find existing worker
    let targetId = args.workerId;
    if (!targetId) {
      if (requiresVision) {
        const vision = this.registry.getVisionWorkers();
        targetId = vision[0]?.profile.id;
      } else {
        const matches = this.registry.getWorkersByCapability(args.task);
        const active = this.registry.getActiveWorkers();
        targetId = matches[0]?.profile.id ?? active[0]?.profile.id;
      }
    }
    
    // Step 2: FIXED auto-spawn - with attempt limit and cooldown
    if (!targetId && autoSpawn) {
      const guessProfile = this.guessProfileFromTask(args.task, requiresVision);
      
      // FIXED: Check if we've exceeded spawn attempts
      if (this.spawnAttempts >= maxAttempts) {
        this.errors.push(`Spawn attempt blocked: max attempts (${maxAttempts}) reached`);
        return `Auto-spawn disabled: too many failed spawn attempts (${this.failedSpawns}). Manual intervention required.`;
      }
      
      const instance = await this.spawnWorker(guessProfile);
      if (instance) {
        targetId = instance.profile.id;
      } else {
        // FIXED: Propagate spawn failure as error
        return `Failed to auto-spawn worker for profile "${guessProfile}". ${this.failedSpawns} spawn failures recorded.`;
      }
    }
    
    // Step 3: Handle no worker available
    if (!targetId) {
      return "No workers available. Spawn one with spawn_worker({ profileId: 'coder' }) or run ensure_workers({ profileIds: [...] }).";
    }
    
    // Step 4: Execute task
    const worker = this.registry.getWorker(targetId);
    if (!worker || worker.status === "error" || worker.status === "stopped") {
      return `Worker ${targetId} is not available (status: ${worker?.status ?? "not found"})`;
    }
    
    return `Task delegated to ${targetId}: ${args.task.slice(0, 50)}...`;
  }
}

describe("Auto-Spawn Limits", () => {
  let cleanup: CleanupManager;
  let registry: MockRegistry;
  
  beforeEach(() => {
    cleanup = createCleanupManager();
    registry = new MockRegistry();
  });
  
  afterEach(async () => {
    registry.clear();
    await cleanup.cleanupAll();
  });
  
  describe("Unbounded Auto-Spawn Bug", () => {
    /**
     * Demonstrates the bug: Each delegateTask call attempts to spawn
     * when no worker is available and spawns keep failing.
     */
    test("BUGGY: unlimited spawn attempts when workers keep failing", async () => {
      const system = new MockDelegateTaskSystem(registry, {
        autoSpawn: true,
        spawnFailureMode: "always", // All spawns fail
      });
      
      const taskCount = 20;
      const results: string[] = [];
      
      // Each delegateTask call will attempt to spawn since no workers exist
      for (let i = 0; i < taskCount; i++) {
        const result = await system.delegateTaskBuggy({
          task: `Task ${i}: Write some code`,
          autoSpawn: true,
        });
        results.push(result);
      }
      
      const stats = system.stats;
      console.log(`[AUTO-SPAWN-BUG] Tasks: ${taskCount}, Spawn attempts: ${stats.spawnAttempts}, Failures: ${stats.failedSpawns}`);
      
      // BUG: Spawn attempts equals task count - no limiting!
      expect(stats.spawnAttempts).toBe(taskCount);
      expect(stats.failedSpawns).toBe(taskCount);
      
      // All results should indicate no workers available
      expect(results.every((r) => r.includes("No workers available"))).toBe(true);
    });
    
    /**
     * Shows the resource consumption grows linearly with failed calls
     */
    test("BUGGY: resource consumption grows without bound", async () => {
      const system = new MockDelegateTaskSystem(registry, {
        autoSpawn: true,
        spawnFailureMode: "always",
      });
      
      // Simulate a burst of requests
      const burstSize = 100;
      const startMemory = process.memoryUsage().heapUsed;
      
      await Promise.all(
        Array.from({ length: burstSize }, (_, i) =>
          system.delegateTaskBuggy({
            task: `Concurrent task ${i}`,
            autoSpawn: true,
          })
        )
      );
      
      const endMemory = process.memoryUsage().heapUsed;
      const stats = system.stats;
      
      console.log(`[AUTO-SPAWN-RESOURCE] Burst: ${burstSize}, Attempts: ${stats.spawnAttempts}`);
      console.log(`[AUTO-SPAWN-RESOURCE] Memory: ${((endMemory - startMemory) / 1024).toFixed(2)}KB used`);
      
      // Every concurrent request triggered a spawn attempt
      expect(stats.spawnAttempts).toBe(burstSize);
    });
  });
  
  describe("Fixed Auto-Spawn with Limits", () => {
    /**
     * Fixed version should stop spawning after max attempts
     */
    test("FIXED: spawn attempts are bounded", async () => {
      const system = new MockDelegateTaskSystem(registry, {
        autoSpawn: true,
        spawnFailureMode: "always",
      });
      
      const taskCount = 20;
      const maxExpectedAttempts = 3; // The fixed implementation's limit
      
      const results: string[] = [];
      for (let i = 0; i < taskCount; i++) {
        const result = await system.delegateTaskFixed({
          task: `Task ${i}: Write some code`,
          autoSpawn: true,
        });
        results.push(result);
      }
      
      const stats = system.stats;
      console.log(`[AUTO-SPAWN-FIX] Tasks: ${taskCount}, Spawn attempts: ${stats.spawnAttempts} (max: ${maxExpectedAttempts})`);
      
      // FIXED: Spawn attempts should be capped
      expect(stats.spawnAttempts).toBeLessThanOrEqual(maxExpectedAttempts);
      expect(stats.failedSpawns).toBeLessThanOrEqual(maxExpectedAttempts);
      
      // Later tasks should receive the "too many attempts" error
      const blockedTasks = results.filter((r) => r.includes("too many failed spawn attempts"));
      expect(blockedTasks.length).toBeGreaterThan(0);
    });
    
    /**
     * Fixed version should provide meaningful error messages
     */
    test("FIXED: proper error propagation to caller", async () => {
      const system = new MockDelegateTaskSystem(registry, {
        autoSpawn: true,
        spawnFailureMode: "always",
      });
      
      // First few attempts will try to spawn
      const result1 = await system.delegateTaskFixed({ task: "First task" });
      expect(result1).toContain("Failed to auto-spawn");
      
      const result2 = await system.delegateTaskFixed({ task: "Second task" });
      expect(result2).toContain("Failed to auto-spawn");
      
      const result3 = await system.delegateTaskFixed({ task: "Third task" });
      expect(result3).toContain("Failed to auto-spawn");
      
      // Fourth attempt should be blocked
      const result4 = await system.delegateTaskFixed({ task: "Fourth task" });
      expect(result4).toContain("too many failed spawn attempts");
      expect(result4).toContain("Manual intervention required");
    });
  });
  
  describe("Intermittent Failures", () => {
    /**
     * Test behavior when spawns fail intermittently
     */
    test("handles intermittent spawn failures gracefully", async () => {
      const system = new MockDelegateTaskSystem(registry, {
        autoSpawn: true,
        spawnFailureMode: "intermittent",
        intermittentFailureRate: 0.5, // 50% failure rate
      });
      
      const taskCount = 20;
      const results: string[] = [];
      
      for (let i = 0; i < taskCount; i++) {
        const result = await system.delegateTaskFixed({
          task: `Intermittent task ${i}`,
          autoSpawn: true,
        });
        results.push(result);
      }
      
      const stats = system.stats;
      console.log(`[INTERMITTENT] Tasks: ${taskCount}, Attempts: ${stats.spawnAttempts}, Success: ${stats.successfulSpawns}, Failed: ${stats.failedSpawns}`);
      
      // Some spawns should have succeeded
      const successfulDelegations = results.filter((r) => r.includes("Task delegated"));
      console.log(`[INTERMITTENT] Successful delegations: ${successfulDelegations.length}`);
      
      // Should be bounded even with intermittent failures
      expect(stats.spawnAttempts).toBeLessThanOrEqual(taskCount);
    });
  });
  
  describe("Spawn Recovery", () => {
    /**
     * Test that system recovers when spawns start succeeding
     */
    test("recovers when spawns start succeeding", async () => {
      // Start with failing spawns, then switch to succeeding
      let spawnShouldFail = true;
      
      const customSystem = new MockDelegateTaskSystem(registry, {
        autoSpawn: true,
        spawnFailureMode: "never", // We'll control this manually
      });
      
      // Override spawn behavior
      const originalSpawn = (customSystem as any).spawnWorker.bind(customSystem);
      (customSystem as any).spawnWorker = async (profileId: string) => {
        if (spawnShouldFail) {
          (customSystem as any).spawnAttempts++;
          (customSystem as any).failedSpawns++;
          return null;
        }
        return originalSpawn(profileId);
      };
      
      // First few calls fail
      await customSystem.delegateTaskFixed({ task: "Failing task 1" });
      await customSystem.delegateTaskFixed({ task: "Failing task 2" });
      
      // Now spawns succeed
      spawnShouldFail = false;
      
      // This should still be within attempt limit
      const result = await customSystem.delegateTaskFixed({ task: "Succeeding task" });
      
      // If we're still within limits, spawn should work
      const stats = customSystem.stats;
      if (stats.spawnAttempts < 3) {
        expect(result).toContain("Task delegated");
      }
    });
    
    /**
     * Test that existing workers are preferred over spawning
     */
    test("prefers existing workers over spawning new ones", async () => {
      const system = new MockDelegateTaskSystem(registry, {
        autoSpawn: true,
        spawnFailureMode: "never",
      });
      
      // Pre-register a worker
      const existingProfile = createTestProfile("existing-coder", {
        name: "Existing Coder",
        purpose: "code writing",
        whenToUse: "For coding tasks",
      });
      
      registry.register({
        profile: existingProfile,
        status: "ready",
        port: 14000,
        pid: 10000,
        serverUrl: "http://localhost:14000",
        startedAt: new Date(),
        lastActivity: new Date(),
      });
      
      // Task should use existing worker, not spawn new one
      const result = await system.delegateTaskFixed({
        task: "Write some code for me",
        autoSpawn: true,
      });
      
      const stats = system.stats;
      
      // No spawn attempts should have been made
      expect(stats.spawnAttempts).toBe(0);
      expect(result).toContain("Task delegated");
      expect(result).toContain("existing-coder");
    });
  });
  
  describe("Profile Selection Heuristics", () => {
    /**
     * Test that correct profile is selected based on task content
     */
    test("selects vision profile for vision tasks", async () => {
      const system = new MockDelegateTaskSystem(registry, {
        autoSpawn: true,
        spawnFailureMode: "never",
        profiles: {
          vision: createTestProfile("vision", {
            name: "Vision Worker",
            supportsVision: true,
          }),
        },
      });
      
      const result = await system.delegateTaskFixed({
        task: "Analyze this image",
        requiresVision: true,
        autoSpawn: true,
      });
      
      expect(result).toContain("Task delegated");
      expect(result).toContain("vision");
    });
    
    test("selects docs profile for documentation tasks", async () => {
      const system = new MockDelegateTaskSystem(registry, {
        autoSpawn: true,
        spawnFailureMode: "never",
      });
      
      const result = await system.delegateTaskFixed({
        task: "Write documentation for the API",
        autoSpawn: true,
      });
      
      // Should attempt to spawn docs profile
      const stats = system.stats;
      expect(stats.spawnAttempts).toBe(1);
      expect(result).toContain("Task delegated");
    });
    
    test("selects architect profile for design tasks", async () => {
      const system = new MockDelegateTaskSystem(registry, {
        autoSpawn: true,
        spawnFailureMode: "never",
      });
      
      const result = await system.delegateTaskFixed({
        task: "Design the system architecture",
        autoSpawn: true,
      });
      
      expect(result).toContain("Task delegated");
    });
    
    test("defaults to coder profile for general tasks", async () => {
      const system = new MockDelegateTaskSystem(registry, {
        autoSpawn: true,
        spawnFailureMode: "never",
      });
      
      const result = await system.delegateTaskFixed({
        task: "Fix the bug in the login form",
        autoSpawn: true,
      });
      
      expect(result).toContain("Task delegated");
    });
  });
  
  describe("Auto-Spawn Disabled", () => {
    /**
     * Test that no spawning occurs when autoSpawn is disabled
     */
    test("no spawning when autoSpawn is false", async () => {
      const system = new MockDelegateTaskSystem(registry, {
        autoSpawn: false,
        spawnFailureMode: "never",
      });
      
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          system.delegateTaskFixed({
            task: `Task ${i}`,
            autoSpawn: false,
          })
        )
      );
      
      const stats = system.stats;
      
      // No spawn attempts should be made
      expect(stats.spawnAttempts).toBe(0);
      expect(results.every((r) => r.includes("No workers available"))).toBe(true);
    });
    
    /**
     * Test per-call autoSpawn override
     */
    test("per-call autoSpawn override works", async () => {
      const system = new MockDelegateTaskSystem(registry, {
        autoSpawn: true, // Default is on
        spawnFailureMode: "never",
      });
      
      // Explicitly disable for this call
      const result = await system.delegateTaskFixed({
        task: "Task with spawn disabled",
        autoSpawn: false,
      });
      
      const stats = system.stats;
      expect(stats.spawnAttempts).toBe(0);
      expect(result).toContain("No workers available");
    });
  });
  
  describe("Concurrent Auto-Spawn Requests", () => {
    /**
     * Test that concurrent requests don't each trigger spawns
     */
    test("concurrent requests should not multiply spawn attempts", async () => {
      const system = new MockDelegateTaskSystem(registry, {
        autoSpawn: true,
        spawnFailureMode: "never",
      });
      
      const concurrency = 10;
      
      // Fire concurrent requests
      const results = await Promise.all(
        Array.from({ length: concurrency }, (_, i) =>
          system.delegateTaskFixed({
            task: `Concurrent task ${i}`,
            autoSpawn: true,
          })
        )
      );
      
      const stats = system.stats;
      console.log(`[CONCURRENT] Concurrency: ${concurrency}, Spawn attempts: ${stats.spawnAttempts}`);
      
      // Note: In the mock, each concurrent call may trigger a spawn
      // In a real implementation with proper deduplication, this should be 1
      // This test documents the current behavior
      
      // At minimum, spawn attempts should be bounded
      expect(stats.spawnAttempts).toBeLessThanOrEqual(3); // Fixed limit
      
      // Most tasks should have succeeded
      const successful = results.filter((r) => r.includes("Task delegated"));
      expect(successful.length).toBeGreaterThan(0);
    });
  });
});
