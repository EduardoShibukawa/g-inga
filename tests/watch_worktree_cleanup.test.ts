// T105 — vigia worktree_cleanup: só a worktree mergeada sai (WIP arquivado); fixtures em tmp.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function sweep(root: string): Promise<any[]> {
  const mod = await import("../src/watch/worktrees.ts").catch(() => null);
  expect(mod).not.toBeNull();
  return mod!.sweepWorktrees(root);
}

function git(cwd: string, args: string[]) {
  const r = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pinga-t105-"));
  const repo = join(root, "ginga");
  mkdirSync(repo);
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["config", "user.email", "t105@t.local"]);
  git(repo, ["config", "user.name", "T105"]);
  writeFileSync(join(repo, "a.txt"), "base\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-q", "-m", "c1"]);
  const mk = (n: string, merge: boolean) => {
    const wt = join(root, `ginga-plan-${n}`);
    git(repo, ["worktree", "add", "-q", "-b", `plan/${n}`, wt, "main"]);
    writeFileSync(join(wt, `f${n}.txt`), `feat ${n}\n`);
    git(wt, ["add", "."]);
    git(wt, ["commit", "-q", "-m", `feat ${n}`]);
    if (merge) git(repo, ["merge", "-q", "--no-ff", "-m", `Merge ${n}`, `plan/${n}`]);
    return wt;
  };
  const merged = mk("0001", true);
  const open = mk("0002", false);
  const mergedReady = mk("0003", true);
  // WIP sem commit na mergeada: alteração em arquivo rastreado + arquivo novo
  writeFileSync(join(merged, "f0001.txt"), "feat 0001\nwip-linha\n");
  writeFileSync(join(merged, "novo.txt"), "untracked-conteudo\n");
  // worktree recém-criada (ponta == main) não sai
  const fresh = join(root, "ginga-plan-0004");
  git(repo, ["worktree", "add", "-q", "-b", "plan/0004", fresh, "main"]);
  const ready = join(root, ".ginga", "plans", "PLAN-0003-x", "ready");
  mkdirSync(ready, { recursive: true });
  writeFileSync(join(ready, "ginga.json"), JSON.stringify({ branch: "plan/0003" }));
  return { root, repo, merged, open, mergedReady, fresh, clean: () => rmSync(root, { recursive: true, force: true }) };
}

describe("T105 sweepWorktrees", () => {
  test("só a worktree mergeada (sem ready) sai, com o WIP arquivado", async () => {
    const f = fixture();
    try {
      const alerts = await sweep(f.root);
      expect(alerts.length).toBe(1);
      expect(alerts[0].rule_id).toBe("worktree_cleanup");
      expect(alerts[0].severity).toBe("info");
      expect(alerts[0].entity).toBe("ginga/ginga-plan-0001");
      expect(alerts[0].dedupe_key).toBe("worktree_cleanup:ginga/ginga-plan-0001");

      expect(existsSync(f.merged)).toBe(false);
      expect(existsSync(f.open)).toBe(true);
      expect(existsSync(f.mergedReady)).toBe(true);
      expect(existsSync(f.fresh)).toBe(true);
      const branches = git(f.repo, ["branch", "--list"]);
      expect(branches).not.toContain("plan/0001");
      for (const b of ["plan/0002", "plan/0003", "plan/0004"]) expect(branches).toContain(b);

      const ar = join(f.root, ".ginga", "_archive");
      const day = readdirSync(ar).find((d) => d.endsWith("-worktrees"));
      expect(day).toBeTruthy();
      const dir = join(ar, day!, "ginga-plan-0001");
      expect(readFileSync(join(dir, "wip.patch"), "utf8")).toContain("+wip-linha");
      expect(readFileSync(join(dir, "untracked", "novo.txt"), "utf8")).toBe("untracked-conteudo\n");
      const manifest = readFileSync(join(dir, "MANIFEST"), "utf8");
      expect(manifest).toContain("plan/0001");
      expect(manifest).toContain("novo.txt");
    } finally {
      f.clean();
    }
  });

  test("idempotente: segunda chamada não faz nada", async () => {
    const f = fixture();
    try {
      await sweep(f.root);
      expect((await sweep(f.root)).length).toBe(0);
    } finally {
      f.clean();
    }
  });
});
