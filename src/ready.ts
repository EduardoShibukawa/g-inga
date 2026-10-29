// ginga ready write (PLAN-0025 TASK-03, follow-up 10 do PLAN-0023): grava
// <root>/.ginga/plans/<plan>/ready/<repo>.json com {branch, by:{pid,cmd}, at}
// só quando todas as TASKs do PLAN para o repo estão done/pass no pinga queue
// da worktree. Par do varredor de ready/ do vigia (src/watch/ready.ts), que
// consome exatamente esta shape.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/;

const USAGE = "uso: ginga ready write --root R --plan <pasta-do-PLAN> --repo <repo> --branch <branch> [--worktree DIR]";

/** `pinga queue --json` → mapa task (último segmento do ref) → state/receipt. */
function readQueueStates(worktree: string): Map<string, { state: string; receiptStatus: string | null }> {
  const map = new Map<string, { state: string; receiptStatus: string | null }>();
  const r = Bun.spawnSync(["pinga", "queue", "--json", "--root", worktree], { stdout: "pipe", stderr: "pipe" });
  if (r.error) throw new Error(`não consegui rodar 'pinga queue' (${(r.error as Error).message})`);
  if (r.exitCode !== 0) throw new Error(`pinga queue saiu com ${r.exitCode ?? "sinal"}: ${r.stderr.toString().trim()}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(r.stdout.toString());
  } catch {
    throw new Error("pinga queue: saída não é JSON");
  }
  const tasks = (parsed as { tasks?: unknown } | null)?.tasks;
  if (!Array.isArray(tasks)) throw new Error("pinga queue: saída sem 'tasks'");
  for (const raw of tasks) {
    if (typeof raw !== "object" || raw === null) continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.task !== "string" || o.task === "") continue;
    const ref = o.task.includes("/") ? o.task.slice(o.task.lastIndexOf("/") + 1) : o.task;
    const receipt = typeof o.receipt === "object" && o.receipt !== null ? (o.receipt as Record<string, unknown>) : null;
    map.set(ref, {
      state: typeof o.state === "string" ? o.state : "",
      receiptStatus: receipt !== undefined && receipt !== null && typeof receipt.status === "string" ? receipt.status : null,
    });
  }
  return map;
}

/** `pinga_task` das TASK-*.md do PLAN cujo frontmatter `repo:` é o repo pedido. */
function collectTasks(planDir: string, repo: string): { file: string; pingaTask: string | null }[] {
  const out: { file: string; pingaTask: string | null }[] = [];
  for (const name of readdirSync(planDir).sort()) {
    if (!/^TASK-.*\.md$/.test(name)) continue;
    let raw: string;
    try {
      raw = readFileSync(join(planDir, name), "utf8");
    } catch {
      continue;
    }
    const m = FRONTMATTER.exec(raw);
    if (!m) continue;
    let fm: unknown;
    try {
      fm = Bun.YAML.parse(m[1] ?? "");
    } catch {
      continue;
    }
    if (typeof fm !== "object" || fm === null) continue;
    const o = fm as Record<string, unknown>;
    if (String(o.repo ?? "") !== repo) continue;
    const t = typeof o.pinga_task === "number" ? String(o.pinga_task) : o.pinga_task;
    out.push({ file: name, pingaTask: typeof t === "string" && t !== "" ? t : null });
  }
  return out;
}

export function readyWriteCmd(args: string[]): number {
  let root: string | undefined;
  let plan: string | undefined;
  let repo: string | undefined;
  let branch: string | undefined;
  let worktree: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--root") { root = args[++i]; continue; }
    if (a.startsWith("--root=")) { root = a.slice("--root=".length); continue; }
    if (a === "--plan") { plan = args[++i]; continue; }
    if (a.startsWith("--plan=")) { plan = a.slice("--plan=".length); continue; }
    if (a === "--repo") { repo = args[++i]; continue; }
    if (a.startsWith("--repo=")) { repo = a.slice("--repo=".length); continue; }
    if (a === "--branch") { branch = args[++i]; continue; }
    if (a.startsWith("--branch=")) { branch = a.slice("--branch=".length); continue; }
    if (a === "--worktree") { worktree = args[++i]; continue; }
    if (a.startsWith("--worktree=")) { worktree = a.slice("--worktree=".length); continue; }
    console.error(`${USAGE} (argumento inesperado: ${a})`);
    return 2;
  }
  for (const [name, value] of [["--plan", plan], ["--repo", repo], ["--branch", branch]] as const) {
    if (value === undefined || value === "") {
      console.error(`${USAGE} (${name} ausente)`);
      return 2;
    }
  }
  const base = root && root !== "" ? root : process.cwd();
  const planDir = join(base, ".ginga", "plans", plan!);
  if (!existsSync(planDir) || !readdirSync(planDir).some((n) => /^TASK-.*\.md$/.test(n))) {
    console.error(`ginga ready write: sem TASK-*.md em ${planDir}`);
    return 1;
  }

  // Worktree padrão da fatia: <root>/<repo>-plan-<NNNN> (NNNN do nome do PLAN).
  let wt = worktree;
  if (wt === undefined || wt === "") {
    const num = /^PLAN-(\d+)/.exec(plan!);
    if (num === null) {
      console.error(`ginga ready write: não derivei a worktree de '${plan}' (use --worktree)`);
      return 2;
    }
    wt = join(base, `${repo}-plan-${num[1]}`);
  }
  if (!existsSync(wt)) {
    console.error(`ginga ready write: worktree ausente: ${wt}`);
    return 1;
  }

  let states: Map<string, { state: string; receiptStatus: string | null }>;
  try {
    states = readQueueStates(wt);
  } catch (e) {
    console.error(`ginga ready write: ${(e as Error).message}`);
    return 1;
  }

  const collected = collectTasks(planDir, repo!);
  const pending: string[] = [];
  for (const t of collected) {
    if (t.pingaTask === null) {
      pending.push(`${t.file}: sem pinga_task (não verificável na fila)`);
      continue;
    }
    const st = states.get(t.pingaTask);
    if (st === undefined) pending.push(`${t.pingaTask} (${t.file}): ausente do pinga queue`);
    else if (st.state !== "done") pending.push(`${t.pingaTask} (${t.file}): state=${st.state || "(vazio)"}`);
    else if (st.receiptStatus !== null && st.receiptStatus !== "pass") pending.push(`${t.pingaTask} (${t.file}): receipt=${st.receiptStatus}`);
  }
  if (pending.length > 0) {
    console.error(`ginga ready write: ${repo} não está pronto (${pending.length} pendência(s)):`);
    for (const p of pending) console.error(`  ${p}`);
    return 1;
  }

  const readyDir = join(planDir, "ready");
  mkdirSync(readyDir, { recursive: true });
  const out = join(readyDir, `${repo}.json`);
  const doc = {
    branch: branch!,
    by: { pid: process.pid, cmd: process.argv.join(" ") },
    at: new Date().toISOString(),
  };
  writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`ready gravado: ${out} (${collected.length} TASK(s) do repo done/pass na fila)`);
  return 0;
}
