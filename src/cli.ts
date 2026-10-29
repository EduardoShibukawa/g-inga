const VERSION = { schema_version: 1, name: "ginga", version: "0.1.0" } as const;

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { emitEvent } from "./events/emit.ts";
import { migrateFile } from "./events/migrate.ts";
import { validateEvent } from "./events/validate.ts";
import { lintBundle } from "./lint/index.ts";
import { exportOkf } from "./lint/okf.ts";
import { ingestCommand } from "./state/ingest.ts";
import { existsSync } from "node:fs";
import { installCmd } from "./install/index.ts";
import { installSupervisorCmd } from "./install/supervisor_unit.ts";
import { hooksCheckCmd, hooksInstallCmd } from "./hooks/index.ts";
import { readyWriteCmd } from "./ready.ts";
import { watchCmd } from "./watch.ts";
import { doctorCmd } from "./doctor.ts";
import { adoptLocalEntries } from "./install/adopt.ts";
import { defaultManifestPath } from "./install/manifest.ts";
import { VERBS, getVerb, runVerb, type Verb, type VerbArgs } from "./verbs/registry.ts";
import { openStateDb, resolveStateDbPath } from "./state/db.ts";

export { emitEvent };

// ---------------------------------------------------------------------------
// CLI gerada do registro (TASK-02/PLAN-0011): dispatch genérico, nenhuma
// lógica por verbo aqui. `ginga <verbo> [sub] args... [--json] [--via V]
// [--by N] [--root DIR]`: posicionais na ordem de verb.args; `--<nome> valor`
// também preenche o argumento. A validação (nome, obrigatórios) é do
// registro via runVerb — erro do registro → exit 2; falha do verbo → exit 1.
// ---------------------------------------------------------------------------

function nonEmpty(v: string | undefined): string | undefined {
  return v !== undefined && v !== "" ? v : undefined;
}

