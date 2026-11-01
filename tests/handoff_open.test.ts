// tests_frozen — PLAN-0013 TASK-13 (T152): abertura da sessão nova (`--open`).
//
// Interface do PLAN.md: `openSession(runtime, o)` em src/handoff/open.ts →
// Promise<{ ok, sessionRef, attachCmd }>, com o = { handoffPath, userPrompt,
// model, cwd, spawn }. Claude (src/handoff/open_claude.ts): chama
// `claude --bg -n "handoff:<plano>" --model <model> "<prompt>"` com stdin
// fechado, lê o id impresso, attachCmd = "claude attach <id>"; NUNCA
// --resume/--fork-session; não fecha a sessão antiga. Outros runtimes: mesma
// interface devolve só o attachCmd impresso (opencode -s, pi --name), sem abrir.
// O verbo `handoff --open` registra evento `handoff` com trigger e depth.
// Teste: spawn falso → argv contém --bg e não contém --resume nem --fork-session.
// Import dinâmico: RED por asserção.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateEvent } from "../src/events/validate";

const openMod = await import("../src/handoff/open.ts").catch(() => null);
const claudeMod = await import("../src/handoff/open_claude.ts").catch(() => null);

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  delete process.env.GINGA_EVENTS;
});

const NOW = new Date("2026-10-30T12:00:00Z");

function tmpDir(): string {
  const D = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "open-")));
  dirs.push(D);
  return D;
}

type Spawn = (cmd: string[], args: string[], opts: { cwd: string }) => { stdout: string; exitCode: number };

describe("openSession (src/handoff/open.ts + open_claude.ts)", () => {
  test("módulos existem e exportam openSession", () => {
    expect(openMod).not.toBeNull();
    expect(typeof (openMod as any)?.openSession).toBe("function");
    expect(claudeMod).not.toBeNull();
  });

  test("claude: argv tem --bg, -n handoff:<plano>, --model; SEM --resume/--fork-session; devolve id e attachCmd", async () => {
    if (!openMod) throw new Error("src/handoff/open.ts não existe ainda (RED)");
    const cwd = tmpDir();
    const calls: string[][] = [];
    const spawn: Spawn = (cmd, args) => {
      calls.push([...cmd, ...args]);
      return { stdout: "ses_abertura42\n", exitCode: 0 };
    };
    const out = await (openMod as any).openSession("claude", {
      handoffPath: join(cwd, "handoffs", "HANDOFF-2026-10-30-PLAN-0013.md"),
      userPrompt: "continua o PLAN-0013",
      model: "glm-5.3-flash-free",
      cwd,
      spawn,
      now: NOW,
    });
    expect(calls).toHaveLength(1);
    const argv = calls[0]!.join(" ");
    expect(argv).toContain("--bg");
    expect(argv).toContain("-n");
    expect(argv).toContain("handoff:");
    expect(argv).toContain("--model");
    expect(argv).toContain("glm-5.3-flash-free");
    expect(argv).not.toContain("--resume");
    expect(argv).not.toContain("--fork-session");
    expect(out.ok).toBe(true);
    expect(out.sessionRef).toBe("ses_abertura42");
    expect(out.attachCmd).toBe("claude attach ses_abertura42");
  });

  test("outro runtime (opencode): não abre sozinho, devolve só o attachCmd impresso", async () => {
    if (!openMod) throw new Error("RED");
    const cwd = tmpDir();
    const calls: string[][] = [];
    const spawn: Spawn = (cmd, args) => {
      calls.push([...cmd, ...args]);
      return { stdout: "", exitCode: 0 };
    };
    const out = await (openMod as any).openSession("opencode", {
      handoffPath: join(cwd, "handoffs", "H.md"),
      userPrompt: "continua",
      model: "glm",
      cwd,
      spawn,
      now: NOW,
    });
    expect(calls).toHaveLength(0); // não chama spawn: só imprime o comando
    expect(out.sessionRef).toBeNull();
    expect(out.attachCmd).toContain("opencode");
    expect(out.attachCmd).toContain("-s");
  });
});

describe("evento handoff do --open", () => {
  test("evento emitido com trigger e depth passa no schema", () => {
    // o verbo handoff --open emite kind=handoff com data.trigger e data.depth;
    // aqui se congela só o contrato do evento (o emission fica no verbo).
    const ev = {
      v: 1,
      ts: NOW.toISOString(),
      source: "cli",
      kind: "handoff",
      id: "01JZZZ0000000000000000ABCD",
      plan: "PLAN-0013",
      data: { trigger: "cache", context_tokens: 120000, handoff_tokens: 3900, depth: 1, file: "handoffs/HANDOFF-2026-10-30-sessao.md" },
    };
    expect(validateEvent(ev).ok).toBe(true);
  });
});
