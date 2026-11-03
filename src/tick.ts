// `ginga tick` (PLAN-0010 TASK-02): varre a fila (`[commands].queue`) e
// despacha cada TASK `open` sem `blocked_by` por `[commands].dispatch`
// (padrão `manda run {plan} --task {task}`). O claim é atômico entre processos:
// BEGIN IMMEDIATE + busy_timeout em task_exec marca `running` com lease
// (`lease_owner`, `lease_until` em epoch ms, renovado enquanto o despacho
// roda); no fim o lease é liberado e o status vira `dispatched` (exit 0,
// não despacha de novo) ou `failed` (exit ≠ 0, volta à fila). Lease vencido
// volta à fila; lease válido de outro dono bloqueia. Aqui só se decide QUANDO
// despachar: o que roda, com que runtime/modelo, é do `manda`.
//
// A renovação em tempo real precisa do event loop, então src/cli.ts usa este
// arquivo como worker (sync fachada → `bun src/tick.ts tick …`).

import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { Database } from "bun:sqlite";
import { emitEvent } from "./events/emit.ts";
import { getPhase, setPhase } from "./plan_phase.ts";
import { quotaCapOk, readQuotas } from "./quota/index.ts";
import { nextAction } from "./tick_plan.ts";

/** TTL do lease; vencido, outro tick pode assumir a TASK. */
const LEASE_TTL_MS = 60_000;
/** Renova o lease enquanto o despacho roda, a TTL/3. */
const RENEW_MS = LEASE_TTL_MS / 3;
/** Contenda entre ticks paralelos: espera em vez de quebrar com SQLITE_BUSY. */
const BUSY_TIMEOUT_MS = 10_000;

type QueueEntry = { ref: string; plan: string; task: string; state: string; blocked_by: string[] };
type Exec = { plan: string; task: string };
type Commands = { queue: string; dispatch: string; red?: string; run?: string; judge?: string; merge?: string; replan?: string; notify?: string };

const DEFAULT_COMMANDS: Commands = {
  queue: "pinga queue --json --root {root}",
  dispatch: "manda run {plan} --task {task}",
  red: "manda red {plan}",
  run: "manda run {plan} {task}",
  judge: "manda judge {plan}",
  merge: "bin/merge-gate.sh {plan}",
  replan: "manda replan {plan} {task}",
};

/** `queue = "…"`/`dispatch = "…"` da seção [commands] do project.toml. */
export function parseCommands(raw: string): Partial<Commands> {
  const cmds: Partial<Commands> = {};
  let section = "";
  for (const line of raw.split("\n")) {
    const head = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (head) {
      section = head[1]!.trim();
      continue;
    }
    const kv = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*"(.*)"\s*$/);
    if (kv && section === "commands") {
      const key = kv[1]! as keyof Commands;
      if (key === "queue" || key === "dispatch" || key === "red" || key === "run" || key === "judge" || key === "merge" || key === "replan" || key === "notify") {
        cmds[key] = kv[2]!;
      }
    }
  }
  return cmds;
}

function readCommands(root: string): Commands {
  let raw = "";
  try {
    raw = readFileSync(join(root, ".ginga", "project.toml"), "utf8");
  } catch {
    // sem project.toml: valem os comandos padrão
  }
  return { ...DEFAULT_COMMANDS, ...parseCommands(raw) };
}

/** Substitui {plan}, {task} e {root} no comando configurado. */
function fill(command: string, vars: Record<string, string>): string {
  return command.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? vars[key]! : m));
}

