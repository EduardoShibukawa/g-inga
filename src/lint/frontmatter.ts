import type { Frontmatter } from "../bundle/read.ts";

export type LintError = { file: string; field: string; message: string };

/** Campos obrigatórios por `type`, conforme 04-artefatos §5. */
const REQUIRED: Record<string, readonly string[]> = {
  intent: ["title", "source", "timestamp"],
  spec: ["title", "intent", "status", "bench"],
  plan: ["title", "intent", "status"],
  task: ["mode", "goal", "done_when", "touch", "plan"],
};

/** Valores aceitos pelos documentos de design. */
const ALLOWED: Record<string, Record<string, readonly string[]>> = {
  spec: {
    status: ["draft", "blocked", "approved", "superseded"],
    bench: ["perf", "docs", "ux", "none"],
  },
  plan: {
    status: ["draft", "approved", "superseded"],
    kind: ["change", "investigation"],
  },
  task: {
    mode: ["mvp", "padrao", "completo"],
  },
};

export const TYPES: readonly string[] = Object.keys(REQUIRED);

function absent(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

/** Valida o frontmatter de um documento. Arquivos sem `type` conhecido são ignorados. */
export function lintDocument(file: string, frontmatter: Frontmatter): LintError[] {
  const type = frontmatter.type;
  if (typeof type !== "string" || !TYPES.includes(type)) return [];

  const errors: LintError[] = [];

  for (const field of REQUIRED[type] ?? []) {
    if (absent(frontmatter[field])) errors.push({ file, field, message: "obrigatório" });
  }

  for (const [field, accepted] of Object.entries(ALLOWED[type] ?? {})) {
    const value = frontmatter[field];
    if (absent(value)) continue;
    if (typeof value !== "string" || !accepted.includes(value)) {
      errors.push({
        file,
        field,
        message: `inválido: ${JSON.stringify(value)} (aceitos: ${accepted.join(", ")})`,
      });
    }
  }

  return errors;
}
