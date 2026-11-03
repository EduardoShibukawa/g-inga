import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "ginga-cost-sync-ts-"));
  dirs.push(dir);
  return dir;
}

function stateDb(): Database {
  const db = new Database(":memory:");
  db.run("CREATE TABLE events(id TEXT PRIMARY KEY, ts TEXT, kind TEXT, plan TEXT, task TEXT, json TEXT NOT NULL)");
  return db;
}

/** opencode.db temporário com uma sessão antiga (2026-10-05) de US$40 no diretório dado. */
function opencodeDb(directory: string, timeCreatedMs: number): string {
  const path = join(tmp(), "opencode.db");
  const db = new Database(path);
  db.run(`CREATE TABLE session_v2 (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, directory TEXT NOT NULL,
    cost REAL NOT NULL DEFAULT 0, tokens_input INTEGER NOT NULL DEFAULT 0,
    tokens_output INTEGER NOT NULL DEFAULT 0, time_created INTEGER NOT NULL)`);
  db.run(`CREATE TABLE session_message (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, seq INTEGER NOT NULL,
    time_created INTEGER NOT NULL, data TEXT NOT NULL)`);
  const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const data = JSON.stringify({ model: { id: "glm-5.3-flash", providerID: "opencode" } });
  db.exec(
    `INSERT INTO session_v2(id, project_id, directory, cost, tokens_input, tokens_output, time_created) ` +
      `VALUES('ses-old','p',${sqlStr(directory)},40,1000,200,${timeCreatedMs});` +
      `INSERT INTO session_message(id, session_id, seq, time_created, data) ` +
      `VALUES('m1','ses-old',1,${timeCreatedMs},${sqlStr(data)});`,
  );
  db.close();
  return path;
}

/** Bundle falso <ws>/.ginga com plans/PLAN-0014-metricas-e-quota/PLAN.md. */
function bundle(): string {
  const root = join(tmp(), ".ginga");
  const planDir = join(root, "plans", "PLAN-0014-metricas-e-quota");
  mkdirSync(planDir, { recursive: true });
  writeFileSync(join(planDir, "PLAN.md"), "---\ntitle: x\n---\n");
  return root;
}

const OLD = Date.parse("2026-10-05T12:00:00.000Z");
const OLD_ISO = "2026-10-05T12:00:00.000Z";

describe("PLAN-0014 TASK-17 — ts da sessão e plan/task no syncCost", () => {
  test("evento cost sai com ts = time_created da sessão, não a hora do sync", async () => {
    const mod = await import(join(ROOT, "src/cost/opencode_db.ts"));
    const sessions = mod.readOpencodeSessions(opencodeDb("/ws/ginga-plan-0014", OLD));
    const state = stateDb();
    mod.syncCost(state, sessions);
    const rows = state.query("SELECT ts, json FROM events WHERE kind='cost'").all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].ts).toBe(OLD_ISO);
    expect(JSON.parse(rows[0].json).ts).toBe(OLD_ISO);
    state.close();
  });

  test("quota do zen do mês corrente não conta custo importado de outro mês", async () => {
    const mod = await import(join(ROOT, "src/cost/opencode_db.ts"));
    const quotas = await import(join(ROOT, "src/quota/index.ts"));
    const sessions = mod.readOpencodeSessions(opencodeDb("/ws/ginga", OLD));
    const state = stateDb();
    mod.syncCost(state, sessions);
    const home = tmp();
    const zen = quotas.readQuotas({ home, db: state }).find((q: any) => q.provider === "zen");
    // US$40 de 2026-10-05 não entra no mês corrente (budget US$10 → used_pct seria 400 com ts errado)
    expect(zen.used_pct).toBe(0);
    expect(quotas.quotaCapOk(quotas.readQuotas({ home, db: state }))).toBe(true);
    state.close();
  });

  test("planTaskForDirectory resolve worktree <repo>-plan-NNNN e tasks/T<N>", async () => {
    const mod = await import(join(ROOT, "src/cost/opencode_db.ts"));
    expect(typeof mod.planTaskForDirectory).toBe("function");
    const root = bundle();
    expect(mod.planTaskForDirectory(root, "/ws/ginga-plan-0014")).toEqual({
      plan: "PLAN-0014-metricas-e-quota",
      task: null,
    });
    expect(mod.planTaskForDirectory(root, "/ws/ginga-plan-0014/tasks/T366")).toEqual({
      plan: "PLAN-0014-metricas-e-quota",
      task: "T366",
    });
    expect(mod.planTaskForDirectory(root, "/ws/ginga")).toEqual({ plan: null, task: null });
  });

  test("syncCost com resolve grava colunas plan/task e computeMetrics vê cost_by.plan", async () => {
    const mod = await import(join(ROOT, "src/cost/opencode_db.ts"));
    const metrics = await import(join(ROOT, "src/metrics.ts"));
    const root = bundle();
    const sessions = mod.readOpencodeSessions(opencodeDb("/ws/ginga-plan-0014", OLD));
    const state = stateDb();
    mod.syncCost(state, sessions, (dir: string) => mod.planTaskForDirectory(root, dir));
    const row = state.query("SELECT ts, plan, task, json FROM events WHERE kind='cost'").get() as any;
    expect(row.ts).toBe(OLD_ISO);
    expect(row.plan).toBe("PLAN-0014-metricas-e-quota");
    expect(row.task).toBeNull();
    const envelope = JSON.parse(row.json);
    expect(envelope.plan).toBe("PLAN-0014-metricas-e-quota");
    const m = metrics.computeMetrics(state, { root });
    expect(m.cost_by.plan["PLAN-0014-metricas-e-quota"]).toBe(40);
    expect(m.spent_usd).toBe(40);
    state.close();
  });
});
