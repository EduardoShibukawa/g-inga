import { readBundle } from "../bundle/read.ts";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { lintDag } from "./dag.ts";
import { lintDocument, TYPES, type LintError } from "./frontmatter.ts";
import { lintRelations, lintTaskName, type Artifact } from "./relations.ts";
import { lintLearnings, type LintIssue } from "./learnings.ts";
import { lintProjectToml } from "./project_toml.ts";

export type { LintError } from "./frontmatter.ts";
export type { LintIssue } from "./learnings.ts";

export type LintResult = { ok: boolean; errors: LintError[]; warnings: LintIssue[] };

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
      warnings: [],
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
  errors.push(...lintProjectToml(dir));
  const learnings = lintPlanLearnings(dir, artifacts);
  errors.push(...learnings.issues);

  errors.sort((a, b) => a.file.localeCompare(b.file) || a.field.localeCompare(b.field));
  return { ok: errors.length === 0, warnings: learnings.warnings, errors };
}

/** PLAN approved sem LEARNINGS.md no folder é um aviso (não erro); PLAN draft não exige. */
function lintPlanLearnings(root: string, artifacts: Artifact[]): { issues: LintIssue[]; warnings: LintIssue[] } {
  const warnings: LintIssue[] = [];
  const issues: LintIssue[] = [];
  for (const a of artifacts) {
    if (a.type !== "plan" || a.frontmatter.status !== "approved") continue;
    const learningsRel = join(dirname(a.file), "LEARNINGS.md");
    const learningsAbs = join(root, learningsRel);
    if (!existsSync(learningsAbs)) {
      const warning = { file: a.file, field: "learnings", message: `approved sem LEARNINGS.md (esperado: ${learningsRel})` };
      // Aviso vai para stderr aqui: o CLI imprime só os erros (TASK-02 deixa o
      // exit 0; o texto tem de citar LEARNINGS.md mesmo no caminho "OK").
      console.error(`aviso: ${warning.file}: learnings: ${warning.message}`);
      warnings.push(warning);
      continue;
    }
    // LEARNINGS.md presente: formato validado como erro (doc 06 §2).
    issues.push(...lintLearnings(learningsAbs));
  }
  return { issues, warnings };
}
