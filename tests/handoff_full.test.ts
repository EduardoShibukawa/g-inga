// PLAN-0013 TASK-16 (T143): correção dos achados do judge na TASK-03.
// Congela: git nos repos do PLAN, estado/próxima aberta/blockers/SPEC,
// ordem descartada < armadilha < confirmada, frontmatter determinístico no
// buildHandoff e evento handoff válido pelo schema (validateEvent) com
// plan no envelope (cai no log.md). O frozen do T142 (tests/handoff.test.ts)
// continua válido e roda junto no done_when.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getVerb } from "../src/verbs/registry";
import { validateEvent } from "../src/events/validate";
import { appendPlanLog, formatLogLine } from "../src/plan_log";

const ROOT = join(import.meta.dir, "..");
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmpBundle(): string {
  const D = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "handoff-full-")));
  dirs.push(D);
  const P = join(D, "plans", "PLAN-0001-alpha");
  mkdirSync(P, { recursive: true });
  mkdirSync(join(D, "handoffs"), { recursive: true });
  mkdirSync(join(D, "ginga"), { recursive: true }); // repo do frontmatter repos:
  writeFileSync(
    join(P, "PLAN.md"),
    [
      "---",
      "type: plan",
      "title: Rodar alpha",
      "spec: SPEC-0001-x",
      "status: approved",
      "kind: change",
      "repos: [ginga]",
      "---",
      "## Objetivo",
      "OBJETIVO-MARK",
      "## Blockers",
      "- B-1 espera o dono (BLOCKER-MARK)",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(P, "TASK-01-um.md"),
    "---\ntype: task\nrepo: ginga\npinga_task: T900\ngoal: um\ndone_when: \"true\"\ntouch: []\n---\n## Fazer\n- x\n",
  );
  writeFileSync(
    join(P, "TASK-02-dois.md"),
    "---\ntype: task\nrepo: ginga\npinga_task: T901\ngoal: dois\ndone_when: \"true\"\ntouch: []\n---\n## Fazer\n- y\n",
  );
  writeFileSync(
    join(P, "LEARNINGS.md"),
    [
      "# Learnings — PLAN-0001",
      "",
      "## L-01 · confirmada · 2026-10-29 10:00",
      "- conclusão: CONFIRMADA-MARK",
      "",
      "## L-02 · armadilha · 2026-10-29 11:00",
      "- conclusão: ARMADILHA-MARK",
      "",
      "## L-03 · descartada · 2026-10-29 12:00",
      "- conclusão: DESCARTADA-MARK",
      "",
    ].join("\n"),
  );
  writeFileSync(join(P, "log.md"), "# Log — PLAN-0001\n");
  return D;
}

const NOW = new Date("2026-10-29T12:00:00Z");

function fakeGitFactory(log: string[][]) {
  return (args: string[], cwd: string): string => {
    log.push([cwd, ...args]);
    if (args.includes("diff")) return "1 file changed (DIFF-CANNED)";
    if (args.includes("status")) return "?? src/x.ts (STATUS-CANNED)";
    return "";
  };
}

const fakeQueue = (_repoDir: string) => [
  { task: "T900", state: "done", receipt: { status: "pass", seq: 900 } },
  { task: "T901", state: "open", receipt: null },
];

const handoff = await import("../src/handoff.ts").catch(() => null);

