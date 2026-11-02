import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveBoard } from "../src/board";
import { getVerb, runVerb, type VerbCtx } from "../src/verbs/registry";
import { openStateDb } from "../src/state/db";

/**
 * RED — PLAN-0012 follow-up do judge 2026-11-01T221449 (TASK-09, grave): os
 * alertas não chegam ao Inbox nem a nenhuma superfície de ponta a ponta.
 * - `deriveBoard` emite itens `type: "alerta"` no Inbox a partir dos eventos
 *   kind=alert do state.db (com severity).
 * - Existe o verbo `alerts` no registro: `runVerb("alerts", ctx, {})` lista os
 *   alertas e `runVerb("alerts", ctx, { sev: "high" })` filtra pela severidade
 *   mínima (mostra a escolhida e as acima).
 */

const dirs: string[] = [];

function ctx(): VerbCtx & { dir: string } {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-alertas-")));
  dirs.push(dir);
  const root = join(dir, "bundle");
  mkdirSync(join(root, "plans", "PLAN-0001-x"), { recursive: true });
  writeFileSync(join(root, "plans", "PLAN-0001-x", "PLAN.md"), "---\ntype: plan\ntitle: X\nstatus: active\nrepos: [ginga]\n---\n");
  const db = openStateDb(join(dir, "state.db"));
  const alert = (id: string, ts: string, sev: string, entity: string, summary: string, plan: string | null) =>
    db.query("INSERT INTO events(id, ts, kind, plan, task, json) VALUES(?, ?, 'alert', ?, NULL, ?)").run(
      id,
      ts,
      plan,
      JSON.stringify({ v: 1, ts, kind: "alert", plan, data: { rule_id: `rule-${id}`, severity: sev, entity, summary } }),
    );
  alert("a1", "2026-11-01T10:00:00Z", "critical", "PLAN-0001", "lane travada", "PLAN-0001");
  alert("a2", "2026-11-01T09:00:00Z", "high", "ginga", "hook drift", null);
  alert("a3", "2026-11-01T08:00:00Z", "warn", "ginga", "ready velho", null);
  return { by: "test", via: "cli", root, db, dir };
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("alertas de ponta a ponta (T334)", () => {
  test("deriveBoard emite itens alerta no Inbox com severity", () => {
    const c = ctx();
    try {
      const board = deriveBoard(c.root, c.db);
      const alertas = board.inbox.filter((i) => i.type === "alerta");
      expect(alertas.length).toBe(3);
      const crit = alertas.find((a) => a.id === "a1");
      expect(crit?.severity).toBe("critical");
      expect(crit?.entity).toBe("PLAN-0001");
      expect(crit?.title).toBe("lane travada");
    } finally {
      c.db.close();
    }
  });

  test("verbo alerts registrado lista os alertas do state.db", async () => {
    const c = ctx();
    try {
      const v = getVerb("alerts");
      expect(v).toBeDefined();
      const r = (await runVerb("alerts", c, {})) as any;
      expect(r.items.length).toBe(3);
      expect(r.items[0].severity).toBe("critical");
      expect(r.items[0].rule_id).toBe("rule-a1");
    } finally {
      c.db.close();
    }
  });

  test("verbo alerts com sev=high filtra pela severidade mínima (high e critical)", async () => {
    const c = ctx();
    try {
      const r = (await runVerb("alerts", c, { sev: "high" })) as any;
      expect(r.items.map((a: any) => a.severity).sort()).toEqual(["critical", "high"]);
    } finally {
      c.db.close();
    }
  });
});
