import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveBoard } from "../src/board";
import { openStateDb } from "../src/state/db";
import { runVerb, type VerbCtx } from "../src/verbs/registry";

/**
 * PLAN-0012 TASK-01: modelo único do quadro e do Inbox.
 * - `deriveBoard(root, db)` deriva as colunas INTENT, SPEC, PLAN, EXECUTANDO,
 *   VERIFICANDO e FEITO, sem escrever no bundle.
 * - O fixture tem 1 INTENT, 1 SPEC draft e 1 PLAN approved com 2 TASKs.
 * - Um evento receipt de verify com status pass conta uma TASK concluída.
 * - `read.board` e `read.inbox` usam exatamente o mesmo modelo.
 */

const FIXTURE = join(import.meta.dir, "fixtures", "board", "bundle");
const dirs: string[] = [];

beforeEach(() => {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-board-")));
  dirs.push(dir);
  cpSync(FIXTURE, join(dir, "bundle"), { recursive: true });
});

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function context(): VerbCtx {
  const root = join(dirs[0]!, "bundle");
  const db = openStateDb(join(dirs[0]!, "state.db"));
  db.query(
    "INSERT INTO events(id, ts, kind, plan, task, json) VALUES(?, ?, 'receipt', 'PLAN-0001', 'TASK-01', ?)",
  ).run(
    "01JBX0000000000000000000AA",
    "2026-10-29T12:00:00Z",
    JSON.stringify({
      v: 1,
      ts: "2026-10-29T12:00:00Z",
      source: "pinga",
      kind: "receipt",
      id: "01JBX0000000000000000000AA",
      plan: "PLAN-0001",
      task: "TASK-01",
      data: { status: "pass", check: "verify", ledger_n: 1, hash: "a".repeat(64) },
    }),
  );
  return { by: "test", via: "cli", root, db };
}

describe("deriveBoard", () => {
  test("deriva as seis colunas do fixture e conta os receipts das TASKs", () => {
    const ctx = context();
    const board = deriveBoard(ctx.root, ctx.db);

    expect(Object.keys(board.columns)).toEqual([
      "INTENT",
      "SPEC",
      "PLAN",
      "EXECUTANDO",
      "VERIFICANDO",
      "FEITO",
    ]);
    expect(board.columns.INTENT.map((card) => card.id)).toEqual(["INTENT-0001"]);
    expect(board.columns.SPEC.map((card) => card.id)).toEqual(["SPEC-0001"]);
    expect(board.columns.PLAN.map((card) => card.id)).toEqual(["PLAN-0001"]);
    expect(board.columns.EXECUTANDO).toEqual([]);
    expect(board.columns.VERIFICANDO).toEqual([]);
    expect(board.columns.FEITO).toEqual([]);

    expect(board.columns.PLAN[0]).toEqual({
      id: "PLAN-0001",
      kind: "plan",
      title: "Roda Web",
      status: "approved",
      repo: "ginga",
      track: "feature",
      tasks: { total: 2, pass: 1, running: 0 },
      blocked: false,
    });

    ctx.db.close();
  });

  test("o Inbox contém exatamente a SPEC draft que espera aprovação", () => {
    const ctx = context();
    const board = deriveBoard(ctx.root, ctx.db);

    expect(board.inbox).toEqual([
      {
        id: "SPEC-0001",
        type: "aprovar",
        entity: "SPEC-0001",
        title: "Roda Web",
        actions: ["approve", "reject"],
      },
    ]);

    ctx.db.close();
  });
});

describe("verbos de leitura", () => {
  test("board e inbox leem o modelo único", async () => {
    const ctx = context();
    const board = await runVerb("board", ctx, {}) as { columns: Record<string, Array<{ id: string }>> };
    const inbox = await runVerb("inbox", ctx, {}) as { items: unknown[] };

    expect(board.columns.INTENT.map((card) => card.id)).toEqual(["INTENT-0001"]);
    expect(board.columns.SPEC.map((card) => card.id)).toEqual(["SPEC-0001"]);
    expect(board.columns.PLAN.map((card) => card.id)).toEqual(["PLAN-0001"]);
    expect(inbox.items).toEqual([
      {
        id: "SPEC-0001",
        type: "aprovar",
        entity: "SPEC-0001",
        title: "Roda Web",
        actions: ["approve", "reject"],
      },
    ]);

    ctx.db.close();
  });
});
