import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveBoard } from "../src/board";
import { openStateDb } from "../src/state/db";

const dirs: string[] = [];

beforeEach(() => {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-index-")));
  dirs.push(dir);
});

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("ginga index (PLAN-0012 TASK-06)", () => {
  test("renderIndex gera index.md com frontmatter okf 0.1 e linha gerado por ginga", () => {
    const root = join(dirs[0]!, "bundle");
    const db = openStateDb(join(dirs[0]!, "state.db"));
    const board = deriveBoard(root, db);
    const template = `---
okf: "0.1"
---
# titulo

> gerado por ginga

## Em andamento

<!-- ginga:board:em_andamento -->

## Pronto para pegar

<!-- ginga:board:pronto -->
`;
    const { renderIndex } = require("../src/index_md");
    const out = renderIndex(board, template, new Date("2026-10-29T00:00:00Z"));
    expect(out).toContain('okf: "0.1"');
    expect(out).toContain('> gerado por ginga');
  });

  test("mesma entrada gera mesmos bytes; segunda escrita não muda (changed false)", async () => {
    const { writeIndex } = await import("../src/index_md");
    const root = dirs[0]!;
    mkdirSync(join(root, ".ginga"), { recursive: true });
    mkdirSync(join(root, "intents"), { recursive: true });
    writeFileSync(join(root, ".ginga", "index.template.md"), `---
okf: "0.1"
---
> gerado por ginga

## Pronto para pegar

<!-- ginga:board:pronto -->

## Esperando o dono

<!-- ginga:board:esperando -->

## Em andamento

<!-- ginga:board:em_andamento -->

## Concluído

<!-- ginga:board:concluido -->

## Backlog (INTENTs sem PLAN)

<!-- ginga:board:backlog -->
`);
    const db = openStateDb(join(root, "state.db"));
    const r1 = writeIndex(root, db);
    const first = readFileSync(join(root, ".ginga", "index.md"), "utf8");
    const r2 = writeIndex(root, db);
    const second = readFileSync(join(root, ".ginga", "index.md"), "utf8");
    expect(r1.changed).toBe(true);
    expect(r2.changed).toBe(false);
    expect(first).toBe(second);
  });

  test("ginga index --check sai 1 se desatualizado", async () => {
    const root = dirs[0]!;
    mkdirSync(join(root, ".ginga"), { recursive: true });
    writeFileSync(join(root, ".ginga", "index.template.md"), `---
okf: "0.1"
---
> gerado por ginga
`);
    writeFileSync(join(root, ".ginga", "index.md"), "desatualizado\n");
    const { checkIndex } = await import("../src/index_md");
    expect(checkIndex(root)).toBe(false);
  });
});
