// Varredura de worktrees do vigia (PLAN-0027 TASK-01, T105).
// worktree_cleanup: worktree cuja branch já é ancestral da main (e a ponta difere,
// salvaguarda p/ branch recém-criada) e sem ready apontando para ela → arquiva o
// WIP em <root>/.ginga/_archive/<YYYY-MM-DD>-worktrees/, remove a worktree e
// apaga a branch com -d (nunca -D). Arquivamento falhou → não remove nada.

import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import type { Alert } from "./evaluate.ts";

function gitOut(cwd: string, args: string[]): string | null {
  const r = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) return null;
  return r.stdout.toString();
}

function gitOk(cwd: string, args: string[]): boolean {
  const r = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  return r.exitCode === 0;
}

type WorktreeEntry = {
  path: string;
  head: string;
  branch: string | null; // nome curto (sem refs/heads/)
  locked: boolean;
  bare: boolean;
};

function listWorktrees(repoDir: string): WorktreeEntry[] {
  const raw = gitOut(repoDir, ["worktree", "list", "--porcelain"]);
  if (raw === null) return [];
  const out: WorktreeEntry[] = [];
  let cur: Partial<WorktreeEntry> | null = null;
  const flush = () => {
    if (cur && typeof cur.path === "string") {
      out.push({
        path: cur.path,
        head: cur.head ?? "",
        branch: cur.branch ?? null,
        locked: !!cur.locked,
        bare: !!cur.bare,
      });
    }
    cur = null;
  };
  for (const line of raw.split("\n")) {
    if (line === "") {
      flush();
      continue;
    }
    if (line.startsWith("worktree ")) {
      flush();
      cur = { path: line.slice("worktree ".length) };
    } else if (line.startsWith("HEAD ") && cur) {
      cur.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ") && cur) {
      cur.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    } else if (line.startsWith("locked") && cur) {
      cur.locked = true;
    } else if (line === "bare" && cur) {
      cur.bare = true;
    }
  }
  flush();
  return out;
}

function containsPath(parent: string, child: string): boolean {
  const p = resolve(parent);
  const c = resolve(child);
  return c === p || c.startsWith(p + sep);
}

// Branches apontadas por <repo>.json em <root>/.ginga/plans/*/ready/ (só ready/,
// nunca ready/done/). JSON inválido ou sem branch: ignora o arquivo.
function readyBranches(root: string, repoName: string): Set<string> {
  const set = new Set<string>();
  const plansDir = join(root, ".ginga", "plans");
  let plans: string[];
  try {
    plans = readdirSync(plansDir);
  } catch {
    return set;
  }
  for (const plan of plans) {
    const file = join(plansDir, plan, "ready", `${repoName}.json`);
    let st;
    try {
      st = statSync(file);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    try {
      const doc = JSON.parse(readFileSync(file, "utf8"));
      if (typeof doc?.branch === "string" && doc.branch !== "") set.add(doc.branch);
    } catch {}
  }
  return set;
}

function dayStamp(now: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

// Arquivos de repositório (subpastas de <root> com .git DIRETÓRIO): checkout
// principal tem .git pasta; worktree tem .git arquivo → não entra.
function mainRepos(root: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }
  const repos: string[] = [];
  for (const name of entries.sort()) {
    const dir = join(root, name);
    try {
      if (!statSync(dir).isDirectory()) continue;
      if (!statSync(join(dir, ".git")).isDirectory()) continue;
    } catch {
      continue;
    }
    repos.push(name);
  }
  return repos;
}

export function sweepWorktrees(root: string, now = new Date()): Alert[] {
  const alerts: Alert[] = [];
  const cwd = process.cwd();
  for (const repoName of mainRepos(root)) {
    const repoDir = join(root, repoName);
    const mainSha = gitOut(repoDir, ["rev-parse", "--verify", "main"]);
    if (mainSha === null) continue; // sem main: nada a comparar
    const ready = readyBranches(root, repoName);
    for (const wt of listWorktrees(repoDir)) {
      const entity = `${repoName}/${basename(wt.path)}`;
      const dedupeKey = `worktree_cleanup:${entity}`;
      const warn = (summary: string) =>
        alerts.push({ rule_id: "worktree_cleanup", severity: "warn", entity, summary, dedupe_key: dedupeKey, actions: ["archive_and_remove"] });

      // Ignoradas: principal/bare, sem branch (detached), locked, a que contém o cwd,
      // branch apontada por ready/ e recém-criada (ponta == ponta da main).
      if (wt.bare || wt.locked || wt.branch === null) continue;
      let isMain = false;
      try {
        isMain = statSync(join(wt.path, ".git")).isDirectory();
      } catch {}
      if (isMain || containsPath(wt.path, cwd)) continue;
      const branch = wt.branch;
      if (ready.has(branch)) continue;
      if (!gitOk(repoDir, ["merge-base", "--is-ancestor", branch, "main"])) continue;
      const tip = gitOut(repoDir, ["rev-parse", "--verify", `refs/heads/${branch}`]);
      if (tip === null || tip.trim() === mainSha.trim()) continue;

      // (1) Arquivar WIP; falhou → não remove nada.
      const archiveDir = join(root, ".ginga", "_archive", `${dayStamp(now)}-worktrees`, basename(wt.path));
      const archived: string[] = [];
      try {
        mkdirSync(archiveDir, { recursive: true });
        const patch = gitOut(wt.path, ["diff", "HEAD", "--binary"]);
        if (patch !== null && patch.trim() !== "") {
          writeFileSync(join(archiveDir, "wip.patch"), patch);
          archived.push("wip.patch");
        }
        const others = gitOut(wt.path, ["ls-files", "--others", "--exclude-standard", "-z"]);
        for (const rel of (others ?? "").split("\0").filter((s) => s !== "")) {
          const dest = join(archiveDir, "untracked", rel);
          mkdirSync(dirname(dest), { recursive: true });
          copyFileSync(join(wt.path, rel), dest);
          archived.push(`untracked/${rel}`);
        }
        writeFileSync(
          join(archiveDir, "MANIFEST"),
          [
            `repo: ${repoName}`,
            `branch: ${branch}`,
            `sha: ${wt.head}`,
            `path: ${wt.path}`,
            `date: ${now.toISOString()}`,
            `arquivos:`,
            ...archived.map((f) => `- ${f}`),
            "",
          ].join("\n"),
        );
      } catch {
        warn(`arquivamento do WIP falhou em ${archiveDir} — worktree preservada`);
        continue;
      }

      // (2) Remover a worktree.
      if (!gitOk(repoDir, ["worktree", "remove", "--force", wt.path])) {
        warn("arquivado, mas git worktree remove falhou — nada removido");
        continue;
      }

      // (3) Apagar a branch fundida (nunca -D); se -d falhar, a branch ficou → warn.
      if (gitOk(repoDir, ["branch", "-d", branch])) {
        alerts.push({
          rule_id: "worktree_cleanup",
          severity: "info",
          entity,
          summary: `branch ${branch} ancestral da main — WIP arquivado, worktree removida e branch apagada`,
          dedupe_key: dedupeKey,
          actions: ["archive_and_remove"],
        });
      } else {
        warn(`worktree removida, mas git branch -d ${branch} falhou — a branch ficou`);
      }
    }
  }
  return alerts;
}
