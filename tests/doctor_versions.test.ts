// tests_frozen — PLAN-0015 TASK-05 (ginga doctor confere versões).
//
// - Faixas semver em `package.json` (`gingaCompat: {pinga, manda, gira}`, sintaxe ">=X.Y.Z").
// - O doctor roda `--version --json` de cada um (binários pelo PATH, timeout 5 s) e acrescenta
//   um registro por binário: harness=<bin>, check="version", as 9 chaves do pinga, cmd=[bin,"--version","--json"].
// - Na faixa → ok/pass. Obrigatório (pinga, manda) FORA da faixa → broken/fail e `ginga doctor` exit 1.
// - Ausente do PATH → unverified/blocked (aviso, não erro) — inclusive obrigatório.
// - Opcional (gira) fora da faixa ou com resposta inválida → degraded/fail (aviso), exit inalterado.
// - Resposta inválida de obrigatório (sem `--version`, como o pinga real) → unverified/blocked, aviso.
// - `--json` passa a ser {"schema_version":1,"records":[...]}. Não instala nada.

import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const BIN = join(ROOT, "bin", "ginga.ts");
const tmps: string[] = [];

afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(p: string): string {
  const d = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), p)));
  tmps.push(d);
  return d;
}

/** Dir de binários: `versions[name] = null` → ausente; string → `--version --json` responde esse JSON;
 *  número → o binário sai com esse código sem nada (como o pinga real, que não tem `--version`). */
function stubBins(versions: Record<string, string | number | null>): string {
  const dir = tmp("ginga-ver-bin-");
  for (const [name, v] of Object.entries(versions)) {
    if (v === null) continue;
    const body = typeof v === "number" ? `exit ${v}\n` : `echo '${v}'\n`;
    writeFileSync(join(dir, name), `#!/bin/sh\n${body}`);
    chmodSync(join(dir, name), 0o755);
  }
  return dir;
}

function doctor(versions: Record<string, string | number | null>) {
  const base = tmp("ginga-ver-");
  const cwd = join(base, "app");
  const home = join(base, "home");
  const bin = stubBins(versions);
  mkdirSync(cwd, { recursive: true });
  mkdirSync(home, { recursive: true });
  mkdirSync(join(cwd, ".ginga"), { recursive: true });
  writeFileSync(join(cwd, ".ginga", "project.toml"), '[install]\nplugin = "acme"\n');
  const src = join(base, "src");
  mkdirSync(join(src, ".claude-plugin"), { recursive: true });
  writeFileSync(join(src, ".claude-plugin", "marketplace.json"), JSON.stringify({ name: "acme-local", plugins: [{ name: "acme", source: "./p" }] }));
  const emptyBin = tmp("ginga-ver-empty-");
  const env: Record<string, string> = {
    PATH: `${bin}:${emptyBin}:${dirname(process.execPath)}:/usr/bin:/bin`,
    HOME: home,
    XDG_STATE_HOME: join(base, "state"),
    TMPDIR: tmp("ginga-ver-tmp-"),
    GINGA_PLUGIN_SOURCE: src,
  };
  const r = Bun.spawnSync(["bun", BIN, "doctor", "--json", "--home", home, "--manifest", join(base, "state", "manifest.json")], {
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  let parsed: any = null;
  try {
    parsed = JSON.parse(r.stdout.toString());
  } catch {}
  const records: any[] = Array.isArray(parsed) ? parsed : parsed?.records ?? [];
  return { exit: r.exitCode, parsed, records };
}

const find = (rs: any[], harness: string, check: string) => rs.find((r) => r.harness === harness && r.check === check);

describe("ginga doctor: versões de pinga, manda e gira", () => {
  test("package.json declara as faixas gingaCompat", () => {
    const compat = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).gingaCompat;
    expect(compat).toMatchObject({ pinga: expect.stringContaining(">="), manda: expect.stringContaining(">="), gira: expect.stringContaining(">=") });
  });

  test("todos na faixa: ok/pass por binário e schema_version na saída", () => {
    const r = doctor({
      pinga: '{"schema_version":1,"name":"pinga","version":"9.9.9"}',
      manda: '{"schema_version":1,"name":"manda","version":"9.9.9"}',
      gira: '{"schema_version":1,"name":"gira","version":"9.9.9"}',
    });
    expect(r.parsed?.schema_version).toBe(1);
    expect(Array.isArray(r.parsed?.records)).toBe(true);
    for (const name of ["pinga", "manda", "gira"]) {
      const rec = find(r.records, name, "version");
      expect(rec).toBeDefined();
      expect(rec).toMatchObject({ status: "ok", law2: "pass", exit: 0 });
      expect(rec.cmd).toEqual([expect.stringContaining(name), "--version", "--json"]);
    }
    expect(r.exit).toBe(0);
  });

  test("obrigatório fora da faixa: broken/fail e doctor exit 1", () => {
    const r = doctor({
      pinga: '{"schema_version":1,"name":"pinga","version":"0.0.1"}',
      manda: '{"schema_version":1,"name":"manda","version":"9.9.9"}',
      gira: '{"schema_version":1,"name":"gira","version":"9.9.9"}',
    });
    expect(find(r.records, "pinga", "version")).toMatchObject({ status: "broken", law2: "fail" });
    expect(r.exit).toBe(1);
  });

  test("ausentes do PATH: unverified/blocked — aviso, não erro", () => {
    const r = doctor({ pinga: null, manda: null, gira: null });
    for (const name of ["pinga", "manda", "gira"]) {
      expect(find(r.records, name, "version")).toMatchObject({ status: "unverified", law2: "blocked", cmd: null, exit: null });
    }
    expect(r.exit).toBe(0);
  });

  test("gira fora da faixa (opcional): degraded, exit não muda", () => {
    const r = doctor({
      pinga: '{"schema_version":1,"name":"pinga","version":"9.9.9"}',
      manda: '{"schema_version":1,"name":"manda","version":"9.9.9"}',
      gira: '{"schema_version":1,"name":"gira","version":"0.0.1"}',
    });
    expect(find(r.records, "gira", "version")).toMatchObject({ status: "degraded", law2: "fail" });
    expect(r.exit).toBe(0);
  });

  test("obrigatório sem --version (pinga real: exit ≠ 0): unverified/blocked", () => {
    const r = doctor({ pinga: 2, manda: '{"schema_version":1,"name":"manda","version":"9.9.9"}', gira: null });
    expect(find(r.records, "pinga", "version")).toMatchObject({ status: "unverified", law2: "blocked", exit: 2 });
    expect(r.exit).toBe(0);
  });
});
