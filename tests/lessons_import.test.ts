// tests_frozen — PLAN-0013 TASK-08 (T148): `ginga lessons import <arquivo>`.
//
// Interface do PLAN.md: `importLessons(root, file): { created: string[]; skipped: number }`
// em src/lessons_import.ts (lógica em src/lessons.ts); verbo `lessons import <file>`
// em LEARNING_VERBS. Teste da TASK: fixture com 3 entradas no LESSONS.md da raiz
// (formato livre, cada `## ...` vira uma LESSON) → 3 arquivos; rodar de novo →
// `created: []`, `skipped: 3` (idempotente por hash do texto da entrada);
// `from: import:<arquivo>`; scope.files vazio quando não há caminho citado;
// o LESSONS-PROPOSED.md do pinga (cabeçalho PROPOSALS_HEADER) também importa;
// os arquivos de origem não são apagados nem editados. Import dinâmico: RED.

import { afterEach, describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getVerb } from "../src/verbs/registry";

const importMod = await import("../src/lessons_import.ts").catch(() => null);

const FIXTURE = join(import.meta.dir, "fixtures", "lessons-import");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmpRoot(): { root: string; src: string } {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "imp-")));
  dirs.push(root);
  const src = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "imp-src-")));
  dirs.push(src);
  copyFileSync(join(FIXTURE, "LESSONS.md"), join(src, "LESSONS.md"));
  copyFileSync(join(FIXTURE, "LESSONS-PROPOSED.md"), join(src, "LESSONS-PROPOSED.md"));
  return { root, src };
}

function lessonFiles(root: string): string[] {
  const dir = join(root, "knowledge", "lessons");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^LESSON-\d+.*\.md$/.test(f));
}

describe("importLessons (src/lessons_import.ts)", () => {
  test("módulo existe e exporta importLessons", () => {
    expect(importMod).not.toBeNull();
    expect(typeof (importMod as any)?.importLessons).toBe("function");
  });

  test("LESSONS.md da raiz com 3 entradas `## ...` → 3 LESSON-*.md com from: import:<arquivo>", () => {
    if (!importMod) throw new Error("src/lessons_import.ts não existe ainda (RED)");
    const { root, src } = tmpRoot();
    const before = readFileSync(join(src, "LESSONS.md"), "utf8");
    const res = (importMod as any).importLessons(root, join(src, "LESSONS.md"));
    expect(res.created).toHaveLength(3);
    expect(lessonFiles(root)).toHaveLength(3);
    for (const f of lessonFiles(root)) {
      const text = readFileSync(join(root, "knowledge", "lessons", f), "utf8");
      expect(text).toContain("type: lesson");
      expect(text).toContain("from: import:LESSONS.md");
    }
    // origem intacta
    expect(readFileSync(join(src, "LESSONS.md"), "utf8")).toBe(before);
  });

  test("idempotente por hash: segunda pasada → created [], skipped 3", () => {
    if (!importMod) throw new Error("src/lessons_import.ts não existe ainda (RED)");
    const { root, src } = tmpRoot();
    const first = (importMod as any).importLessons(root, join(src, "LESSONS.md"));
    expect(first.created).toHaveLength(3);
    const second = (importMod as any).importLessons(root, join(src, "LESSONS.md"));
    expect(second.created).toEqual([]);
    expect(second.skipped).toBe(3);
    expect(lessonFiles(root)).toHaveLength(3);
  });

  test("LESSONS-PROPOSED.md do pinga (cabeçalho v1) também importa suas entradas", () => {
    if (!importMod) throw new Error("src/lessons_import.ts não existe ainda (RED)");
    const { root, src } = tmpRoot();
    const res = (importMod as any).importLessons(root, join(src, "LESSONS-PROPOSED.md"));
    expect(res.created).toHaveLength(2);
    for (const f of lessonFiles(root)) {
      const text = readFileSync(join(root, "knowledge", "lessons", f), "utf8");
      expect(text).toContain("from: import:LESSONS-PROPOSED.md");
    }
  });
});

describe("verbo lessons import", () => {
  test("registry tem `lessons import` com argumento file (obrigatório)", () => {
    const v = getVerb("lessons import");
    expect(v).toBeDefined();
    expect(v!.args.some((a) => a.name === "file" && a.required)).toBe(true);
  });
});
