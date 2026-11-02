import { describe, expect, test } from "bun:test";
import { join } from "node:path";

/**
 * RED — PLAN-0016 TASK-04: superfície C (skill) + agentConfig gera o opencode.json de cada modo.
 * Contrato (TASK-04): bench/code-mode/config.ts exporta
 * agentConfig(mode: Mode, o: { snapshot: string; repoDir: string }): object (JSON do opencode.json).
 * M → só o MCP da TASK-03, bash desligado; C → bash ligado + a skill (c-skill.md), sem MCP;
 * X1/X2 → só o MCP da TASK-05 (surfaces/x), bash desligado; sempre permission sem escrita
 * fora do workdir (repoDir). Nada é instalado em ~/.config/opencode.
 */

const SNAP = join(import.meta.dir, "..", "fixtures", "code-mode", "snapshot");

describe("PLAN-0016 TASK-04: agentConfig por modo", () => {
  test("M: MCP da superfície M ligado, bash desligado, workdir na permission", async () => {
    const mod = await import("../../bench/code-mode/config").catch(() => null);
    expect(mod).not.toBeNull();
    const cfg = mod!.agentConfig("M", { snapshot: SNAP, repoDir: "/wd0016" }) as any;
    const s = JSON.stringify(cfg);
    expect(cfg.tools.bash).toBe(false);
    expect(s).toContain("mcp_stdio");
    expect(cfg.permission).toBeTruthy();
    expect(s).toContain("/wd0016");
  });

  test("C: bash ligado + skill (c-skill), sem MCP, workdir na permission", async () => {
    const mod = await import("../../bench/code-mode/config").catch(() => null);
    const cfg = mod!.agentConfig("C", { snapshot: SNAP, repoDir: "/wd0016" }) as any;
    const s = JSON.stringify(cfg);
    expect(cfg.tools.bash).toBe(true);
    expect(cfg.mcp ?? null).toBeNull();
    expect(s).toContain("c-skill");
    expect(s).toContain("/wd0016");
  });

  test("X1 e X2: MCP da superfície X (surfaces/x) ligado, bash desligado", async () => {
    const mod = await import("../../bench/code-mode/config").catch(() => null);
    for (const mode of ["X1", "X2"] as const) {
      const cfg = mod!.agentConfig(mode, { snapshot: SNAP, repoDir: "/wd0016" }) as any;
      const s = JSON.stringify(cfg);
      expect(cfg.tools.bash).toBe(false);
      expect(s).toContain("surfaces/x");
      expect(s).toContain("/wd0016");
    }
  });
});