/** Lê o JSON da fila vindo do comando de queue configurado. */
export function readQueue(root: string, command: string): QueueEntry[] {
  const r = Bun.spawnSync(["/bin/sh", "-c", fill(command, { root })], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`queue saiu com ${r.exitCode ?? "sinal"}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(r.stdout.toString("utf8"));
  } catch {
    throw new Error("fila não é JSON");
  }
  const tasks = (parsed as { tasks?: unknown } | null)?.tasks;
  if (!Array.isArray(tasks)) throw new Error("fila sem 'tasks'");
  const out: QueueEntry[] = [];
  for (const raw of tasks) {
    if (typeof raw !== "object" || raw === null) continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.task !== "string" || o.task === "") continue;
    out.push({
      ref: o.task,
      plan: typeof o.plan === "string" && o.plan !== "" ? o.plan : o.task.split("/")[0],
      task: o.task.includes("/") ? o.task.slice(o.task.lastIndexOf("/") + 1) : o.task,
      state: typeof o.state === "string" ? o.state : "",
      blocked_by: Array.isArray(o.blocked_by) ? o.blocked_by.filter((d): d is string => typeof d === "string") : [],
    });
  }
  return out;
}

type ExecRow = {
  status: string | null;
  attempts: number | null;
  lease_owner: string | null;
  lease_until: number | string | null;
};

function getRow(db: Database, exec: Exec): ExecRow | null {
  return db
    .query("SELECT status, attempts, lease_owner, lease_until FROM task_exec WHERE plan = ? AND task = ?")
    .get(exec.plan, exec.task) as ExecRow | null;
}

/** lease_until em epoch ms (número ou o texto da affinity TEXT da coluna). */
function leaseVivo(until: number | string | null, now: number): boolean {
  if (until === null) return false;
  const n = Number(until);
  return Number.isFinite(n) && n > now;
}

/** (Re)claim possível: sem row, `failed`, `running` sem lease ou lease vencido. */
function claimavel(row: ExecRow | null, now: number): boolean {
  if (row === null) return true;
  if (row.status === "dispatched") return false;
  if (row.status === "running" && leaseVivo(row.lease_until, now)) return false;
  return true;
}

/** Claim atômico: BEGIN IMMEDIATE decide dono; retry soma attempts, primeiro é 1. */
function claim(db: Database, exec: Exec, owner: string): boolean {
  const now = Date.now();
  db.run("BEGIN IMMEDIATE");
  try {
    const row = getRow(db, exec);
    if (!claimavel(row, now)) {
      db.run("ROLLBACK");
      return false;
    }
    const attempts = Number(row?.attempts ?? 0) + 1;
    if (row === null) {
      db.query(
        "INSERT INTO task_exec(plan, task, status, attempts, lease_owner, lease_until) VALUES(?, ?, 'running', ?, ?, ?)",
      ).run(exec.plan, exec.task, attempts, owner, now + LEASE_TTL_MS);
    } else {
      db.query(
        "UPDATE task_exec SET status = 'running', attempts = ?, lease_owner = ?, lease_until = ? WHERE plan = ? AND task = ?",
      ).run(attempts, owner, now + LEASE_TTL_MS, exec.plan, exec.task);
    }
    db.run("COMMIT");
    return true;
  } catch (e) {
    try {
      db.run("ROLLBACK");
    } catch {
      // sem transação aberta
    }
    console.error(`tick: claim de ${exec.plan}/${exec.task} falhou: ${(e as Error).message}`);
    return false;
  }
}

/** Renova o lease do dono atual (se ainda for o dono). */
function renovate(db: Database, exec: Exec, owner: string): void {
  try {
    db.query(
      "UPDATE task_exec SET lease_until = ? WHERE plan = ? AND task = ? AND lease_owner = ?",
    ).run(Date.now() + LEASE_TTL_MS, exec.plan, exec.task, owner);
  } catch {
    // melhor esforço: a próxima renovação cobre
  }
}

/** task pending → running, emitido por system. */
function emitTransition(exec: Exec): void {
  emitEvent({
    source: "ginga",
    kind: "transition",
    plan: exec.plan,
    task: exec.task,
    data: { entity: "task", from: "pending", to: "running", by: "system", via: "cli" },
  });
}

/** Roda o comando de dispatch no shell, renovando o lease até o fim. */
async function despachar(
  command: string,
  json: boolean,
  renew: () => void,
  onChild?: (child: any | null) => void,
): Promise<number> {
  const child = Bun.spawn(["/bin/sh", "-c", command], {
    stdin: "ignore",
    stdout: json ? "ignore" : "inherit",
    stderr: json ? "ignore" : "inherit",
  });
  onChild?.(child);
  const timer = setInterval(renew, RENEW_MS);
  if (typeof timer === "object" && typeof timer.unref === "function") timer.unref();
  try {
    await child.exited;
    return child.exitCode ?? 1;
  } finally {
    clearInterval(timer);
    onChild?.(null);
  }
}

/** Fim do despacho: solta o lease e grava o resultado (dispatched | failed). */
function finalize(db: Database, exec: Exec, code: number): void {
  const status = code === 0 ? "dispatched" : "failed";
  db.run("BEGIN IMMEDIATE");
  try {
    db.query("UPDATE task_exec SET status = ?, lease_owner = NULL, lease_until = NULL WHERE plan = ? AND task = ?").run(
      status,
      exec.plan,
      exec.task,
    );
    db.run("COMMIT");
  } catch (e) {
    try {
      db.run("ROLLBACK");
    } catch {
      // sem transação aberta
    }
    console.error(`tick: salvar ${status} de ${exec.plan}/${exec.task} falhou: ${(e as Error).message}`);
  }
}

/** Schema completo do state.db, com `lease_until INTEGER`: o epoch ms precisa
 *  voltar como número para quem lê o banco (lease vivo é comparável a
 *  Date.now()). Demais tabelas idênticas ao contrato de src/state/db.ts;
 *  `IF NOT EXISTS` respeita um banco que já exista (com outra shape ou não). */
const STATE_DB_SCHEMA = `
CREATE TABLE IF NOT EXISTS task_exec (
  plan TEXT NOT NULL,
  task TEXT NOT NULL,
  status TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_until INTEGER,
  PRIMARY KEY (plan, task)
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  ts TEXT,
  kind TEXT,
  plan TEXT,
  task TEXT,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS offsets (
  path TEXT PRIMARY KEY,
  byte INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS plan_thread (
  plan TEXT NOT NULL,
  target TEXT NOT NULL,
  thread_id TEXT,
  PRIMARY KEY (plan, target)
);
CREATE TABLE IF NOT EXISTS plan_phase (
  plan TEXT PRIMARY KEY,
  phase TEXT,
  since TEXT,
  replans INTEGER NOT NULL DEFAULT 0
);
`;

/** Abre o state.db tolerando o open em corrida com outro tick (retry curto). */
function openDbForTick(path: string): Database {
  mkdirSync(dirname(path), { recursive: true });
  let last: Error | null = null;
  for (let i = 0; i < 50; i++) {
    try {
      const db = new Database(path);
      db.run(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
      db.run(STATE_DB_SCHEMA);
      return db;
    } catch (e) {
      last = e as Error;
      Bun.sleepSync(10);
    }
  }
  throw last ?? new Error("state.db indisponível");
}

function getPlanTasksState(db: Database, plan: string) {
  // Try to get from task_exec or infer from queue context
  const rows = db
    .query("SELECT task, status, attempts FROM task_exec WHERE plan = ?")
    .all(plan) as Array<{ task: string; status: string | null; attempts: number | null }>;
  // Also need deps_done and blocked info - for now look up from queue? Or use sensible defaults
  return rows.map((r) => ({
    id: plan + "/" + r.task,
    status: (r.status === "dispatched" ? "pass" : r.status === "failed" ? "fail" : r.status === "blocked" ? "blocked" : "open") as any,
    attempts: Number(r.attempts ?? 0),
    deps_done: true,
  }));
}

/** Status do frontmatter do PLAN.md do bundle (seed da fase no fluxo de fases). */
function planFrontmatterStatus(root: string, plan: string): string | null {
  try {
    const raw = readFileSync(join(root, ".ginga", "plans", plan, "PLAN.md"), "utf8");
    return raw.match(/^status:\s*(.+)$/m)?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Veredito mais recente do judge em `.ginga/plans/<plan>/judge/*.json` →
 * "pass" | "high" (falha grave) | outro veredito | undefined (sem judge).
 */
function readJudgeVerdict(root: string, plan: string): string | undefined {
  try {
    const dir = join(root, ".ginga", "plans", plan, "judge");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    const last = files[files.length - 1];
    if (!last) return undefined;
    const parsed = JSON.parse(readFileSync(join(dir, last), "utf8"));
    const verdict = parsed?.judge?.verdict;
    if (verdict === "pass") return "pass";
    const items = Array.isArray(parsed?.judge?.items) ? parsed.judge.items : [];
    if (items.some((it: any) => it?.severity === "grave" && it?.ok === false)) return "high";
    return typeof verdict === "string" ? verdict : undefined;
  } catch {
    return undefined;
  }
}

type TickOptions = {
  dryRun: boolean;
  json: boolean;
  loop: boolean;
  base: string;
  repo?: string;
};

type LoopControl = {
  readonly stopped: boolean;
  setChild(child: any | null): void;
  sleep(ms: number): Promise<void>;
  dispose(): void;
};

function stateDbPath(base: string): string {
  return process.env.GINGA_STATE_DB && process.env.GINGA_STATE_DB !== ""
    ? process.env.GINGA_STATE_DB
    : join(base, ".ginga", "state", "state.db");
}

/** Filtro do supervisor: o repo exato ou qualquer PLAN que comece por ele. */
function filterQueueByRepo(queue: QueueEntry[], repo: string | undefined): QueueEntry[] {
  if (!repo) return queue;
  return queue.filter((entry) => entry.plan === repo || entry.plan.startsWith(repo));
}

/**
 * Pendência claimável do loop: TASK aberta, sem dependência, sem status
 * `dispatched` e sem lease vivo. Uma lease válida de outro tick não conta.
 */
function queueHasClaimablePending(queue: QueueEntry[], dbPath: string): boolean {
  const candidates = queue.filter((entry) => entry.state === "open" && entry.blocked_by.length === 0);
  if (candidates.length === 0) return false;
  if (!existsSync(dbPath)) return true;
  const db = openDbForTick(dbPath);
  try {
    const now = Date.now();
    return candidates.some((entry) =>
      claimavel(getRow(db, { plan: entry.plan, task: entry.task }), now),
    );
  } finally {
    db.close();
  }
}

function envNonNegativeInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

/** Interrompe o loop com exit 0 quando o processo recebe SIGTERM/SIGINT. */
function createLoopControl(): LoopControl {
  let stopped = false;
  let activeChild: any | null = null;
  let wakeSleep: (() => void) | null = null;

  const onSignal = () => {
    stopped = true;
    wakeSleep?.();
    try {
      activeChild?.kill();
    } catch {
      // o filho já pode ter terminado
    }
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);

  return {
    get stopped() {
      return stopped;
    },
    setChild(child: any | null) {
      activeChild = child;
      if (stopped && child) {
        try {
          child.kill();
        } catch {
          // o filho já pode ter terminado
        }
      }
    },
    sleep(ms: number): Promise<void> {
      if (stopped) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          wakeSleep = null;
          resolve();
        }, ms);
        wakeSleep = () => {
          clearTimeout(timer);
          wakeSleep = null;
          resolve();
        };
        if (stopped) wakeSleep?.();
      });
    },
    dispose() {
      process.off("SIGTERM", onSignal);
      process.off("SIGINT", onSignal);
      activeChild = null;
      wakeSleep = null;
    },
  };
}

