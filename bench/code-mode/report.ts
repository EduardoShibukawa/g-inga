import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Mode, Sandbox, Trial } from "./runner";

export type Verdict = "adotar" | "rejeitar" | "informativo" | "inconclusivo";

export interface DecideResult {
  h: "H1" | "H2" | "H3" | "H4" | "H5" | "H7";
  verdict: Verdict;
  evidence: string;
}

type Cell = {
  mode: Mode;
  model: string;
  trials: Trial[];
};

type CellMetrics = {
  reward: number;
  passK: number;
  turns: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  latency: number;
  infra: number;
};

function modelSizeRank(model: string): number {
  const name = model.toLowerCase();
  if (name.includes("flash")) return 0;
  if (name.includes("pro")) return 2;
  return 1;
}

function isSubtaskDifference(difference: number): boolean {
  return difference > 1e-9 && difference < 1 - 1e-9;
}

function cells(trials: Trial[]): Map<string, Cell> {
  const grouped = new Map<string, Cell>();
  for (const trial of trials) {
    const key = `${trial.mode}\u0000${trial.model}`;
    const cell = grouped.get(key) ?? { mode: trial.mode, model: trial.model, trials: [] };
    cell.trials.push(trial);
    grouped.set(key, cell);
  }
  return grouped;
}

function metrics(cell: Cell): CellMetrics {
  const valid = cell.trials.filter((trial) => !trial.infra);
  const mean = (pick: (trial: Trial) => number): number =>
    valid.length === 0 ? 0 : valid.reduce((sum, trial) => sum + pick(trial), 0) / valid.length;

  const byTask = new Map<string, Trial[]>();
  for (const trial of valid) {
    const taskTrials = byTask.get(trial.task) ?? [];
    taskTrials.push(trial);
    byTask.set(trial.task, taskTrials);
  }
  let passedTasks = 0;
  for (const taskTrials of byTask.values()) {
    const required = Math.max(...taskTrials.map((trial) => trial.k));
    if (taskTrials.length >= required && taskTrials.every((trial) => trial.reward === 1)) passedTasks += 1;
  }

  return {
    reward: mean((trial) => trial.reward),
    passK: byTask.size === 0 ? 0 : passedTasks / byTask.size,
    turns: mean((trial) => trial.turns),
    tokensIn: mean((trial) => trial.tokens_in),
    tokensOut: mean((trial) => trial.tokens_out),
    cost: mean((trial) => trial.cost_usd),
    latency: mean((trial) => trial.latency_ms),
    infra: cell.trials.length - valid.length,
  };
}

function modelsFor(grouped: Map<string, Cell>, mode: Mode): string[] {
  return [...grouped.values()].filter((cell) => cell.mode === mode).map((cell) => cell.model);
}

function cell(grouped: Map<string, Cell>, mode: Mode, model: string): CellMetrics | undefined {
  const found = grouped.get(`${mode}\u0000${model}`);
  return found ? metrics(found) : undefined;
}

/** Normaliza o fixture legado da T341; o runner real sempre grava `sandbox`. */
function normalizedSandboxTrials(trials: Trial[]): Trial[] {
  const legacyModels = new Set(
    trials
      .filter((trial) => trial.mode === "X2" && !trial.sandbox && trial.model.endsWith("-min"))
      .map((trial) => trial.model.slice(0, -4)),
  );
  return trials.map((trial) => {
    if (trial.sandbox || trial.mode !== "X2") return trial;
    if (trial.model.endsWith("-min")) {
      return { ...trial, model: trial.model.slice(0, -4), sandbox: "minimal" as const };
    }
    if (legacyModels.has(trial.model)) return { ...trial, sandbox: "full" as const };
    return trial;
  });
}

function sandboxCell(
  trials: Trial[],
  model: string,
  sandbox: Sandbox,
): CellMetrics | undefined {
  const matching = trials.filter(
    (trial) => trial.mode === "X2" && trial.model === model && trial.sandbox === sandbox,
  );
  return matching.length > 0 ? metrics({ mode: "X2", model, trials: matching }) : undefined;
}

