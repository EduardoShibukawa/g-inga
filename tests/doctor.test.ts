import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * PLAN-0006 TASK-03: `ginga doctor [--json] [--only H] [--home P]` com a parte de harness do `pinga doctor`
 * (caixa preta, binário `claude` falso no PATH).
 * - Um registro por probe de cada adapter (pi, claude, opencode, hermes, tuios), com as 9 chaves do pinga
 *   (harness, check, status, law2, cmd, exit, stdout_sha256, duration_ms, detail) nessa ordem. `--json`
 *   embrulha em {schema_version, records} desde PLAN-0015 TASK-05; pinga/manda/gira têm registro `version`.
 * - Fonte e nome do plugin vêm de `GINGA_PLUGIN_SOURCE` + `[install].plugin` (TASK-02); sem fonte → exit 2.
 * - `--only H`: os outros viram `unverified` ("filtrado por --only"); H inválido → exit 2.
 * - claude/plugin_list: habilitado → ok; desabilitado ou ausente → degraded; exit ≠ 0 → broken e `ginga doctor` sai com 1.
 * - Binário ausente do PATH → unverified com law2 `blocked` e detail "<bin> ausente".
 * - Ledger, toolchain e gira NÃO existem aqui (ficam no `pinga doctor`).
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

function plugin(name: string): string {
  const dir = tmp("ginga-doc-src-");
  mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
  writeFileSync(join(dir, ".claude-plugin", "marketplace.json"), JSON.stringify({ name: `${name}-local`, plugins: [{ name, source: "./p" }] }));
  return dir;
}

/** `claude` falso: `plugin list` imprime `listing` (exit `listExit`); `plugin validate` passa. */
function fakeClaude(listing: string, listExit = 0): string {
  const bin = tmp("ginga-doc-bin-");
  writeFileSync(join(bin, "claude"), `#!/bin/sh\nif [ "$2" = "list" ]; then printf '%s\\n' '${listing}'; exit ${listExit}; fi\necho valid\n`);
  chmodSync(join(bin, "claude"), 0o755);
  return bin;
}

function doctor(args: string[], o: { bin?: string; toml?: string | null; source?: string | null } = {}) {
  const base = tmp("ginga-doc-");
  const cwd = join(base, "app");
  const home = join(base, "home");
  mkdirSync(cwd, { recursive: true });
  mkdirSync(home, { recursive: true });
  if (o.toml !== null) {
    mkdirSync(join(cwd, ".ginga"), { recursive: true });
    writeFileSync(join(cwd, ".ginga", "project.toml"), o.toml ?? '[install]\nplugin = "acme"\n');
  }
  const emptyBin = tmp("ginga-doc-empty-");
  const env: Record<string, string> = {
    PATH: `${o.bin ?? emptyBin}:${emptyBin}:${dirname(process.execPath)}`,
    HOME: home,
    XDG_STATE_HOME: join(base, "state"),
    TMPDIR: tmp("ginga-doc-tmp-"),
    ...(o.source === null ? {} : { GINGA_PLUGIN_SOURCE: o.source ?? plugin("acme") }),
  };
  const r = Bun.spawnSync(["bun", BIN, "doctor", ...args, "--home", home, "--manifest", join(base, "state", "manifest.json")], { cwd, env, stdout: "pipe", stderr: "pipe" });
  const out = r.stdout.toString();
  let records: any[] = [];
  try {
    const parsed = JSON.parse(out);
    records = Array.isArray(parsed) ? parsed : parsed?.records ?? [];
  } catch {}
  return { exit: r.exitCode, out, err: r.stderr.toString(), records };
}
const find = (rs: any[], harness: string, check: string) => rs.find((r) => r.harness === harness && r.check === check);

describe("ginga doctor", () => {
  test("claude habilitado: ok com as 9 chaves, hash do stdout e o nome do plugin do config", () => {
    const r = doctor(["--json", "--only", "claude"], { bin: fakeClaude("  acme@acme-local\n    Status: enabled") });
    expect(r.exit).toBe(0);
    const rec = find(r.records, "claude", "plugin_list");
    expect(Object.keys(rec)).toEqual(KEYS);
    expect(rec).toMatchObject({ status: "ok", law2: "pass", exit: 0 });
    expect(rec.cmd).toEqual(expect.arrayContaining(["plugin", "list"]));
    expect(rec.stdout_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.detail).toContain("acme");
    expect(find(r.records, "claude", "plugin_validate").status).toBe("ok");
  });

  test("--only: os outros harnesses viram unverified/filtrado e não há ledger nem toolchain", () => {
    const r = doctor(["--json", "--only", "claude"], { bin: fakeClaude("acme@acme-local\n  Status: enabled") });
    const others = r.records.filter((x) => ["pi", "opencode", "hermes", "tuios"].includes(x.harness));
    expect(others.length).toBeGreaterThanOrEqual(4);
    for (const x of others) expect(x).toMatchObject({ status: "unverified", detail: "filtrado por --only" });
    expect(r.records.filter((x) => ["ledger", "toolchain"].includes(x.harness))).toEqual([]);
    // com --only a seleção é só de adapters: nem os probes de versão rodam (PLAN-0015 TASK-05)
    expect(r.records.filter((x) => x.check === "version")).toEqual([]);
  });

  test("plugin desabilitado ou ausente: degraded, exit 0", () => {
    const dis = doctor(["--json", "--only", "claude"], { bin: fakeClaude("acme@acme-local\n  Status: disabled") });
    expect(find(dis.records, "claude", "plugin_list")).toMatchObject({ status: "degraded", law2: "fail" });
    expect(dis.exit).toBe(0);
    const abs = doctor(["--json", "--only", "claude"], { bin: fakeClaude("outro@mkt\n  Status: enabled") });
    expect(find(abs.records, "claude", "plugin_list")).toMatchObject({ status: "degraded" });
    expect(abs.records.find((x) => x.status === "degraded")!.detail).toContain("acme");
  });

  test("plugin list com exit ≠ 0: broken e exit 1", () => {
    const r = doctor(["--json", "--only", "claude"], { bin: fakeClaude("erro", 3) });
    expect(find(r.records, "claude", "plugin_list")).toMatchObject({ status: "broken", exit: 3 });
    expect(r.exit).toBe(1);
  });

  test("claude fora do PATH: unverified, law2 blocked, 'claude ausente'", () => {
    const r = doctor(["--json", "--only", "claude"]);
    expect(find(r.records, "claude", "plugin_list")).toMatchObject({ status: "unverified", law2: "blocked", cmd: null, exit: null });
    expect(find(r.records, "claude", "plugin_list").detail).toContain("claude ausente");
  });

  test("texto: uma linha `status harness/check: detalhe` por registro", () => {
    const r = doctor(["--only", "claude"], { bin: fakeClaude("acme@acme-local\n  Status: enabled") });
    expect(r.exit).toBe(0);
    expect(r.out).toMatch(/^ok claude\/plugin_list: /m);
  });

  test("sem fonte do plugin: exit 2 citando GINGA_PLUGIN_SOURCE; --only inválido: exit 2", () => {
    const semFonte = doctor(["--json"], { source: null });
    expect(semFonte.exit).toBe(2);
    expect(semFonte.err).toContain("GINGA_PLUGIN_SOURCE");
    expect(doctor(["--json", "--only", "bogus"]).exit).toBe(2);
  });
});
