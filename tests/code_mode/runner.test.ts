import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

/**
 * RED — PLAN-0016 TASK-02: runner de trials isolados + captura de tokens.
 * Contrato (PLAN.md "Interfaces" + TASK-02):
 *   bench/code-mode/runner.ts exporta Mode, Trial, trialArgv, parseExport, runTrial;
 *   bench/code-mode/run.ts exporta runCells (CLI entra só com import.meta.main) e grava results.jsonl.
 * Fixture: tests/fixtures/code-mode/export.json (export real redigido, 2 turnos assistant).
 * Nunca chama modelo de verdade: o spawn é injetado.
 */

const SNAP = join(import.meta.dir, "..", "fixtures", "code-mode", "snapshot");
const EXPORT = join(import.meta.dir, "..", "fixtures", "code-mode", "export.json");

type Spawn = (argv: string[], o: { cwd: string; stdin: "ignore" }) => Promise<{ code: number; stdout: string; stderr: string }>;

function exportWith(cost: number): string {
  const e = JSON.parse(readFileSync(EXPORT, "utf8"));
  e.info.cost = cost;
  return JSON.stringify(e);
}

/** spawn falso: run devolve 2 linhas JSON (1ª com sessionID) + texto final; session export devolve o fixture. */
function fakeSpawn(runText: string, o: { cost?: number; code?: number; stderr?: string } = {}): Spawn {
  const cost = o.cost ?? 0.0000494;
  return async (argv) => {
    if (argv[0] === "opencode" && argv[1] === "run") {
      const l1 = JSON.stringify({ type: "step_start", sessionID: "ses_fake0001", part: {} });
      const l2 = JSON.stringify({ type: "text", sessionID: "ses_fake0001", part: { type: "text", text: runText } });
      return { code: o.code ?? 0, stdout: `${l1}\n${l2}`, stderr: o.stderr ?? "" };
    }
    if (argv[0] === "opencode" && argv[1] === "session" && argv[2] === "export") {
      return { code: 0, stdout: exportWith(cost), stderr: "" };
    }
    return { code: 1, stdout: "", stderr: `argv inesperado: ${argv.join(" ")}` };
  };
}

describe("PLAN-0016 TASK-02: runner", () => {
  test("parseExport do fixture redigido → números exatos", async () => {
    const mod = await import("../../bench/code-mode/runner").catch(() => null);
    expect(mod).not.toBeNull();
    const p = mod!.parseExport(readFileSync(EXPORT, "utf8"));
    expect(p).toEqual({ in: 14810, out: 104, cache: 16320, cost: 0.0000494, turns: 2, reasoning: 85 });
  });

  test('trialArgv("C", modelo, workdir, prompt) → argv exato com --standalone', async () => {
    const mod = await import("../../bench/code-mode/runner").catch(() => null);
    expect(mod).not.toBeNull();
    expect(mod!.trialArgv("C", "opencode/glm-5.3-flash-free", "/w", "p")).toEqual([
      "opencode", "run", "--standalone", "--format", "json",
      "-m", "opencode/glm-5.3-flash-free", "p",
    ]);
  });

  test("runTrial com spawn falso: copia snapshot, stdin fechado, reward 1 e métricas do export", async () => {
    const mod = await import("../../bench/code-mode/runner").catch(() => null);
    const tasks = await import("../../bench/code-mode/tasks").catch(() => null);
    expect(mod).not.toBeNull();
    expect(tasks).not.toBeNull();
    const task = tasks!.TASKS.find((t) => t.id === "t01")!;
    let sawCwd = ""; let sawStdin = "";
    const spawn: Spawn = async (argv, o) => { sawCwd = o.cwd; sawStdin = o.stdin; return fakeSpawn('"approved"')(argv, o); };
    const t = await mod!.runTrial({ task, mode: "C", model: "opencode/glm-5.3-flash-free", k: 1, snapshot: SNAP, spawn });
    expect(sawStdin).toBe("ignore"); // stdin fechado (armadilha do stdin)
    expect(sawCwd).not.toBe(SNAP); // diretório novo (mkdtemp), não o snapshot
    expect(t.task).toBe("t01");
    expect(t.mode).toBe("C");
    expect(t.k).toBe(1);
    expect(t.reward).toBe(1); // último bloco JSON do texto ("approved") bate com o Oracle
    expect(t.infra).toBe(false);
    expect(t.session_id).toBe("ses_fake0001");
    expect(t.tokens_in).toBe(14810);
    expect(t.tokens_out).toBe(104);
    expect(t.cost_usd).toBe(0.0000494);
    expect(t.turns).toBe(2);
    expect(typeof t.latency_ms).toBe("number");
  });

  test("runTrial com erro 429 → infra: true, reward: 0", async () => {
    const mod = await import("../../bench/code-mode/runner").catch(() => null);
    const tasks = await import("../../bench/code-mode/tasks").catch(() => null);
    const task = tasks!.TASKS.find((t) => t.id === "t01")!;
    const spawn = fakeSpawn("", { code: 1, stderr: "HTTP 429 too many requests" });
    const t = await mod!.runTrial({ task, mode: "C", model: "m", k: 1, snapshot: SNAP, spawn });
    expect(t.infra).toBe(true);
    expect(t.reward).toBe(0);
  });

  test("runCells com teto US$ 0,01 e trials de US$ 0,02 → para depois do 1º e grava 1 linha no results.jsonl", async () => {
    const mod = await import("../../bench/code-mode/run").catch(() => null);
    expect(mod).not.toBeNull();
    expect(typeof mod!.runCells).toBe("function"); // run.ts exporta runCells; o CLI só roda com import.meta.main
    const out = join(mkdtempSync(join(tmpdir(), "cm-")), "results.jsonl");
    const spawn = fakeSpawn('"approved"', { cost: 0.02 });
    const trials = await mod!.runCells({ snapshot: SNAP, plan: "piloto", k: 1, capUsd: 0.01, spawn, out });
    expect(trials.length).toBe(1);
    expect(trials[0].cost_usd).toBe(0.02);
    expect(readFileSync(out, "utf8").trim().split("\n").length).toBe(1);
  });
});
