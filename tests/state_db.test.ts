import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * PLAN-0010 TASK-01: `state.db` (bun:sqlite) e `ginga events ingest`.
 * - `openStateDb(path)` de `src/state/db.ts` cria (se preciso) e devolve o `Database` com as tabelas
 *   `task_exec(plan, task, status, attempts, lease_owner, lease_until)`, `events(id PK, ts, kind, plan, task, json)`,
 *   `offsets(path, byte)` e `plan_thread(plan, target, thread_id)`.
 * - Caminho do db: `GINGA_STATE_DB`, senão `<cwd>/.ginga/state/state.db` (a pasta é criada).
 * - `ginga events ingest` lê `$GINGA_EVENTS` a partir do offset salvo, valida cada linha com `validateEvent`
 *   (src/events/validate.ts, PLAN-0004), ignora `id` repetido, e grava o novo offset (bytes até a última linha completa).
 *   Linha inválida: pulada, com `linha N` no stderr, exit 0. Linha final sem `\n` não é consumida ainda.
 *   Sem `$GINGA_EVENTS`: exit 2. O arquivo de eventos nunca é reescrito.
 */

const ROOT = join(import.meta.dir, "..");
const BIN = join(ROOT, "bin", "ginga.ts");
const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = (p: string) => {
  const d = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), p)));
  tmps.push(d);
  return d;
};

/** ULID válido e único por índice. */
const ulid = (n: number) => "0".repeat(24) + ALPHA[Math.floor(n / 32) % 32] + ALPHA[n % 32];
const ev = (n: number, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ v: 1, ts: "2026-10-28T00:00:00Z", source: "manda", kind: "blocker", id: ulid(n), plan: "PLAN-0001", task: "TASK-01", data: { blocker_id: `b${n}`, question: "q?", raised_by: "manda" }, ...extra });

function ws() {
  const dir = tmp("ginga-state-");
  const events = join(dir, "events.jsonl");
  const db = join(dir, "state.db");
  return { dir, events, db };
}

