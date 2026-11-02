import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..");
const SNAP = join(ROOT, "tests", "fixtures", "code-mode", "snapshot");

function trial(overrides: Record<string, unknown>): any {
  return {
    task: "t01",
    mode: "X2",
    model: "opencode/glm-5.3-flash-free",
    k: 1,
    reward: 1,
    turns: 1,
    tokens_in: 1000,
    tokens_out: 100,
    cost_usd: 0,
    latency_ms: 1,
    infra: false,
    ...overrides,
  };
}

function arm(model: string, rewards: number[], tokens: number, sandbox?: string): any[] {
  return rewards.map((reward, index) =>
    trial({
      task: `t${String(index + 1).padStart(2, "0")}`,
      model,
      reward,
      tokens_in: tokens,
      ...(sandbox ? { sandbox } : {}),
    }),
  );
}

describe("PLAN-0016 TASK-08: critérios do relatório e CLI", () => {
  test("H4 escolhe o menor modelo, não quem consome menos tokens", async () => {
    const report = await import("../../bench/code-mode/report");
    const trials = [
      ...arm("opencode/glm-5.3-flash-free", [1, 1, 1, 1, 1, 1, 1, 1, 0, 0], 9000),
      ...arm("opencode/deepseek-v4-pro", Array(10).fill(1), 1000),
    ];
    const h4 = report.decide(trials).find((item) => item.h === "H4")!;
    expect(h4.verdict).toBe("informativo");
    expect(h4.evidence).toContain("opencode/glm-5.3-flash-free");
    expect(h4.evidence).not.toContain("opencode/deepseek-v4-pro");
  });

  test("H7 pareia minimal/full pelo campo sandbox explícito", async () => {
    const report = await import("../../bench/code-mode/report");
    const model = "opencode/glm-5.3-flash-free";
    const trials = [
      ...arm(model, Array(10).fill(1), 1000, "full"),
      ...arm(model, Array(10).fill(1), 800, "minimal"),
    ];
    const h7 = report.decide(trials).find((item) => item.h === "H7")!;
    expect(h7.verdict).toBe("adotar");
    expect(h7.evidence).toContain("minimal");
    expect(h7.evidence).toContain("full");
  });

  test("runCells h7 gera os dois braços sandbox para a mesma task/model", async () => {
    const run = await import("../../bench/code-mode/run");
    const out = join(mkdtempSync(join(tmpdir(), "cm-h7-")), "results.jsonl");
    const spawn = async (argv: string[]) => {
      if (argv[1] === "run") {
        return {
          code: 0,
          stdout: `${JSON.stringify({ type: "step_start", sessionID: "ses_h7", part: {} })}\n${JSON.stringify({ type: "text", part: { text: '"approved"' } })}\n`,
          stderr: "",
        };
      }
      if (argv[1] === "session") {
        return {
          code: 0,
          stdout: JSON.stringify({
            info: {
              cost: 0.02,
              tokens: { input: 100, output: 10, cache: { read: 0 }, reasoning: 0 },
            },
            messages: [{ type: "assistant" }],
          }),
          stderr: "",
        };
      }
      return { code: 1, stdout: "", stderr: `argv inesperado: ${argv.join(" ")}` };
    };
    const trials = await run.runCells({
      snapshot: SNAP,
      plan: "h7",
      k: 1,
      capUsd: 0.03,
      spawn,
      out,
    });
    expect(trials).toHaveLength(2);
    expect(new Set(trials.map((item: any) => item.sandbox))).toEqual(
      new Set(["full", "minimal"]),
    );
    expect(trials[0].task).toBe(trials[1].task);
    expect(trials[0].model).toBe(trials[1].model);
  });

  test("diferença H3 não nula e menor que 1 task é inconclusiva", async () => {
    const report = await import("../../bench/code-mode/report");
    const model = "opencode/glm-5.3-flash-free";
    const trials = [
      ...arm(model, [...Array(19).fill(1), 0], 1000).map((item) => ({
        ...item,
        mode: "C",
      })),
      ...arm(model, [...Array(18).fill(1), 0, 0], 1000),
    ];
    const h3 = report.decide(trials).find((item) => item.h === "H3")!;
    expect(h3.verdict).toBe("inconclusivo");
  });

  test("a CLI lê results.jsonl e imprime tabela e vereditos", () => {
    const dir = mkdtempSync(join(tmpdir(), "cm-report-cli-"));
    const results = join(dir, "results.jsonl");
    try {
      writeFileSync(
        results,
        `${JSON.stringify(trial({ mode: "O", model: "oracle", reward: 1 }))}\n`,
      );
      const output = execFileSync(
        process.execPath,
        ["bench/code-mode/report.ts", results],
        { cwd: ROOT, encoding: "utf8", stdio: "pipe" },
      );
      expect(output).toContain("reward");
      expect(output).toContain("H1");
      expect(output).toContain("H7");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
