import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * PLAN-0010 TASK-02: `ginga tick [--dry-run] [--json] [--root D]`.
 * - A fila vem de `[commands].queue` (padrão `pinga queue --json --root {root}`): JSON de `pinga queue` com
 *   `tasks[{task:"PLAN-0001/TASK-01", plan, state, blocked_by}]`. Candidata = `state: open`, `blocked_by` vazio e sem lease válido.
 *   (PLAN approved e receipt `pass` já estão no `state` da fila; PLAN pausado fica fora deste teste.)
 * - Despacho por `[commands].dispatch` (padrão `manda run {plan} --task {task}`), com `{plan}`=PLAN-0001 e `{task}`=TASK-01.
 * - `task_exec` (plan, task curto): claim com lease (`lease_owner`, `lease_until` em epoch ms) durante o despacho;
 *   no fim o lease é liberado; exit 0 → `status: dispatched` (não volta a ser despachada), exit ≠ 0 → `failed` (volta à fila);
 *   `attempts` conta os despachos. Lease vencido volta à fila; lease válido de outro dono bloqueia.
 * - Emite `transition` (task, pending → running, `by: system`) em `$GINGA_EVENTS`.
 * - `--dry-run`: lista sem despachar nem gravar; `--json`: `{"dispatched":["PLAN-0001/TASK-01",...]}`.
 */

setDefaultTimeout(20000);

const ROOT = join(import.meta.dir, "..");
const BIN = join(ROOT, "bin", "ginga.ts");
const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});

type Q = { task: string; state: string; blocked_by?: string[] };
const entry = (task: string, state = "open", blocked_by: string[] = []) => ({ task, plan: task.split("/")[0], state, blocked_by });

