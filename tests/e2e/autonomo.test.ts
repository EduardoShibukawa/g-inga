// tests_frozen — PLAN-0028 TASK-08 (T320): e2e de PLAN approved até done sem LLM.
//
// Fixture: repo git temporário com bundle (.ginga) → PLAN de 1 TASK e o teste
// em frozen/demo/; [commands] apontando para o manda real (runtime stub `pi`
// que escreve a solução) e judge stub (pass); merge via gate do fixture.
// `ginga tick` (máx. 10 ticks) deve levar o PLAN de approved a done: fases na
// ordem (approved → red → tasks → judge → done) no state.db, receipt `pass` no
// ledger temporário e commit na main via gate.
// Caso 2: executor que sempre falha → replan depois de 3 falhas.
// Sem rede e sem modelo real. Na sandbox do pinga a cadeia externa não existe.

import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

setDefaultTimeout(240000);

const ROOT = join(import.meta.dir, "..", "..");
const GINGA_BIN = join(ROOT, "bin", "ginga.ts");
const FIX = join(ROOT, "tests", "fixtures", "autonomo");
// No worktree temporário do pinga (prove-red/verify) o irmão ../manda não
// existe; cai no caminho absoluto do workspace para a cadeia rodar de verdade.
const MANDA_REPO =
  process.env.MANDA_BIN ??
  (existsSync(join(ROOT, "..", "manda", "bin", "manda.ts"))
    ? join(ROOT, "..", "manda")
    : "/home/shibuka/Projetos/duh-homelab/manda");
const MANDA_BIN = join(MANDA_REPO, "bin", "manda.ts");
const PINGA = process.env.PINGA_BIN ?? Bun.which("pinga") ?? "";
const PLAN = "PLAN-0099-demo";
const SANDBOX = process.env.PINGA_SANDBOX === "bwrap";
const chain = !SANDBOX && PINGA !== "" && existsSync(MANDA_BIN);

const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});

const PLAN_MD = `---
type: plan
title: Demo autonomy
status: draft
---
## Objetivo
src/ok.txt com "ok"
`;

const TASK_MD = `---
type: task
mode: mvp
goal: "cria src/ok.txt com ok"
plan: ${PLAN}
repo: .
pinga_task: T1
tier: free
touch: [src/ok.txt, tests/ok.test.ts]
done_when: "bun test tests/ok.test.ts"
tests_frozen: [tests/ok.test.ts]
---
## Fazer
- criar src/ok.txt com "ok"
`;

const T1_PLAN_MD = `---
mode: mvp
goal: "cria src/ok.txt com ok"
done_when: "bun test tests/ok.test.ts"
touch: ["src/ok.txt", "tests/ok.test.ts"]
tests_frozen: ["tests/ok.test.ts"]
---`;

const projectToml = () => `[commands]
queue = "bun ${FIX}/queue.ts"
red = "manda red {plan} --repo . --root {root}"
run = "manda run {plan} --task TASK-01 --root {root}"
verify = "pinga verify tasks/T1/PLAN.md --root {worktree} --ledger $PINGA_LEDGER"
judge = "sh ${FIX}/judge-stub.sh {plan} demo"
merge = "sh ${FIX}/merge-gate.sh {plan}"
replan = "sh ${FIX}/replan-stub.sh {plan} {task}"

[runtimes.tier]
free = "pi"
`;

const OK_TEST = `import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
test("src/ok.txt tem ok", () => {
  expect(existsSync("src/ok.txt")).toBe(true);
  expect(readFileSync("src/ok.txt", "utf8").trim()).toBe("ok");
});
`;

