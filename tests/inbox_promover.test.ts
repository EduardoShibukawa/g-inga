import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStateDb } from "../src/state/db";
import { runVerb, type VerbCtx } from "../src/verbs/registry";

// RED — PLAN-0013 TASK-27 (achado do judge 2026-11-01, TASK-05): quando o PLAN fecha
// (status `done` no frontmatter), a Inbox deve trazer o item "promover?" com os
// learnings do LEARNINGS.md do PLAN que ainda não estão marcados `· promovida`.
// Hoje inbox() (src/verbs/read.ts) só lista aprovar (draft) e blocker sem resposta.

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

let dir: string;
let root: string;
let ctx: VerbCtx;

const LEARNINGS = `# LEARNINGS — PLAN-0002

## L-01 · promote já feito · promovida · 2026-10-30
- hipótese: x
- evidência: y
- conclusão: z
- escopo: ginga

## L-02 · pendente de promoção · 2026-10-31
- hipótese: a
- evidência: b
- conclusão: c
- escopo: ginga
`;

function planDir(id: string, slug: string, status: string): string {
  const d = join(root, "plans", `${id}-${slug}`);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "PLAN.md"), `---\ntype: plan\ntitle: ${id}\nstatus: ${status}\n---\n`);
  return d;
}

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-inbox-")));
  dirs.push(dir);
  root = join(dir, "bundle");
  mkdirSync(join(root, "plans"), { recursive: true });
  ctx = { by: "eduardo", via: "cli", root, db: openStateDb(join(dir, "state.db")) };
});

describe("inbox — item 'promover?' ao fechar o PLAN", () => {
  test("PLAN done com learning não promovida → item type 'promover?' com os pendentes", async () => {
    const d = planDir("PLAN-0002", "fechado", "done");
    writeFileSync(join(d, "LEARNINGS.md"), LEARNINGS);
    const inbox: any = await runVerb("inbox", ctx, {});
    const item = inbox.items.find((i: any) => i.type === "promover?");
    expect(item).toBeDefined();
    expect(item.plan).toBe("PLAN-0002");
    expect(item.pending).toEqual(["L-02"]);
  });

  test("PLAN done com todos promovidos → sem item 'promover?'", async () => {
    const d = planDir("PLAN-0002", "fechado", "done");
    writeFileSync(
      join(d, "LEARNINGS.md"),
      "# LEARNINGS\n\n## L-01 · feito · promovida · 2026-10-30\n- hipótese: x\n- evidência: y\n- conclusão: z\n- escopo: ginga\n",
    );
    const inbox: any = await runVerb("inbox", ctx, {});
    expect(inbox.items.find((i: any) => i.type === "promover?")).toBeUndefined();
  });

  test("PLAN aberto (não done) com learning pendente → sem item 'promover?'", async () => {
    const d = planDir("PLAN-0002", "aberto", "approved");
    writeFileSync(join(d, "LEARNINGS.md"), LEARNINGS);
    const inbox: any = await runVerb("inbox", ctx, {});
    expect(inbox.items.find((i: any) => i.type === "promover?")).toBeUndefined();
  });

  test("inbox continua listando aprovar e blocker junto do 'promover?'", async () => {
    const d = planDir("PLAN-0002", "fechado", "done");
    writeFileSync(join(d, "LEARNINGS.md"), LEARNINGS);
    mkdirSync(join(root, "specs"), { recursive: true });
    writeFileSync(join(root, "specs", "SPEC-0001-x.md"), "---\ntype: spec\ntitle: X\nstatus: draft\n---\n");
    const inbox: any = await runVerb("inbox", ctx, {});
    const types = inbox.items.map((i: any) => i.type);
    expect(types).toContain("aprovar");
    expect(types).toContain("promover?");
  });
});
