import { readFileSync } from "node:fs";
import type { LintError } from "./frontmatter.ts";

/** Um problema de formato num LEARNINGS.md (mesma forma de LintError). */
export type LintIssue = LintError;

/** Status aceitos no cabeçalho `## L-NN · <status> · AAAA-MM-DD HH:MM`. */
const STATUSES: readonly string[] = ["confirmada", "descartada", "fato", "armadilha"];

/** Campos que cada entrada de learning traz como `- <campo>: <texto>`. */
const FIELDS: readonly string[] = ["hipótese", "evidência", "conclusão", "escopo"];

/** `## L-NN · confirmada|descartada|fato|armadilha · 2026-10-29 12:00` (doc 06 §2). */
const HEADING = /^## (L-\d+) · ([^·]+?) · (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})\s*$/;

const FIELD_LINE = /^- (hipótese|evidência|conclusão|escopo):/;

/** Valida o formato de um LEARNINGS.md (doc 06 §2): status conhecido e campos presentes. */
export function lintLearnings(path: string): LintIssue[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    return [{ file: path, field: "learnings", message: `não consegui ler: ${(e as Error).message}` }];
  }

  const lines = raw.split(/\r?\n/);
  const issues: LintIssue[] = [];

  // Índices dos cabeçalhos de entrada (`## L-NN · ...`); texto fora de entrada é ignorado.
  const heads: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^## L-\d+/.test(lines[i] ?? "")) heads.push(i);
  }

  for (const [n, start] of heads.entries()) {
    const end = n + 1 < heads.length ? heads[n + 1]! : lines.length;
    const block = lines.slice(start, end);
    const heading = block[0] ?? "";
    const m = heading.match(HEADING);
    if (!m) {
      issues.push({
        file: path,
        field: "cabeçalho",
        message: `inválido: ${heading.trim()} (uso: ## L-NN · <${STATUSES.join("|")}> · AAAA-MM-DD HH:MM)`,
      });
      continue;
    }
    const id = m[1]!;
    const status = m[2]!;
    if (!STATUSES.includes(status)) {
      issues.push({
        file: path,
        field: "status",
        message: `${id}: inválido: ${JSON.stringify(status)} (aceitos: ${STATUSES.join(", ")})`,
      });
    }
    const present = new Set(
      block
        .slice(1)
        .map((line) => line.match(FIELD_LINE)?.[1])
        .filter((f): f is string => f !== undefined),
    );
    for (const field of FIELDS) {
      if (!present.has(field)) {
        issues.push({ file: path, field, message: `${id}: campo \`- ${field}:\` obrigatório ausente` });
      }
    }
  }

  return issues;
}
