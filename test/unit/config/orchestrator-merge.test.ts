/**
 * MEDIUM: Orchestrator config deep merge test
 * 
 * Tests that config deep merge handles arrays correctly.
 * 
 * Root cause: In orchestrator.ts:63-75 (and helpers/format.ts:39-51), the
 * deepMerge function replaces arrays instead of merging them. This means
 * that if a project config has a partial profiles array, it will completely
 * replace the global/default profiles instead of extending them.
 * 
 * Test approach:
 * - Create base config with array fields
 * - Merge with override config with array fields
 * - Verify arrays are merged, not replaced
 * - Test nested array scenarios
 * 
 * @module test/unit/config/orchestrator-merge
 */

import { describe, test, expect } from "bun:test";

/**
 * The current (buggy) deepMerge implementation from helpers/format.ts:39-51
 * 
 * BUG: Arrays are replaced, not merged (line 42-43)
 */
function deepMergeBuggy(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  
  for (const [k, v] of Object.entries(override)) {
    if (Array.isArray(v)) {
      // BUG: Array is replaced entirely
      out[k] = v;
    } else if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMergeBuggy(out[k] as Record<string, unknown>, v);
    } else {
      out[k] = v;
    }
  }
  
  return out;
}

/**
 * Fixed deepMerge that properly handles arrays
 * 
 * Options for array merging:
 * 1. Concatenate: [...base, ...override] - simple but may duplicate
 * 2. Union: unique values from both arrays
 * 3. Override by ID: for arrays of objects, merge by unique identifier
 */
function deepMergeFixed(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
  options: {
    arrayMerge?: "replace" | "concat" | "union" | "byId";
    arrayIdKey?: string;
  } = {}
): Record<string, unknown> {
  const { arrayMerge = "concat", arrayIdKey = "id" } = options;
  const out: Record<string, unknown> = { ...base };
  
  for (const [k, v] of Object.entries(override)) {
    if (Array.isArray(v)) {
      const baseArray = Array.isArray(out[k]) ? out[k] as unknown[] : [];
      
      switch (arrayMerge) {
        case "replace":
          // Same as buggy behavior
          out[k] = v;
          break;
          
        case "concat":
          // Simple concatenation (may have duplicates)
          out[k] = [...baseArray, ...v];
          break;
          
        case "union":
          // Unique values (for primitives)
          out[k] = [...new Set([...baseArray, ...v])];
          break;
          
        case "byId":
          // Merge objects by ID key
          out[k] = mergeArraysById(baseArray, v, arrayIdKey);
          break;
      }
    } else if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMergeFixed(out[k] as Record<string, unknown>, v, options);
    } else {
      out[k] = v;
    }
  }
  
  return out;
}

/**
 * Merge arrays of objects by a unique ID key
 */
function mergeArraysById(
  base: unknown[],
  override: unknown[],
  idKey: string
): unknown[] {
  const result = new Map<string, unknown>();
  
  // Add base items
  for (const item of base) {
    if (isPlainObject(item) && idKey in item) {
      result.set(item[idKey] as string, item);
    } else if (typeof item === "string") {
      result.set(item, item);
    } else {
      // Items without ID are kept as-is
      result.set(crypto.randomUUID(), item);
    }
  }
  
  // Override/add items from override array
  for (const item of override) {
    if (isPlainObject(item) && idKey in item) {
      const id = item[idKey] as string;
      const existing = result.get(id);
      if (existing && isPlainObject(existing)) {
        // Merge the objects
        result.set(id, { ...existing, ...item });
      } else {
        result.set(id, item);
      }
    } else if (typeof item === "string") {
      result.set(item, item);
    } else {
      result.set(crypto.randomUUID(), item);
    }
  }
  
  return Array.from(result.values());
}

