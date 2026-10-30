// PLAN-0013 TASK-01 (T140): log.md automático — testes congelados.
// Codificam o "Fazer" + a "Interface" da TASK:
// - `formatLogLine(ev)`: attempt → `AAAA-MM-DD TASK-xx <runtime/modelo> tentativa N pass|fail[: motivo]`;
//   transition/receipt/answer/handoff/learning → `AAAA-MM-DD <kind> <resumo>`; outros kinds → null.
// - `appendPlanLog(root, ev)`: linha no log.md da pasta do PLAN (criado se não existir),
//   idempotente por ev.id; ids diferentes do mesmo attempt não se duplicam entre si (reprocessar sim).
// Import dinâmico: sem o módulo, a prova falha por asserção (não por import).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dirs: string[] = [];

function tmpBundle(): string {
  const D = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "plan-log-")));
  dirs.push(D);
  mkdirSync(join(D, "plans", "PLAN-0001-alpha"), { recursive: true });
  writeFileSync(join(D, "plans", "PLAN-0001-alpha", "PLAN.md"), "---\ntype: plan\ntitle: alpha\nintent: INTENT-0001\nstatus: approved\nkind: change\n---\n## Objetivo\nx\n");
  return D;
}

let root: string;
beforeEach(() => {
  root = tmpBundle();
});
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

type AnyEv = Record<string, unknown>;
const attemptEv = (over: Partial<AnyEv> = {}): AnyEv => ({
  v: 1,
  ts: "2026-10-29T12:00:00Z",
  source: "opencode",
  kind: "attempt",
  id: "ev-attempt-1",
  plan: "PLAN-0001",
  task: "TASK-05",
  data: { runtime: "opencode", model: "opencode/qwen3.8-flash", attempt_n: 1, passed: true },
  ...over,
});

const planLog = await import("../src/plan_log.ts").catch(() => null);

describe("formatLogLine", () => {
  test("attempt com model/n/passed → a linha exata do formato das lanes", () => {
    if (!planLog) throw new Error("src/plan_log.ts não existe ainda (RED)");
    const line = planLog!.formatLogLine(attemptEv());
    expect(line).toBe("2026-10-29 TASK-05 opencode/qwen3.8-flash tentativa 1 pass");
  });

  test("attempt com passed:false → linha em fail", () => {
    if (!planLog) throw new Error("src/plan_log.ts não existe ainda (RED)");
    const ev = attemptEv({
      id: "ev-attempt-2",
      data: { runtime: "opencode", model: "opencode/qwen3.8-flash", attempt_n: 2, passed: false, failure: "done_when" },
    });
    const line = planLog!.formatLogLine(ev) as string;
    expect(line).toMatch(/^2026-10-29 TASK-05 opencode\/qwen3\.8-flash tentativa 2 fail/);
  });

  test("transition, receipt e learning viram `<kind> <resumo>`; blocker não vai para o log", () => {
    if (!planLog) throw new Error("src/plan_log.ts não existe ainda (RED)");
    const base = { v: 1, ts: "2026-10-29T12:00:00Z", source: "cli", plan: "PLAN-0001" };
    expect(planLog!.formatLogLine({ ...base, kind: "transition", id: "t1", data: { entity: "plan", from: "draft", to: "approved", by: "dono", via: "cli" } })).toMatch(/^2026-10-29 transition /);
    expect(planLog!.formatLogLine({ ...base, kind: "receipt", id: "r1", data: { status: "pass", check: "verify" } })).toMatch(/^2026-10-29 receipt /);
    expect(planLog!.formatLogLine({ ...base, kind: "learning", id: "l1", data: { learning_id: "L-01", status: "confirmada" } })).toMatch(/^2026-10-29 learning /);
    expect(planLog!.formatLogLine({ ...base, kind: "blocker", id: "b1", data: { blocker_id: "x", question: "sim?", raised_by: "manda" } })).toBeNull();
  });
});

describe("appendPlanLog", () => {
  test("cria o log.md na pasta do PLAN e é idempotente por ev.id", () => {
    if (!planLog) throw new Error("src/plan_log.ts não existe ainda (RED)");
    const ev = attemptEv();
    expect(planLog!.appendPlanLog(root, ev)).toEqual({ appended: true });
    const r2 = planLog!.appendPlanLog(root, ev);
    expect(r2).toEqual({ appended: false });
    const logPath = join(root, "plans", "PLAN-0001-alpha", "log.md");
    expect(existsSync(logPath)).toBe(true);
    const linhas = readFileSync(logPath, "utf8").split("\n").filter((l) => l.includes("tentativa 1 pass"));
    expect(linhas.length).toBe(1);
  });

  test("dois ids diferentes do mesmo evento produzem duas linhas (a chave é o id, não o texto)", () => {
    if (!planLog) throw new Error("src/plan_log.ts não existe ainda (RED)");
    planLog!.appendPlanLog(root, attemptEv());
    expect(planLog!.appendPlanLog(root, attemptEv({ id: "ev-attempt-9" }))).toEqual({ appended: true });
    const linhas = readFileSync(join(root, "plans", "PLAN-0001-alpha", "log.md"), "utf8")
      .split("\n")
      .filter((l) => l.includes("tentativa 1 pass"));
    expect(linhas.length).toBe(2);
  });

  test("evento de outro PLAN (sem pasta) não escreve em lugar nenhum", () => {
    if (!planLog) throw new Error("src/plan_log.ts não existe ainda (RED)");
    const r = planLog!.appendPlanLog(root, attemptEv({ plan: "PLAN-9999", id: "ev-x" }));
    expect(r).toEqual({ appended: false });
    expect(existsSync(join(root, "plans", "PLAN-0001-alpha", "log.md"))).toBe(false);
  });
});
