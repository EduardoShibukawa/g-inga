import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStateDb } from "../src/state/db";
import { runVerb } from "../src/verbs/registry";

/**
 * T918: o verbo `answer` grava `## Respostas` no arquivo da SPEC. O verbo
 * `spec` já devolve as respostas estruturadas, então essa seção não pode
 * voltar também em `sections` (a tela mostrava a resposta duas vezes).
 */
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

test("depois de responder, Respostas não aparece em sections", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ginga-spec-resp-"));
  dirs.push(dir);
  const root = join(dir, ".ginga");
  mkdirSync(join(root, "specs"), { recursive: true });
  const file = join(root, "specs", "SPEC-0001-x.md");
  writeFileSync(file, "---\ntype: spec\ntitle: X\nstatus: draft\n---\n## Objetivo\no\n\n## Notas\nn\n");
  const db = openStateDb(join(dir, "state.db"));
  db.query("INSERT INTO events(id, ts, kind, plan, task, json) VALUES('01', '2026-10-27T10:00:00Z', 'blocker', 'SPEC-0001', NULL, ?)").run(
    JSON.stringify({ data: { blocker_id: "b1", question: "Qual?", raised_by: "spec-judge" } }),
  );
  const ctx = { by: "dono", via: "web", root, db };
  await runVerb("answer", ctx, { blocker_id: "b1", text: "esta" });
  expect(readFileSync(file, "utf8")).toContain("## Respostas"); // o answer continua gravando no arquivo
  const r: any = await runVerb("spec", ctx, { id: "SPEC-0001" });
  expect(r.sections).toEqual([{ title: "Notas", body: "n" }]);
  expect(r.answers.map((a: any) => a.answer)).toEqual(["esta"]);
});
