import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { processSpawn, runTrial, type Mode, type Spawn, type Trial } from "./runner";
import { TASKS, type CMTask } from "./tasks";

export type Plan = "piloto" | "principal" | "h2" | "h7";

const FREE_MODELS = [
  "opencode/glm-5.3-flash-free",
  "opencode/deepseek-v4.1-flash-free",
];
const ALL_MODELS = [...FREE_MODELS, "opencode/deepseek-v4-pro"];
const ALL_MODES: Mode[] = ["M", "C", "X1", "X2"];

type Cell = { task: CMTask; mode: Mode; model: string };

function defaultK(plan: Plan): number {
  return plan === "piloto" ? 1 : 3;
}

function cellsFor(plan: Plan, k: number): Cell[] {
  const tasks = plan === "piloto" ? TASKS.slice(0, 5) : TASKS;
  const modes = plan === "h2" ? (["X1", "X2"] as Mode[]) : plan === "h7" ? (["X2"] as Mode[]) : ALL_MODES;
  const models = plan === "piloto" || plan === "principal" ? ALL_MODELS : ALL_MODELS;
  const cells: Cell[] = [];

  for (const task of tasks) {
    for (const mode of modes) {
      for (const model of models) {
        for (let attempt = 0; attempt < k; attempt += 1) {
          cells.push({ task, mode, model });
        }
      }
    }
  }
  return cells;
}

function validPlan(value: string): Plan {
  if (value === "piloto" || value === "principal" || value === "h2" || value === "h7") {
    return value;
  }
  throw new Error(`plano inválido: ${value}`);
}

export type RunCellsOptions = {
  snapshot: string;
  plan: Plan;
  k?: number;
  capUsd?: number;
  spawn: Spawn;
  out?: string;
};

/** Executa as células do plano e anexa cada trial ao JSONL. */
export async function runCells(o: RunCellsOptions): Promise<Trial[]> {
  const plan = validPlan(o.plan);
  const k = o.k ?? defaultK(plan);
  if (!Number.isInteger(k) || k < 1) throw new Error("k deve ser um inteiro positivo");
  if (o.capUsd !== undefined && (!Number.isFinite(o.capUsd) || o.capUsd < 0)) {
    throw new Error("cap-usd deve ser um número não negativo");
  }

  const out = resolve(o.out ?? "results.jsonl");
  mkdirSync(dirname(out), { recursive: true });
  const trials: Trial[] = [];
  let totalCost = 0;

  for (const cell of cellsFor(plan, k)) {
    const trial = await runTrial({
      task: cell.task,
      mode: cell.mode,
      model: cell.model,
      k,
      snapshot: o.snapshot,
      spawn: o.spawn,
    });
    trials.push(trial);
    appendFileSync(out, `${JSON.stringify(trial)}\n`);
    totalCost += trial.cost_usd;
    if (o.capUsd !== undefined && totalCost > o.capUsd) break;
  }

  return trials;
}

function usage(): string {
  return [
    "uso: bun bench/code-mode/run.ts --snapshot <dir> --plan piloto|principal|h2|h7",
    "       [--k N] [--cap-usd X] [--out results.jsonl]",
  ].join("\n");
}

function parseArgs(argv: string[]): {
  snapshot: string;
  plan: Plan;
  k?: number;
  capUsd?: number;
  out?: string;
} {
  let snapshot: string | undefined;
  let plan: Plan | undefined;
  let k: number | undefined;
  let capUsd: number | undefined;
  let out: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--help" || flag === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (!value || value.startsWith("--")) throw new Error(`valor ausente para ${flag}\n${usage()}`);
    index += 1;

    if (flag === "--snapshot") snapshot = value;
    else if (flag === "--plan") plan = validPlan(value);
    else if (flag === "--k") k = Number(value);
    else if (flag === "--cap-usd") capUsd = Number(value);
    else if (flag === "--out") out = value;
    else throw new Error(`opção desconhecida: ${flag}\n${usage()}`);
  }

  if (!snapshot) throw new Error(`--snapshot é obrigatório\n${usage()}`);
  if (!plan) throw new Error(`--plan é obrigatório\n${usage()}`);
  return { snapshot, plan, k, capUsd, out };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const trials = await runCells({
    snapshot: args.snapshot,
    plan: args.plan,
    k: args.k,
    capUsd: args.capUsd,
    out: args.out,
    spawn: processSpawn,
  });
  console.log(
    JSON.stringify({
      trials: trials.length,
      cost_usd: trials.reduce((sum, trial) => sum + trial.cost_usd, 0),
      out: resolve(args.out ?? "results.jsonl"),
    }),
  );
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