/**
 * Helper to check if a value is a plain object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

describe("Config Deep Merge", () => {
  describe("Array Handling - Current (Buggy) Behavior", () => {
    /**
     * Demonstrates the bug: arrays are replaced, not merged
     */
    test("BUGGY: override array completely replaces base array", () => {
      const base = {
        profiles: ["coder", "architect", "docs"],
        workers: [
          { id: "coder", model: "claude-opus-4" },
          { id: "architect", model: "claude-opus-4" },
        ],
      };
      
      const override = {
        profiles: ["vision"], // User just wants to add vision
        workers: [
          { id: "vision", model: "gpt-4o" },
        ],
      };
      
      const result = deepMergeBuggy(base, override);
      
      // BUG: Base profiles are completely replaced
      expect(result.profiles).toEqual(["vision"]);
      expect(result.profiles).not.toContain("coder");
      expect(result.profiles).not.toContain("architect");
      
      // BUG: Base workers are completely replaced
      expect(result.workers).toEqual([{ id: "vision", model: "gpt-4o" }]);
      expect(result.workers).toHaveLength(1);
      
      console.log("[BUGGY] Original profiles (coder, architect, docs) were lost!");
      console.log("[BUGGY] User only wanted to add vision, but replaced everything");
    });
    
    /**
     * Shows this affects the pruning.protectedTools config
     */
    test("BUGGY: protectedTools override loses default protection", () => {
      const base = {
        pruning: {
          enabled: false,
          maxToolOutputChars: 12000,
          protectedTools: ["task", "todowrite", "todoread"], // Default protected
        },
      };
      
      const override = {
        pruning: {
          enabled: true,
          protectedTools: ["myCustomTool"], // User wants to add custom tool
        },
      };
      
      const result = deepMergeBuggy(base, override) as any;
      
      // BUG: Default protectedTools are lost
      expect(result.pruning.protectedTools).toEqual(["myCustomTool"]);
      expect(result.pruning.protectedTools).not.toContain("task");
      expect(result.pruning.protectedTools).not.toContain("todowrite");
      
      console.log("[BUGGY] Critical tools (task, todowrite, todoread) lost protection!");
    });
  });
  
  describe("Array Handling - Fixed Behavior", () => {
    /**
     * Fixed version: arrays are concatenated
     */
    test("FIXED (concat): arrays are concatenated", () => {
      const base = {
        profiles: ["coder", "architect", "docs"],
      };
      
      const override = {
        profiles: ["vision"],
      };
      
      const result = deepMergeFixed(base, override, { arrayMerge: "concat" });
      
      // Arrays are concatenated
      expect(result.profiles).toEqual(["coder", "architect", "docs", "vision"]);
      expect(result.profiles).toHaveLength(4);
    });
    
    /**
     * Fixed version: arrays are unioned (no duplicates)
     */
    test("FIXED (union): arrays are unioned without duplicates", () => {
      const base = {
        profiles: ["coder", "architect", "docs"],
      };
      
      const override = {
        profiles: ["vision", "coder"], // coder is duplicate
      };
      
      const result = deepMergeFixed(base, override, { arrayMerge: "union" });
      
      // Arrays are unioned
      expect(result.profiles).toContain("coder");
      expect(result.profiles).toContain("architect");
      expect(result.profiles).toContain("docs");
      expect(result.profiles).toContain("vision");
      
      // No duplicates
      const profiles = result.profiles as string[];
      expect(profiles.filter((p) => p === "coder")).toHaveLength(1);
    });
    
    /**
     * Fixed version: object arrays merged by ID
     */
    test("FIXED (byId): object arrays are merged by ID", () => {
      const base = {
        workers: [
          { id: "coder", model: "claude-opus-4", purpose: "Code" },
          { id: "architect", model: "claude-opus-4", purpose: "Design" },
        ],
      };
      
      const override = {
        workers: [
          { id: "coder", model: "gpt-4" }, // Override coder's model
          { id: "vision", model: "gpt-4o", purpose: "Vision" }, // Add new
        ],
      };
      
      const result = deepMergeFixed(base, override, { arrayMerge: "byId" });
      const workers = result.workers as Array<Record<string, unknown>>;
      
      // Should have all 3 workers
      expect(workers).toHaveLength(3);
      
      // Coder should be merged (model overridden, purpose preserved)
      const coder = workers.find((w) => w.id === "coder");
      expect(coder?.model).toBe("gpt-4"); // Overridden
      expect(coder?.purpose).toBe("Code"); // Preserved from base
      
      // Architect should be unchanged
      const architect = workers.find((w) => w.id === "architect");
      expect(architect?.model).toBe("claude-opus-4");
      
      // Vision should be added
      const vision = workers.find((w) => w.id === "vision");
      expect(vision?.model).toBe("gpt-4o");
    });
  });
  
  describe("Nested Object Merging", () => {
    /**
     * Test that nested objects are properly merged
     */
    test("nested objects are recursively merged", () => {
      const base = {
        ui: {
          toasts: true,
          injectSystemContext: true,
          systemContextMaxWorkers: 12,
        },
        notifications: {
          idle: {
            enabled: false,
            title: "OpenCode",
            delayMs: 1500,
          },
        },
      };
      
      const override = {
        ui: {
          toasts: false, // Override this
          // Other ui fields should be preserved
        },
        notifications: {
          idle: {
            enabled: true, // Override this
            message: "Session is idle", // Add this
          },
        },
      };
      
      const result = deepMergeBuggy(base, override) as any;
      
      // ui should be merged
      expect(result.ui.toasts).toBe(false); // Overridden
      expect(result.ui.injectSystemContext).toBe(true); // Preserved
      expect(result.ui.systemContextMaxWorkers).toBe(12); // Preserved
      
      // notifications.idle should be merged
      expect(result.notifications.idle.enabled).toBe(true); // Overridden
      expect(result.notifications.idle.title).toBe("OpenCode"); // Preserved
      expect(result.notifications.idle.message).toBe("Session is idle"); // Added
      expect(result.notifications.idle.delayMs).toBe(1500); // Preserved
    });
    
    /**
     * Test arrays within nested objects
     */
    test("BUGGY: arrays within nested objects are still replaced", () => {
      const base = {
        pruning: {
          enabled: true,
          protectedTools: ["task", "todowrite", "todoread"],
        },
      };
      
      const override = {
        pruning: {
          protectedTools: ["customTool"],
        },
      };
      
      const result = deepMergeBuggy(base, override) as any;
      
      // nested array is still replaced (bug)
      expect(result.pruning.enabled).toBe(true); // Preserved
      expect(result.pruning.protectedTools).toEqual(["customTool"]); // Replaced!
    });
    
    /**
     * Fixed version handles nested arrays
     */
    test("FIXED: arrays within nested objects are merged", () => {
      const base = {
        pruning: {
          enabled: true,
          protectedTools: ["task", "todowrite", "todoread"],
        },
      };
      
      const override = {
        pruning: {
          protectedTools: ["customTool"],
        },
      };
      
      const result = deepMergeFixed(base, override, { arrayMerge: "concat" }) as any;
      
      // enabled is preserved
      expect(result.pruning.enabled).toBe(true);
      
      // protectedTools are concatenated
      expect(result.pruning.protectedTools).toContain("task");
      expect(result.pruning.protectedTools).toContain("todowrite");
      expect(result.pruning.protectedTools).toContain("todoread");
      expect(result.pruning.protectedTools).toContain("customTool");
    });
  });
  
  describe("Edge Cases", () => {
    /**
     * Test with empty arrays
     */
    test("empty override array should not clear base array (fixed)", () => {
      const base = {
        profiles: ["coder", "architect"],
      };
      
      const override = {
        profiles: [], // Empty array
      };
      
      // Buggy: replaces with empty
      const buggyResult = deepMergeBuggy(base, override);
      expect(buggyResult.profiles).toEqual([]);
      
      // Fixed (concat): base is preserved
      const fixedResult = deepMergeFixed(base, override, { arrayMerge: "concat" });
      expect(fixedResult.profiles).toEqual(["coder", "architect"]);
    });
    
    /**
     * Test with null/undefined values
     */
    test("handles null and undefined correctly", () => {
      const base = {
        value: "original",
        nullValue: null,
        array: [1, 2, 3],
      };
      
      const override = {
        value: null,
        nullValue: "now defined",
        newField: undefined,
      };
      
      const result = deepMergeBuggy(base, override as any) as any;
      
      expect(result.value).toBeNull();
      expect(result.nullValue).toBe("now defined");
      expect(result.array).toEqual([1, 2, 3]); // Unchanged
    });
    
    /**
     * Test with mixed types (array in base, object in override)
     */
    test("handles type changes correctly", () => {
      const base = {
        config: ["value1", "value2"],
      };
      
      const override = {
        config: { key: "value" }, // Changed from array to object
      };
      
      const result = deepMergeBuggy(base, override as any) as any;
      
      // Override wins with different type
      expect(result.config).toEqual({ key: "value" });
      expect(Array.isArray(result.config)).toBe(false);
    });
    
    /**
     * Test deeply nested structures
     */
    test("handles deeply nested structures", () => {
      const base = {
        level1: {
          level2: {
            level3: {
              array: [1, 2],
              value: "base",
            },
          },
        },
      };
      
      const override = {
        level1: {
          level2: {
            level3: {
              array: [3, 4],
              newValue: "added",
            },
          },
        },
      };
      
      const buggyResult = deepMergeBuggy(base, override) as any;
      
      // Buggy: array replaced
      expect(buggyResult.level1.level2.level3.array).toEqual([3, 4]);
      expect(buggyResult.level1.level2.level3.value).toBe("base"); // Preserved
      expect(buggyResult.level1.level2.level3.newValue).toBe("added"); // Added
      
      const fixedResult = deepMergeFixed(base, override, { arrayMerge: "concat" }) as any;
      
      // Fixed: array concatenated
      expect(fixedResult.level1.level2.level3.array).toEqual([1, 2, 3, 4]);
    });
  });
  
  describe("Real-World Config Scenarios", () => {
    /**
     * Simulates the actual orchestrator config merge scenario
     */
    test("orchestrator config merge: global + project", () => {
      // Default/Global config (from orchestrator.ts:187-217)
      const globalConfig = {
        basePort: 14096,
        autoSpawn: true,
        startupTimeout: 30000,
        profiles: [],
        workers: [],
        ui: {
          toasts: true,
          injectSystemContext: true,
          systemContextMaxWorkers: 12,
        },
        pruning: {
          enabled: false,
          protectedTools: ["task", "todowrite", "todoread"],
        },
      };
      
      // User's project config (might want to add workers)
      const projectConfig = {
        workers: ["coder", "vision"], // User wants these workers
        pruning: {
          enabled: true,
          protectedTools: ["myCustomTool"], // User wants to protect this too
        },
      };
      
      // Current (buggy) behavior
      const buggyMerged = deepMergeBuggy(globalConfig, projectConfig) as any;
      
      console.log("[SCENARIO] Buggy merge result:");
      console.log("  workers:", buggyMerged.workers);
      console.log("  protectedTools:", buggyMerged.pruning.protectedTools);
      
      // BUG: This is fine since base was empty
      expect(buggyMerged.workers).toEqual(["coder", "vision"]);
      
      // BUG: Lost default protected tools!
      expect(buggyMerged.pruning.protectedTools).toEqual(["myCustomTool"]);
      expect(buggyMerged.pruning.protectedTools).not.toContain("task");
      
      // Fixed behavior
      const fixedMerged = deepMergeFixed(globalConfig, projectConfig, { arrayMerge: "union" }) as any;
      
      console.log("[SCENARIO] Fixed merge result:");
      console.log("  workers:", fixedMerged.workers);
      console.log("  protectedTools:", fixedMerged.pruning.protectedTools);
      
      // Fixed: workers combined
      expect(fixedMerged.workers).toContain("coder");
      expect(fixedMerged.workers).toContain("vision");
      
      // Fixed: protectedTools combined
      expect(fixedMerged.pruning.protectedTools).toContain("task");
      expect(fixedMerged.pruning.protectedTools).toContain("todowrite");
      expect(fixedMerged.pruning.protectedTools).toContain("todoread");
      expect(fixedMerged.pruning.protectedTools).toContain("myCustomTool");
    });
    
    /**
     * Test profile extension scenario
     */
    test("profile extension: base + custom profile", () => {
      // Base profiles as objects
      const baseConfig = {
        profiles: [
          { id: "coder", name: "Coder", model: "claude-opus-4", purpose: "Code" },
          { id: "architect", name: "Architect", model: "claude-opus-4", purpose: "Design" },
        ],
      };
      
      // User wants to customize coder and add a new profile
      const userConfig = {
        profiles: [
          { id: "coder", model: "gpt-4" }, // Override model only
          { id: "myworker", name: "My Worker", model: "custom", purpose: "Custom" },
        ],
      };
      
      // Fixed with byId merging
      const result = deepMergeFixed(baseConfig, userConfig, { arrayMerge: "byId" }) as any;
      
      const profiles = result.profiles as Array<Record<string, unknown>>;
      
      // Should have 3 profiles
      expect(profiles).toHaveLength(3);
      
      // Coder should have merged properties
      const coder = profiles.find((p) => p.id === "coder");
      expect(coder?.model).toBe("gpt-4"); // Overridden
      expect(coder?.name).toBe("Coder"); // Preserved
      expect(coder?.purpose).toBe("Code"); // Preserved
      
      // Architect unchanged
      const architect = profiles.find((p) => p.id === "architect");
      expect(architect?.model).toBe("claude-opus-4");
      
      // myworker added
      const myworker = profiles.find((p) => p.id === "myworker");
      expect(myworker?.name).toBe("My Worker");
    });
  });
  
  describe("Backward Compatibility", () => {
    /**
     * Test that 'replace' mode maintains current behavior
     */
    test("replace mode maintains buggy behavior for compatibility", () => {
      const base = { array: [1, 2, 3] };
      const override = { array: [4, 5] };
      
      const buggyResult = deepMergeBuggy(base, override);
      const fixedReplaceResult = deepMergeFixed(base, override, { arrayMerge: "replace" });
      
      expect(buggyResult.array).toEqual([4, 5]);
      expect(fixedReplaceResult.array).toEqual([4, 5]);
    });
  });
});
