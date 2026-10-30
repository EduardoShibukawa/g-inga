// tests_frozen — PLAN-0013 TASK-06 (T147): `ginga lessons find --touch <caminhos>`.
//
// Interface do PLAN.md: `findLessons(root, touch, repo?)` → (Lesson & { why })[]
// em src/lessons.ts; verbo `lessons find` em LEARNING_VERBS (src/verbs/learning.ts).
// Teste da TASK: lesson com `scope.files: [src/notify/]` casa `src/notify/router.ts`
// e NÃO casa `src/tick.ts`; `--json` traz id/title/path/why. Match por
// prefixo/glob de scope.files e por scope.repo. Sem busca semântica/LLM.
// Import dinâmico: RED por asserção.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getVerb } from "../src/verbs/registry";

const lessonsMod = await import("../src/lessons.ts").catch(() => null);

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmpBundle(): string {
  const D = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "find-")));
  dirs.push(D);
  const L = join(D, "knowledge", "lessons");
  mkdirSync(L, { recursive: true });
  writeFileSync(
    join(L, "LESSON-0001-notify.md"),
    [
      "---",
      "type: lesson",
      "title: Router do notify",
      "scope:",
      "  repo: ginga",
      "  files: [src/notify/]",
      "  tags: [notify]",
      "evidence: receipt abc",
      "from: PLAN-0099#L-02",
      "---",
      "# LESSON-0001",
      "corpo",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(L, "LESSON-0002-outro-repo.md"),
    [
      "---",
      "type: lesson",
      "title: Lição do manda",
      "scope:",
      "  repo: manda",
      "  files: [src/]",
      "  tags: []",
      "evidence: commit xyz",
      "from: PLAN-0001#L-01",
      "---",
      "# LESSON-0002",
      "",
    ].join("\n"),
  );
  return D;
}

describe("findLessons (src/lessons.ts)", () => {
  test("módulo existe e exporta findLessons", () => {
    expect(lessonsMod).not.toBeNull();
    expect(typeof (lessonsMod as any)?.findLessons).toBe("function");
  });

  test("scope.files [src/notify/] casa src/notify/router.ts e não src/tick.ts; repo filtra", () => {
    if (!lessonsMod) throw new Error("src/lessons.ts não existe ainda (RED)");
    const root = tmpBundle();
    const hit = (lessonsMod as any).findLessons(root, ["src/notify/router.ts"], "ginga");
    expect(hit.map((h: any) => h.id)).toContain("LESSON-0001");
    expect(hit.find((h: any) => h.id === "LESSON-0001")?.why).toBeTruthy();
    const miss = (lessonsMod as any).findLessons(root, ["src/tick.ts"], "ginga");
    expect(miss.map((m: any) => m.id)).not.toContain("LESSON-0001");
    // repo diferente não traz a lesson do ginga
    const wrongRepo = (lessonsMod as any).findLessons(root, ["src/notify/router.ts"], "manda");
    expect(wrongRepo.map((m: any) => m.id)).not.toContain("LESSON-0001");
    expect(wrongRepo.map((m: any) => m.id)).toContain("LESSON-0002");
  });
});

describe("verbo lessons find", () => {
  test("registry tem `lessons find` com argumento touch", () => {
    const v = getVerb("lessons find");
    expect(v).toBeDefined();
    expect(v!.args.some((a) => a.name === "touch")).toBe(true);
  });

  test("--json devolve id, title, path e why", async () => {
    if (!lessonsMod) throw new Error("src/lessons.ts não existe ainda (RED)");
    const root = tmpBundle();
    const v = getVerb("lessons find")!;
    const out: any = await Promise.resolve(
      v.run({ by: "planner", via: "cli", root, db: null as any }, { touch: "src/notify/router.ts", repo: "ginga", json: "1" }),
    );
    const items = Array.isArray(out) ? out : out?.lessons ?? out?.results ?? [];
    expect(items.length).toBe(1);
    expect(items[0].id).toBe("LESSON-0001");
    expect(typeof items[0].title).toBe("string");
    expect(typeof items[0].path).toBe("string");
    expect(typeof items[0].why).toBe("string");
  });
});
