import { readBundle } from "../bundle/read.ts";
import { lintDag } from "./dag.ts";
import { lintDocument, TYPES, type LintError } from "./frontmatter.ts";
import { lintRelations, lintTaskName, type Artifact } from "./relations.ts";

export type { LintError } from "./frontmatter.ts";

export type LintResult = { ok: boolean; errors: LintError[] };

/** TASK-*.md num folder de PLAN: checada como TASK mesmo sem `type: task`. */
const UNTYPED_TASK = /^plans\/PLAN-[^/]+\/TASK-[^/]*\.md$/;

/** Lê o bundle, valida o frontmatter e as relações (referências, numeração e DAG). */
export function lintBundle(dir: string): LintResult {
  let entries;
  try {
    entries = readBundle(dir);
  } catch (e) {
    return {
      ok: false,
      errors: [{ file: dir, field: "bundle", message: `não consegui ler: ${(e as Error).message}` }],
    };
  }

  const errors: LintError[] = [];
  const artifacts: Artifact[] = [];
  for (const entry of entries) {
    if (!entry.ok) {
      errors.push({ file: entry.file, field: "frontmatter", message: entry.message });
      // TASK-*.md em plans/PLAN-*/: o erro de nome roda também sem frontmatter válido.
      if (UNTYPED_TASK.test(entry.file)) errors.push(...lintTaskName(entry.file));
      continue;
    }
    errors.push(...lintDocument(entry.file, entry.frontmatter));
    // Arquivo TASK-*.md dentro de plans/PLAN-*/ entra na checagem de nome
    // (TASK-<NN>-slug) de relations.ts mesmo com `type` ausente ou desconhecido.
    const declared = entry.frontmatter.type;
    if (typeof declared === "string" && TYPES.includes(declared)) {
      artifacts.push({ file: entry.file, type: declared, frontmatter: entry.frontmatter });
    } else if (UNTYPED_TASK.test(entry.file)) {
      artifacts.push({ file: entry.file, type: "task", frontmatter: entry.frontmatter });
    }
  }

  errors.push(...lintRelations(artifacts));
  errors.push(...lintDag(artifacts));

  errors.sort((a, b) => a.file.localeCompare(b.file) || a.field.localeCompare(b.field));
  return { ok: errors.length === 0, errors };
}
