// PLAN-0013 TASK-03 (T142): `ginga handoff` — testes congelados.
// Fiel à "Interface" (buildHandoff(root, {plan, now, git}) e HANDOFF_VERBS no
// registro) e ao "Teste" da TASK (relógio fixo → bytes idênticos; zero spawn
// de LLM). A derivação de estado das TASKs (fila) não é congelada aqui: o que
// se exige é a ordem das seções do doc 06 §4 e o arquivo/evento via CLI.
// Import dinâmico: sem o módulo, a prova falha por asserção (não por import).

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getVerb } from "../src/verbs/registry";

const ROOT = join(import.meta.dir, "..");
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmpBundle(): string {
  const D = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "handoff-")));
  dirs.push(D);
  const P = join(D, "plans", "PLAN-0001-alpha");
  mkdirSync(P, { recursive: true });
  mkdirSync(join(D, "handoffs"), { recursive: true });
  writeFileSync(
    join(P, "PLAN.md"),
    "---\ntype: plan\ntitle: Rodar alpha\nintent: INTENT-0001\nstatus: approved\nkind: change\nrepos: [ginga]\n---\n## Objetivo\nOBJETIVO-MARK\n## Abordagem\nABORDAGEM-MARK\n",
  );
  writeFileSync(
    join(P, "TASK-01-um.md"),
    "---\ntype: task\nmode: mvp\ngoal: um\ndone_when: \"true\"\ntouch: []\n---\n## Fazer\n- x\n",
  );
  writeFileSync(
    join(P, "TASK-02-dois.md"),
    "---\ntype: task\nmode: mvp\ngoal: dois\ndone_when: \"true\"\ntouch: []\n---\n## Fazer\n- y\n",
  );
  writeFileSync(
    join(P, "LEARNINGS.md"),
    [
      "# Learnings — PLAN-0001",
      "",
      "## L-01 · confirmada · 2026-10-29 10:00",
      "- hipótese: h1",
      "- evidência: e1",
      "- conclusão: CONFIRMADA-MARK",
      "- escopo: src/",
      "",
      "## L-02 · armadilha · 2026-10-29 11:00",
      "- hipótese: h2",
      "- evidência: e2",
      "- conclusão: ARMADILHA-MARK",
      "- escopo: src/",
      "",
    ].join("\n"),
  );
  writeFileSync(join(D, "log.md"), "# Log — PLAN-0001\n");
  return D;
}

// git injetado: status e diff vira texto-canned (byte-identidade não depende da máquina).
function fakeGit(args: string[], _cwd: string): string {
  if (args.includes("diff")) return "1 file changed, 2 insertions(+)(DIFF-CANNED)";
  if (args.includes("status")) return "?? src/x.ts (STATUS-CANNED)";
  return "";
}

const handoff = await import("../src/handoff.ts").catch(() => null);

const NOW = new Date("2026-10-29T12:00:00Z");