function ingest(w: ReturnType<typeof ws>, o: { env?: Record<string, string>; db?: boolean } = {}) {
  const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: w.dir, GINGA_EVENTS: w.events, ...(o.db === false ? {} : { GINGA_STATE_DB: w.db }), ...(o.env ?? {}) };
  const r = Bun.spawnSync(["bun", BIN, "events", "ingest"], { cwd: w.dir, env, stdout: "pipe", stderr: "pipe" });
  return { exit: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

async function open(path: string) {
  const mod: any = await import(join(ROOT, "src", "state", "db.ts"));
  return mod.openStateDb(path);
}
const rows = (db: any, sql: string): any[] => db.query(sql).all();

describe("openStateDb", () => {
  test("cria as quatro tabelas com as colunas do contrato", async () => {
    const w = ws();
    const db = await open(w.db);
    const cols = (t: string) => rows(db, `PRAGMA table_info(${t})`).map((c) => c.name);
    expect(cols("task_exec")).toEqual(["plan", "task", "status", "attempts", "lease_owner", "lease_until"]);
    expect(cols("events")).toEqual(expect.arrayContaining(["id", "ts", "kind", "plan", "task", "json"]));
    expect(cols("offsets")).toEqual(["path", "byte"]);
    expect(cols("plan_thread")).toEqual(["plan", "target", "thread_id"]);
    expect(rows(db, "PRAGMA table_info(events)").find((c) => c.name === "id").pk).toBe(1);
    db.close();
  });

  test("reabrir não apaga os dados", async () => {
    const w = ws();
    let db = await open(w.db);
    db.run("INSERT INTO plan_thread(plan, target, thread_id) VALUES('PLAN-0001','discord:1','T')");
    db.close();
    db = await open(w.db);
    expect(rows(db, "SELECT thread_id FROM plan_thread")).toEqual([{ thread_id: "T" }]);
    db.close();
  });
});

describe("ginga events ingest", () => {
  test("ingere as linhas válidas e salva o offset em bytes", async () => {
    const w = ws();
    writeFileSync(w.events, [ev(1), ev(2), ev(3)].join("\n") + "\n");
    const r = ingest(w);
    expect(r.exit).toBe(0);
    const db = await open(w.db);
    expect(rows(db, "SELECT id, kind, plan, task FROM events ORDER BY id")).toEqual([1, 2, 3].map((n) => ({ id: ulid(n), kind: "blocker", plan: "PLAN-0001", task: "TASK-01" })));
    expect(JSON.parse(rows(db, "SELECT json FROM events WHERE id = '" + ulid(1) + "'")[0].json).data.question).toBe("q?");
    expect(rows(db, "SELECT path, byte FROM offsets")).toEqual([{ path: w.events, byte: statSync(w.events).size }]);
    db.close();
  });

  test("rodar de novo não duplica; só o que foi acrescentado entra; id repetido é ignorado", async () => {
    const w = ws();
    writeFileSync(w.events, [ev(1), ev(2)].join("\n") + "\n");
    ingest(w);
    expect(ingest(w).exit).toBe(0);
    appendFileSync(w.events, [ev(2), ev(3)].join("\n") + "\n");
    ingest(w);
    const db = await open(w.db);
    expect(rows(db, "SELECT id FROM events ORDER BY id").map((r) => r.id)).toEqual([1, 2, 3].map(ulid));
    expect(rows(db, "SELECT byte FROM offsets")[0].byte).toBe(statSync(w.events).size);
    db.close();
  });

  test("linha inválida é pulada com `linha N` no stderr e não trava as seguintes", async () => {
    const w = ws();
    writeFileSync(w.events, [ev(1), '{"v":1,"kind":"blocker"}', "não é json", ev(2)].join("\n") + "\n");
    const r = ingest(w);
    expect(r.exit).toBe(0);
    expect(r.err).toContain("linha 2");
    expect(r.err).toContain("linha 3");
    const db = await open(w.db);
    expect(rows(db, "SELECT id FROM events ORDER BY id").map((x) => x.id)).toEqual([1, 2].map(ulid));
    expect(rows(db, "SELECT byte FROM offsets")[0].byte).toBe(statSync(w.events).size);
    db.close();
  });

  test("linha final sem \\n fica para a próxima rodada", async () => {
    const w = ws();
    const first = ev(1) + "\n";
    writeFileSync(w.events, first + ev(2));
    ingest(w);
    let db = await open(w.db);
    expect(rows(db, "SELECT id FROM events").map((x) => x.id)).toEqual([ulid(1)]);
    expect(rows(db, "SELECT byte FROM offsets")[0].byte).toBe(Buffer.byteLength(first));
    db.close();
    appendFileSync(w.events, "\n");
    ingest(w);
    db = await open(w.db);
    expect(rows(db, "SELECT id FROM events ORDER BY id").map((x) => x.id)).toEqual([1, 2].map(ulid));
    db.close();
  });

  test("o arquivo de eventos não é reescrito", () => {
    const w = ws();
    writeFileSync(w.events, [ev(1), "lixo"].join("\n") + "\n");
    const before = readFileSync(w.events, "utf8");
    const m = statSync(w.events).mtimeMs;
    ingest(w);
    expect(existsSync(w.db)).toBe(true);
    expect(readFileSync(w.events, "utf8")).toBe(before);
    expect(statSync(w.events).mtimeMs).toBe(m);
  });

  test("sem GINGA_STATE_DB o db fica em .ginga/state/state.db do cwd", () => {
    const w = ws();
    writeFileSync(w.events, ev(1) + "\n");
    expect(ingest(w, { db: false }).exit).toBe(0);
    expect(existsSync(join(w.dir, ".ginga", "state", "state.db"))).toBe(true);
  });

  test("sem GINGA_EVENTS: exit 2", () => {
    const w = ws();
    const r = Bun.spawnSync(["bun", BIN, "events", "ingest"], { cwd: w.dir, env: { PATH: process.env.PATH ?? "", HOME: w.dir, GINGA_STATE_DB: w.db }, stdout: "pipe", stderr: "pipe" });
    expect(r.exitCode).toBe(2);
    expect(r.stderr.toString()).toContain("GINGA_EVENTS");
  });
});
