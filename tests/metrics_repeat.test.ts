// PLAN-0014 TASK-04 (tests_frozen): erros repetidos — falha com o mesmo motivo e escopo
// depois de existir learning/LESSON anterior sobre eles (doc 06 §6).
// Fixture montado em runtime: root falso com plans/PLAN-0014-*/TASK-*.md (pinga_task +
// touch), LEARNINGS.md com learning de 2026-10-01 sobre src/x.ts (menciona done_when) e
// knowledge/lessons/LESSON-0001 sobre src/z.ts (tags com done_when); state.db com attempts:
//   T400 2026-10-05 done_when  → repetido (learning L-01, semana 2026-W41)
//   T400 2026-10-06 pass       → ignorado
//   T400 2026-10-12 timeout    → motivo diferente, não conta (2026-W42)
//   T401 2026-10-19 done_when  → repetido via LESSON (2026-W43, reused_lessons=1)
// Import dinâmico para o RED falhar por asserção (módulo ausente), não por erro de resolução.

import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStateDb } from "../src/state/db";
import type { Metrics } from "../src/metrics";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Ctx = { db: Database; root: string };

function fixture(): Ctx {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-repeat-")));
  dirs.push(root);

  const planDir = join(root, "plans", "PLAN-0014-metricas-e-quota");
  mkdirSync(planDir, { recursive: true });
  writeFileSync(
    join(planDir, "TASK-01-metricas.md"),
    "---\ntype: task\npinga_task: T400\ntouch: [src/x.ts]\n---\n",
  );
  writeFileSync(
    join(planDir, "TASK-02-quota-codex.md"),
    "---\ntype: task\npinga_task: T401\ntouch: [src/z.ts]\n---\n",
  );
  writeFileSync(
    join(planDir, "LEARNINGS.md"),
    [
      "## L-01 · armadilha · 2026-10-01",
      "- hipótese: testeRED quebrado",
      "- evidência: bun test falhou",
      "- conclusão: falha done_when repetida em src/x.ts",
      "- escopo: src/x.ts",
      "",
    ].join("\n"),
  );
  const lessonsDir = join(root, "knowledge", "lessons");
  mkdirSync(lessonsDir, { recursive: true });
  writeFileSync(
    join(lessonsDir, "LESSON-0001-retry.md"),
    [
      "---",
      "type: lesson",
      "title: retry após done_when",
      "from: PLAN-0014#L-02",
      "status: confirmada",
      "scope:",
      "  repo: ginga",
      "  files: [src/z.ts]",
      "  symbols: []",
      "  tags: [confirmada, done_when]",
      "evidence: falha done_when em src/z.ts",
      "---",
      "",
    ].join("\n"),
  );

  const db = openStateDb(join(root, "state.db"));
  const insert = db.prepare("INSERT INTO events(id, ts, kind, plan, task, json) VALUES(?, ?, 'attempt', ?, ?, ?)");
  const ev = (id: string, ts: string, task: string, data: Record<string, unknown>) =>
    JSON.stringify({ v: 1, ts, source: "ginga", kind: "attempt", id, plan: "PLAN-0014", task, data });
  insert.run("01JC00000000000000000000A1", "2026-10-05T10:00:00.000Z", "T400", ev("01JC00000000000000000000A1", "2026-10-05T10:00:00.000Z", "T400", { runtime: "opencode", passed: false, failure: "done_when", model: "m", tier: "medium", attempt_n: 1 }));
  insert.run("01JC00000000000000000000A2", "2026-10-06T10:00:00.000Z", "T400", ev("01JC00000000000000000000A2", "2026-10-06T10:00:00.000Z", "T400", { runtime: "opencode", passed: true, model: "m", tier: "medium", attempt_n: 2 }));
  insert.run("01JC00000000000000000000A3", "2026-10-12T10:00:00.000Z", "T400", ev("01JC00000000000000000000A3", "2026-10-12T10:00:00.000Z", "T400", { runtime: "opencode", passed: false, failure: "timeout", model: "m", tier: "medium", attempt_n: 3 }));
  insert.run("01JC00000000000000000000A4", "2026-10-19T10:00:00.000Z", "T401", ev("01JC00000000000000000000A4", "2026-10-19T10:00:00.000Z", "T401", { runtime: "opencode", passed: false, failure: "done_when", model: "m", tier: "medium", attempt_n: 1 }));
  return { db, root };
}

async function loadRepeat(): Promise<(db: Database, root: string) => { plan: string; week: string; repeated: number; reused_lessons: number }[]> {
  const mod = await import("../src/metrics_repeat").catch(() => null);
  expect(mod).not.toBeNull();
  return (mod as unknown as { repeatedErrors: (db: Database, root: string) => { plan: string; week: string; repeated: number; reused_lessons: number }[] }).repeatedErrors;
}

describe("PLAN-0014 TASK-04 — erros repetidos", () => {
  test("learning anterior no escopo com o mesmo motivo conta como repetido; LESSON conta como reutilizada", async () => {
    const repeatedErrors = await loadRepeat();
    const { db, root } = fixture();
    const rows = repeatedErrors(db, root);
    db.close();

    expect(rows).toEqual([
      { plan: "PLAN-0014", week: "2026-W41", repeated: 1, reused_lessons: 0 }, // T400 done_when 10-05 (learning L-01 de 10-01)
      { plan: "PLAN-0014", week: "2026-W42", repeated: 0, reused_lessons: 0 }, // T400 timeout 10-12: motivo diferente
      { plan: "PLAN-0014", week: "2026-W43", repeated: 1, reused_lessons: 1 }, // T401 done_when 10-19 via LESSON-0001
    ]);
  });

  test("computeMetrics ganha repeated_errors (soma dos repetidos com root)", async () => {
    const mod = await import("../src/metrics").catch(() => null);
    expect(mod).not.toBeNull();
    const computeMetrics = (mod as unknown as { computeMetrics: (db: Database, o?: { since?: string; root?: string }) => Metrics & { repeated_errors: number } }).computeMetrics;
    const { db, root } = fixture();
    const m = computeMetrics(db, { root });
    db.close();
    expect(m.repeated_errors).toBe(2);
  });
});
