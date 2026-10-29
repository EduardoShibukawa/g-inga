// T25 — ginga hooks install|check (tests_frozen, criado pelo operador da rodada 3)
// Fixture: bundle temporário (.ginga/hooks.toml + .ginga/hooks/git/) + repos git temporários.
// Nenhum repo real é tocado. Tudo pela CLI (`hooks install|check --root`).
import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const GINGA = join(ROOT, "bin", "ginga.ts");
const FIXTURES = join(import.meta.dir, "fixtures", "hooks");
const SOURCE_HOOK = join(FIXTURES, "git", "reference-transaction");
const PREV_LOG = join("/tmp", "pinga-t25-prev.log");
const HOOK = "reference-transaction";
const GOLDEN = () => readFileSync(SOURCE_HOOK, "utf8");

function git(cwd: string, args: string[], extraEnv: Record<string, string> = {}) {
  const r = Bun.spawnSync(["git", "-C", cwd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...extraEnv },
  });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

function ginga(args: string[], env: Record<string, string> = {}) {
  const r = Bun.spawnSync(["bun", GINGA, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
  return { code: r.exitCode ?? 1, out: r.stdout.toString(), err: r.stderr.toString() };
}

function makeRoot() {
  const tmp = mkdtempSync(join(tmpdir(), "pinga-t25-"));
  mkdirSync(join(tmp, ".ginga", "hooks", "git"), { recursive: true });
  writeFileSync(join(tmp, ".ginga", "hooks.toml"), readFileSync(join(FIXTURES, "hooks.toml"), "utf8"));
  writeFileSync(join(tmp, ".ginga", "hooks", "git", HOOK), readFileSync(SOURCE_HOOK, "utf8"));
  for (const repo of ["repoA", "repoB"]) mkdirSync(join(tmp, repo), { recursive: true });
  return { tmp, clean: () => rmSync(tmp, { recursive: true, force: true }) };
}

function initRepos(root: string) {
  for (const repo of ["repoA", "repoB"]) {
    const p = join(root, repo);
    git(p, ["init", "-b", "main"]);
    git(p, ["config", "user.email", "t25@t.local"]);
    git(p, ["config", "user.name", "T25"]);
    git(p, ["commit", "--allow-empty", "-m", "c1"]);
  }
}

function hooksDir(repo: string) {
  return join(repo, ".git", "hooks");
}

describe("T25 — ginga hooks install|check", () => {
  test("install escreve o hook da fonte versionada, executável, nos dois repos; idempotente 2×", () => {
    const { tmp, clean } = makeRoot();
    try {
      initRepos(tmp);
      expect(ginga(["hooks", "install", "--root", tmp]).code).toBe(0);
      // segunda install: idempotência (nenhum .ginga-prev e conteúdo igual)
      expect(ginga(["hooks", "install", "--root", tmp]).code).toBe(0);
      const golden = GOLDEN();
      for (const repo of ["repoA", "repoB"]) {
        const t = join(hooksDir(join(tmp, repo)), HOOK);
        expect(existsSync(t)).toBe(true);
        expect(readFileSync(t, "utf8")).toBe(golden);
        expect(Bun.spawnSync(["test", "-x", t]).exitCode).toBe(0); // executável
        expect(existsSync(join(hooksDir(join(tmp, repo)), HOOK + ".ginga-prev"))).toBe(false);
      }
    } finally {
      clean();
    }
  });

  test("hook pré-existente é preservado (.ginga-prev) e chamado quando o update é permitido", () => {
    const { tmp, clean } = makeRoot();
    try {
      initRepos(tmp);
      const repoA = join(tmp, "repoA");
      writeFileSync(join(hooksDir(repoA), HOOK), '# prev-de-teste\necho "prev $1" >> "' + PREV_LOG + '"\nexit 0\n');
      Bun.spawnSync(["chmod", "+x", join(hooksDir(repoA), HOOK)]);
      expect(ginga(["hooks", "install", "--root", tmp]).code).toBe(0);
      expect(readFileSync(join(hooksDir(repoA), HOOK + ".ginga-prev"), "utf8")).toContain("prev-de-teste");
      // update permitido (branch não-main) chama também o pré-existente, depois do nosso guard
      rmSync(PREV_LOG, { force: true });
      git(repoA, ["checkout", "-q", "-b", "work"]);
      git(repoA, ["commit", "--allow-empty", "-m", "w1"]);
      expect(existsSync(PREV_LOG)).toBe(true);
      expect(readFileSync(PREV_LOG, "utf8")).toContain("prev prepared");
    } finally {
      clean();
    }
  });

  test("reference-transaction recusa commit direto na main sem MERGE_GATE=1; aceita com MERGE_GATE=1", () => {
    const { tmp, clean } = makeRoot();
    try {
      initRepos(tmp);
      expect(ginga(["hooks", "install", "--root", tmp]).code).toBe(0);
      const repoA = join(tmp, "repoA");
      const blocked = git(repoA, ["commit", "--allow-empty", "-m", "x"]);
      expect(blocked.code).not.toBe(0);
      expect(blocked.err).toContain("BLOQUEADO");
      const allowed = git(repoA, ["commit", "--allow-empty", "-m", "x"], { MERGE_GATE: "1" });
      expect(allowed.code).toBe(0);
    } finally {
      clean();
    }
  });

  test("recusa merge --ff-only e reset --hard em refs/heads/main sem MERGE_GATE=1; com MERGE_GATE=1 passa", () => {
    const { tmp, clean } = makeRoot();
    try {
      initRepos(tmp);
      const repoA = join(tmp, "repoA");
      const head1 = git(repoA, ["rev-parse", "HEAD"]).out.trim(); // commit único na main
      git(repoA, ["checkout", "-q", "-b", "side"]);
      git(repoA, ["commit", "--allow-empty", "-m", "c2"]);
      git(repoA, ["checkout", "-q", "main"]);
      expect(ginga(["hooks", "install", "--root", tmp]).code).toBe(0);
      // ff merge main → side: bloqueado sem MERGE_GATE, main não andou
      const m = Bun.spawnSync(["sh", "-c", "git merge -q --ff-only side"], { cwd: repoA, stdout: "pipe", stderr: "pipe" });
      expect(m.exitCode).not.toBe(0);
      expect(m.stderr.toString()).toContain("BLOQUEADO");
      expect(git(repoA, ["rev-parse", "HEAD"]).out.trim()).toBe(head1);
      // com MERGE_GATE=1 o mesmo ff merge passa
      const ok = Bun.spawnSync(["sh", "-c", "git merge -q --ff-only side"], {
        cwd: repoA, stdout: "pipe", stderr: "pipe", env: { ...process.env, MERGE_GATE: "1" },
      });
      expect(ok.exitCode).toBe(0);
      expect(git(repoA, ["rev-parse", "HEAD"]).out.trim()).not.toBe(head1);
      // reset --hard para trás sem MERGE_GATE: bloqueado; com MERGE_GATE: passa
      const back = Bun.spawnSync(["sh", "-c", "git reset -q --hard HEAD~1"], { cwd: repoA, stdout: "pipe", stderr: "pipe" });
      expect(back.exitCode).not.toBe(0);
      expect(git(repoA, ["rev-parse", "HEAD"]).out.trim()).not.toBe(head1);
      const fwd = Bun.spawnSync(["sh", "-c", "git reset -q --hard side"], {
        cwd: repoA, stdout: "pipe", stderr: "pipe", env: { ...process.env, MERGE_GATE: "1" },
      });
      expect(fwd.exitCode).toBe(0);
    } finally {
      clean();
    }
  });

  test("commit em branch não-main é permitido após a install", () => {
    const { tmp, clean } = makeRoot();
    try {
      initRepos(tmp);
      expect(ginga(["hooks", "install", "--root", tmp]).code).toBe(0);
      const repoA = join(tmp, "repoA");
      git(repoA, ["checkout", "-q", "-b", "work"]);
      expect(git(repoA, ["commit", "--allow-empty", "-m", "ok"]).code).toBe(0);
    } finally {
      clean();
    }
  });

  test("core.hooksPath é respeitado: install vai para o caminho configurado e o guard bloqueia lá também", () => {
    const { tmp, clean } = makeRoot();
    try {
      initRepos(tmp);
      const repoB = join(tmp, "repoB");
      git(repoB, ["config", "core.hooksPath", "./hooks-c"]);
      expect(ginga(["hooks", "install", "--root", tmp]).code).toBe(0);
      const t = join(repoB, "hooks-c", HOOK);
      expect(existsSync(t)).toBe(true);
      expect(readFileSync(t, "utf8")).toBe(GOLDEN());
      const blocked = git(repoB, ["commit", "--allow-empty", "-m", "x"]);
      expect(blocked.code).not.toBe(0);
      expect(blocked.err).toContain("BLOQUEADO");
    } finally {
      clean();
    }
  });

  test("check sai 0 após install e sai 1 no drift (conteúdo mudado / hook ausente), listando repo e hook", () => {
    const { tmp, clean } = makeRoot();
    try {
      initRepos(tmp);
      // sem install: hook ausente → drift → exit 1
      expect(ginga(["hooks", "check", "--root", tmp]).code).toBe(1);
      expect(ginga(["hooks", "install", "--root", tmp]).code).toBe(0);
      const c0 = ginga(["hooks", "check", "--root", tmp]);
      expect(c0.code).toBe(0);
      // drift: conteúdo mudado em repoA
      writeFileSync(join(hooksDir(join(tmp, "repoA")), HOOK), "# drift");
      const c1 = ginga(["hooks", "check", "--root", tmp]);
      expect(c1.code).toBe(1);
      expect(c1.out + c1.err).toContain("repoA");
      expect(c1.out + c1.err).toContain(HOOK);
      // drift: hook ausente em repoB (mantém o repoA no relatório)
      rmSync(join(hooksDir(join(tmp, "repoB")), HOOK));
      const c2 = ginga(["hooks", "check", "--root", tmp]);
      expect(c2.code).toBe(1);
      expect(c2.out + c2.err).toContain("repoB");
      expect(c2.out + c2.err).toContain("repoA");
      // install recomposta: volta a sair 0
      expect(ginga(["hooks", "install", "--root", tmp]).code).toBe(0);
      expect(ginga(["hooks", "check", "--root", tmp]).code).toBe(0);
    } finally {
      clean();
    }
  });

  test("uso inválido sai com 2", () => {
    expect(ginga(["hooks"]).code).toBe(2);
    expect(ginga(["hooks", "instalar"]).code).toBe(2);
  });
});
