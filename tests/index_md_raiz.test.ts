import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStateDb } from "../src/state/db";

/**
 * RED — PLAN-0012 follow-up do judge 2026-11-01T221449 (TASK-06/14): o gerador
 * deriva o quadro da raiz errada e duplica os cabeçalhos `## Seção`.
 * - `writeIndex(ws, db)` deriva o board de `<ws>/.ginga` (bundle), não de `<ws>`:
 *   o INTENT/PLAN que vivem em `<ws>/.ginga/...` aparecem no index.md gerado.
 * - Cada `## Seção` do template aparece uma única vez no gerado (sem duplicar).
 * - PLAN `done` aparece na seção Concluído.
 */

const ROOT = join(import.meta.dir, "..");
const TEMPLATE = join(ROOT, "tests", "fixtures", "index", "template.md");
const dirs: string[] = [];

beforeEach(() => {
  const ws = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-index-raiz-")));
  dirs.push(ws);
  mkdirSync(join(ws, ".ginga", "intents"), { recursive: true });
  writeFileSync(join(ws, ".ginga", "intents", "INTENT-0001-teste.md"), "---\ntype: intent\nstatus: draft\ntitle: Teste\n---\n");
  mkdirSync(join(ws, ".ginga", "plans", "PLAN-0002-done"), { recursive: true });
  writeFileSync(
    join(ws, ".ginga", "plans", "PLAN-0002-done", "PLAN.md"),
    "---\ntype: plan\ntitle: Plano done\nstatus: done\nrepos: [ginga]\n---\n",
  );
  writeFileSync(join(ws, ".ginga", "plans", "PLAN-0002-done", "TASK-01-a.md"), "---\ntype: task\nstatus: done\n---\n");
  cpSync(TEMPLATE, join(ws, ".ginga", "index.template.md"));
  const db = openStateDb(join(ws, "state.db"));
  db.query(
    "INSERT INTO events(id, ts, kind, plan, task, json) VALUES('r1', '2026-11-01T10:00:00Z', 'receipt', 'PLAN-0002', 'TASK-01', ?)",
  ).run(JSON.stringify({ v: 1, kind: "receipt", plan: "PLAN-0002", task: "TASK-01", data: { status: "pass", check: "verify" } }));
  db.close();
});

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("writeIndex deriva do bundle <ws>/.ginga e não duplica cabeçalhos (T333)", () => {
  test("index.md gerado lista o INTENT do .ginga e o PLAN done em Concluído, com cada ## uma vez só", async () => {
    const { writeIndex } = await import("../src/index_md");
    const ws = dirs[0]!;
    const db = openStateDb(join(ws, "state.db"));
    try {
      const r = writeIndex(ws, db);
      expect(r.changed).toBe(true);
      const out = readFileSync(join(ws, ".ginga", "index.md"), "utf8");
      expect(out).toContain("> gerado por ginga");
      // derivado do bundle: INTENT-0001 só existe em <ws>/.ginga/intents
      expect(out).toContain("INTENT-0001");
      // PLAN done na seção Concluído
      const ci = out.indexOf("## Concluído");
      expect(ci).toBeGreaterThanOrEqual(0);
      expect(out.slice(ci)).toContain("PLAN-0002");
      // sem cabeçalhos duplicados
      for (const h of ["## Pronto para pegar", "## Esperando o dono", "## Em andamento", "## Concluído", "## Backlog (INTENTs sem PLAN)"]) {
        expect(out.split(h).length - 1).toBe(1);
      }
    } finally {
      db.close();
    }
  });

  test("renderIndex não repete o ## da seção quando o template já tem o cabeçalho", async () => {
    const { renderIndex } = await import("../src/index_md");
    const template = readFileSync(TEMPLATE, "utf8");
    const board: any = {
      columns: {
        INTENT: [{ id: "INTENT-0001", title: "Teste" }],
        SPEC: [],
        PLAN: [],
        EXECUTANDO: [{ id: "PLAN-0009", title: "Em andamento" }],
        VERIFICANDO: [],
        FEITO: [],
      },
      inbox: [],
    };
    const out = renderIndex(board, template, new Date("2026-11-01T00:00:00Z"));
    expect(out.split("## Em andamento").length - 1).toBe(1);
    expect(out).toContain("PLAN-0009");
    expect(out.split("## Backlog (INTENTs sem PLAN)").length - 1).toBe(1);
    expect(out).toContain("INTENT-0001");
  });

  test("checkIndex(ws) é true quando o index.md gerado está atualizado", async () => {
    const { writeIndex, checkIndex } = await import("../src/index_md");
    const ws = dirs[0]!;
    const db = openStateDb(join(ws, "state.db"));
    try {
      writeIndex(ws, db);
      expect(checkIndex(ws)).toBe(true);
      expect(existsSync(join(ws, ".ginga", "index.md"))).toBe(true);
    } finally {
      db.close();
    }
  });
});
