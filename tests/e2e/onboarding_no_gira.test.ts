// tests_frozen — PLAN-0015 TASK-02 (e2e do onboarding sem gira).
//
// Num repo git novo, sem `gira` nem `ginga` no PATH:
//   `ginga init --yes` → provider "rg" no project.toml;
//   `ginga intent new` → INTENT no bundle;
//   `manda plan` (stub de `pi` como planner) → PLAN + TASK no bundle;
//   `ginga approve` → status approved na frente do PLAN;
//   `ginga tick` → despacha `manda run` (stub de `pi` como executor) →
//   `pinga verify` REAL com `--ledger` temporário sela receipt `pass`.
// Sem modelos reais e sem rede: só stubs no formato real (tests/stubs/pi).
// Referência: manda/tests/e2e/no_gira.test.ts (PLAN-0009).
// Na sandbox do pinga (PINGA_SANDBOX=bwrap) não há `pinga` nem `manda` no
// namespace (HOME falso, sem o repo irmão): a cadeia externa fica bloqueada.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const GINGA_BIN = join(ROOT, "bin", "ginga.ts");
const STUBS = join(ROOT, "tests", "stubs");
const PINGA = process.env.PINGA_BIN ?? Bun.which("pinga") ?? "";
const MANDA_REPO = process.env.MANDA_BIN ?? join(ROOT, "..", "manda");
const MANDA_BIN = join(MANDA_REPO, "bin", "manda.ts");

const SANDBOX = process.env.PINGA_SANDBOX === "bwrap";
const chain = !SANDBOX && PINGA !== "" && existsSync(MANDA_BIN);

const PLAN_ID = "PLAN-0001-quero-um-src-a-ts";

// Resposta pré-gravada do planner (formato real do `pi --mode json`).
const text = (s: string) =>
  JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: s }],
      usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { total: 0 } },
      stopReason: "stop",
    },
  }) + "\n";

const PLANNER_REPLY = [
  "=== FILE: PLAN.md ===",
  `---\ntype: plan\ntitle: Quero um src/a.ts\nintent: INTENT-0001\nstatus: draft\n---\n## Objetivo\ncriar src/a.ts`,
  "=== FILE: TASK-01-a.md ===",
  `---\ntype: task\nmode: mvp\ngoal: "cria src/a.ts"\nplan: ${PLAN_ID}\ndepends_on: []\ntier: free\ntouch: [src/a.ts]\ndone_when: "test -f src/a.ts"\ntests_frozen: []\n---\n## Fazer\n- criar src/a.ts`,
].join("\n");

let ws: string;
let aux: string;
let bin: string;
let ledger: string;
let log: string;

