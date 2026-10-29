import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateEvent } from "../src/events/validate";
import { openStateDb } from "../src/state/db";
import { VERBS, getVerb, runVerb, type VerbCtx } from "../src/verbs/registry";

/**
 * PLAN-0011 TASK-01: registro único de verbos (doc 05 §2).
 * - `VERBS: Verb[]`, `Verb = {name, args: {name, required?}[], write: boolean, run(ctx, args) → JSON}`.
 *   `getVerb(name)` devolve o verbo (ou undefined); `runVerb(name, ctx, args)` valida os argumentos
 *   obrigatórios pelo registro (erro `verbo desconhecido: X` / `falta argumento: nome`) e chama `run`.
 * - `ctx = {by, via, root, db}`: `root` é a raiz do bundle (`intents/`, `specs/`, `plans/` direto nela),
 *   `db` é o `Database` de `openStateDb`. Eventos vão para `$GINGA_EVENTS`.
 * - Tabelas próprias criadas pelos verbos (IF NOT EXISTS): `answers(blocker_id, answer, by, via, ts)`,
 *   `decisions(item, option, by, via, ts)`, `ctl(scope PK, paused, cancelled, budget_usd, tier)`
 *   (scope `*` = fila inteira, `PLAN-NNNN`, ou `PLAN-NNNN/TASK-NN`).
 * - Escrita com PLAN no alvo → linha no `log.md` do PLAN (com `by` e `via`) + evento `transition`/`answer`.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  delete process.env.GINGA_EVENTS;
});

let dir: string;
let root: string;
let ctx: VerbCtx;
let eventsPath: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-verbs-")));
  dirs.push(dir);
  root = join(dir, "bundle");
  mkdirSync(join(root, "intents"), { recursive: true });
  mkdirSync(join(root, "specs"), { recursive: true });
  mkdirSync(join(root, "plans", "PLAN-0001-auth"), { recursive: true });
  writeFileSync(join(root, "intents", "INTENT-0001-primeiro.md"), "---\ntype: intent\ntitle: Primeiro\nsource: cli\ntimestamp: 2026-10-27T00:00:00Z\n---\nCorpo.\n");
  writeFileSync(join(root, "specs", "SPEC-0001-auth.md"), "---\ntype: spec\ntitle: Auth\nstatus: draft\n---\n## Objetivo\nx\n");
  writeFileSync(join(root, "plans", "PLAN-0001-auth", "PLAN.md"), "---\ntype: plan\ntitle: Auth plan\nstatus: draft\n---\n## Objetivo\nx\n");
  writeFileSync(join(root, "plans", "PLAN-0001-auth", "log.md"), "# Log — PLAN-0001\n");
  eventsPath = join(dir, "events.jsonl");
  process.env.GINGA_EVENTS = eventsPath;
  ctx = { by: "eduardo", via: "discord", root, db: openStateDb(join(dir, "state.db")) };
});

const events = () =>
  existsSync(eventsPath)
    ? readFileSync(eventsPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, any>)
    : [];
const planMd = () => readFileSync(join(root, "plans", "PLAN-0001-auth", "PLAN.md"), "utf8");
const planLog = () => readFileSync(join(root, "plans", "PLAN-0001-auth", "log.md"), "utf8");

describe("registro", () => {
  const WRITES = ["intent new", "approve", "reject", "answer", "decide", "pause", "resume", "retry", "escalate", "cancel", "budget raise"];
  const READS = ["status", "board", "inbox", "watch"];

  test("tem todos os verbos, com write correto e args declarados", () => {
    const names = VERBS.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of WRITES) expect(getVerb(n)?.write).toBe(true);
    for (const n of READS) expect(getVerb(n)?.write).toBe(false);
    for (const v of VERBS) {
      expect(Array.isArray(v.args)).toBe(true);
      expect(typeof v.run).toBe("function");
    }
    expect(getVerb("nao-existe")).toBeUndefined();
  });

  test("runVerb valida o registro: desconhecido e argumento obrigatório", async () => {
    await expect(runVerb("nao-existe", ctx, {})).rejects.toThrow("verbo desconhecido: nao-existe");
    await expect(runVerb("approve", ctx, {})).rejects.toThrow("falta argumento: id");
    await expect(runVerb("answer", ctx, { blocker_id: "b1" })).rejects.toThrow("falta argumento: text");
  });
});

describe("intent new", () => {
  test("cria INTENT-NNNN-slug.md com source = via e o texto no corpo", async () => {
    const out: any = await runVerb("intent new", ctx, { text: "Quero login com OAuth" });
    expect(out.id).toBe("INTENT-0002");
    const file = readdirSync(join(root, "intents")).find((f) => f.startsWith("INTENT-0002-"))!;
    expect(file).toBe("INTENT-0002-quero-login-com-oauth.md");
    const raw = readFileSync(join(root, "intents", file), "utf8");
    expect(raw).toMatch(/^---\ntype: intent\n/);
    expect(raw).toContain("source: discord");
    expect(raw).toContain("Quero login com OAuth");
  });
});

describe("approve / reject", () => {
  test("approve PLAN muda o status no frontmatter, loga by/via e emite transition válido", async () => {
    const out: any = await runVerb("approve", ctx, { id: "PLAN-0001" });
    expect(out.status).toBe("approved");
    expect(planMd()).toMatch(/\nstatus: approved\n/);
    expect(planMd()).not.toContain("status: draft");
    const log = planLog();
    expect(log).toContain("approve");
    expect(log).toContain("eduardo");
    expect(log).toContain("discord");
    const t = events().find((e) => e.kind === "transition")!;
    expect(t.plan).toBe("PLAN-0001");
    expect(t.data).toMatchObject({ entity: "plan", from: "draft", to: "approved", by: "eduardo", via: "discord" });
    expect(validateEvent(t)).toEqual({ ok: true, errors: [] });
  });

  test("approve SPEC muda o frontmatter do arquivo da SPEC", async () => {
    await runVerb("approve", ctx, { id: "SPEC-0001" });
    expect(readFileSync(join(root, "specs", "SPEC-0001-auth.md"), "utf8")).toMatch(/\nstatus: approved\n/);
    expect(events().find((e) => e.kind === "transition")!.data.entity).toBe("spec");
  });

  test("reject PLAN grava status rejected e o motivo no log", async () => {
    await runVerb("reject", ctx, { id: "PLAN-0001", reason: "escopo grande demais" });
    expect(planMd()).toMatch(/\nstatus: rejected\n/);
    expect(planLog()).toContain("escopo grande demais");
    expect(events().find((e) => e.kind === "transition")!.data.to).toBe("rejected");
  });

  test("id inexistente falha sem alterar nada", async () => {
    await expect(runVerb("approve", ctx, { id: "PLAN-0099" })).rejects.toThrow();
    expect(planMd()).toContain("status: draft");
  });
});

describe("answer / decide", () => {
  test("answer grava no state.db e na seção Respostas do PLAN do blocker, e emite answer", async () => {
    ctx.db
      .query("INSERT INTO events(id, ts, kind, plan, task, json) VALUES(?, ?, 'blocker', 'PLAN-0001', 'TASK-01', ?)")
      .run("01", "2026-10-29T00:00:00Z", JSON.stringify({ data: { blocker_id: "b1", question: "rotação?", raised_by: "manda" } }));
    await runVerb("answer", ctx, { blocker_id: "b1", text: "janela fixa" });
    const row: any = ctx.db.query("SELECT answer, by, via FROM answers WHERE blocker_id = 'b1'").get();
    expect(row).toEqual({ answer: "janela fixa", by: "eduardo", via: "discord" });
    const md = planMd();
    expect(md).toContain("## Respostas");
    expect(md.slice(md.indexOf("## Respostas"))).toContain("janela fixa");
    const a = events().find((e) => e.kind === "answer")!;
    expect(a.data).toMatchObject({ blocker_id: "b1", answer: "janela fixa", by: "eduardo", via: "discord" });
    expect(validateEvent(a)).toEqual({ ok: true, errors: [] });
    expect(planLog()).toContain("janela fixa");
  });

  test("answer de blocker desconhecido falha", async () => {
    await expect(runVerb("answer", ctx, { blocker_id: "zzz", text: "x" })).rejects.toThrow();
  });

  test("decide grava a opção escolhida no state.db", async () => {
    await runVerb("decide", ctx, { item: "worktree-ginga-plan-0003", option: "arquivar" });
    const row: any = ctx.db.query("SELECT item, option, by, via FROM decisions").get();
    expect(row).toEqual({ item: "worktree-ginga-plan-0003", option: "arquivar", by: "eduardo", via: "discord" });
  });
});

describe("controle de execução (só state.db)", () => {
  const ctl = (scope: string): any => ctx.db.query("SELECT * FROM ctl WHERE scope = ?").get(scope);

  test("pause/resume da fila inteira e de um PLAN", async () => {
    await runVerb("pause", ctx, {});
    expect(ctl("*").paused).toBe(1);
    await runVerb("resume", ctx, {});
    expect(ctl("*").paused).toBe(0);
    await runVerb("pause", ctx, { plan: "PLAN-0001" });
    expect(ctl("PLAN-0001").paused).toBe(1);
    expect(planLog()).toContain("pause");
    await runVerb("resume", ctx, { plan: "PLAN-0001" });
    expect(ctl("PLAN-0001").paused).toBe(0);
  });

  test("retry marca a task para nova tentativa (e guarda --tier); escalate marca escalated", async () => {
    ctx.db.query("INSERT INTO task_exec(plan, task, status, attempts) VALUES('PLAN-0001', 'TASK-01', 'failed', 2)").run();
    await runVerb("retry", ctx, { plan: "PLAN-0001", task: "TASK-01", tier: "strong" });
    const row: any = ctx.db.query("SELECT status, attempts, lease_owner FROM task_exec WHERE plan = 'PLAN-0001' AND task = 'TASK-01'").get();
    expect(row).toEqual({ status: "retry", attempts: 2, lease_owner: null });
    expect(ctl("PLAN-0001/TASK-01").tier).toBe("strong");
    const t = events().find((e) => e.kind === "transition")!;
    expect(t.task).toBe("TASK-01");
    expect(t.data).toMatchObject({ entity: "task", from: "failed", to: "retry", by: "eduardo", via: "discord" });
    expect(validateEvent(t).ok).toBe(true);
    await runVerb("escalate", ctx, { plan: "PLAN-0001", task: "TASK-01" });
    const st: any = ctx.db.query("SELECT status FROM task_exec WHERE plan = 'PLAN-0001' AND task = 'TASK-01'").get();
    expect(st.status).toBe("escalated");
  });

  test("cancel marca o PLAN e budget raise grava o teto, ambos com linha no log", async () => {
    await runVerb("cancel", ctx, { plan: "PLAN-0001" });
    expect(ctl("PLAN-0001").cancelled).toBe(1);
    await runVerb("budget raise", ctx, { plan: "PLAN-0001", usd: "5" });
    expect(ctl("PLAN-0001").budget_usd).toBe(5);
    const log = planLog();
    expect(log).toContain("cancel");
    expect(log).toContain("budget raise");
    expect(log).toContain("5");
  });
  test("budget raise com valor inválido falha", async () => {
    await expect(runVerb("budget raise", ctx, { plan: "PLAN-0001", usd: "abc" })).rejects.toThrow();
  });
});

describe("leituras", () => {
  test("não escrevem nada (sem log, sem evento, sem arquivo)", async () => {
    const before = planLog();
    for (const n of ["status", "board", "inbox"]) await runVerb(n, ctx, {});
    expect(planLog()).toBe(before);
    expect(events()).toEqual([]);
  });

  test("status/board listam os PLANs por status; inbox traz o que espera o dono", async () => {
    const st: any = await runVerb("status", ctx, {});
    expect(st.plans).toContainEqual(expect.objectContaining({ id: "PLAN-0001", status: "draft" }));
    const board: any = await runVerb("board", ctx, {});
    expect(board.columns.draft).toContain("PLAN-0001");
    const inbox: any = await runVerb("inbox", ctx, {});
    const ids = inbox.items.map((i: any) => i.id);
    expect(ids).toContain("PLAN-0001");
    expect(ids).toContain("SPEC-0001");
    await runVerb("approve", ctx, { id: "PLAN-0001" });
    const board2: any = await runVerb("board", ctx, {});
    expect(board2.columns.approved).toContain("PLAN-0001");
    expect(board2.columns.draft ?? []).not.toContain("PLAN-0001");
  });

  test("inbox lista blocker sem resposta e deixa de listar depois do answer", async () => {
    ctx.db
      .query("INSERT INTO events(id, ts, kind, plan, task, json) VALUES('01', '2026-10-29T00:00:00Z', 'blocker', 'PLAN-0001', 'TASK-01', ?)")
      .run(JSON.stringify({ data: { blocker_id: "b1", question: "rotação?", raised_by: "manda" } }));
    const before: any = await runVerb("inbox", ctx, {});
    expect(before.items.map((i: any) => i.id)).toContain("b1");
    await runVerb("answer", ctx, { blocker_id: "b1", text: "ok" });
    const after: any = await runVerb("inbox", ctx, {});
    expect(after.items.map((i: any) => i.id)).not.toContain("b1");
  });

  test("watch devolve os eventos do state.db do alvo (PLAN ou TASK)", async () => {
    ctx.db
      .query("INSERT INTO events(id, ts, kind, plan, task, json) VALUES('01', '2026-10-29T00:00:00Z', 'blocker', 'PLAN-0001', 'TASK-01', '{}'), ('02', '2026-10-29T00:00:01Z', 'blocker', 'PLAN-0002', 'TASK-01', '{}')")
      .run();
    const out: any = await runVerb("watch", ctx, { target: "PLAN-0001" });
    expect(out.events.map((e: any) => e.id)).toEqual(["01"]);
  });
});
