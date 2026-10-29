// T102 — vigia: stale_ready (ready sem commits além da main → ready/done + info) e
// ready_writer (ready sem by/at → warn). Fixtures em diretório temporário; nenhum repo real.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sweepReady } from "../src/watch/ready.ts";

const GINGA = join(import.meta.dir, "..", "bin", "ginga.ts");
const PLAN = "PLAN-9999-fixture";

function git(cwd: string, args: string[]) {
  const r = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
}

function fixture(opts: { ahead: boolean; ready: Record<string, unknown> }) {
  const root = mkdtempSync(join(tmpdir(), "pinga-t102-"));
  const repo = join(root, "ginga");
  mkdirSync(repo);
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["config", "user.email", "t102@t.local"]);
  git(repo, ["config", "user.name", "T102"]);
  git(repo, ["commit", "-q", "--allow-empty", "-m", "c1"]);
  git(repo, ["checkout", "-q", "-b", "plan/9999"]);
  if (opts.ahead) git(repo, ["commit", "-q", "--allow-empty", "-m", "c2"]);
  git(repo, ["checkout", "-q", "main"]);
  const ready = join(root, ".ginga", "plans", PLAN, "ready");
  mkdirSync(ready, { recursive: true });
  writeFileSync(join(ready, "ginga.json"), JSON.stringify(opts.ready));
  return { root, ready, clean: () => rmSync(root, { recursive: true, force: true }) };
}

const GOOD = { branch: "plan/9999", by: { pid: 4242, cmd: "pinga verify tasks/T9/PLAN.md" }, at: "2026-10-28T20:00:00.000Z" };

describe("T102 — stale_ready e ready_writer", () => {
  test("branch sem commits além da main: ready vai para ready/done e gera alerta info stale_ready", () => {
    const f = fixture({ ahead: false, ready: GOOD });
    try {
      const alerts = sweepReady(f.root);
      const stale = alerts.filter((a) => a.rule_id === "stale_ready");
      expect(stale.length).toBe(1);
      expect(stale[0]!.severity).toBe("info");
      expect(stale[0]!.entity).toBe(`${PLAN}/ginga`);
      expect(existsSync(join(f.ready, "ginga.json"))).toBe(false);
      const moved = readdirSync(join(f.ready, "done"));
      expect(moved.length).toBe(1);
      expect(moved[0]!.startsWith("ginga")).toBe(true);
      expect(JSON.parse(readFileSync(join(f.ready, "done", moved[0]!), "utf8")).branch).toBe("plan/9999");
      // idempotente: segundo tick não gera nada
      expect(sweepReady(f.root)).toEqual([]);
    } finally {
      f.clean();
    }
  });

  test("branch com commit além da main e by/at válidos: ready fica e nada é alertado", () => {
    const f = fixture({ ahead: true, ready: GOOD });
    try {
      expect(sweepReady(f.root)).toEqual([]);
      expect(existsSync(join(f.ready, "ginga.json"))).toBe(true);
    } finally {
      f.clean();
    }
  });

  test("ready sem by/at (gravado à mão): alerta warn ready_writer e o arquivo fica", () => {
    const f = fixture({ ahead: true, ready: { branch: "plan/9999" } });
    try {
      const alerts = sweepReady(f.root);
      expect(alerts.length).toBe(1);
      expect(alerts[0]!.rule_id).toBe("ready_writer");
      expect(alerts[0]!.severity).toBe("warn");
      expect(alerts[0]!.entity).toBe(`${PLAN}/ginga`);
      expect(existsSync(join(f.ready, "ginga.json"))).toBe(true);
    } finally {
      f.clean();
    }
  });

  test("by sem pid numérico ou cmd vazio também é ready_writer", () => {
    const f = fixture({ ahead: true, ready: { branch: "plan/9999", by: { pid: "x", cmd: "" }, at: "2026-10-28T20:00:00.000Z" } });
    try {
      expect(sweepReady(f.root).map((a) => a.rule_id)).toEqual(["ready_writer"]);
    } finally {
      f.clean();
    }
  });

  test("ginga watch --json inclui stale_ready e move o ready (regras padrão)", () => {
    const f = fixture({ ahead: false, ready: GOOD });
    try {
      const ev = join(f.root, "ev.jsonl");
      writeFileSync(ev, "");
      const r = Bun.spawnSync(["bun", GINGA, "watch", "--root", f.root, "--events", ev, "--json"], { stdout: "pipe", stderr: "pipe" });
      expect(r.exitCode).toBe(0);
      const out = JSON.parse(r.stdout.toString().trim().split("\n").pop()!);
      expect(out.some((a: any) => a.rule_id === "stale_ready" && a.severity === "info")).toBe(true);
      expect(existsSync(join(f.ready, "ginga.json"))).toBe(false);
      expect(existsSync(join(f.ready, "done"))).toBe(true);
    } finally {
      f.clean();
    }
  });
});
