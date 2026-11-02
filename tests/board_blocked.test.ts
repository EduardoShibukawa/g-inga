import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveBoard } from "../src/board";
import { openStateDb } from "../src/state/db";

/**
 * RED — PLAN-0012 follow-up do judge 2026-11-01T221449 (TASK-01): o modelo do
 * quadro precisa de `blocked` real e de PLAN `done` na coluna FEITO.
 * - PLAN com status `done` vai para FEITO (não para PLAN).
 * - PLAN com blocker aberto (evento kind=blocker sem answer) fica blocked=true.
 * - PLAN sem blocker aberto fica blocked=false.
 */

const dirs: string[] = [];

beforeEach(() => {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-board-blocked-")));
  dirs.push(dir);
  const b = join(dir, "bundle");
  mkdirSync(join(b, "plans", "PLAN-0002-done"), { recursive: true });
  writeFileSync(
    join(b, "plans", "PLAN-0002-done", "PLAN.md"),
    "---\ntype: plan\ntitle: Done plan\nstatus: done\nrepos: [ginga]\n---\n",
  );
  writeFileSync(join(b, "plans", "PLAN-0002-done", "TASK-01-a.md"), "---\ntype: task\nstatus: done\n---\n");
  writeFileSync(join(b, "plans", "PLAN-0002-done", "TASK-02-b.md"), "---\ntype: task\nstatus: done\n---\n");
  mkdirSync(join(b, "plans", "PLAN-0003-aberto"), { recursive: true });
  writeFileSync(
    join(b, "plans", "PLAN-0003-aberto", "PLAN.md"),
    "---\ntype: plan\ntitle: Aberto plan\nstatus: approved\nrepos: [ginga]\n---\n",
  );
  writeFileSync(join(b, "plans", "PLAN-0003-aberto", "TASK-01-a.md"), "---\ntype: task\nstatus: draft\n---\n");
  const db = openStateDb(join(dir, "state.db"));
  for (const [i, task] of ["TASK-01", "TASK-02"].entries()) {
    db.query(
      "INSERT INTO events(id, ts, kind, plan, task, json) VALUES(?, ?, 'receipt', 'PLAN-0002', ?, ?)",
    ).run(`r${i}`, "2026-11-01T10:00:00Z", task, JSON.stringify({ v: 1, kind: "receipt", plan: "PLAN-0002", task, data: { status: "pass", check: "verify" } }));
  }
  db.query(
    "INSERT INTO events(id, ts, kind, plan, task, json) VALUES('b9', '2026-11-01T11:00:00Z', 'blocker', 'PLAN-0003', 'TASK-01', ?)",
  ).run(JSON.stringify({ v: 1, kind: "blocker", plan: "PLAN-0003", task: "TASK-01", data: { blocker_id: "b9", question: "continuar?", raised_by: "manda" } }));
  db.close();
});

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("deriveBoard — blocked real e PLAN done em FEITO (T332)", () => {
  test("PLAN status done vai para a coluna FEITO", () => {
    const dir = dirs[0]!;
    const db = openStateDb(join(dir, "state.db"));
    const board = deriveBoard(join(dir, "bundle"), db);
    expect(board.columns.FEITO.map((c) => c.id)).toEqual(["PLAN-0002"]);
    expect(board.columns.PLAN.map((c) => c.id)).toEqual(["PLAN-0003"]);
    db.close();
  });

  test("blocker aberto deixa o card blocked=true; sem blocker, false", () => {
    const dir = dirs[0]!;
    const db = openStateDb(join(dir, "state.db"));
    const board = deriveBoard(join(dir, "bundle"), db);
    const aberto = board.columns.PLAN.find((c) => c.id === "PLAN-0003");
    const feito = board.columns.FEITO.find((c) => c.id === "PLAN-0002");
    expect(aberto?.blocked).toBe(true);
    expect(feito?.blocked).toBe(false);
    expect(board.inbox.some((i) => i.type === "blocker" && i.id === "b9")).toBe(true);
    db.close();
  });
});
