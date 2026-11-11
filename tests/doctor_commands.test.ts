import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * T920: `ginga doctor` confere se os binários dos `[commands]` do condutor
 * (padrões ou do project.toml) existem no PATH. Registro `ginga/commands`;
 * ausência é aviso (unverified/blocked) e não muda o exit.
 */
const BIN = join(import.meta.dir, "..", "bin", "ginga.ts");
const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(p: string): string {
  const d = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), p)));
  tmps.push(d);
  return d;
}

function doctor(bins: string[], commands = "", extra: string[] = []) {
  const base = tmp("ginga-doc-cmd-");
  const cwd = join(base, "app");
  const home = join(base, "home");
  const bin = tmp("ginga-doc-cmd-bin-");
  for (const name of bins) {
    writeFileSync(join(bin, name), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, name), 0o755);
  }
  mkdirSync(join(cwd, ".ginga"), { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(join(cwd, ".ginga", "project.toml"), `[install]\nplugin = "acme"\n\n[commands]\n${commands}`);
  const src = join(base, "src");
  mkdirSync(join(src, ".claude-plugin"), { recursive: true });
  writeFileSync(join(src, ".claude-plugin", "marketplace.json"), JSON.stringify({ name: "acme-local", plugins: [{ name: "acme", source: "./p" }] }));
  const r = Bun.spawnSync(["bun", BIN, "doctor", "--json", "--home", home, "--manifest", join(base, "state", "manifest.json"), ...extra], {
    cwd,
    env: { PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, XDG_STATE_HOME: join(base, "state"), TMPDIR: tmp("ginga-doc-cmd-tmp-"), GINGA_PLUGIN_SOURCE: src },
    stdout: "pipe",
    stderr: "pipe",
  });
  const records: any[] = JSON.parse(r.stdout.toString()).records;
  return { exit: r.exitCode, record: records.find((x) => x.harness === "ginga" && x.check === "commands"), records };
}

describe("ginga doctor: [commands] do condutor", () => {
  test("pinga e manda no PATH: ok/pass", () => {
    const { record } = doctor(["pinga", "manda"]);
    expect(record).toBeDefined();
    expect(record.status).toBe("ok");
    expect(record.law2).toBe("pass");
  });

  test("sem manda: aviso com o binário e as chaves que dependem dele; exit igual", () => {
    const com = doctor(["pinga", "manda"]);
    const sem = doctor(["pinga"]);
    expect(sem.record.status).toBe("unverified");
    expect(sem.record.law2).toBe("blocked");
    expect(sem.record.detail).toContain("manda");
    for (const key of ["red", "run", "judge", "merge", "replan", "next"]) expect(sem.record.detail).toContain(key);
    expect(sem.record.detail).not.toContain("pinga");
    expect(sem.exit).toBe(com.exit);
  });

  test("sem pinga: fila e ledger aparecem no aviso", () => {
    const { record } = doctor(["manda"]);
    expect(record.status).toBe("unverified");
    expect(record.detail).toContain("pinga");
    expect(record.detail).toContain("queue");
    expect(record.detail).toContain("ledger");
  });

  test("vale o project.toml: comando trocado é o que se confere", () => {
    const trocado = doctor(["pinga", "manda"], 'judge = "meu-juiz {plan}"\n');
    expect(trocado.record.status).toBe("unverified");
    expect(trocado.record.detail).toContain("meu-juiz");
    expect(trocado.record.detail).toContain("judge");
    const achado = doctor(["pinga", "manda", "meu-juiz"], 'judge = "meu-juiz {plan}"\n');
    expect(achado.record.status).toBe("ok");
  });

  test("builtin e none não pedem binário", () => {
    const { record } = doctor(["pinga", "manda"], 'next = "builtin"\nledger = "none"\n');
    expect(record.status).toBe("ok");
  });

  test("com --only o check não roda", () => {
    const { record } = doctor(["pinga", "manda"], "", ["--only", "claude"]);
    expect(record).toBeUndefined();
  });
});