function setup(queue: Q[], o: { exit?: number; sleep?: number } = {}) {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-tick-")));
  tmps.push(dir);
  mkdirSync(join(dir, ".ginga"), { recursive: true });
  writeFileSync(join(dir, "queue.json"), JSON.stringify({ tasks: queue }));
  const stub = join(dir, "dispatch-stub.sh");
  // registra `<args>` (uma linha por chamada) e dorme para sobrepor processos
  writeFileSync(stub, `#!/bin/sh\necho "$@" >> "${dir}/dispatch.log"\nsleep ${o.sleep ?? 0}\nexit ${o.exit ?? 0}\n`);
  chmodSync(stub, 0o755);
  writeFileSync(join(dir, ".ginga", "project.toml"), `[commands]\nqueue = "cat ${dir}/queue.json"\ndispatch = "${stub} run {plan} --task {task}"\n`);
  const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: dir, GINGA_STATE_DB: join(dir, "state.db"), GINGA_EVENTS: join(dir, "events.jsonl") };
  const tick = (args: string[] = []) => {
    const r = Bun.spawnSync(["bun", BIN, "tick", "--root", dir, ...args], { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
    return { exit: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
  };
  const calls = () => (existsSync(join(dir, "dispatch.log")) ? readFileSync(join(dir, "dispatch.log"), "utf8").split("\n").filter(Boolean).sort() : []);
  const db = async () => ((await import(join(ROOT, "src", "state", "db.ts"))) as any).openStateDb(join(dir, "state.db"));
  const events = () => (existsSync(env.GINGA_EVENTS!) ? readFileSync(env.GINGA_EVENTS!, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  return { dir, env, tick, calls, db, events };
}

describe("ginga tick: quem é despachado", () => {
  test("só TASK open e sem dependência aberta; cada uma com `run <plan> --task <task>`", () => {
    const w = setup([entry("PLAN-0001/TASK-01"), entry("PLAN-0001/TASK-02", "open", ["PLAN-0001/TASK-01"]), entry("PLAN-0001/TASK-03", "done"), entry("PLAN-0001/TASK-04", "blocked"), entry("PLAN-0002/TASK-01")]);
    const r = w.tick(["--json"]);
    expect(r.exit).toBe(0);
    expect(JSON.parse(r.out).dispatched.sort()).toEqual(["PLAN-0001/TASK-01", "PLAN-0002/TASK-01"]);
    expect(w.calls()).toEqual(["run PLAN-0001 --task TASK-01", "run PLAN-0002 --task TASK-01"]);
  });

  test("tick seguinte com a fila igual não despacha de novo (status dispatched)", async () => {
    const w = setup([entry("PLAN-0001/TASK-01")]);
    w.tick();
    w.tick();
    expect(w.calls()).toEqual(["run PLAN-0001 --task TASK-01"]);
    const db = await w.db();
    expect(db.query("SELECT plan, task, status, attempts, lease_owner FROM task_exec").all()).toEqual([{ plan: "PLAN-0001", task: "TASK-01", status: "dispatched", attempts: 1, lease_owner: null }]);
    db.close();
  });

  test("despacho com exit ≠ 0: status failed, lease liberado e a TASK volta na fila do próximo tick", async () => {
    const w = setup([entry("PLAN-0001/TASK-01")], { exit: 3 });
    w.tick();
    w.tick();
    expect(w.calls().length).toBe(2);
    const db = await w.db();
    expect(db.query("SELECT status, attempts, lease_owner, lease_until FROM task_exec").all()).toEqual([{ status: "failed", attempts: 2, lease_owner: null, lease_until: null }]);
    db.close();
  });
});

describe("ginga tick: lease", () => {
  test("lease válido de outro dono bloqueia; lease vencido volta à fila e troca de dono", async () => {
    const w = setup([entry("PLAN-0001/TASK-01"), entry("PLAN-0001/TASK-02")]);
    const db = await w.db();
    const ins = "INSERT INTO task_exec(plan, task, status, attempts, lease_owner, lease_until) VALUES(?, ?, 'running', 1, 'outro-tick', ?)";
    db.run(ins, ["PLAN-0001", "TASK-01", Date.now() + 60_000]);
    db.run(ins, ["PLAN-0001", "TASK-02", Date.now() - 60_000]);
    db.close();
    w.tick();
    expect(w.calls()).toEqual(["run PLAN-0001 --task TASK-02"]);
    const after = await w.db();
    const rows = after.query("SELECT task, status, attempts, lease_owner FROM task_exec ORDER BY task").all();
    expect(rows[0]).toEqual({ task: "TASK-01", status: "running", attempts: 1, lease_owner: "outro-tick" });
    expect(rows[1]).toEqual({ task: "TASK-02", status: "dispatched", attempts: 2, lease_owner: null });
    after.close();
  });

  test("durante o despacho há lease com dono e validade no futuro", async () => {
    const w = setup([entry("PLAN-0001/TASK-01")], { sleep: 1.5 });
    const p = Bun.spawn(["bun", BIN, "tick", "--root", w.dir], { cwd: w.dir, env: w.env, stdout: "pipe", stderr: "pipe" });
    const deadline = Date.now() + 5000;
    while (!existsSync(join(w.dir, "dispatch.log")) && Date.now() < deadline) await Bun.sleep(50);
    const db = await w.db();
    const row = db.query("SELECT status, lease_owner, lease_until FROM task_exec").get() as any;
    db.close();
    expect(row.lease_owner).toBeTruthy();
    expect(row.lease_until).toBeGreaterThan(Date.now());
    await p.exited;
  });
});

describe("ginga tick: saídas", () => {
  test("--dry-run lista o que despacharia sem despachar, sem lease e sem evento", async () => {
    const w = setup([entry("PLAN-0001/TASK-01")]);
    const r = w.tick(["--dry-run", "--json"]);
    expect(r.exit).toBe(0);
    expect(JSON.parse(r.out).dispatched).toEqual(["PLAN-0001/TASK-01"]);
    expect(w.calls()).toEqual([]);
    expect(w.events()).toEqual([]);
    if (existsSync(join(w.dir, "state.db"))) {
      const db = await w.db();
      expect(db.query("SELECT * FROM task_exec").all()).toEqual([]);
      db.close();
    }
  });

  test("emite transition task pending → running por system", () => {
    const w = setup([entry("PLAN-0001/TASK-01")]);
    w.tick();
    const t = w.events().filter((e) => e.kind === "transition");
    expect(t.length).toBe(1);
    expect(t[0]).toMatchObject({ plan: "PLAN-0001", task: "TASK-01", data: { entity: "task", from: "pending", to: "running", by: "system" } });
  });
});
