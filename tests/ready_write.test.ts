// T103 — ginga ready write: só grava ready/<repo>.json quando todas as TASKs do PLAN para o repo
// estão done/pass no pinga queue da worktree; registra {branch, by:{pid,cmd}, at}. pinga falso no PATH.
import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const GINGA = join(import.meta.dir, "..", "bin", "ginga.ts");
const PLAN = "PLAN-9998-fixture";

function fixture(states: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "pinga-t103-"));
  const plan = join(root, ".ginga", "plans", PLAN);
  mkdirSync(plan, { recursive: true });
  mkdirSync(join(root, "ginga-plan-9998")); // worktree
  const mk = (n: string, repo: string, t: string) =>
    writeFileSync(join(plan, `TASK-${n}-x.md`), `---\ntype: task\nplan: ${PLAN}\nrepo: ${repo}\npinga_task: ${t}\n---\ncorpo\n`);
  mk("01", "ginga", "T901");
  mk("02", "ginga", "T902");
  mk("03", "manda", "T903"); // outro repo: não conta
  const bin = join(root, "bin");
  mkdirSync(bin);
  const queue = JSON.stringify({ tasks: Object.entries(states).map(([task, state]) => ({ task, state, receipt: state === "done" ? { status: "pass" } : null })) });
  writeFileSync(join(root, "queue.json"), queue);
  writeFileSync(join(bin, "pinga"), `#!/bin/sh\ncat '${join(root, "queue.json")}'\n`);
  chmodSync(join(bin, "pinga"), 0o755);
  return { root, plan, bin, clean: () => rmSync(root, { recursive: true, force: true }) };
}

function ready(f: { root: string; bin: string }) {
  const r = Bun.spawnSync(
    ["bun", GINGA, "ready", "write", "--root", f.root, "--plan", PLAN, "--repo", "ginga", "--branch", "plan/9998"],
    { stdout: "pipe", stderr: "pipe", env: { ...process.env, PATH: `${f.bin}:${process.env.PATH}` } },
  );
  return { code: r.exitCode ?? 1, out: r.stdout.toString(), err: r.stderr.toString() };
}

describe("T103 — ginga ready write", () => {
  test("todas as TASKs do repo done/pass: grava {branch, by:{pid,cmd}, at}", () => {
    const f = fixture({ T901: "done", T902: "done", T903: "open" });
    try {
      const r = ready(f);
      expect(r.code).toBe(0);
      const j = JSON.parse(readFileSync(join(f.plan, "ready", "ginga.json"), "utf8"));
      expect(j.branch).toBe("plan/9998");
      expect(typeof j.by.pid).toBe("number");
      expect(j.by.pid).toBeGreaterThan(0);
      expect(typeof j.by.cmd).toBe("string");
      expect(j.by.cmd.length).toBeGreaterThan(0);
      expect(Number.isFinite(Date.parse(j.at))).toBe(true);
    } finally {
      f.clean();
    }
  });

  test("TASK do repo ainda não done: exit 1, lista a pendente e não grava", () => {
    const f = fixture({ T901: "done", T902: "open" });
    try {
      const r = ready(f);
      expect(r.code).toBe(1);
      expect(r.err + r.out).toContain("T902");
      expect(existsSync(join(f.plan, "ready", "ginga.json"))).toBe(false);
    } finally {
      f.clean();
    }
  });

  test("TASK ausente do pinga queue conta como pendente", () => {
    const f = fixture({ T901: "done" });
    try {
      const r = ready(f);
      expect(r.code).toBe(1);
      expect(r.err + r.out).toContain("T902");
      expect(existsSync(join(f.plan, "ready", "ginga.json"))).toBe(false);
    } finally {
      f.clean();
    }
  });
});