function sh(...a: string[]) {
  return Bun.spawnSync(["git", "-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: ws, stdout: "pipe", stderr: "pipe" }).stdout.toString().trim();
}

function put(rel: string, content: string) {
  const p = join(ws, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

function env(): Record<string, string> {
  return {
    ...process.env,
    // PATH só com os stubs, o bun e o sistema: sem ~/.local/bin (gira, ginga, pinga e manda reais).
    PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
    GINGA_ROOT: "",
    GINGA_BY: "",
    GINGA_STATE_DB: join(aux, "state.db"),
    GINGA_EVENTS: join(aux, "events.jsonl"),
    STUB_LOG: log,
    STUB_PLANNER_OUT: join(aux, "planner.jsonl"),
    STUB_EXEC_OUT: join(STUBS, "exec-ok.jsonl"),
  };
}

function ginga(...args: string[]) {
  return Bun.spawnSync([process.execPath, GINGA_BIN, ...args], { cwd: ws, env: env(), stdout: "pipe", stderr: "pipe" });
}

/** Insere linhas logo após o cabeçalho `[section]` (sem duplicar a tabela TOML). */
function addToml(file: string, section: string, lines: string[]) {
  const raw = readFileSync(file, "utf8").split("\n");
  const at = raw.findIndex((l) => l.trim() === `[${section}]`);
  if (at < 0) throw new Error(`sem seção [${section}] em ${file}`);
  raw.splice(at + 1, 0, ...lines);
  writeFileSync(file, raw.join("\n"));
}

beforeEach(() => {
  ws = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-onb-")));
  aux = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-onb-aux-")));
  bin = join(aux, "bin");
  mkdirSync(bin);
  ledger = join(aux, "ledger.db");
  log = join(aux, "calls.log");
  chmodSync(join(STUBS, "pi"), 0o755);
  symlinkSync(join(STUBS, "pi"), join(bin, "pi"));
  if (PINGA !== "") symlinkSync(PINGA, join(bin, "pinga"));
  writeFileSync(join(bin, "manda"), `#!/bin/sh\nexec "${process.execPath}" "${MANDA_BIN}" "$@"\n`);
  chmodSync(join(bin, "manda"), 0o755);
  writeFileSync(join(aux, "planner.jsonl"), text(PLANNER_REPLY));
  sh("init", "-q", "-b", "main");
  put(".gitignore", ".worktrees/\n");
  put("src/base.ts", "export {};\n");
  sh("add", ".");
  sh("commit", "-q", "-m", "base");
});

afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
  rmSync(aux, { recursive: true, force: true });
});

describe("onboarding sem gira (init → intent → approve → tick → receipt pass)", () => {
  test("o PATH do teste não resolve gira nem ginga", () => {
    const r = Bun.spawnSync(["sh", "-c", "command -v gira; command -v ginga"], { env: env(), stdout: "pipe" });
    expect(r.stdout.toString().trim()).toBe("");
  });

  test("ginga init --yes num repo sem gira cria o bundle com provider rg", () => {
    const r = ginga("init", "--yes");
    expect(r.stderr.toString()).toBe("");
    expect(r.exitCode).toBe(0);
    const out = JSON.parse(r.stdout.toString());
    expect(out.detected.provider).toBe("rg");
    const toml = readFileSync(join(ws, ".ginga", "project.toml"), "utf8");
    expect(toml).toContain('provider = "rg"');
    expect(existsSync(join(ws, ".ginga", "intents"))).toBe(true);
  });

  const t = chain ? test : test.skip;
  t(
    "init + intent new + approve + tick levam a TASK ao receipt pass do pinga",
    () => {
      expect(ginga("init", "--yes").exitCode).toBe(0);

      const intent = ginga("intent", "new", "Quero um src/a.ts");
      expect(intent.exitCode).toBe(0);
      const id = JSON.parse(intent.stdout.toString()).id as string;
      expect(id).toBe("INTENT-0001");
      expect(existsSync(join(ws, ".ginga", "intents", `${id}-quero-um-src-a-ts.md`))).toBe(true);

      // o que o humano faz: rodar o planner e o executor no stub `pi` (o init detectou o binário; não sabe o papel)
      const tomlPath = join(ws, ".ginga", "project.toml");
      addToml(tomlPath, "runtimes", ['planner = "pi:opencode/glm-5.3-flash-free"']);
      writeFileSync(tomlPath, readFileSync(tomlPath, "utf8") + '\n[runtimes.tier]\nfree = "pi"\n');

      const plan = Bun.spawnSync([process.execPath, MANDA_BIN, "plan", "INTENT-0001", "--root", ws], {
        cwd: ws,
        env: env(),
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(plan.stderr.toString()).toBe("");
      expect(plan.exitCode).toBe(0);
      expect(existsSync(join(ws, ".ginga", "plans", PLAN_ID, "PLAN.md"))).toBe(true);
      expect(existsSync(join(ws, ".ginga", "plans", PLAN_ID, "TASK-01-a.md"))).toBe(true);

      const appr = ginga("approve", "PLAN-0001");
      expect(appr.exitCode).toBe(0);
      expect(readFileSync(join(ws, ".ginga", "plans", PLAN_ID, "PLAN.md"), "utf8")).toContain("status: approved");

      // o que o humano faz: contrato pinga + comandos do projeto (fila, despacho, verify com ledger temporário)
      put("tasks/T1/PLAN.md", '---\nmode: mvp\ngoal: "cria src/a.ts"\ndone_when: "test -f src/a.ts"\ntouch: ["src/a.ts"]\n---\n');
      addToml(tomlPath, "commands", [
        `queue = "pinga queue --json --root {root} --ledger ${ledger}"`,
        `dispatch = "manda run ${PLAN_ID} --root {root}"`,
        `verify = "pinga verify tasks/T1/PLAN.md --root {worktree} --ledger ${ledger}"`,
      ]);
      sh("add", ".");
      sh("commit", "-q", "-m", "plan");

      const tick = ginga("tick", "--root", ws);
      expect(tick.stderr.toString()).not.toContain("fila indisponível");
      expect(tick.exitCode).toBe(0);
      expect(tick.stdout.toString()).toContain("despachado: T1");

      expect(existsSync(join(ws, "src", "a.ts"))).toBe(true);
      const q = Bun.spawnSync([PINGA, "queue", "--json", "--root", ws, "--ledger", ledger], { env: env(), stdout: "pipe", stderr: "pipe" });
      const t1 = JSON.parse(q.stdout.toString()).tasks.find((t: { task: string }) => t.task === "T1");
      expect(t1?.state).toBe("done");
      expect(t1?.receipt?.status).toBe("pass");
    },
  );
});
