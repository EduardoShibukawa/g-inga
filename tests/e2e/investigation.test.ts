// tests_frozen — PLAN-0013 TASK-04 (T145): e2e de PLAN kind: investigation.
//
// Fixture em tests/fixtures/investigation/ws (workspace git mínimo com bundle
// .ginga e tasks/T1..T2). O que se congela (TASK-04 "Fazer"):
//   1) `pinga verify` REAL (binário do PATH, ledger temporário) roda em cada
//      TASK e no PLAN: T1 (done_when "true") sela receipt pass; T2
//      (done_when "false" = hipótese descartada) sela receipt fail — o fluxo
//      de investigação não quebra o verify.
//   2) `ginga lint` (lintBundle) aceita o PLAN kind: investigation com
//      LEARNINGS.md L-01 confirmada + L-02 descartada (formato do doc 06 §2).
//   3) buildHandoff do PLAN lista a learning DESCARTADA antes da confirmada.
// Import dinâmico: sem o que a TASK entrega, a prova falha por asserção.

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "investigation", "ws");
const PINGA = process.env.PINGA_BIN ?? Bun.which("pinga") ?? "";
const lintMod = await import("../../src/lint/index.ts").catch(() => null);
const handoffMod = await import("../../src/handoff.ts").catch(() => null);

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setupWs(): { ws: string; aux: string; ledger: string } {
  const ws = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "inv-ws-")));
  const aux = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "inv-aux-")));
  dirs.push(ws, aux);
  cpSync(FIXTURE, ws, { recursive: true });
  const ledger = join(aux, "ledger.db");
  const env = { ...process.env, PATH: `${join(aux, "bin")}:${dirnameSafe(process.execPath)}:/usr/bin:/bin` };
  mkdirSync(join(aux, "bin"), { recursive: true });
  if (PINGA) symlinkSync(PINGA, join(aux, "bin", "pinga"));
  const sh = (args: string[]) =>
    Bun.spawnSync(["git", ...args], { cwd: ws, env, stdout: "pipe", stderr: "pipe" });
  sh(["init", "-q", "-b", "main"]);
  sh(["add", "."]);
  sh(["commit", "-q", "-m", "fixture"]);
  return { ws, aux, ledger };
}

function dirnameSafe(p: string): string {
  return p.slice(0, p.lastIndexOf("/"));
}

function queue(ws: string, ledger: string) {
  const r = Bun.spawnSync(["pinga", "queue", "--json", "--root", ws, "--ledger", ledger], {
    cwd: ws,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return JSON.parse(r.stdout.toString());
}

describe("PLAN kind: investigation passa pelo verify (TASK e PLAN)", () => {
  test("T1 (hipótese que passa) sela receipt pass e T2 (descartada) sela fail; o PLAN também verifica", () => {
    expect(PINGA).not.toBe("");
    const { ws, ledger } = setupWs();
    const env = { ...process.env };

    const v1 = Bun.spawnSync([PINGA, "verify", "tasks/T1/PLAN.md", "--root", ws, "--ledger", ledger], { cwd: ws, env, stdout: "pipe", stderr: "pipe" });
    expect(v1.exitCode).toBe(0);
    const v2 = Bun.spawnSync([PINGA, "verify", "tasks/T2/PLAN.md", "--root", ws, "--ledger", ledger], { cwd: ws, env, stdout: "pipe", stderr: "pipe" });
    expect(v2.exitCode).not.toBe(0); // hipótese descartada: done_when falha, mas o verify roda e sela
    // o PLAN verifica pelo mesmo caminho (kind: investigation não é caso especial):
    // sela receipt no nível do PLAN (bloqueado enquanto há TASK sem pass — mesmo de kind: change)
    const vPlan = Bun.spawnSync(
      [PINGA, "verify", join(".ginga", "plans", "PLAN-0001-investigacao", "PLAN.md"), "--root", ws, "--ledger", ledger],
      { cwd: ws, env, stdout: "pipe", stderr: "pipe" },
    );
    expect(vPlan.exitCode).not.toBe(0);
    expect(vPlan.stdout.toString() + vPlan.stderr.toString()).toContain("tasks_open");

    const q = queue(ws, ledger);
    const t1 = q.tasks.find((t: any) => t.task === "T1");
    const t2 = q.tasks.find((t: any) => t.task === "T2");
    expect(t1?.receipt?.status).toBe("pass");
    expect(t2?.receipt?.status).toBe("fail");
  });

  test("ginga lint aceita o PLAN kind: investigation com LEARNINGS L-01 confirmada + L-02 descartada", () => {
    if (!lintMod) throw new Error("src/lint não carregou (RED)");
    const { ws } = setupWs();
    const res = (lintMod as any).lintBundle(join(ws, ".ginga"));
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
    const planMd = readFileSync(join(ws, ".ginga", "plans", "PLAN-0001-investigacao", "PLAN.md"), "utf8");
    expect(planMd).toContain("kind: investigation");
  });

  test("handoff do PLAN de investigação lista a learning descartada antes da confirmada", () => {
    if (!handoffMod) throw new Error("src/handoff.ts não carregou (RED)");
    const { ws } = setupWs();
    const git = () => "";
    const h = (handoffMod as any).buildHandoff(join(ws, ".ginga"), {
      plan: "PLAN-0001-investigacao",
      now: new Date("2026-10-30T06:00:00Z"),
      git,
    });
    const md: string = h.markdown;
    expect(md).toContain("ACHAR-A-CAUSA-MARK");
    expect(md).toContain("DESCARTADA-MARK");
    expect(md).toContain("CONFIRMADA-MARK");
    expect(md.indexOf("DESCARTADA-MARK")).toBeLessThan(md.indexOf("CONFIRMADA-MARK"));
    expect(existsSync(join(ws, ".ginga", "plans", "PLAN-0001-investigacao", "LEARNINGS.md"))).toBe(true);
  });
});
