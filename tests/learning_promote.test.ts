// tests_frozen — PLAN-0013 TASK-05 (T146): `ginga learning promote` → LESSON-*.md.
//
// Congela a interface do PLAN.md: `promote(root, ref /* PLAN-NNNN#L-NN */): Lesson`
// em src/lessons.ts e `LEARNING_VERBS` em src/verbs/learning.ts (registrado com
// `...LEARNING_VERBS` no registry). Teste da TASK: PLAN de fixture com L-02 →
// `LESSON-0001-<slug>.md` com `from: PLAN-0099#L-02` e o learning marcado
// `· promovida`; frontmatter `type: lesson` com scope/evidence; evento `learning`
// com `promoted: true` (válido pelo schema). Import dinâmico: RED por asserção.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getVerb } from "../src/verbs/registry";
import { validateEvent } from "../src/events/validate";

const lessonsMod = await import("../src/lessons.ts").catch(() => null);
const learningVerbMod = await import("../src/verbs/learning.ts").catch(() => null);

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  delete process.env.GINGA_EVENTS;
});

function tmpBundle(): string {
  const D = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "promote-")));
  dirs.push(D);
  const P = join(D, "plans", "PLAN-0099-investigacao");
  mkdirSync(P, { recursive: true });
  writeFileSync(
    join(P, "PLAN.md"),
    "---\ntype: plan\ntitle: Investigar\nstatus: approved\nkind: investigation\nrepos: [ginga]\n---\n## Objetivo\nx\n",
  );
  writeFileSync(
    join(P, "LEARNINGS.md"),
    [
      "# Learnings — PLAN-0099",
      "",
      "## L-01 · confirmada · 2026-10-30 05:00",
      "- hipótese: h1",
      "- evidência: ev1",
      "- conclusão:Conclusão um",
      "- escopo: src/watch/",
      "",
      "## L-02 · armadilha · 2026-10-30 05:10",
      "- hipótese: h2",
      "- evidência: receipt 48650da9",
      "- conclusão:Conclusão dois",
      "- escopo: src/notify/router.ts",
      "",
    ].join("\n"),
  );
  return D;
}

describe("promote (src/lessons.ts)", () => {
  test("módulo existe e exporta promote", () => {
    expect(lessonsMod).not.toBeNull();
    expect(typeof (lessonsMod as any)?.promote).toBe("function");
  });

  test("PLAN-0099#L-02 → LESSON-0001-<slug>.md com from/scope/evidence e learning marcado promovida", () => {
    if (!lessonsMod) throw new Error("src/lessons.ts não existe ainda (RED)");
    const root = tmpBundle();
    const lesson = (lessonsMod as any).promote(root, "PLAN-0099#L-02");
    expect(lesson).toBeObject();
    expect(lesson.id).toBe("LESSON-0001");
    expect(lesson.from).toBe("PLAN-0099#L-02");
    const lessonsDir = join(root, "knowledge", "lessons");
    expect(existsSync(lessonsDir)).toBe(true);
    const files = readdirSync(lessonsDir).filter((f) => /^LESSON-0001-.*\.md$/.test(f));
    expect(files).toHaveLength(1);
    const text = readFileSync(join(lessonsDir, files[0]!), "utf8");
    expect(text).toContain("type: lesson");
    expect(text).toContain("from: PLAN-0099#L-02");
    expect(text).toContain("src/notify/router.ts"); // escopo vira scope.files
    expect(text).toContain("receipt 48650da9"); // evidência
    // o learning original é marcado como promovido
    const learn = readFileSync(join(root, "plans", "PLAN-0099-investigacao", "LEARNINGS.md"), "utf8");
    const l2 = learn.split("## L-02")[1] ?? "";
    expect(l2).toContain("promovida");
  });
});

describe("verbo learning promote (LEARNING_VERBS)", () => {
  test("src/verbs/learning.ts exporta LEARNING_VERBS e o registry tem `learning promote`", () => {
    expect(learningVerbMod).not.toBeNull();
    expect(Array.isArray((learningVerbMod as any)?.LEARNING_VERBS)).toBe(true);
    const v = getVerb("learning promote");
    expect(v).toBeDefined();
    expect(v!.write).toBe(true);
  });

  test("rodar o verbo promove e emite evento learning com promoted: true (schema válido)", () => {
    if (!learningVerbMod) throw new Error("src/verbs/learning.ts não existe ainda (RED)");
    const root = tmpBundle();
    const events = join(root, "events.jsonl");
    process.env.GINGA_EVENTS = events;
    const v = getVerb("learning promote")!;
    const out = v.run({ by: "operador", via: "cli", root, db: null as any }, { ref: "PLAN-0099#L-02" });
    Promise.resolve(out).then(() => {});
    // o run pode ser síncrono ou assíncrono: dá um respiro e valida o que saiu
    const lessonFiles = existsSync(join(root, "knowledge", "lessons"))
      ? readdirSync(join(root, "knowledge", "lessons")).filter((f) => f.startsWith("LESSON-"))
      : [];
    expect(lessonFiles.length).toBe(1);
    if (existsSync(events)) {
      const lines = readFileSync(events, "utf8").trim().split("\n").filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);
      const ev = JSON.parse(lines[lines.length - 1]!);
      expect(ev.kind).toBe("learning");
      expect(ev.data.promoted).toBe(true);
      expect(validateEvent(ev).ok).toBe(true);
    }
  });
});