function printTickResult(options: TickOptions, dispatched: string[]): void {
  if (options.json) console.log(JSON.stringify({ dispatched }));
  else if (options.dryRun) for (const ref of dispatched) console.log(`despacharia: ${ref}`);
}

/** Ponto de entrada do worker: `bun src/tick.ts tick […flags]`. */
export async function runTick(args: string[]): Promise<number> {
  let dryRun = false;
  let json = false;
  let loop = false;
  let root: string | undefined;
  let repo: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--dry-run") dryRun = true;
    else if (a === "--json") json = true;
    else if (a === "--loop") loop = true;
    else if (a === "--repo") {
      const value = args[++i];
      if (value === undefined || value === "" || value.startsWith("--")) {
        console.error("uso: ginga tick [--dry-run] [--json] [--loop] [--repo R] [--root D] (falta valor para --repo)");
        return 2;
      }
      repo = value;
    } else if (a.startsWith("--repo=")) {
      repo = a.slice("--repo=".length);
      if (repo === "") {
        console.error("uso: ginga tick [--dry-run] [--json] [--loop] [--repo R] [--root D] (falta valor para --repo)");
        return 2;
      }
    } else if (a === "--root") root = args[++i];
    else if (a.startsWith("--root=")) root = a.slice("--root=".length);
    else {
      console.error(`uso: ginga tick [--dry-run] [--json] [--loop] [--repo R] [--root D] (flag desconhecida: ${a})`);
      return 2;
    }
  }
  const base = root && root !== "" ? root : process.cwd();
  const options: TickOptions = { dryRun, json, loop, base, repo };
  const commands = readCommands(base);

  let queue: QueueEntry[];
  try {
    queue = filterQueueByRepo(readQueue(base, commands.queue), repo);
  } catch (e) {
    console.error(`tick: fila indisponível: ${(e as Error).message}`);
    return 1;
  }

  const dispatched: string[] = [];
  if (!loop) {
    const code = await runTickPass(options, commands, queue, dispatched);
    printTickResult(options, dispatched);
    return code;
  }

  const dbPath = stateDbPath(base);
  const maxPasses = envNonNegativeInt("GINGA_TICK_LOOP_MAX", 0);
  const loopMs = envNonNegativeInt("GINGA_TICK_LOOP_MS", 5_000);
  const control = createLoopControl();
  try {
    let passes = 0;
    while (!control.stopped) {
      if (maxPasses > 0 && passes >= maxPasses) break;
      if (!queueHasClaimablePending(queue, dbPath)) break;

      const code = await runTickPass(options, commands, queue, dispatched, control);
      if (code !== 0) return code;
      passes++;
      if (control.stopped) break;
      if (maxPasses > 0 && passes >= maxPasses) break;

      try {
        queue = filterQueueByRepo(readQueue(base, commands.queue), repo);
      } catch (e) {
        console.error(`tick: fila indisponível: ${(e as Error).message}`);
        return 1;
      }
      if (!queueHasClaimablePending(queue, dbPath)) break;
      await control.sleep(loopMs);
    }
  } finally {
    control.dispose();
  }
  printTickResult(options, dispatched);
  return 0;
}

