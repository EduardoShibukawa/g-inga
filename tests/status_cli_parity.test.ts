import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStateDb } from "../src/state/db";
import { runVerb } from "../src/verbs/registry";

/**
 * RED — PLAN-0012 TASK-11 (T324): paridade CLI × runVerb do verbo `status`.
 *
 * tests/cli_verbs.test.ts (frozen do PLAN-0011, não alterar) exige que
 * `ginga status --json` no subprocesso devolva o mesmo JSON do runVerb direto.
 * Falha hoje: o subprocesso roda com $GINGA_EVENTS=<events.jsonl inexistente
 * ao lado do state.db> e reporta broken_sources com 1 item; o runVerb direto
 * no processo (sem a variável) reporta []. O relógio também era real.
 *
 * Contrato: buildStatus resolve o caminho de eventos como $GINGA_EVENTS quando
 * definida, senão `events.jsonl` no diretório do state.db (db.filename), e o
 * relógio padrão é determinístico por db (MAX(ts) de events, ou epoch).
 */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function fixture() {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-parity-")));
  dirs.push(dir);
  const root = join(dir, "bundle");
  mkdirSync(join(root, "plans", "PLAN-0001-auth"), { recursive: true });
  writeFileSync(
    join(root, "plans", "PLAN-0001-auth", "PLAN.md"),
    "---\ntype: plan\ntitle: Auth plan\nstatus: draft\nrepos: [ginga]\n---\n",
  );
  const db = join(dir, "state.db");
  const conn = openStateDb(db);
  conn
    .query("INSERT INTO events(id, ts, kind, plan, task, json) VALUES('01','2026-10-29T00:00:00Z','blocker','PLAN-0001','TASK-01',?)")
    .run(
      JSON.stringify({
        v: 1, ts: "2026-10-29T00:00:00Z", source: "test", kind: "blocker", id: "01",
        plan: "PLAN-0001", task: "TASK-01", data: { blocker_id: "b1", question: "rotação?" },
      }),
    );
  conn.close();
  return { dir, root, db, events: join(dir, "events.jsonl") }; // events.jsonl não é criado
}

describe("paridade CLI × runVerb do verbo status (TASK-11)", () => {
  test("ginga status --json no subprocesso == runVerb direto (mesmo JSON)", async () => {
    const fx = fixture();
    const BIN = join(import.meta.dir, "..", "bin", "ginga.ts");
    const env = { ...process.env, GINGA_STATE_DB: fx.db, GINGA_EVENTS: fx.events, GINGA_BY: "", GINGA_ROOT: "" };
    const p = Bun.spawnSync([process.execPath, BIN, "status", "--by", "eduardo", "--json", "--root", fx.root], {
      env,
      cwd: fx.dir,
    });
    expect(p.stderr.toString()).toBe("");
    expect(p.exitCode).toBe(0);

    const prev = process.env.GINGA_EVENTS;
    delete process.env.GINGA_EVENTS; // runVerb direto sem a variável no ambiente
    try {
      const db = openStateDb(fx.db);
      const direct = await runVerb("status", { by: "eduardo", via: "cli", root: fx.root, db }, {});
      db.close();
      expect(JSON.parse(p.stdout.toString())).toEqual(JSON.parse(JSON.stringify(direct)));
    } finally {
      if (prev === undefined) delete process.env.GINGA_EVENTS;
      else process.env.GINGA_EVENTS = prev;
    }
  });
});
