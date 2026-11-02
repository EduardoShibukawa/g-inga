import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStateDb } from "../src/state/db";
import { VERBS, runVerb, type VerbCtx } from "../src/verbs/registry";

/**
 * PLAN-0011 TASK-02: a CLI é gerada do registro (`src/verbs/registry.ts`).
 * - `ginga <verbo> [sub] args... [--json] [--via V] [--by N] [--root DIR]`: argumentos posicionais na ordem de
 *   `verb.args`; `--<nome> valor` também preenche um argumento (ex.: `--tier strong`). `via` padrão `cli`;
 *   `by` padrão `$GINGA_BY`, senão `$USER`, senão `cli`; `root` padrão `$GINGA_ROOT`, senão `<cwd>/.ginga`;
 *   o `state.db` é o de `resolveStateDbPath(root)` (`$GINGA_STATE_DB` vence); eventos em `$GINGA_EVENTS`.
 * - `--json` imprime exatamente o resultado do `run` do verbo (JSON). Erro do registro (verbo/argumento) → stderr, exit 2.
 * - `ginga --help` lista todos os nomes do registro. Nenhuma lógica por verbo em src/cli.ts.
 * - `ginga watch <alvo>` é o verbo `watch`; `ginga watch` sem alvo continua sendo o vigia.
 */

const ROOT = join(import.meta.dir, "..");
const BIN = join(ROOT, "bin", "ginga.ts");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

type Fx = { dir: string; root: string; db: string; events: string; ctx: VerbCtx };

/** Bundle + state.db idênticos a cada chamada (só o caminho muda). */
function fixture(): Fx {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-cliverbs-")));
  dirs.push(dir);
  const root = join(dir, "bundle");
  mkdirSync(join(root, "intents"), { recursive: true });
  mkdirSync(join(root, "specs"), { recursive: true });
  mkdirSync(join(root, "plans", "PLAN-0001-auth"), { recursive: true });
  writeFileSync(join(root, "intents", "INTENT-0001-primeiro.md"), "---\ntype: intent\ntitle: Primeiro\nsource: cli\ntimestamp: 2026-10-27T00:00:00Z\n---\nCorpo.\n");
  writeFileSync(join(root, "specs", "SPEC-0001-auth.md"), "---\ntype: spec\ntitle: Auth\nstatus: draft\n---\n## Objetivo\nx\n");
  writeFileSync(join(root, "plans", "PLAN-0001-auth", "PLAN.md"), "---\ntype: plan\ntitle: Auth plan\nstatus: draft\nrepos: [ginga]\n---\n## Objetivo\nx\n");
  writeFileSync(join(root, "plans", "PLAN-0001-auth", "log.md"), "# Log — PLAN-0001\n");
  writeFileSync(join(root, "plans", "PLAN-0001-auth", "LEARNINGS.md"), "# Learnings\n\n## L-01 · confirmada · 2026-10-30\n- hipótese: h1\n- evidência: ev1\n- conclusão:Conclusão um\n- escopo: src/\n");
  mkdirSync(join(dir, "tests/fixtures/lessons-import"), { recursive: true });
  const lessonsProposedPath = join(import.meta.dir, "fixtures", "lessons-import", "LESSONS-PROPOSED.md");
  const lessonsProposedContent = existsSync(lessonsProposedPath) ? readFileSync(lessonsProposedPath, "utf8") : "## Lição teste\n";
  writeFileSync(join(dir, "tests/fixtures/lessons-import/LESSONS-PROPOSED.md"), lessonsProposedContent);
  const db = join(dir, "state.db");
  const conn = openStateDb(db);
  conn
    .query("INSERT INTO events(id, ts, kind, plan, task, json) VALUES('01', '2026-10-29T00:00:00Z', 'blocker', 'PLAN-0001', 'TASK-01', ?)")
    .run(JSON.stringify({ data: { blocker_id: "b1", question: "rotação?", raised_by: "manda" } }));
  conn.query("INSERT INTO task_exec(plan, task, status, attempts) VALUES('PLAN-0001', 'TASK-01', 'failed', 2)").run();
  return { dir, root, db, events: join(dir, "events.jsonl"), ctx: { by: "eduardo", via: "cli", root, db: conn } };
}

