import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStateDb } from "../src/state/db";
import { VERBS, runVerb } from "../src/verbs/registry";

/**
 * T915: verbo `spec <id>` — leitura da SPEC para a tela "SPEC aberta":
 * frontmatter, objetivo, critérios de aceite, blockers abertos e respostas.
 */
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const SPEC = `---
type: spec
title: G-Ingá revamp
intent: INTENT-0001-ginga-revamp
status: draft
bench: none
---
## Objetivo
Separar o harness em pacotes desacoplados.
Uma segunda linha do objetivo.

## ACs
- AC-1: \`pinga verify\` roda sozinho, sem o ginga instalado.
- AC-2: o orquestrador não cita runtime nenhum.
- sem id explícito também vale

## Notas
Texto livre.
`;

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "ginga-spec-"));
  dirs.push(dir);
  const root = join(dir, ".ginga");
  mkdirSync(join(root, "specs"), { recursive: true });
  writeFileSync(join(root, "specs", "SPEC-0001-ginga-revamp.md"), SPEC);
  writeFileSync(join(root, "specs", "SPEC-0002-outra.md"), "---\ntype: spec\ntitle: Outra\nstatus: approved\n---\n## Objetivo\ny\n");
  const db = openStateDb(join(dir, "state.db"));
  const ev = (id: string, plan: string, data: unknown) =>
    db.query("INSERT INTO events(id, ts, kind, plan, task, json) VALUES(?, '2026-10-27T10:00:00Z', 'blocker', ?, NULL, ?)").run(id, plan, JSON.stringify({ data }));
  ev("01", "SPEC-0001", { blocker_id: "b-nome", question: "Qual o nome do orquestrador?", raised_by: "spec-judge", options: ["Manda-CARU", "Mand-Ingá"] });
  ev("02", "SPEC-0001", { blocker_id: "b-velho", question: "Já respondido?", raised_by: "spec-judge" });
  ev("03", "PLAN-0009", { blocker_id: "b-outro", question: "De outro artefato", raised_by: "manda" });
  return { by: "dono", via: "api", root, db };
}

describe("verbo spec", () => {
  test("é verbo de leitura com id obrigatório", () => {
    const v = VERBS.find((x) => x.name === "spec");
    expect(v).toBeDefined();
    expect(v!.write).toBe(false);
    expect(v!.args).toEqual([{ name: "id", required: true }]);
  });

  test("devolve frontmatter, objetivo e critérios de aceite", async () => {
    const r: any = await runVerb("spec", fixture(), { id: "SPEC-0001" });
    expect(r).toMatchObject({
      id: "SPEC-0001",
      file: "specs/SPEC-0001-ginga-revamp.md",
      title: "G-Ingá revamp",
      status: "draft",
      intent: "INTENT-0001-ginga-revamp",
      bench: "none",
    });
    expect(r.objective).toBe("Separar o harness em pacotes desacoplados.\nUma segunda linha do objetivo.");
    expect(r.acs).toEqual([
      { id: "AC-1", text: "`pinga verify` roda sozinho, sem o ginga instalado." },
      { id: "AC-2", text: "o orquestrador não cita runtime nenhum." },
      { id: "AC-3", text: "sem id explícito também vale" },
    ]);
    expect(r.sections).toEqual([{ title: "Notas", body: "Texto livre." }]);
  });

  test("blockers abertos são só os desta SPEC e sem resposta", async () => {
    const ctx = fixture();
    await runVerb("answer", ctx, { blocker_id: "b-velho", text: "sim" });
    const r: any = await runVerb("spec", ctx, { id: "spec-0001" });
    expect(r.blockers).toEqual([
      { id: "b-nome", question: "Qual o nome do orquestrador?", raised_by: "spec-judge", options: ["Manda-CARU", "Mand-Ingá"] },
    ]);
    expect(r.answers.length).toBe(1);
    expect(r.answers[0]).toMatchObject({ blocker_id: "b-velho", question: "Já respondido?", answer: "sim", by: "dono", via: "api" });
  });

  test("SPEC sem seções e sem eventos devolve listas vazias", async () => {
    const r: any = await runVerb("spec", fixture(), { id: "SPEC-0002" });
    expect(r).toMatchObject({ id: "SPEC-0002", status: "approved", intent: null, bench: null, objective: "y", acs: [], blockers: [], answers: [], sections: [] });
  });

  test("id que não é de SPEC ou não existe é erro", async () => {
    await expect(runVerb("spec", fixture(), { id: "SPEC-0099" })).rejects.toThrow("SPEC-0099");
    await expect(runVerb("spec", fixture(), { id: "PLAN-0001" })).rejects.toThrow();
  });

  test("não escreve no arquivo nem no state.db", async () => {
    const ctx = fixture();
    const before = ctx.db.query("SELECT count(*) AS n FROM events").get() as any;
    await runVerb("spec", ctx, { id: "SPEC-0001" });
    expect((ctx.db.query("SELECT count(*) AS n FROM events").get() as any).n).toBe(before.n);
  });
});
