// tests_frozen — T923 (PLAN-0003, AC-6): o `ginga tick` conduz um PLAN de
// approved a mergeado num MONOREPO: um repositório só, com o `.ginga/` dentro
// dele e o código num pacote (`demo/`); a TASK aponta `repo: demo`.
//
// Reais: ginga tick, manda red/run/judge/merge, pinga prove-red/verify/gate/
// ledger verify. De mentira: o executor (`pi`) e o juiz (`agy`), que são os
// únicos pontos onde um modelo entraria. Sem rede.

import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { Database } from "bun:sqlite";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

setDefaultTimeout(240000);

const ROOT = join(import.meta.dir, "..", "..");
const GINGA_BIN = join(ROOT, "bin", "ginga.ts");
const FIX = join(ROOT, "tests", "fixtures", "autonomo");
const MANDA_REPO = process.env.MANDA_BIN ?? join(ROOT, "..", "manda");
const MANDA_BIN = join(MANDA_REPO, "bin", "manda.ts");
const PINGA = process.env.PINGA_BIN ?? Bun.which("pinga") ?? "";
const chain = process.env.PINGA_SANDBOX !== "bwrap" && PINGA !== "" && existsSync(MANDA_BIN);
const PLAN = "PLAN-0001-demo";

const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});

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

const OK_TEST = `import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
test("src/ok.txt tem ok", () => {
  expect(existsSync("src/ok.txt")).toBe(true);
  expect(readFileSync("src/ok.txt", "utf8").trim()).toBe("ok");
});
`;