function cli(fx: Fx, argv: string[]) {
  const env = { ...process.env, GINGA_STATE_DB: fx.db, GINGA_EVENTS: fx.events, GINGA_BY: "", GINGA_ROOT: "" };
  const p = Bun.spawnSync([process.execPath, BIN, ...argv, "--root", fx.root], { env, cwd: fx.dir });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}

// Binários stub (exit 0, mudo) para os verbos de operação que delegam ao PATH
// (PLAN-0015 TASK-07): a comparação CLI × run direto precisa de um `pinga`/`gira`
// determinístico — nunca o real.
function stubBin(names: string[]): string {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-clistub-")));
  dirs.push(dir);
  for (const n of names) {
    writeFileSync(join(dir, n), "#!/bin/sh\nexit 0\n");
    chmodSync(join(dir, n), 0o755);
  }
  return dir;
}

// Um caso por verbo do registro: argv posicional (+ flags) e os args equivalentes do `run`.
// `via` força o mesmo ctx dos dois lados (ctl/tui/hermes/hud só agem em CLI com tty);
// `bin` prepõe stubs no PATH para os que delegam a binários externos.
const CASES: Record<string, { argv: string[]; args: Record<string, string>; via?: string; bin?: string[] }> = {
  "intent new": { argv: ["intent", "new", "Quero login com OAuth"], args: { text: "Quero login com OAuth" } },
  approve: { argv: ["approve", "PLAN-0001"], args: { id: "PLAN-0001" } },
  reject: { argv: ["reject", "SPEC-0001", "escopo grande"], args: { id: "SPEC-0001", reason: "escopo grande" } },
  answer: { argv: ["answer", "b1", "janela fixa"], args: { blocker_id: "b1", text: "janela fixa" } },
  decide: { argv: ["decide", "worktree-x", "arquivar"], args: { item: "worktree-x", option: "arquivar" } },
  pause: { argv: ["pause"], args: {} },
  resume: { argv: ["resume", "PLAN-0001"], args: { plan: "PLAN-0001" } },
  retry: { argv: ["retry", "PLAN-0001", "TASK-01", "--tier", "strong"], args: { plan: "PLAN-0001", task: "TASK-01", tier: "strong" } },
  escalate: { argv: ["escalate", "PLAN-0001", "TASK-01"], args: { plan: "PLAN-0001", task: "TASK-01" } },
  cancel: { argv: ["cancel", "PLAN-0001"], args: { plan: "PLAN-0001" } },
  "budget raise": { argv: ["budget", "raise", "PLAN-0001", "5"], args: { plan: "PLAN-0001", usd: "5" } },
  "triage promote": { argv: ["triage", "promote", "PLAN-0001"], args: { plan: "PLAN-0001" } },
  init: { argv: ["init", "--yes"], args: { yes: "true" } },
  status: { argv: ["status"], args: {} },
  board: { argv: ["board"], args: {} },
  inbox: { argv: ["inbox"], args: {} },
  alerts: { argv: ["alerts"], args: {} },
  watch: { argv: ["watch", "PLAN-0001"], args: { target: "PLAN-0001" } },
  index: { argv: ["index"], args: {} },
  // Operação (PLAN-0015 TASK-03; cobertura TASK-07): tty-guards via `api`, delegações com stub no PATH.
  ctl: { argv: ["ctl"], args: {}, via: "api" },
  web: { argv: ["web", "status"], args: { action: "status" } },
  tui: { argv: ["tui"], args: {}, via: "api" },
  hermes: { argv: ["hermes"], args: {}, via: "api" },
  hud: { argv: ["hud", "testando"], args: { arg1: "testando" }, via: "api" },
  verify: { argv: ["verify", "tasks/T1/PLAN.md"], args: { arg1: "tasks/T1/PLAN.md" }, bin: ["pinga"] },
  maestro: { argv: ["maestro", "scoreboard"], args: { arg1: "scoreboard" }, bin: ["pinga"] },
  gira: { argv: ["gira", "outline", "src/a.ts"], args: { arg1: "outline", arg2: "src/a.ts" }, bin: ["gira"] },
  handoff: { argv: ["handoff", "PLAN-0001"], args: { plan: "PLAN-0001" } },
  "learning promote": { argv: ["learning", "promote", "PLAN-0001#L-01"], args: { ref: "PLAN-0001#L-01" } },
  "lessons find": { argv: ["lessons", "find", "--touch", "src/notify/router.ts", "--repo", "ginga"], args: { touch: "src/notify/router.ts", repo: "ginga" } },
  "lessons import": { argv: ["lessons", "import", "tests/fixtures/lessons-import/LESSONS-PROPOSED.md"], args: { file: "tests/fixtures/lessons-import/LESSONS-PROPOSED.md" } },
};

