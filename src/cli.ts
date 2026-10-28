const VERSION = { schema_version: 1, name: "ginga", version: "0.1.0" } as const;

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { emitEvent } from "./events/emit.ts";
import { migrateFile } from "./events/migrate.ts";
import { validateEvent } from "./events/validate.ts";
import { lintBundle } from "./lint/index.ts";
import { exportOkf } from "./lint/okf.ts";
import { ingestCommand } from "./state/ingest.ts";

export { emitEvent };

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

export function run(args: string[]): number {
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
  console.error(`comando desconhecido: ${args[0] ?? "(vazio)"}`);
  return 2;
}

if (import.meta.main) {
  process.exit(run(process.argv.slice(2)));
}
