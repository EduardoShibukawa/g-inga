// tests_frozen — PLAN-0013 TASK-24 (T314): correções do achado grave do judge
// na TASK-06. `lessons find` deve devolver TODAS as LESSONs que casam (não só
// a primeira), com `title` real do frontmatter, e aceitar múltiplos caminhos
// no --touch (lista separada por vírgula).

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

function writeLesson(root: string, file: string, title: string, repo: string, files: string[]): void {
  const L = join(root, "knowledge", "lessons");
  mkdirSync(L, { recursive: true });
  writeFileSync(
    join(L, file),
    [
      "---",
      "type: lesson",
      `title: ${title}`,
      "scope:",
      `  repo: ${repo}`,
      `  files: [${files.join(", ")}]`,
      "  tags: []",
      "evidence: receipt abc",
      "from: PLAN-0099#L-02",
      "---",
      `# ${file.replace(/\.md$/, "")}`,
      "corpo",
      "",
    ].join("\n"),
  );
}

function tmpBundle(): string {
  const D = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "find-all-")));
  dirs.push(D);
  writeLesson(D, "LESSON-0001-notify.md", "Router do notify", "ginga", ["src/notify/"]);
  writeLesson(D, "LESSON-0002-manda.md", "Lição do manda", "manda", ["src/"]);
  writeLesson(D, "LESSON-0003-router.md", "Router específico", "ginga", ["src/notify/router.ts"]);
  writeLesson(D, "LESSON-0004-outro.md", "Outro escopo", "ginga", ["src/other/"]);
  return D;
}

describe("findLessons devolve todas as LESSONs com title real", () => {
  test("dois escopos que casam o mesmo caminho devolvem as duas, com title", () => {
    if (!lessonsMod) throw new Error("src/lessons.ts não existe (RED)");
    const root = tmpBundle();
    const hit = (lessonsMod as any).findLessons(root, ["src/notify/router.ts"], "ginga");
    const ids = hit.map((h: any) => h.id).sort();
    expect(ids).toEqual(["LESSON-0001", "LESSON-0003"]);
    const t1 = hit.find((h: any) => h.id === "LESSON-0001");
    const t3 = hit.find((h: any) => h.id === "LESSON-0003");
    expect(t1.title).toBe("Router do notify");
    expect(t3.title).toBe("Router específico");
    expect(t1.why).toBeTruthy();
    expect(t3.why).toBeTruthy();
  });

  test("múltiplos caminhos no array de touch são todos considerados", () => {
    if (!lessonsMod) throw new Error("src/lessons.ts não existe (RED)");
    const root = tmpBundle();
    const hit = (lessonsMod as any).findLessons(root, ["src/tick.ts", "src/other/x.ts"], "ginga");
    expect(hit.map((h: any) => h.id)).toEqual(["LESSON-0004"]);
    expect(hit[0].title).toBe("Outro escopo");
  });
});

describe("verbo lessons find devolve todas as LESSONs e aceita lista no --touch", () => {
  test("--touch com lista vírgula devolve todas as que casam, todas com title", async () => {
    if (!lessonsMod) throw new Error("src/lessons.ts não existe (RED)");
    const root = tmpBundle();
    const v = getVerb("lessons find")!;
    const out: any = await Promise.resolve(
      v.run({ by: "planner", via: "cli", root, db: null as any }, {
        touch: "src/notify/router.ts,src/other/x.ts",
        repo: "ginga",
      }),
    );
    const items = out?.lessons ?? [];
    expect(items.map((i: any) => i.id).sort()).toEqual(["LESSON-0001", "LESSON-0003", "LESSON-0004"]);
    for (const it of items) {
      expect(typeof it.title).toBe("string");
      expect(it.title.length).toBeGreaterThan(0);
      expect(typeof it.path).toBe("string");
      expect(typeof it.why).toBe("string");
    }
  });

  test("--touch unitário devolve só as que casam, sem truncar para uma", async () => {
    if (!lessonsMod) throw new Error("src/lessons.ts não existe (RED)");
    const root = tmpBundle();
    const v = getVerb("lessons find")!;
    const out: any = await Promise.resolve(
      v.run({ by: "planner", via: "cli", root, db: null as any }, {
        touch: "src/notify/router.ts",
        repo: "ginga",
      }),
    );
    const items = out?.lessons ?? [];
    expect(items.map((i: any) => i.id).sort()).toEqual(["LESSON-0001", "LESSON-0003"]);
    expect(items.every((i: any) => typeof i.title === "string" && i.title.length > 0)).toBe(true);
  });
});