describe("CLI gerada do registro", () => {
  test("todo verbo do registro tem caso aqui (um verbo novo exige cobertura)", () => {
    expect(VERBS.map((v) => v.name).sort()).toEqual(Object.keys(CASES).sort());
  });

  for (const verb of VERBS) {
    test(`ginga ${verb.name} --json devolve o mesmo JSON que o run direto`, async () => {
      const c = CASES[verb.name]!;
      const viaCli = fixture();
      const direct = fixture();
      const origPath = process.env.PATH ?? "";
      if (c.bin) process.env.PATH = `${stubBin(c.bin)}:${origPath}`;
      try {
        const r = cli(viaCli, [...c.argv, "--by", "eduardo", "--json", ...(c.via ? ["--via", c.via] : [])]);
        expect(r.err).toBe("");
        expect(r.code).toBe(0);
        const expected = await runVerb(verb.name, { ...direct.ctx, via: c.via ?? "cli" }, c.args);
        expect(JSON.parse(r.out)).toEqual(JSON.parse(JSON.stringify(expected)));
      } finally {
        process.env.PATH = origPath;
      }
    });
  }

  test("sem --json também sai 0 e imprime algo", () => {
    const fx = fixture();
    const r = cli(fx, ["status"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).not.toBe("");
  });

  test("--via e --by chegam ao evento; padrão de via é cli", () => {
    const fx = fixture();
    expect(cli(fx, ["approve", "PLAN-0001", "--via", "telegram", "--by", "ana", "--json"]).code).toBe(0);
    const ev = readFileSync(fx.events, "utf8").trim().split("\n").map((l) => JSON.parse(l)).find((e) => e.kind === "transition");
    expect(ev.data).toMatchObject({ by: "ana", via: "telegram", to: "approved" });
    const fx2 = fixture();
    expect(cli(fx2, ["approve", "SPEC-0001", "--by", "ana", "--json"]).code).toBe(0);
    const ev2 = readFileSync(fx2.events, "utf8").trim().split("\n").map((l) => JSON.parse(l)).find((e) => e.kind === "transition");
    expect(ev2.data.via).toBe("cli");
  });

  test("--help lista o registro inteiro", () => {
    const p = Bun.spawnSync([process.execPath, BIN, "--help"]);
    expect(p.exitCode).toBe(0);
    const out = p.stdout.toString();
    for (const v of VERBS) expect(out).toContain(v.name);
  });

  test("argumento obrigatório ausente: erro do registro no stderr, exit 2", () => {
    const fx = fixture();
    const r = cli(fx, ["approve"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("falta argumento: id");
    expect(readFileSync(join(fx.root, "plans", "PLAN-0001-auth", "PLAN.md"), "utf8")).toContain("status: draft");
  });

  test("verbo desconhecido continua exit 2", () => {
    const fx = fixture();
    const r = cli(fx, ["nada-disso"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("nada-disso");
  });

  test("falha de execução do verbo (id inexistente) sai 1 com a mensagem", () => {
    const fx = fixture();
    const r = cli(fx, ["approve", "PLAN-0099", "--json"]);
    expect(r.code).toBe(1);
    expect(r.err).not.toBe("");
  });

  test("nenhuma lógica por verbo em src/cli.ts", () => {
    const src = readFileSync(join(ROOT, "src", "cli.ts"), "utf8");
    for (const word of ['"approve"', '"reject"', '"escalate"', '"cancel"', '"decide"', '"budget"', '"inbox"']) {
      expect(src).not.toContain(word);
    }
    expect(existsSync(join(ROOT, "src", "verbs", "registry.ts"))).toBe(true);
  });
});
