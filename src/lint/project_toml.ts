// Lint de project.toml: valida a seção [handoff] (doc 11 §1).
// Mini-parse de TOML suficiente para seções simples e pares key=value.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LintError } from "./frontmatter.ts";

const VALID_HANDOFF_MODES = ["off", "suggest", "auto"] as const;

/** Mini-parse de TOML: seções [name] → { key: value }, valores escalares. */
function parseToml(raw: string): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  let section = "";
  for (let rawLine of raw.split(/\r?\n/)) {
    const hash = rawLine.indexOf("#");
    let line = hash < 0 ? rawLine : rawLine.slice(0, hash);
    line = line.trim();
    if (line === "") continue;
    const sec = /^\[([^\]]+)\]$/.exec(line);
    if (sec) {
      section = sec[1]!.trim();
      continue;
    }
    const kv = /^([^=]+)=(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1]!.trim();
    let val: string = kv[2]!.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    const map = result[section] ?? {};
    map[key] = val;
    result[section] = map;
  }
  return result;
}

/** Valida o [handoff] do project.toml de um bundle. */
export function lintProjectToml(dir: string): LintError[] {
  const errors: LintError[] = [];
  const path = join(dir, "project.toml");
  if (!existsSync(path)) return errors;

  const raw = readFileSync(path, "utf8");
  const toml = parseToml(raw);
  const handoff = toml["handoff"];
  if (!handoff) return errors;

  const mode = handoff.mode;
  if (mode !== undefined && !VALID_HANDOFF_MODES.includes(mode as string)) {
    errors.push({
      file: "project.toml",
      field: "handoff/mode",
      message: `mode "${mode}" inválido; esperado: ${VALID_HANDOFF_MODES.join(", ")}`,
    });
  }
  return errors;
}
