import { describe, expect, test } from "bun:test";
import { join } from "node:path";

/**
 * RED — PLAN-0016 TASK-03: superfície M (MCP stdio, 12 tools de leitura, uma por operação).
 * Contrato (PLAN.md "Interfaces" + TASK-03): bench/code-mode/surfaces/m.ts exporta
 * M_TOOLS ({name, run}[]) e handle(req, snapshot); mcp_stdio.ts faz o loop JSON-RPC 2.0
 * (initialize/tools/list/tools/call) sem dependência externa. Saída truncada em 8000 chars.
 * Fixture: tests/fixtures/code-mode/snapshot/.
 */

const SNAP = join(import.meta.dir, "..", "fixtures", "code-mode", "snapshot");

const TOOLS12 = [
  "list_plans", "read_plan", "list_tasks", "read_task", "read_log", "grep_logs",
  "list_runs", "read_run", "count_in_runs", "plan_deps", "task_attempts", "paid_attempts",
];

describe("PLAN-0016 TASK-03: superfície M", () => {
  test("M_TOOLS tem exatamente as 12 tools de leitura, sem tool de escrita", async () => {
    const mod = await import("../../bench/code-mode/surfaces/m").catch(() => null);
    expect(mod).not.toBeNull();
    expect(mod!.M_TOOLS.length).toBe(12);
    expect(mod!.M_TOOLS.map((t) => t.name).sort()).toEqual([...TOOLS12].sort());
    for (const t of mod!.M_TOOLS) expect(typeof t.run).toBe("function");
  });

  test("handle tools/list → 12 nomes; tools/call list_plans no fixture → os 4 PLANs", async () => {
    const mod = await import("../../bench/code-mode/surfaces/m").catch(() => null);
    const list = mod!.handle({ id: 1, method: "tools/list" }, SNAP) as any;
    expect(list.result.tools.map((t: any) => t.name).sort()).toEqual([...TOOLS12].sort());
    const call = mod!.handle({ id: 2, method: "tools/call", params: { name: "list_plans", arguments: {} } }, SNAP) as any;
    const s = JSON.stringify(call);
    for (const p of ["PLAN-0001-alpha", "PLAN-0002-beta", "PLAN-0003-gamma", "PLAN-0004-delta"]) expect(s).toContain(p);
  });

  test("tools/call read_plan e count_in_runs leem o snapshot", async () => {
    const mod = await import("../../bench/code-mode/surfaces/m").catch(() => null);
    const rp = mod!.handle({ id: 3, method: "tools/call", params: { name: "read_plan", arguments: { plan: "PLAN-0001-alpha" } } }, SNAP) as any;
    expect(JSON.stringify(rp)).toContain("Alpha");
    const cir = mod!.handle({ id: 4, method: "tools/call", params: { name: "count_in_runs", arguments: { pattern: "step_finish" } } }, SNAP) as any;
    expect(JSON.stringify(cir)).toContain("3"); // total de step_finish nos runs/*.jsonl do fixture
  });

  test("saída truncada em 8000 chars", async () => {
    const mod = await import("../../bench/code-mode/surfaces/m").catch(() => null);
    const big = mod!.handle({ id: 5, method: "tools/call", params: { name: "read_log", arguments: { plan: "PLAN-0001-alpha" } } }, SNAP) as any;
    expect(JSON.stringify(big).length).toBeLessThan(9000);
  });
});