describe("buildHandoff completo (TASK-16)", () => {
  test("módulo existe e exporta buildHandoff", () => {
    expect(handoff).not.toBeNull();
    expect(typeof (handoff as any)?.buildHandoff).toBe("function");
  });

  test("git roda no repo do PLAN (cwd = root/<repo>), não no planDir", () => {
    if (!handoff) throw new Error("src/handoff.ts não existe ainda (RED)");
    const root = tmpBundle();
    const calls: string[][] = [];
    (handoff as any).buildHandoff(root, { plan: "PLAN-0001", now: NOW, git: fakeGitFactory(calls), queue: fakeQueue });
    const cwds = calls.map((c) => c[0]);
    expect(cwds.length).toBeGreaterThan(0);
    for (const cwd of cwds) expect(cwd).toBe(join(root, "ginga"));
    const md: string = (handoff as any).buildHandoff(root, { plan: "PLAN-0001", now: NOW, git: fakeGitFactory([]), queue: fakeQueue }).markdown;
    expect(md).toContain("STATUS-CANNED");
    expect(md).toContain("DIFF-CANNED");
  });

  test("TASKs com estado/última tentativa da fila e próxima TASK aberta; SPEC e blockers entram", () => {
    if (!handoff) throw new Error("src/handoff.ts não existe ainda (RED)");
    const root = tmpBundle();
    const md: string = (handoff as any).buildHandoff(root, { plan: "PLAN-0001", now: NOW, git: fakeGitFactory([]), queue: fakeQueue }).markdown;
    expect(md).toContain("T900");
    expect(md).toContain("done");
    expect(md).toContain("pass");
    expect(md).toContain("T901");
    // próxima aberta: a TASK-02 (T901 open) aparece como próxima, não a TASK-01
    const proxIdx = md.toLowerCase().indexOf("próxima");
    expect(proxIdx).toBeGreaterThan(-1);
    expect(md.slice(proxIdx)).toContain("TASK-02");
    expect(md).toContain("SPEC-0001-x");
    expect(md).toContain("BLOCKER-MARK");
  });

  test("learnings: descartada antes de armadilha antes de confirmada", () => {
    if (!handoff) throw new Error("src/handoff.ts não existe ainda (RED)");
    const root = tmpBundle();
    const md: string = (handoff as any).buildHandoff(root, { plan: "PLAN-0001", now: NOW, git: fakeGitFactory([]), queue: fakeQueue }).markdown;
    const d = md.indexOf("DESCARTADA-MARK");
    const a = md.indexOf("ARMADILHA-MARK");
    const c = md.indexOf("CONFIRMADA-MARK");
    expect(d).toBeGreaterThan(-1);
    expect(a).toBeGreaterThan(d);
    expect(c).toBeGreaterThan(a);
  });

  test("frontmatter determinístico dentro do markdown (date de now, sem new Date no verb)", () => {
    if (!handoff) throw new Error("src/handoff.ts não existe ainda (RED)");
    const root = tmpBundle();
    const a = (handoff as any).buildHandoff(root, { plan: "PLAN-0001", now: NOW, git: fakeGitFactory([]), queue: fakeQueue });
    const b = (handoff as any).buildHandoff(root, { plan: "PLAN-0001", now: NOW, git: fakeGitFactory([]), queue: fakeQueue });
    expect(a.markdown).toBe(b.markdown);
    expect(a.markdown.startsWith("---")).toBe(true);
    expect(a.markdown).toContain("type: handoff");
    expect(a.markdown).toContain("date: 2026-10-29");
    expect(a.markdown).toContain("plan: PLAN-0001");
    expect(a.path).toContain("HANDOFF-2026-10-29-PLAN-0001");
    expect(a.tokens).toBeGreaterThan(0);
  });
});

describe("CLI completa (TASK-16)", () => {
  test("verbo registrado", () => {
    expect(getVerb("handoff")).toBeDefined();
  });

  test("CLI grava o arquivo (git real injetado: ?? no status) e emite evento válido pelo schema, com plan no envelope e no log.md", () => {
    const root = tmpBundle();
    // repo real: git init + commit + arquivo não trackado → status mostra ??
    const repoDir = join(root, "ginga");
    const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
    for (const args of [["init"], ["config", "user.email", "t@t"], ["config", "user.name", "t"], ["add", "-A"], ["commit", "-m", "x", "--allow-empty"], ["--version"]]) {
      Bun.spawnSync(["git", ...args], { cwd: repoDir, env: gitEnv, stdout: "ignore", stderr: "ignore" });
    }
    writeFileSync(join(repoDir, "untracked.ts"), "// novo\n");
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
    expect(md).toContain("?? untracked.ts"); // prova: git real rodou no repo
    // evento válido pelo schema, com os campos que o judge cobrou
    const evs = readFileSync(events, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l))
      .filter((e) => e.kind === "handoff");
    expect(evs.length).toBe(1);
    const ev = evs[0];
    expect(validateEvent(ev).ok).toBe(true);
    expect(ev.plan).toBe("PLAN-0001");
    expect(typeof ev.data?.file).toBe("string");
    expect(typeof ev.data?.context_tokens).toBe("number");
    expect(ev.data?.trigger).toBe("boundary");
    expect(ev.data?.handoff_tokens).toBeGreaterThan(0);
    // entra no log.md do PLAN (gancho lê ev.plan)
    expect(formatLogLine(ev)).not.toBeNull();
    expect(appendPlanLog(root, ev).appended).toBe(true);
    expect(readFileSync(join(root, "plans", "PLAN-0001-alpha", "log.md"), "utf8")).toContain("handoff");
  });
});