export function decide(trials: Trial[]): DecideResult[] {
  const grouped = cells(trials.filter((trial) => trial.sandbox === undefined));
  const results: DecideResult[] = [];

  const h1Models = modelsFor(grouped, "M").filter((model) => modelsFor(grouped, "X2").includes(model));
  const h1Candidates = h1Models.map((model) => {
    const m = cell(grouped, "M", model)!;
    const x2 = cell(grouped, "X2", model)!;
    const difference = Math.abs(m.reward - x2.reward) * 10;
    return {
      model,
      difference,
      tokensPass: m.tokensIn > 0 && x2.tokensIn <= 0.7 * m.tokensIn,
      subtask: isSubtaskDifference(difference),
    };
  });
  const h1Passed = h1Candidates.find(
    (candidate) => candidate.tokensPass && candidate.difference <= 1 && !candidate.subtask,
  );
  const h1Subtask = h1Candidates.find(
    (candidate) => candidate.tokensPass && candidate.subtask,
  );
  results.push({
    h: "H1",
    verdict: h1Models.length === 0
      ? "inconclusivo"
      : h1Passed
        ? "adotar"
        : h1Subtask
          ? "inconclusivo"
          : "rejeitar",
    evidence: h1Passed
      ? `${h1Passed.model}: X2 usou ≤ 0,7× os tokens de M e perdeu no máximo 1 task`
      : h1Subtask
        ? `${h1Subtask.model}: diferença M/X2 = ${h1Subtask.difference.toFixed(1)} task(s), menor que 1 task; inconclusivo`
        : h1Models.length === 0
          ? "sem pares M/X2 do mesmo modelo"
          : "nenhum par M/X2 satisfaz tokens ≤ 0,7× e reward ≥ M − 1 task",
  });

  results.push({
    h: "H2",
    verdict: "informativo",
    evidence: "X1 versus X2 depende dos traces da primeira versão",
  });

  const h3Models = modelsFor(grouped, "C").filter((model) => modelsFor(grouped, "X2").includes(model));
  const h3Difference = h3Models
    .map((model) => {
      const c = cell(grouped, "C", model)!;
      const x2 = cell(grouped, "X2", model)!;
      return { model, difference: Math.abs(c.reward - x2.reward) * 10 };
    })
    .sort((a, b) => a.difference - b.difference);
  const h3Closest = h3Difference[0];
  const h3Subtask =
    h3Closest !== undefined && isSubtaskDifference(h3Closest.difference);
  results.push({
    h: "H3",
    verdict: h3Subtask
      ? "inconclusivo"
      : h3Closest && h3Closest.difference <= 1
        ? "adotar"
        : h3Models.length === 0
          ? "inconclusivo"
          : "rejeitar",
    evidence: h3Closest
      ? h3Subtask
        ? `${h3Closest.model}: diferença C/X2 = ${h3Closest.difference.toFixed(1)} task(s), menor que 1 task; inconclusivo`
        : `${h3Closest.model}: diferença C/X2 = ${h3Closest.difference.toFixed(1)} task(s); não criar execute`
      : "sem pares C/X2 do mesmo modelo",
  });

  const h4Candidates = modelsFor(grouped, "X2")
    .map((model) => ({ model, metrics: cell(grouped, "X2", model)! }))
    .filter(({ metrics: value }) => value.reward >= 0.8)
    .sort((a, b) => modelSizeRank(a.model) - modelSizeRank(b.model) || a.model.localeCompare(b.model));
  const h4Best = h4Candidates[0];
  results.push({
    h: "H4",
    verdict: h4Best ? "informativo" : "inconclusivo",
    evidence: h4Best
      ? `${h4Best.model} é o menor modelo X2 com reward ${(h4Best.metrics.reward * 10).toFixed(1)}/10`
      : "nenhum modelo X2 atingiu reward ≥ 8/10",
  });

  const oracleCells = [...grouped.values()].filter((value) => value.mode === "O");
  const oracleTasks = new Set<string>();
  for (const oracle of oracleCells) {
    for (const trial of oracle.trials) {
      if (!trial.infra && trial.reward === 1) oracleTasks.add(trial.task);
    }
  }
  results.push({
    h: "H5",
    verdict: oracleTasks.size >= 10 ? "adotar" : oracleCells.length === 0 ? "inconclusivo" : "rejeitar",
    evidence: `Oracle resolveu ${oracleTasks.size}/10 tasks`,
  });

  const h7Trials = normalizedSandboxTrials(trials);
  const h7Models = [
    ...new Set(
      h7Trials
        .filter((trial) => trial.mode === "X2" && trial.sandbox !== undefined)
        .map((trial) => trial.model),
    ),
  ];
  const h7Pairs = h7Models.flatMap((model) => {
    const minimal = sandboxCell(h7Trials, model, "minimal");
    const full = sandboxCell(h7Trials, model, "full");
    return minimal && full ? [{ model, minimal, full }] : [];
  });
  const h7Passed = h7Pairs.find(
    ({ minimal, full }) =>
      full.tokensIn > 0 && minimal.tokensIn <= 0.85 * full.tokensIn && minimal.reward === full.reward,
  );
  results.push({
    h: "H7",
    verdict: h7Pairs.length === 0 ? "inconclusivo" : h7Passed ? "adotar" : "rejeitar",
    evidence: h7Passed
      ? `${h7Passed.model}: sandbox minimal usou ≤ 0,85× os tokens de full e manteve o reward`
      : h7Pairs.length === 0
        ? "sem pares X2 mínimo/FS completo"
        : "nenhum par X2 mínimo/FS completo satisfaz tokens ≤ 0,85× com o mesmo reward",
  });

  return results;
}

export function renderReport(trials: Trial[]): string {
  const grouped = cells(trials);
  const lines = [
    "| modo | modelo | reward médio | pass^k | turnos | tokens_in | tokens_out | custo | latência (ms) | infra |",
    "|------|--------|-------------|--------|--------|-----------|------------|-------|----------------|------|",
  ];

  for (const cell of grouped.values()) {
    const value = metrics(cell);
    lines.push(
      `| ${cell.mode} | ${cell.model} | ${value.reward.toFixed(2)} | ${(value.passK * 100).toFixed(1)}% | ` +
        `${value.turns.toFixed(1)} | ${value.tokensIn.toFixed(0)} | ${value.tokensOut.toFixed(0)} | ` +
        `${value.cost.toFixed(4)} | ${value.latency.toFixed(0)} | ${value.infra} |`,
    );
  }

  return lines.join("\n");
}

function readTrials(path: string): Trial[] {
  const text = readFileSync(resolve(path), "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        const value = JSON.parse(line) as Trial;
        if (!value || typeof value !== "object" || typeof value.task !== "string") {
          throw new Error("trial sem task");
        }
        return value;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`results inválido na linha ${index + 1}: ${message}`);
      }
    });
}

function main(): void {
  const path = process.argv[2] ?? "results.jsonl";
  const trials = readTrials(path);
  console.log(renderReport(trials));
  console.log("");
  for (const result of decide(trials)) {
    console.log(`${result.h}: ${result.verdict} — ${result.evidence}`);
  }
}

if (import.meta.main) {
  try {
    main();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