function fixture(fail: boolean) {
  const ws = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-autonomo-")));
  const aux = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-autonomo-aux-")));
  tmps.push(ws, aux);
  const bin = join(aux, "bin");
  mkdirSync(bin);
  copyFileSync(join(FIX, "pi-stub.sh"), join(bin, "pi"));
  chmodSync(join(bin, "pi"), 0o755);
  writeFileSync(join(bin, "manda"), `#!/bin/sh\nexec "${process.execPath}" "${MANDA_BIN}" "$@"\n`);
  chmodSync(join(bin, "manda"), 0o755);
  symlinkSync(PINGA, join(bin, "pinga"));

  const put = (rel: string, content: string) => {
    const p = join(ws, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  };
  const sh = (...a: string[]) =>
    Bun.spawnSync(["git", "-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: ws, stdout: "pipe", stderr: "pipe" });
  sh("init", "-q", "-b", "main");
  put(".gitignore", ".worktrees/\n*-plan-*/\n");
  put(".ginga/project.toml", projectToml());
  put(`.ginga/plans/${PLAN}/PLAN.md`, PLAN_MD);
  put(`.ginga/plans/${PLAN}/TASK-01-demo.md`, TASK_MD);
  put(`.ginga/plans/${PLAN}/frozen/tests/ok.test.ts`, OK_TEST);
  put("src/base.ts", "export {};\n");
  sh("add", ".");
  sh("commit", "-q", "-m", "base");
  // RED pré-materializado na main (como o operador faz antes do despacho):
  // tasks/T1/PLAN.md + teste frozen, commitado como test(T1): RED.
  put("tasks/T1/PLAN.md", T1_PLAN_MD);
  put("tests/ok.test.ts", OK_TEST);
  sh("add", ".");
  sh("commit", "-q", "-m", "test(T1): RED");

  const env: Record<string, string> = {
    ...process.env,
    PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
    PINGA_LEDGER: join(aux, "ledger.db"),
    GINGA_STATE_DB: join(aux, "state.db"),
    GINGA_EVENTS: join(aux, "events.jsonl"),
    GINGA_ROOT: "",
    GINGA_BY: "",
    STUB_ROOT: ws,
    STUB_PLAN: PLAN,
    STUB_LOG: join(aux, "calls.log"),
    STUB_EXEC_OUT: join(FIX, "exec-ok.jsonl"),
    STUB_FAIL: fail ? "1" : "0",
  };
  const ginga = (args: string[]) =>
    Bun.spawnSync([process.execPath, GINGA_BIN, ...args], { cwd: ws, env, stdout: "pipe", stderr: "pipe" });
  const tick = () => ginga(["tick"]);
  const phase = (): string | null => {
    const p = join(aux, "state.db");
    if (!existsSync(p)) return null;
    const db = new Database(p, { readonly: true });
    const row = db.query("SELECT phase FROM plan_phase WHERE plan = ?").get(PLAN) as { phase: string } | undefined;
    db.close();
    return row?.phase ?? null;
  };
  const calls = () => (existsSync(join(aux, "calls.log")) ? readFileSync(join(aux, "calls.log"), "utf8") : "");
  const queue = () =>
    JSON.parse(Bun.spawnSync(["pinga", "queue", "--json", "--root", ws], { env, stdout: "pipe" }).stdout.toString());
  const mainHasOk = () => {
    const r = Bun.spawnSync(["git", "-C", ws, "show", "main:src/ok.txt"], { stdout: "pipe", stderr: "pipe" });
    return r.exitCode === 0 && r.stdout.toString().trim() === "ok";
  };
  return { ws, ginga, tick, phase, calls, queue, mainHasOk };
}

const t = chain ? test : test.skip;

describe("PLAN-0028 TASK-08: approved → done sem LLM", () => {
  t("até 10 ticks: fases na ordem, receipt pass e commit na main via gate", () => {
    const w = fixture(false);
    const appr = w.ginga(["approve", PLAN]);
    expect(appr.exitCode).toBe(0);
    expect(readFileSync(join(w.ws, ".ginga/plans", PLAN, "PLAN.md"), "utf8")).toContain("status: approved");

    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = w.tick();
      expect(r.exitCode).toBe(0);
      const ph = w.phase();
      if (ph && seen[seen.length - 1] !== ph) seen.push(ph);
      if (ph === "done") break;
    }
    // "approved" é semeado e avança para "red" no mesmo tick
    const order = ["red", "tasks", "judge", "done"];
    expect(order.filter((p) => seen.includes(p))).toEqual(order);

    const t1 = w.queue().tasks.find((x: { task: string }) => x.task.endsWith("/T1") || x.task === "T1");
    expect(t1?.state).toBe("done");
    expect(t1?.receipt?.status).toBe("pass");
    expect(w.mainHasOk()).toBe(true);
    expect(w.calls()).toContain("judge");
    expect(w.calls()).toContain("merge");
  });

  t("executor que sempre falha → replan depois de 3 falhas", () => {
    const w = fixture(true);
    expect(w.ginga(["approve", PLAN]).exitCode).toBe(0);
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = w.tick();
      expect(r.exitCode).toBe(0);
      const ph = w.phase();
      if (ph && seen[seen.length - 1] !== ph) seen.push(ph);
      if (ph === "replan") break;
    }
    expect(seen).toContain("replan");
    expect(w.calls()).toContain("replan");
  });
});