/** Uma passada do tick; no loop, o wrapper repete enquanto houver pendência. */
async function runTickPass(
  options: TickOptions,
  commands: Commands,
  queue: QueueEntry[],
  despachadas: string[],
  control?: LoopControl,
): Promise<number> {
  const { dryRun, json, base } = options;
  const dbPath = stateDbPath(base);
  const owner = `tick-${process.pid}`;

  let db: Database | null = null;
  try {
    // dry-run não grada nada: só a fila e, se o db já existir, leitura de lease.
    db = dryRun ? (existsSync(dbPath) ? openDbForTick(dbPath) : null) : openDbForTick(dbPath);
    
    // First, try phase-based tick for plans that have plan_phase
    if (db) {
      const plans = [...new Set(queue.map(q => q.plan))];
      for (const plan of plans) {
        if (control?.stopped) break;
        let planPhase = getPhase(db, plan);
        if (!planPhase) {
          // TASK-08 (e2e sem humano): PLAN aprovado no bundle sem linha de fase
          // entra no fluxo de fases como "approved".
          if (planFrontmatterStatus(base, plan) === "approved") {
            setPhase(db, plan, "approved", "seed: PLAN.md approved");
            planPhase = getPhase(db, plan);
          }
        }
        if (!planPhase) continue; // not phase-managed
        // Build tasks state from queue entries for this plan
        const planEntries = queue.filter(q => q.plan === plan);
        const tasksState = planEntries.map(e => {
          // Try to get attempts from task_exec
          let attempts = 0;
          try {
            const row = db.query("SELECT attempts, status FROM task_exec WHERE plan = ? AND task = ?").get(plan, e.task) as any;
            if (row) {
              attempts = Number(row.attempts ?? 0);
            }
          } catch {}
          // Determine status
          let status: any = "open";
          if (e.state === "pass" || e.state === "done") status = "pass";
          else if (e.state === "fail") status = "fail";
          else if (e.state === "blocked") status = "blocked";
          else status = "open";
          return {
            id: e.ref,
            status,
            attempts,
            deps_done: (e.blocked_by?.length ?? 0) === 0,
          };
        });
        const action = nextAction({
          phase: planPhase.phase,
          tasks: tasksState,
          cap_ok: quotaCapOk(readQuotas({ home: process.env.HOME ?? homedir(), db })),
          judge: readJudgeVerdict(base, plan),
        });
        if (action.cmd === "none" || action.cmd === "notify") continue;
        // Execute action
        const cmdTemplate = (commands as any)[action.cmd];
        if (!cmdTemplate) continue;
        const cmdVars: Record<string, string> = { plan, root: base };
        if (action.task) cmdVars.task = action.task;
        const command = fill(cmdTemplate, cmdVars);
        if (dryRun) {
          despachadas.push(action.task ? `${plan}/${action.task}` : plan);
          continue;
        }
        const code = await despachar(command, json, () => {}, (child) => control?.setChild(child));
        // red/run avançam a fase no DESPACHO (a tentativa conta mesmo falhando,
        // para o replan depois de 3 falhas ver attempts no task_exec).
        if (action.cmd === "red") {
          setPhase(db, plan, "red", "red");
        } else if (action.cmd === "run") {
          setPhase(db, plan, "tasks", "run");
          if (action.task) {
            const row = db
              .query("SELECT attempts FROM task_exec WHERE plan = ? AND task = ?")
              .get(plan, action.task) as { attempts: number } | undefined;
            const att = Number(row?.attempts ?? 0) + 1;
            db.query(
              "INSERT INTO task_exec(plan, task, status, attempts, lease_owner, lease_until) VALUES(?, ?, ?, ?, NULL, NULL) ON CONFLICT(plan, task) DO UPDATE SET attempts = excluded.attempts, status = excluded.status",
            ).run(plan, action.task, code === 0 ? "dispatched" : "failed", att);
          }
        }
        if (code === 0) {
          despachadas.push(action.task ? `${plan}/${action.task}` : plan);
          if (!json) console.log(`despachado: ${action.task ? `${plan}/${action.task}` : plan}`);
          // Update phase based on action
          if (action.cmd === "judge") {
            setPhase(db, plan, "judge", "judge");
          } else if (action.cmd === "merge") {
            setPhase(db, plan, "done", "merge");
          } else if (action.cmd === "replan") {
            setPhase(db, plan, "replan", "replan");
          }
        } else {
          console.error(`tick: ${action.task ? `${plan}/${action.task}` : plan} saiu com ${code}`);
        }
        continue;
      }
    }
    
    for (const entry of queue) {
      if (control?.stopped) break;
      if (entry.state !== "open" || entry.blocked_by.length > 0) continue;
      // Skip if this plan is phase-managed and we handled it above?
      if (db) {
        const pp = getPhase(db, entry.plan);
        if (pp) continue; // handled in phase-based logic
      }
      const exec: Exec = { plan: entry.plan, task: entry.task };
      if (dryRun) {
        const row = db ? getRow(db, exec) : null;
        if (claimavel(row, Date.now())) despachadas.push(entry.ref);
        continue;
      }
      if (!claim(db, exec, owner)) continue;
      emitTransition(exec);
      const command = fill(commands.dispatch, { plan: exec.plan, task: exec.task, root: base });
      const code = await despachar(
        command,
        json,
        () => renovate(db!, exec, owner),
        (child) => control?.setChild(child),
      );
      finalize(db!, exec, code);
      if (code === 0) {
        despachadas.push(entry.ref);
        if (!json) console.log(`despachado: ${entry.ref}`);
      } else {
        console.error(`tick: ${entry.ref} saiu com ${code} (failed: volta à fila)`);
      }
    }
  } finally {
    db?.close();
  }

  return 0;
}

if (import.meta.main) {
  process.exit(await runTick(process.argv.slice(2)));
}
