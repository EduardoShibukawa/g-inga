// T101 — reference-transaction recusa update de main com ancestral agente LLM (tests_frozen)
// Hook testado: tests/fixtures/hooks_llm/git/reference-transaction (a fonte promovida a
// .ginga/hooks/git/ pelo operador). Hermético: cada git roda ÓRFÃO (setsid -f), para o ancestral
// real do runner (ex. claude -p) nunca entrar na conta; o "agente" é um symlink de bash com o
// nome do agente (claude -p <script>, codex exec, opencode run, pi exec).
import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const GINGA = join(ROOT, "bin", "ginga.ts");
const NEW_HOOK = join(import.meta.dir, "fixtures", "hooks_llm", "git", "reference-transaction");
const OLD_HOOK = join(import.meta.dir, "fixtures", "hooks", "git", "reference-transaction");
const HOOK = "reference-transaction";

type Agent = { name: string; args: string[] } | undefined;
const AGENTS: Array<{ name: string; args: string[]; file: string }> = [
  { name: "claude", args: ["-p", "run.sh"], file: "run.sh" },
  { name: "codex", args: ["exec"], file: "exec" },
  { name: "opencode", args: ["run"], file: "run" },
  { name: "pi", args: ["exec"], file: "exec" },
];

function git(cwd: string, args: string[], env: Record<string, string> = {}) {
  const r = Bun.spawnSync(["git", "-C", cwd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
  return { code: r.exitCode, out: r.stdout.toString().trim(), err: r.stderr.toString() };
}

function ginga(args: string[]) {
  const r = Bun.spawnSync(["bun", GINGA, ...args], { stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode ?? 1, out: r.stdout.toString(), err: r.stderr.toString() };
}

function makeRepo(hookSrc: string = NEW_HOOK) {
  const tmp = mkdtempSync(join(tmpdir(), "pinga-t101-"));
  const repo = join(tmp, "repo");
  mkdirSync(repo);
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["config", "user.email", "t101@t.local"]);
  git(repo, ["config", "user.name", "T101"]);
  git(repo, ["commit", "-q", "--allow-empty", "-m", "c1"]);
  git(repo, ["branch", "plan/0025"]);
  const hook = join(repo, ".git", "hooks", HOOK);
  copyFileSync(hookSrc, hook);
  chmodSync(hook, 0o755);
  mkdirSync(join(tmp, "bin"));
  for (const a of AGENTS) {
    const link = join(tmp, "bin", a.name);
    if (!existsSync(link)) symlinkSync("/usr/bin/bash", link);
  }
  return { tmp, repo, clean: () => rmSync(tmp, { recursive: true, force: true }) };
}

// roda `git <args>` em repo, órfão, opcionalmente sob um agente falso; espera o resultado.
function runGit(
  tmp: string,
  repo: string,
  args: string[],
  opts: { agent?: Agent; gate?: boolean } = {},
) {
  const done = join(tmp, "done");
  const codeF = join(tmp, "code");
  const errF = join(tmp, "err");
  rmSync(done, { force: true });
  const script = `git -C '${repo}' ${args.map((x) => `'${x}'`).join(" ")} 2> '${errF}'\necho $? > '${codeF}'\ntouch '${done}'\n`;
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  delete env.MERGE_GATE;
  if (opts.gate) env.MERGE_GATE = "1";
  let cmd: string[];
  if (opts.agent) {
    const spec = AGENTS.find((a) => a.name === opts.agent!.name)!;
    writeFileSync(join(tmp, spec.file), script);
    cmd = ["setsid", "-f", join(tmp, "bin", spec.name), ...opts.agent.args];
  } else {
    writeFileSync(join(tmp, "plain.sh"), script);
    cmd = ["setsid", "-f", "sh", join(tmp, "plain.sh")];
  }
  Bun.spawnSync(cmd, { cwd: tmp, env, stdout: "ignore", stderr: "ignore" });
  const t0 = Date.now();
  while (!existsSync(done) && Date.now() - t0 < 20000) Bun.sleepSync(25);
  expect(existsSync(done)).toBe(true);
  return {
    code: Number(readFileSync(codeF, "utf8").trim()),
    err: existsSync(errF) ? readFileSync(errF, "utf8") : "",
  };
}

const commit = ["commit", "-q", "--allow-empty", "-m", "x"];

describe("T101 — hook reference-transaction com guarda de ancestral LLM", () => {
  test("sem ancestral LLM: main com MERGE_GATE=1 passa; sem MERGE_GATE=1 é barrado", () => {
    const { tmp, repo, clean } = makeRepo();
    try {
      const head0 = git(repo, ["rev-parse", "main"]).out;
      const blocked = runGit(tmp, repo, commit);
      expect(blocked.code).not.toBe(0);
      expect(blocked.err).toContain("BLOQUEADO");
      expect(git(repo, ["rev-parse", "main"]).out).toBe(head0);
      const ok = runGit(tmp, repo, commit, { gate: true });
      expect(ok.code).toBe(0);
      expect(git(repo, ["rev-parse", "main"]).out).not.toBe(head0);
    } finally {
      clean();
    }
  });

  for (const a of AGENTS) {
    test(`ancestral ${a.name} ${a.args[0]}: main é barrada mesmo com MERGE_GATE=1`, () => {
      const { tmp, repo, clean } = makeRepo();
      try {
        const head0 = git(repo, ["rev-parse", "main"]).out;
        const r = runGit(tmp, repo, commit, { agent: { name: a.name, args: a.args }, gate: true });
        expect(r.code).not.toBe(0);
        expect(r.err).toContain("agente LLM");
        expect(git(repo, ["rev-parse", "main"]).out).toBe(head0);
      } finally {
        clean();
      }
    });
  }

  test("ancestral claude -p: commit em branch não-main segue permitido (operador comita em plan/NNNN)", () => {
    const { tmp, repo, clean } = makeRepo();
    try {
      git(repo, ["checkout", "-q", "plan/0025"]);
      const head0 = git(repo, ["rev-parse", "plan/0025"]).out;
      const r = runGit(tmp, repo, commit, { agent: { name: "claude", args: ["-p", "run.sh"] }, gate: true });
      expect(r.code).toBe(0);
      expect(git(repo, ["rev-parse", "plan/0025"]).out).not.toBe(head0);
    } finally {
      clean();
    }
  });

  test("claude sem -p não é agente LLM (mesma regra do merge-gate): main com MERGE_GATE=1 passa", () => {
    const { tmp, repo, clean } = makeRepo();
    try {
      const r = runGit(tmp, repo, commit, { agent: { name: "claude", args: ["run.sh"] }, gate: true });
      expect(r.code).toBe(0);
    } finally {
      clean();
    }
  });

  function installRoot(prevContent?: string) {
    const { tmp, repo, clean } = makeRepo(OLD_HOOK); // repo já com o hook ginga-managed ANTIGO
    mkdirSync(join(tmp, ".ginga", "hooks", "git"), { recursive: true });
    writeFileSync(
      join(tmp, ".ginga", "hooks.toml"),
      '[git]\nrepos = ["repo"]\nhooks = ["reference-transaction"]\n',
    );
    copyFileSync(NEW_HOOK, join(tmp, ".ginga", "hooks", "git", HOOK));
    const prev = join(repo, ".git", "hooks", HOOK + ".ginga-prev");
    if (prevContent !== undefined) {
      writeFileSync(prev, prevContent);
      chmodSync(prev, 0o755);
    }
    return { tmp, repo, prev, clean };
  }

  test("install atualiza hook ginga-managed antigo no lugar: sem .ginga-prev, hook novo ativo", () => {
    const { tmp, repo, prev, clean } = installRoot();
    try {
      const r = ginga(["hooks", "install", "--root", tmp]);
      expect(r.code).toBe(0);
      const target = join(repo, ".git", "hooks", HOOK);
      expect(readFileSync(target, "utf8")).toBe(readFileSync(NEW_HOOK, "utf8"));
      expect(existsSync(prev)).toBe(false);
      expect(ginga(["hooks", "check", "--root", tmp]).code).toBe(0);
      // o hook novo funciona (sem laço de encadeamento): gate passa, agente LLM barra
      expect(runGit(tmp, repo, commit, { gate: true }).code).toBe(0);
      const b = runGit(tmp, repo, commit, { agent: { name: "claude", args: ["-p", "run.sh"] }, gate: true });
      expect(b.code).not.toBe(0);
    } finally {
      clean();
    }
  });

  test("install do hook novo preserva o .ginga-prev de terceiro já existente", () => {
    const { tmp, repo, prev, clean } = installRoot('# terceiro\nexit 0\n');
    try {
      expect(ginga(["hooks", "install", "--root", tmp]).code).toBe(0);
      expect(readFileSync(join(repo, ".git", "hooks", HOOK), "utf8")).toBe(readFileSync(NEW_HOOK, "utf8"));
      expect(readFileSync(prev, "utf8")).toBe("# terceiro\nexit 0\n");
    } finally {
      clean();
    }
  });
});