function fixture(o: { fail?: boolean; verdict?: "pass" | "fail" } = {}) {
  const ws = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-condutor-")));
  const aux = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-condutor-aux-")));
  tmps.push(ws, aux);
  const bin = join(aux, "bin");
  mkdirSync(bin);
  copyFileSync(join(FIX, "pi-stub.sh"), join(bin, "pi"));
  chmodSync(join(bin, "pi"), 0o755);
  const response = JSON.stringify({ verdict: o.verdict ?? "pass", findings: o.verdict === "fail" ? ["AC não coberto"] : [] });
  writeFileSync(
    join(bin, "agy"),
    `#!/bin/sh\nprintf 'agy\\t%s\\n' "$PWD" >> "$STUB_LOG"\nprintf '%s\\n' '${JSON.stringify({ conversation_id: "c1", status: "SUCCESS", response, duration_seconds: 1, num_turns: 1, usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } })}'\n`,
  );
  chmodSync(join(bin, "agy"), 0o755);
  writeFileSync(join(bin, "manda"), `#!/bin/sh\nexec "${process.execPath}" "${MANDA_BIN}" "$@"\n`);
  chmodSync(join(bin, "manda"), 0o755);
  symlinkSync(PINGA, join(bin, "pinga"));

  const put = (rel: string, content: string) => {
    const p = join(ws, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  };
  // o repositório é a raiz; `demo/` é um pacote dele (tem package.json, a raiz não)
  const demo = join(ws, "demo");
  mkdirSync(demo);
  const git = (...a: string[]) =>
    Bun.spawnSync(["git", "-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: ws, stdout: "pipe", stderr: "pipe" }).stdout.toString().trim();
  git("init", "-q", "-b", "main");
  put(".gitignore", ".worktrees/\nruns/\n.pinga/\n.ginga/state/\n");
  put("demo/package.json", '{"name":"demo"}\n');
  put("demo/src/base.ts", "export {};\n");
  put("outro/package.json", '{"name":"outro"}\n');
  put("outro/src/base.ts", "export {};\n");

  // só o que o projeto precisa declarar: gate da TASK, selo do judge e tier.
  // queue, red, run, judge, merge e gate de merge ficam nos padrões.
  put(
    ".ginga/project.toml",
    [
      '[routing]\nmodels = ".ginga/models"',
      `[commands]\nverify = "pinga verify tasks/{gate_id}/PLAN.md --root {worktree}"\njudge_seal = "none"${o.fail ? `\nreplan = "sh ${FIX}/replan-stub.sh {plan} {task}"` : ""}`,
      '[runtimes]\nplanner = "claude:claude-opus-5-5"',
      '[runtimes.tier]\nfree = "pi"',
    ].join("\n\n") + "\n",
  );
  put(".ginga/models/ROUTING.md", ROUTING);
  put(`.ginga/plans/${PLAN}/PLAN.md`, '---\ntype: plan\ntitle: Demo\nstatus: draft\ndone_when: "true"\n---\n## Objetivo\nsrc/ok.txt com ok\n');
  put(
    `.ginga/plans/${PLAN}/TASK-01-ok.md`,
    `---\ntype: task\nmode: mvp\ngoal: "cria src/ok.txt com ok"\nplan: ${PLAN}\nrepo: demo\ndepends_on: []\ntier: free\ntouch: [src/ok.txt, tests/ok.test.ts]\ndone_when: "bun test tests/ok.test.ts"\ntests_frozen: [tests/ok.test.ts]\n---\n## Fazer\n- criar src/ok.txt com ok\n`,
  );
  put(`.ginga/plans/${PLAN}/frozen/demo/tests/ok.test.ts`, OK_TEST);

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
    PINGA_LEDGER: join(aux, "ledger.db"),
    GINGA_STATE_DB: join(aux, "state.db"),
    GINGA_EVENTS: join(aux, "events.jsonl"),
    GINGA_ROOT: "",
    GINGA_BY: "",
    STUB_LOG: join(aux, "calls.log"),
    STUB_EXEC_OUT: join(FIX, "exec-ok.jsonl"),
    STUB_FAIL: o.fail ? "1" : "0",
  };
  const ginga = (args: string[]) => Bun.spawnSync([process.execPath, GINGA_BIN, ...args], { cwd: ws, env, stdout: "pipe", stderr: "pipe" });
  const phase = (): string | null => {
    const p = join(aux, "state.db");
    if (!existsSync(p)) return null;
    const db = new Database(p, { readonly: true });
    const row = db.query("SELECT phase FROM plan_phase WHERE plan = ?").get("PLAN-0001") as { phase: string } | undefined;
    db.close();
    return row?.phase ?? null;
  };
  /** Roda ticks até a fase `until` (ou 10 ticks) e devolve as fases vistas. */
  const drive = (until: string): string[] => {
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      expect(ginga(["tick"]).exitCode).toBe(0);
      const ph = phase();
      if (ph && seen[seen.length - 1] !== ph) seen.push(ph);
      if (ph === until) break;
    }
    return seen;
  };
  // o bundle é arquivo do próprio repositório
  git("add", ".");
  git("commit", "-q", "-m", "base");
  const calls = () => (existsSync(env.STUB_LOG!) ? readFileSync(env.STUB_LOG!, "utf8") : "");
  const queue = () => JSON.parse(Bun.spawnSync(["pinga", "queue", "--json", "--root", ws], { env, stdout: "pipe" }).stdout.toString());
  return { ws, demo, git, ginga, drive, phase, calls, queue };
}

const t = chain ? test : test.skip;

describe("T923: condutor num monorepo", () => {
  t("approved → red → tasks → judge → done, com uma worktree só e o trabalho no pacote", () => {
    const w = fixture();
    expect(w.ginga(["approve", PLAN]).exitCode).toBe(0);
    w.git("add", ".");
    w.git("commit", "-q", "-m", "aprova");
    const mainBefore = w.git("rev-parse", "main");

    expect(w.drive("judge")).toEqual(["red", "tasks", "judge"]);
    expect(w.git("rev-parse", "main")).toBe(mainBefore);
    // o trabalho está na branch do PLAN, dentro do pacote
    expect(w.git("show", "plan/0001:demo/src/ok.txt")).toBe("ok");
    expect(w.git("show", "plan/0001:demo/tests/ok.test.ts")).toContain("src/ok.txt");
    // uma worktree só para o PLAN, e nada solto na raiz do repositório
    expect(w.git("worktree", "list").split("\n").filter((l) => l.includes("[plan/0001]")).length).toBe(1);
    expect(existsSync(join(w.ws, "demo-plan-0001"))).toBe(false);
    expect(existsSync(join(w.ws, "src", "ok.txt"))).toBe(false);

    expect(w.drive("done")).toEqual(["done"]);
    expect(w.git("show", "main:demo/src/ok.txt")).toBe("ok");
    expect(w.git("log", "--format=%s", "-1", "main")).toContain("Merge PLAN-0001-demo (plan/0001)");

    const t1 = w.queue().tasks.find((x: { task: string }) => x.task === "PLAN-0001/TASK-01");
    expect(t1?.state).toBe("done");
    expect(t1?.receipt?.status).toBe("pass");
    // o executor rodou dentro do pacote, na worktree da TASK
    const pi = w.calls().split("\n").filter((l) => l.startsWith("pi\t"));
    expect(pi.length).toBeGreaterThan(0);
    for (const l of pi) expect(l.split("\t")[1]!.endsWith("/demo")).toBe(true);
  });
});
