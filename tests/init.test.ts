// PLAN-0015 TASK-01 (T127): `ginga init` — testes congelados.
// Codificam exatamente o "Fazer" da TASK:
// - cria `index.md` (`okf: "0.1"`), `log.md`, `intents/ specs/ plans/
//   knowledge/{lessons,decisions}/ handoffs/` e `project.toml`;
// - `[commands].test` pela stack (package.json → `bun test`/`npm test`,
//   go.mod → `go test ./...`, pom.xml → `mvn test`);
// - `[context].provider` = "gira" só com binário `gira` no PATH E `.gira/`
//   na raiz; senão "rg";
// - `[runtimes]` só com o que está no PATH; `[notify]` se `hermes` existir;
// - `--yes` não pergunta; sem `--yes` mostra o `project.toml` e pede
//   confirmação (resposta "n" não cria nada); rodar 2× não muda nada;
// - `init` entra no registro de verbos (write) → CLI e API geradas dele.
// O CLI é chamado como `bun bin/ginga.ts init --yes` com cwd = raiz do repo.

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { getVerb } from "../src/verbs/registry";

const ROOT = join(import.meta.dir, "..");
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmpRepo(marker?: string): string {
  const D = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-init-")));
  dirs.push(D);
  if (marker) writeFileSync(join(D, marker), marker.includes(".json") ? '{"name":"x"}\n' : "x\n");
  return D;
}

/** PATH de teste: só o diretório de stubs (se dado), o bun e o sistema. */
function env(stubBin?: string) {
  const path = [stubBin, dirname(process.execPath), "/usr/bin", "/bin"].filter(Boolean).join(":");
  const base: Record<string, string> = { ...process.env } as Record<string, string>;
  delete base.GINGA_ROOT;
  delete base.GINGA_STATE_DB;
  delete base.GINGA_EVENTS;
  return { ...base, PATH: path, HOME: stubBin ?? dirname(process.execPath) };
}

function stub(bin: string, names: string[]) {
  mkdirSync(bin, { recursive: true });
  for (const n of names) {
    writeFileSync(join(bin, n), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, n), 0o755);
  }
}

