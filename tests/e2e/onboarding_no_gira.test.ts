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
import { Database } from "bun:sqlite";
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
  `---\ntype: task\nmode: mvp\ngoal: "cria src/a.ts"\nplan: ${PLAN_ID}\ndepends_on: []\ntier: free\ntouch: [src/a.ts, tests/a.test.ts]\ndone_when: "bun test tests/a.test.ts"\ntests_frozen: [tests/a.test.ts]\n---\n## Fazer\n- criar src/a.ts`,
].join("\n");

const ROUTING = `---
type: policy
title: Roteamento do fixture
ladder:
  - {tier: free, tries: 1}
breaker: {same_reason: 3, ignore: [quota_exhausted, infra]}
pools:
  executor:
    free: [opencode/glm-5.3-flash-free]
  verifier_judge:
    default: [agy/gemini-4-argon]
budget: {month_usd: 10, task_usd: 0.25, plan_usd: 1.5, warn_pct: 80}
---
`;

const A_TEST = `import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
test("src/a.ts existe", () => {
  expect(existsSync("src/a.ts")).toBe(true);
});
`;

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
    PINGA_LEDGER: ledger,
    STUB_LOG: log,
    STUB_PLANNER_OUT: join(aux, "planner.jsonl"),
    STUB_EXEC_OUT: join(STUBS, "exec-ok.jsonl"),
  };
}

function ginga(...args: string[]) {
  return Bun.spawnSync([process.execPath, GINGA_BIN, ...args], { cwd: ws, env: env(), stdout: "pipe", stderr: "pipe" });
}

function phase(): string | null {
  const p = join(aux, "state.db");
  if (!existsSync(p)) return null;
  const db = new Database(p, { readonly: true });
  try {
    return (db.query("SELECT phase FROM plan_phase WHERE plan = ?").get("PLAN-0001") as { phase: string } | undefined)?.phase ?? null;
  } catch {
    return null;
  } finally {
    db.close();
  }
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
  // juiz de mentira (T922): o formato real do `agy --print --output-format json`
  writeFileSync(
    join(bin, "agy"),
    `#!/bin/sh\nprintf '%s\\n' '${JSON.stringify({ conversation_id: "c1", status: "SUCCESS", response: JSON.stringify({ verdict: "pass", findings: [] }), duration_seconds: 1, num_turns: 1, usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } })}'\n`,
  );
  chmodSync(join(bin, "agy"), 0o755);
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

      // o que o humano faz: roteamento com o pool do juiz e o gate da TASK. Fila, red, run,
      // judge e merge ficam nos comandos padrão do tick (T922: fluxo da branch do PLAN).
      // e o teste congelado da TASK, que o `manda red` leva para a branch do PLAN
      put(`.ginga/plans/${PLAN_ID}/frozen/tests/a.test.ts`, A_TEST);
      put(".ginga/models/ROUTING.md", ROUTING);
      writeFileSync(tomlPath, readFileSync(tomlPath, "utf8") + '\n[routing]\nmodels = ".ginga/models"\n');
      addToml(tomlPath, "commands", ['verify = "pinga verify tasks/{gate_id}/PLAN.md --root {worktree}"', 'judge_seal = "none"']);
      sh("add", ".");
      sh("commit", "-q", "-m", "plan");
      const mainBefore = sh("rev-parse", "main");

      // primeiro tick: red. O trabalho nasce na branch do PLAN; a main não anda.
      const tick = ginga("tick", "--root", ws);
      expect(tick.stderr.toString()).not.toContain("fila indisponível");
      expect(tick.exitCode).toBe(0);
      expect(sh("rev-parse", "main")).toBe(mainBefore);
      expect(sh("branch", "--list", "plan/0001")).toContain("plan/0001");

      // ticks até o merge do gate: tasks → judge (cego, stub) → done
      let ph: string | null = phase();
      for (let i = 0; i < 10 && ph !== "done"; i++) {
        expect(ginga("tick", "--root", ws).exitCode).toBe(0);
        ph = phase();
      }
      expect(ph).toBe("done");

      expect(existsSync(join(ws, "src", "a.ts"))).toBe(true);
      expect(sh("log", "--format=%s", "-1", "main")).toContain("(plan/0001)");
      const q = Bun.spawnSync([PINGA, "queue", "--json", "--root", ws], { env: env(), stdout: "pipe", stderr: "pipe" });
      const t1 = JSON.parse(q.stdout.toString()).tasks.find((t: { task: string }) => t.task === "PLAN-0001/TASK-01");
      expect(t1?.state).toBe("done");
      expect(t1?.receipt?.status).toBe("pass");
    },
  );
});