function helpText(): string {
  const lines = [
    "uso: ginga <verbo> [sub] args... [--json] [--via V] [--by N] [--root DIR]",
    "",
    "verbos do registro:",
  ];
  for (const v of VERBS) {
    const shape = v.args.map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`)).join(" ");
    lines.push(`  ginga ${v.name}${shape === "" ? "" : ` ${shape}`}`);
  }
  lines.push("", "infra: events | lint | tick | serve | install | adopt | hooks | ready | doctor | version | vigia (watch sem alvo)");
  return lines.join("\n");
}

/** Nome no registro: tenta verbo de duas palavras primeiro (`intent new`), depois um token. */
function matchVerb(tokens: string[]): { verb: Verb; consumed: number } | null {
  if (tokens.length === 0 || tokens[0]!.startsWith("-")) return null;
  if (tokens.length >= 2 && !tokens[1]!.startsWith("-")) {
    const two = getVerb(`${tokens[0]} ${tokens[1]}`);
    if (two) return { verb: two, consumed: 2 };
  }
  const one = getVerb(tokens[0]!);
  if (one) return { verb: one, consumed: 1 };
  return null;
}

async function verbCommand(verb: Verb, tokens: string[]): Promise<number> {
  const positionals: string[] = [];
  const flags: Record<string, string> = {};
  let json = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === "--json") {
      json = true;
      continue;
    }
    if (t.startsWith("--")) {
      const name = t.slice(2);
      const value = tokens[i + 1];
      const hasValue = value !== undefined && value !== "" && !value.startsWith("--");
      if (!hasValue) {
        // Flag booleana declarada no registro (`--yes`): vale sem valor (T127).
        if (verb.args.some((a) => a.bool && a.name === name)) {
          flags[name] = "true";
          continue;
        }
        console.error(`falta valor para ${t}`);
        return 2;
      }
      flags[name] = value;
      i++;
      continue;
    }
    positionals.push(t);
  }

  // args do verbo: --<nome> vence; senão o próximo posicional (ordem de verb.args).
  const args: VerbArgs = {};
  let next = 0;
  for (const a of verb.args) {
    const flag = flags[a.name];
    if (flag !== undefined) {
      args[a.name] = flag;
      continue;
    }
    const p = positionals[next++];
    if (p !== undefined) args[a.name] = p;
  }
  if (next < positionals.length) {
    console.error(`argumentos excedentes: ${positionals.slice(next).join(" ")}`);
    return 2;
  }

  const root = nonEmpty(flags.root) ?? nonEmpty(process.env.GINGA_ROOT) ?? join(process.cwd(), ".ginga");
  const by = nonEmpty(flags.by) ?? nonEmpty(process.env.GINGA_BY) ?? nonEmpty(process.env.USER) ?? "cli";
  const via = nonEmpty(flags.via) ?? "cli";

  let db: ReturnType<typeof openStateDb> | undefined;
  try {
    db = openStateDb(resolveStateDbPath(root)); // $GINGA_STATE_DB vence dentro de resolveStateDbPath
    const result = await runVerb(verb.name, { by, via, root, db }, args);
    console.log(json ? JSON.stringify(result) : JSON.stringify(result, null, 2));
    return 0;
  } catch (e) {
    const msg = (e as Error).message;
    console.error(msg);
    return msg.startsWith("falta argumento:") || msg.startsWith("verbo desconhecido:") ? 2 : 1;
  } finally {
    db?.close();
  }
}

function validateCommand(file: string): number {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (e) {
    console.error(`não consegui ler ${file}: ${(e as Error).message}`);
    return 1;
  }
  const lines = raw.split("\n");
  let exit = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;
    let ev: unknown;
    try {
      ev = JSON.parse(line);
    } catch (e) {
      console.error(`linha ${(i + 1)}: JSON inválido (${(e as Error).message})`);
      exit = 1;
      continue;
    }
    const r = validateEvent(ev);
    if (!r.ok) {
      console.error(`linha ${i + 1}: ${r.errors.join("; ")}`);
      exit = 1;
    }
  }
  if (exit === 0) console.log(`OK: todos os eventos válidos em ${file}`);
  return exit;
}

export async function run(args: string[]): Promise<number> {
  if (args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
    console.log(helpText());
    return 0;
  }
  if (args[0] === "--version") {
    console.log(`ginga ${VERSION.version}`);
    return 0;
  }
  if (args[0] === "version" && args[1] === "--json") {
    console.log(JSON.stringify(VERSION));
    return 0;
  }
  if (args[0] === "events" && args[1] === "validate") {
    const file = args[2];
    if (!file) {
      console.error("uso: ginga events validate <arquivo.jsonl>");
      return 2;
    }
    return validateCommand(file);
  }
  if (args[0] === "events" && args[1] === "emit") {
    emitEvent(JSON.parse(args[2] ?? "{}"));
    return 0;
  }
  if (args[0] === "events" && args[1] === "ingest") {
    return ingestCommand();
  }
  if (args[0] === "events" && args[1] === "migrate") {
    const input = args[2];
    const flag = args.findIndex((a) => a === "--out" || a.startsWith("--out="));
    const out = flag < 0 ? undefined : args[flag] === "--out" ? args[flag + 1] : args[flag]!.slice("--out=".length);
    if (!input || !out) {
      console.error("uso: ginga events migrate <arquivo.jsonl> --out <saida.jsonl>");
      return 2;
    }
    try {
      const r = migrateFile(input, out);
      console.log(`migrados: ${r.written} evento(s) para ${out}`);
      return 0;
    } catch (e) {
      console.error(`falha ao migrar ${input}: ${(e as Error).message}`);
      return 1;
    }
  }
  if (args[0] === "tick") {
    // A renovação do lease precisa do event loop, então tick roda como worker
    // async próprio; esta fachada é síncrona e só repassa flags e exit code.
    const worker = Bun.spawnSync([Bun.which("bun") ?? "bun", join(import.meta.dir, "tick.ts"), ...args.slice(1)], {
      stdin: "ignore",
      stdout: "inherit", // o default é pipe: sem isto o JSON/human-out morre em worker.stdout
      stderr: "inherit",
    });
    if (worker.exitCode === null) console.error(`falha ao iniciar o worker do tick`);
    return worker.exitCode ?? 1;
  }
  if (args[0] === "serve") {
    // O serve roda para sempre e precisa do event loop, então serve roda como
    // worker próprio; esta fachada é síncrona e só repassa flags e exit code
    // (mesmo padrão do tick, acima).
    const worker = Bun.spawnSync([Bun.which("bun") ?? "bun", join(import.meta.dir, "serve.ts"), ...args.slice(1)], {
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    });
    if (worker.exitCode === null) console.error(`falha ao iniciar o worker do serve`);
    return worker.exitCode ?? 1;
  }
  if (args[0] === "lint") {
    const rest = args.slice(1);
    const json = rest.includes("--json");
    let dir = ".ginga";
    let out: string | undefined;
    let format: string | undefined;
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i]!;
      if (arg === "--json") continue;
      if (arg === "--export") {
        format = rest[i + 1];
        out = rest[i + 2];
        i += 2;
        continue;
      }
      if (arg.startsWith("--export=")) {
        format = arg.slice("--export=".length);
        out = rest[i + 1];
        i++;
        continue;
      }
      if (!arg.startsWith("-")) {
        dir = arg;
      }
    }
    if (format !== undefined) {
      if (format !== "okf") {
        console.error(`formato de exportação desconhecido: ${format || "(vazio)"} (uso: ginga lint <dir> --export okf <saida>)`);
        return 2;
      }
      if (out === undefined) {
        console.error("uso: ginga lint <dir> --export okf <saida>");
        return 2;
      }
      const result = exportOkf(dir, out);
      if (!result.ok) {
        for (const e of result.errors) console.log(`${e.file}: ${e.field}: ${e.message}`);
        return 1;
      }
      console.log(`exportado OKF: ${result.exported} arquivo(s) para ${out}`);
      return 0;
    }
    const { ok, errors } = lintBundle(dir);
    if (json) {
      console.log(JSON.stringify({ ok, errors }));
    } else if (ok) {
      console.log(`OK: ${dir} sem erros de frontmatter`);
    } else {
      for (const e of errors) console.log(`${e.file}: ${e.field}: ${e.message}`);
    }
    return ok ? 0 : 1;
  }
  if (args[0] === "install") {
    const modes = new Set<string>();
    let home: string | undefined;
    let manifestPath: string | undefined;
    let only: string | undefined;
    let supervisor = false;
    let enable = false;
    const rest = args.slice(1);
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i]!;
      if (arg === "--dry-run" || arg === "--apply" || arg === "--revert" || arg === "--rebaseline") {
        modes.add(arg);
      } else if (arg === "--supervisor") {
        supervisor = true;
      } else if (arg === "--enable") {
        enable = true;
      } else if (arg === "--home" || arg === "--manifest" || arg === "--only") {
        const value = rest[i + 1];
        if (value === undefined || value === "") {
          console.error("uso: ginga install ...");
          return 2;
        }
        i++;
        if (arg === "--home") home = value;
        else if (arg === "--manifest") manifestPath = value;
        else only = value;
      } else {
        console.error("uso: ginga install ...");
        return 2;
      }
    }
    if (enable && !supervisor) {
      console.error("uso: ginga install --enable só é válido com --supervisor");
      return 2;
    }
    if (supervisor) {
      // Só a unit do supervisor + link do bin: não exige modo.
      if (modes.size !== 0 || manifestPath !== undefined || only !== undefined) {
        console.error("uso: ginga install --supervisor [--enable] [--home PATH]");
        return 2;
      }
      const supervisorHome = home ?? process.env.HOME;
      if (supervisorHome === undefined || !existsSync(supervisorHome)) {
        console.error("uso: ginga install ...");
        return 2;
      }
      return await installSupervisorCmd({
        home: supervisorHome,
        env: process.env,
        enable,
      });
    }
    if (modes.size !== 1) {
      console.error("uso: ginga install ...");
      return 2;
    }
    const resolvedHome = home ?? process.env.HOME;
    if (resolvedHome === undefined || !existsSync(resolvedHome)) {
      console.error("uso: ginga install ...");
      return 2;
    }
    const mode = modes.has("--dry-run")
      ? ("dry-run" as const)
      : modes.has("--apply")
        ? ("apply" as const)
        : modes.has("--rebaseline")
          ? ("rebaseline" as const)
          : ("revert" as const);
    return await installCmd({
      mode,
      home: resolvedHome,
      manifestPath,
      only,
      env: process.env,
      cwd: process.cwd(),
    });
  }

  if (args[0] === "hooks") {
    if (args[1] === "install") return hooksInstallCmd(args.slice(2));
    if (args[1] === "check") return hooksCheckCmd(args.slice(2));
    console.error(
      args[1] === undefined
        ? "uso: ginga hooks install|check [--root PATH]"
        : `uso: ginga hooks install|check [--root PATH] (subcomando desconhecido: ${args[1]})`,
    );
    return 2;
  }

  // `ginga watch <alvo>` é o verbo watch do registro; `ginga watch` sem alvo
  // posicional (só flags) continua sendo o vigia.
  if (args[0] === "watch" && (args[1] === undefined || args[1].startsWith("-"))) {
    return watchCmd(args.slice(1));
  }

  if (args[0] === "ready") {
    if (args[1] === "write") return readyWriteCmd(args.slice(2));
    console.error(
      args[1] === undefined
        ? "uso: ginga ready write --root PATH --plan P --repo R --branch B [--worktree DIR]"
        : `uso: ginga ready write --root PATH --plan P --repo R --branch B [--worktree DIR] (subcomando desconhecido: ${args[1]})`,
    );
    return 2;
  }

  if (args[0] === "doctor") {
    return doctorCmd(args.slice(1));
  }

  if (args[0] === "adopt") {
    const modes = new Set<string>();
    let home: string | undefined;
    let manifestPath: string | undefined;
    const rest = args.slice(1);
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i]!;
      if (arg === "--dry-run" || arg === "--apply") {
        modes.add(arg);
      } else if (arg === "--home" || arg === "--manifest") {
        const value = rest[i + 1];
        if (value === undefined || value === "") {
          console.error("uso: ginga adopt ...");
          return 2;
        }
        i++;
        if (arg === "--home") home = value;
        else manifestPath = value;
      } else {
        console.error("uso: ginga adopt ...");
        return 2;
      }
    }
    if (modes.size !== 1) {
      console.error("uso: ginga adopt ...");
      return 2;
    }
    const resolvedHome = home ?? process.env.HOME;
    if (resolvedHome === undefined || !existsSync(resolvedHome)) {
      console.error("uso: ginga adopt ...");
      return 2;
    }
    const env = process.env;
    const resolvedManifest = manifestPath ?? defaultManifestPath(env);
    const apply = modes.has("--apply");
    await adoptLocalEntries({
      homeDir: resolvedHome,
      manifestPath: resolvedManifest,
      apply,
    });
    return 0;
  }

  // Dispatch genérico do registro: qualquer verbo nomeado aqui é o verbo —
  // a regra fica no registro, este bloco é igual para todos.
  const matched = matchVerb(args);
  if (matched) return await verbCommand(matched.verb, args.slice(matched.consumed));

  if (args.length === 0) {
    console.error("usage: ginga install / pinga install (--dry-run | --apply | --revert | --rebaseline) [--only H] [--manifest PATH] [--home PATH]");
    return 2;
  }
  console.error(`uso: ginga install ... (pinga install)`);
  console.error(`comando desconhecido: ${args[0] ?? "(vazio)"}`);
  return 2;
}

export const runCli = run;

if (import.meta.main) {
  process.exit(await run(process.argv.slice(2)));
}
