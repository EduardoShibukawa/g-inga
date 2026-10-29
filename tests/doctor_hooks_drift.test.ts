import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * PLAN-0024 (follow-up do judge de PLAN-0022 TASK-04): `ginga doctor` inclui o
 * registro `ginga/hooks_drift` (as 9 chaves), acusando drift dos hooks
 * instalados pelo `ginga hooks install`:
 * - com `.ginga/hooks.toml` na raiz do cwd: drift (hook ausente / não arquivo /
 *   diferente da fonte em .ginga/hooks/git/<hook>) → status broken, law2 fail,
 *   detail listando repo e hook, e `ginga doctor` sai 1; sem drift → ok/pass.
 * - sem hooks.toml → unverified/law2 blocked, detail "hooks.toml ausente",
 *   sem alterar o exit por hooks.
 * Caixa preta: binário `claude` ausente do PATH (plugin fica unverified).
 */

const ROOT = join(import.meta.dir, "..");
const BIN = join(ROOT, "bin", "ginga.ts");
const KEYS = ["harness", "check", "status", "law2", "cmd", "exit", "stdout_sha256", "duration_ms", "detail"];
const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = (p: string) => {
  const d = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), p)));
  tmps.push(d);
  return d;
};

const HOOK_CONTENT = "#!/bin/sh\n# guarda do reference-transaction (fixture)\nexit 0\n";

/** Bundle de hooks em <base>/.ginga: hooks.toml, fonte do hook e repos de teste. */
function hooksBundle(
  base: string,
  o: { repos: string[]; installIn: Array<[string, "ok" | "drift" | "none"]>; hooksToml?: string | null },
) {
  if (o.hooksToml !== null) {
    mkdirSync(join(base, ".ginga", "hooks", "git"), { recursive: true });
    writeFileSync(join(base, ".ginga", "hooks.toml"), o.hooksToml ?? '[git]\nrepos = ["' + o.repos.join('", "') + '"]\nhooks = ["reference-transaction"]\n');
    writeFileSync(join(base, ".ginga", "hooks", "git", "reference-transaction"), HOOK_CONTENT);
    chmodSync(join(base, ".ginga", "hooks", "git", "reference-transaction"), 0o755);
  }
  for (const [repo, state] of o.installIn) {
    const dir = join(base, repo);
    mkdirSync(join(dir, ".git", "hooks"), { recursive: true });
    if (state === "ok") {
      writeFileSync(join(dir, ".git", "hooks", "reference-transaction"), HOOK_CONTENT);
      chmodSync(join(dir, ".git", "hooks", "reference-transaction"), 0o755);
    } else if (state === "drift") {
      writeFileSync(join(dir, ".git", "hooks", "reference-transaction"), "#!/bin/sh\necho velho\n");
      chmodSync(join(dir, ".git", "hooks", "reference-transaction"), 0o755);
    }
  }
}

function doctor(opts: Parameters<typeof hooksBundle>[1]) {
  const base = tmp("ginga-doc-hooks-");
  const cwd = join(base, "app");
  const home = join(base, "home");
  mkdirSync(cwd, { recursive: true });
  mkdirSync(home, { recursive: true });
  hooksBundle(cwd, opts);
  const env: Record<string, string> = {
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    HOME: home,
    TMPDIR: tmp("ginga-doc-tmp-"),
    GINGA_PLUGIN_SOURCE: pluginSource(),
  };
  const r = Bun.spawnSync(["bun", BIN, "doctor", "--json", "--home", home], { cwd, env, stdout: "pipe", stderr: "pipe" });
  let records: any[] = [];
  try {
    const parsed = JSON.parse(r.stdout.toString());
    records = Array.isArray(parsed) ? parsed : parsed?.records ?? [];
  } catch {}
  return { exit: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString(), records };
}

/** Plugin fake para pickSource não falhar (doctor exit 2 sem fonte). */
function pluginSource(): string {
  const dir = tmp("ginga-doc-src-");
  mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
  writeFileSync(join(dir, ".claude-plugin", "marketplace.json"), JSON.stringify({ name: "acme-local", plugins: [{ name: "acme", source: "./p" }] }));
  return dir;
}

const find= (rs: any[], harness: string, check: string) => rs.find((r) => r.harness === harness && r.check === check);

describe("ginga doctor hooks drift", () => {
  test("sem drift: registro ok/law2 pass (as 9 chaves) e exit 0", () => {
    const r = doctor({ repos: ["repoA"], installIn: [["repoA", "ok"]] });
    const rec = find(r.records, "ginga", "hooks_drift");
    expect(rec).toBeDefined();
    expect(Object.keys(rec).sort()).toEqual([...KEYS].sort());
    expect(rec).toMatchObject({ status: "ok", law2: "pass" });
    expect(String(rec.detail)).toContain("sem drift");
    expect(r.exit).toBe(0);
  });

  test("com drift (hook diferente da fonte e ausente em outro repo): broken/fail, detail lista repo e hook, exit 1", () => {
    const r = doctor({
      repos: ["repoA", "repoB"],
      installIn: [["repoA", "drift"], ["repoB", "none"]],
    });
    const rec = find(r.records, "ginga", "hooks_drift");
    expect(rec).toMatchObject({ status: "broken", law2: "fail" });
    expect(String(rec.detail)).toContain("repoA");
    expect(String(rec.detail)).toContain("repoB");
    expect(String(rec.detail)).toContain("reference-transaction");
    expect(r.exit).toBe(1);
  });

  test("sem hooks.toml: unverified/blocked com detail hooks.toml ausente e exit 0", () => {
    const r = doctor({ repos: [], installIn: [], hooksToml: null });
    const rec = find(r.records, "ginga", "hooks_drift");
    expect(rec).toMatchObject({ status: "unverified", law2: "blocked" });
    expect(String(rec.detail)).toContain("hooks.toml ausente");
    expect(r.exit).toBe(0);
  });
});