describe("buildHandoff", () => {
  test("módulo existe e exporta buildHandoff", () => {
    expect(handoff).not.toBeNull();
    expect(typeof (handoff as any)?.buildHandoff).toBe("function");
  });

  test("relógio fixo + git injetado → bytes idênticos nas duas chamadas (sem LLM, sem rede)", () => {
    if (!handoff) throw new Error("src/handoff.ts não existe ainda (RED)");
    const root = tmpBundle();
    const seen: string[] = [];
    const origSpawn = Bun.spawn;
    const origSync = Bun.spawnSync;
    (Bun as any).spawn = ((cmd: any, ...rest: any[]) => {
      seen.push([cmd?.[0] ?? "", ...(cmd?.slice(1) ?? [])].join(" "));
      return (origSpawn as any)(cmd, ...rest);
    }) as typeof Bun.spawn;
    (Bun as any).spawnSync = ((cmd: any, ...rest: any[]) => {
      seen.push([cmd?.[0] ?? "", ...(cmd?.slice(1) ?? [])].join(" "));
      return (origSync as any)(cmd, ...rest);
    }) as typeof Bun.spawnSync;
    let a: any;
    let b: any;
    try {
      a = (handoff as any).buildHandoff(root, { plan: "PLAN-0001", now: NOW, git: fakeGit });
      b = (handoff as any).buildHandoff(root, { plan: "PLAN-0001", now: NOW, git: fakeGit });
    } finally {
      (Bun as any).spawn = origSpawn;
      (Bun as any).spawnSync = origSync;
    }
    expect(a).toBeObject();
    expect(typeof a.markdown).toBe("string");
    expect(typeof a.path).toBe("string");
    expect(a.markdown).toBe(b.markdown);
    // zero spawn de LLM: nada de opencode/claude/codex/glm/qwen/agy na janela
    for (const call of seen) {
      expect(call).not.toMatch(/opencode|claude|codex|glm|qwen|agy|pi(\s|$)/);
    }
  });

  test("o markdown segue a ordem do doc 06 §4: objetivo, TASKs, learnings (armadilha antes de confirmada), git", () => {
    if (!handoff) throw new Error("src/handoff.ts não existe ainda (RED)");
    const root = tmpBundle();
    const h = (handoff as any).buildHandoff(root, { plan: "PLAN-0001", now: NOW, git: fakeGit });
    const md: string = h.markdown;
    expect(md).toContain("OBJETIVO-MARK");
    expect(md).toContain("TASK-01");
    expect(md).toContain("TASK-02");
    expect(md.indexOf("ARMADILHA-MARK")).toBeGreaterThan(-1);
    expect(md.indexOf("CONFIRMADA-MARK")).toBeGreaterThan(-1);
    expect(md.indexOf("ARMADILHA-MARK")).toBeLessThan(md.indexOf("CONFIRMADA-MARK"));
    expect(md).toContain("STATUS-CANNED");
    expect(md).toContain("DIFF-CANNED");
    expect(h.tokens).toBeGreaterThan(0);
  });

  test("sem `plan`: cobre os PLANs approved não concluídos", () => {
    if (!handoff) throw new Error("src/handoff.ts não existe ainda (RED)");
    const root = tmpBundle();
    const P2 = join(root, "plans", "PLAN-0002-beta");
    mkdirSync(P2, { recursive: true });
    writeFileSync(join(P2, "PLAN.md"), "---\ntype: plan\ntitle: Beta\nintent: INTENT-0001\nstatus: approved\nkind: change\n---\n## Objetivo\nBETA-OBJETIVO\n");
    writeFileSync(join(P2, "log.md"), "");
    const h = (handoff as any).buildHandoff(root, { now: NOW, git: fakeGit });
    expect(h.markdown).toContain("PLAN-0001");
    expect(h.markdown).toContain("BETA-OBJETIVO");
  });
});

describe("verbos e CLI", () => {
  test("handoff é verbo do registro (exposto na CLI e API geradas dele)", () => {
    expect(getVerb("handoff")).toBeDefined();
  });

  test("CLI: `ginga handoff PLAN-0001` grava HANDOFF-<data>-<PLAN>.md (type: handoff) e emite evento boundary", () => {
    const root = tmpBundle();
    const events = join(root, "events.jsonl");
    const r = Bun.spawnSync([process.execPath, join(ROOT, "bin/ginga.ts"), "handoff", "PLAN-0001", "--root", root, "--json"], {
      env: { ...process.env, GINGA_EVENTS: events },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(r.exitCode).toBe(0);
    const files = readdirSync(join(root, "handoffs")).filter((f) => /^HANDOFF-.*PLAN-0001.*\.md$/.test(f));
    expect(files.length).toBe(1);
    const md = readFileSync(join(root, "handoffs", files[0]!), "utf8");
    expect(md).toContain("type: handoff");
    expect(existsSync(events)).toBe(true);
    const ev = readFileSync(events, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l))
      .filter((e) => e.kind === "handoff");
    expect(ev.length).toBe(1);
    expect(ev[0].data?.trigger).toBe("boundary");
    expect(typeof ev[0].data?.handoff_tokens).toBe("number");
    expect(ev[0].data?.handoff_tokens).toBeGreaterThan(0);
  });
});