function gingaInit(cwd: string, args: string[], stubBin?: string, stdin = "") {
  const r = Bun.spawnSync([process.execPath, join(ROOT, "bin/ginga.ts"), "init", ...args], {
    cwd,
    env: env(stubBin),
    stdin: stdin === "" ? "ignore" : TextEncoder.encode(stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

/** Texto da seção `[runtimes]` do project.toml (até a próxima seção). */
function runtimesSection(toml: string): string {
  const m = /\[runtimes\]\n([^[]*)/.exec(toml);
  return m ? m[1] : "";
}

describe("ginga init cria o bundle e o project.toml", () => {
  test("init --yes cria .ginga/ (index.md okf, log.md, dirs) e project.toml", () => {
    const D = tmpRepo("package.json");
    const r = gingaInit(D, ["--yes"]);
    expect(r.code).toBe(0);
    expect(existsSync(join(D, ".ginga", "index.md"))).toBe(true);
    expect(readFileSync(join(D, ".ginga", "index.md"), "utf8")).toContain('okf: "0.1"');
    expect(existsSync(join(D, ".ginga", "log.md"))).toBe(true);
    for (const sub of ["intents", "specs", "plans", "handoffs"]) {
      expect(existsSync(join(D, ".ginga", sub))).toBe(true);
    }
    expect(existsSync(join(D, ".ginga", "knowledge", "lessons"))).toBe(true);
    expect(existsSync(join(D, ".ginga", "knowledge", "decisions"))).toBe(true);
    expect(existsSync(join(D, ".ginga", "project.toml"))).toBe(true);
  });

  test("[commands].test sai da stack: bun vs node vs go vs maven", () => {
    const bun = tmpRepo();
    writeFileSync(join(bun, "package.json"), '{"name":"x","dependencies":{"bun":"latest"}}\n');
    expect(gingaInit(bun, ["--yes"]).code).toBe(0);
    expect(readFileSync(join(bun, ".ginga", "project.toml"), "utf8")).toContain('test = "bun test"');

    const node = tmpRepo();
    writeFileSync(join(node, "package.json"), '{"name":"y"}\n');
    expect(gingaInit(node, ["--yes"]).code).toBe(0);
    expect(readFileSync(join(node, ".ginga", "project.toml"), "utf8")).toContain('test = "npm test"');

    const go = tmpRepo();
    writeFileSync(join(go, "go.mod"), "module x\n");
    expect(gingaInit(go, ["--yes"]).code).toBe(0);
    expect(readFileSync(join(go, ".ginga", "project.toml"), "utf8")).toContain('test = "go test ./..."');

    const maven = tmpRepo();
    writeFileSync(join(maven, "pom.xml"), "<project/>\n");
    expect(gingaInit(maven, ["--yes"]).code).toBe(0);
    expect(readFileSync(join(maven, ".ginga", "project.toml"), "utf8")).toContain('test = "mvn test"');
  });

  test("[context].provider: rg sem gira; gira só com binário no PATH e .gira/ na raiz", () => {
    const semGira = tmpRepo("package.json");
    expect(gingaInit(semGira, ["--yes"]).code).toBe(0);
    expect(readFileSync(join(semGira, ".ginga", "project.toml"), "utf8")).toContain('provider = "rg"');

    const comGira = tmpRepo("package.json");
    mkdirSync(join(comGira, ".gira"));
    const bin = join(comGira, "stubs-bin");
    stub(bin, ["gira"]);
    expect(gingaInit(comGira, ["--yes"], bin).code).toBe(0);
    expect(readFileSync(join(comGira, ".ginga", "project.toml"), "utf8")).toContain('provider = "gira"');

    // binário sem .gira/ → ainda rg
    const semDir = tmpRepo("package.json");
    const bin2 = join(semDir, "stubs-bin");
    stub(bin2, ["gira"]);
    expect(gingaInit(semDir, ["--yes"], bin2).code).toBe(0);
    expect(readFileSync(join(semDir, ".ginga", "project.toml"), "utf8")).toContain('provider = "rg"');
  });

  test("[runtimes] só lista o que está no PATH; [notify] só com hermes", () => {
    const D = tmpRepo("package.json");
    const bin = join(D, "stubs-bin");
    stub(bin, ["claude", "opencode", "hermes"]);
    const r = gingaInit(D, ["--yes"], bin);
    expect(r.code).toBe(0);
    const toml = readFileSync(join(D, ".ginga", "project.toml"), "utf8");
    const rt = runtimesSection(toml);
    expect(rt).toContain("claude");
    expect(rt).toContain("opencode");
    expect(rt).not.toContain("codex");
    expect(rt).not.toContain("agy");
    expect(toml).toContain("[notify]");

    const D2 = tmpRepo("package.json");
    expect(gingaInit(D2, ["--yes"]).code).toBe(0);
    const toml2 = readFileSync(join(D2, ".ginga", "project.toml"), "utf8");
    expect(runtimesSection(toml2)).toBe("");
    expect(toml2).not.toContain("[notify]");
  });

  test("--yes não pergunta; sem --yes mostra o project.toml e pede confirmação (n → não cria)", () => {
    const D = tmpRepo("package.json");
    const recusa = gingaInit(D, [], undefined, "n\n");
    expect(recusa.out).toContain("[commands]"); // mostrou o project.toml proposto
    expect(existsSync(join(D, ".ginga", "index.md"))).toBe(false);
    expect(existsSync(join(D, ".ginga", "project.toml"))).toBe(false);

    const D2 = tmpRepo("package.json");
    const confirma = gingaInit(D2, [], undefined, "y\n");
    expect(confirma.code).toBe(0);
    expect(existsSync(join(D2, ".ginga", "project.toml"))).toBe(true);
  });

  test("idempotente: rodar 2× não muda nada e não sobrescreve conteúdo existente", () => {
    const D = tmpRepo("package.json");
    expect(gingaInit(D, ["--yes"]).code).toBe(0);
    const indexAntes = readFileSync(join(D, ".ginga", "index.md"), "utf8");
    writeFileSync(join(D, ".ginga", "intents", "INTENT-0001-manual.md"), "---\ntype: intent\ntitle: manual\n---\nQUERO x\n");

    expect(gingaInit(D, ["--yes"]).code).toBe(0);
    expect(readFileSync(join(D, ".ginga", "index.md"), "utf8")).toBe(indexAntes);
    expect(existsSync(join(D, ".ginga", "intents", "INTENT-0001-manual.md"))).toBe(true);
    expect(readdirSync(join(D, ".ginga", "plans"))).toEqual([]);
  });

  test("init é verbo do registro (write), exposto na ajuda da CLI", () => {
    const verb = getVerb("init");
    expect(verb).toBeDefined();
    expect(verb!.write).toBe(true);
    const r = Bun.spawnSync([process.execPath, join(ROOT, "bin/ginga.ts"), "--help"], { env: env(), stdout: "pipe", stderr: "pipe" });
    expect(r.stdout.toString()).toContain("ginga init");
  });
});
