// tests_frozen — PLAN-0013 TASK-11 (T150): `ginga handoff` em modo sessão.
//
// Congela a TASK: sem <PLAN>, --trigger idle infere o PLAN (branch plan/NNNN,
// state.db, log.md mais recente) ou cai em git + pendências do index.md;
// flags --trigger/--runtime/--from-session/--transcript/--notes/--json;
// buildHandoff ganha trigger/runtime/from_session/transcript/parent_handoff/
// depth/notes no frontmatter; 7 seções na ordem do doc 11 §2 (a 6 "Do chat"
// vem do --notes); segredos filtrados por redact(); mesma entrada → mesmos
// bytes; entrada grande → ≤ 16000 chars (≈4k tokens a chars/4).
// Teste da TASK: fixture sem PLAN → seções 4/5 do git; notes com sk-... →
// [REDACTED]. Import dinâmico: RED por asserção.

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const FIXTURE = join(ROOT, "tests", "fixtures", "handoff-session", "bundle");
const handoffMod = await import("../src/handoff.ts").catch(() => null);
const redactMod = await import("../src/handoff/redact.ts").catch(() => null);

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const NOW = new Date("2026-10-30T12:00:00Z");

function tmpBundle(): string {
  const D = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "hsess-")));
  dirs.push(D);
  cpSync(FIXTURE, D, { recursive: true });
  return D;
}

function fakeGit(args: string[], _cwd: string): string {
  if (args.includes("status")) return " M src/x.ts\n?? novo.ts (STATUS-SESSAO)";
  if (args.includes("diff")) return "1 file changed (DIFF-SESSAO)";
  if (args.includes("branch")) return "* plan/0013\n";
  return "";
}

describe("redact (src/handoff/redact.ts)", () => {
  test("módulo existe e exporta redact", () => {
    expect(redactMod).not.toBeNull();
    expect(typeof (redactMod as any)?.redact).toBe("function");
  });

  test("chave sk-... e linha de .env viram [REDACTED]", () => {
    if (!redactMod) throw new Error("src/handoff/redact.ts não existe ainda (RED)");
    const out = (redactMod as any).redact("use sk-ant-api03-ABCDEFGHIJKLMNOP1234567890 aqui\nTOKEN=abcdef1234567890abcdef\n");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("sk-ant-api03-ABCDEFGHIJKLMNOP1234567890");
    expect(out).not.toContain("abcdef1234567890abcdef");
  });
});

describe("buildHandoff em modo sessão (sem PLAN)", () => {
  test("frontmatter leva trigger/runtime/depth/notes e as 7 seções do doc 11 §2 na ordem", () => {
    if (!handoffMod) throw new Error("src/handoff.ts não carregou (RED)");
    const root = tmpBundle();
    const notes = readFileSync(join(FIXTURE, "notes.md"), "utf8");
    const h = (handoffMod as any).buildHandoff(root, {
      now: NOW,
      git: fakeGit,
      trigger: "idle",
      runtime: "claude",
      from_session: "ses_origem",
      depth: 1,
      notes,
    });
    const md: string = h.markdown;
    // frontmatter
    expect(md).toContain("trigger: idle");
    expect(md).toContain("runtime: claude");
    expect(md).toContain("from_session: ses_origem");
    expect(md).toContain("depth: 1");
    // 7 seções na ordem do doc 11 §2
    const ordem = ["Objetivo", "TASK", "Learning", "Próximo", "git", "chat", "retomar"];
    let last = -1;
    for (const marker of ordem) {
      const i = md.toLowerCase().indexOf(marker.toLowerCase());
      expect(i).toBeGreaterThan(last);
      last = i;
    }
    // sem PLAN claro (só rascunho draft): cai nas pendências do index.md + git
    expect(md).toContain("Pendências");
    expect(md).toContain("STATUS-SESSAO");
    // seção "Do chat" traz as notes REDIGIDAS (sem a chave sk-...)
    expect(md).toContain("Decisões do dono");
    expect(md).not.toContain("sk-ant-api03-ABCDEFGHIJKLMNOP1234567890");
    expect(md).toContain("[REDACTED]");
  });

  test("mesma entrada → mesmos bytes; entrada grande → ≤ 16000 chars", () => {
    if (!handoffMod) throw new Error("src/handoff.ts não carregou (RED)");
    const root = tmpBundle();
    const bigNotes = "x".repeat(60000);
    const opts = { now: NOW, git: fakeGit, trigger: "context" as const, notes: bigNotes };
    const a = (handoffMod as any).buildHandoff(root, opts);
    const b = (handoffMod as any).buildHandoff(root, opts);
    expect(a.markdown).toBe(b.markdown);
    expect(a.markdown.length).toBeLessThanOrEqual(16000);
  });
});
