import { basename } from "node:path";

import type { Frontmatter } from "../bundle/read.ts";
import type { LintError } from "./frontmatter.ts";

/** Artefato tipado lido do bundle — entrada dos linters de relação e de DAG. */
export type Artifact = { file: string; type: string; frontmatter: Frontmatter };

/** Pasta do PLAN que contém o arquivo (`plans/<PLAN>/...`). */
export function planFolderOf(file: string): string | undefined {
  return /^plans\/([^/]+)\//.exec(file)?.[1];
}

/** ID do artefato: nome do arquivo sem `.md`; para PLAN, o nome da pasta. */
export function artifactId(type: string, file: string): string | undefined {
  if (type === "plan") return planFolderOf(file);
  if (!file.endsWith(".md")) return undefined;
  return basename(file, ".md");
}

/** Número sequencial embutido no ID de cada tipo (TASKs: dentro do PLAN). */
const NUMBER: Record<string, RegExp> = {
  intent: /^INTENT-(\d+)-/,
  spec: /^SPEC-(\d+)-/,
  plan: /^PLAN-(\d+)-/,
  task: /^TASK-(\d+)-/,
};

/** Erro de nome: arquivo com o prefixo do tipo, mas ID fora do padrão `TYPE-<NN>-slug`. */
function nameError(type: string, file: string, id: string): LintError {
  return { file, field: "id", message: `nome fora do padrão ${type.toUpperCase()}-<NN>-slug: ${id}` };
}

/** Checagem de nome de `TASK-*.md` sem depender do frontmatter: roda mesmo com entrada inválida. */
export function lintTaskName(file: string): LintError[] {
  const id = artifactId("task", file);
  if (id === undefined || NUMBER.task.test(id) || !basename(file).startsWith("TASK-")) return [];
  return [nameError("task", file, id)];
}

function scalar(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
}

/** Lista de strings tolerante a YAML (`[a, b]`, `a, b` ou ausente). */
export function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => scalar(v)).filter((v): v is string => v !== undefined);
  }
  const single = scalar(value);
  if (!single) return [];
  return single
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

type Numbered = { file: string; id: string; number: number };

/** IDs únicos e sequenciais (1..N) por tipo; TASKs são numeradas dentro do PLAN. */
function lintNumbering(type: string, artifacts: Artifact[], where?: string): LintError[] {
  const pattern = NUMBER[type];
  if (!pattern) return [];

  const items: Numbered[] = [];
  const errors: LintError[] = [];

  for (const artifact of artifacts) {
    const id = artifactId(type, artifact.file);
    if (!id) continue;
    const match = pattern.exec(id);
    if (!match) {
      // Arquivo com o prefixo do tipo no nome (ex.: `TASK-*.md`) fora do padrão `TYPE-<NN>-slug` é erro.
      if (basename(artifact.file).startsWith(`${type.toUpperCase()}-`)) {
        errors.push(nameError(type, artifact.file, id));
      }
      continue;
    }
    items.push({ file: artifact.file, id, number: Number(match[1]) });
  }

  const scope = where ? ` em ${where}` : "";
  const pad = (n: number) => String(n).padStart(4, "0");

  const groups = new Map<number, Numbered[]>();
  for (const item of items) {
    const group = groups.get(item.number) ?? [];
    group.push(item);
    groups.set(item.number, group);
  }

  for (const [number, group] of groups) {
    if (group.length < 2) continue;
    const ids = group.map((item) => item.id).join(", ");
    for (const item of group) {
      errors.push({ file: item.file, field: "id", message: `número ${pad(number)} duplicado${scope}: ${ids}` });
    }
  }

  const present = [...groups.keys()].sort((a, b) => a - b);
  const highest = present[present.length - 1];
  if (highest !== undefined) {
    const missing: number[] = [];
    for (let n = 1; n <= highest; n++) if (!groups.has(n)) missing.push(n);
    if (missing.length > 0) {
      const last = items.reduce((best, item) => (item.number > best.number ? item : best), items[0]!);
      errors.push({
        file: last.file,
        field: "id",
        message: `numeração não sequencial${scope}: faltam ${missing.map(pad).join(", ")}`,
      });
    }
  }

  return errors;
}

/** Relações estruturais: referências existentes, PLAN com TASK e numeração. */
export function lintRelations(artifacts: Artifact[]): LintError[] {
  const errors: LintError[] = [];
  const byType = (type: string) => artifacts.filter((artifact) => artifact.type === type);
  const idSet = (type: string) =>
    new Set(
      byType(type)
        .map((artifact) => artifactId(type, artifact.file))
        .filter((id): id is string => id !== undefined),
    );

  const intentIds = idSet("intent");
  const specIds = idSet("spec");
  const planIds = idSet("plan");

  const tasksByPlan = new Map<string, Artifact[]>();
  for (const artifact of byType("task")) {
    const folder = planFolderOf(artifact.file);
    if (!folder) continue;
    const list = tasksByPlan.get(folder) ?? [];
    list.push(artifact);
    tasksByPlan.set(folder, list);
  }
  const taskIdsIn = (folder: string) =>
    new Set(
      (tasksByPlan.get(folder) ?? [])
        .map((artifact) => artifactId("task", artifact.file))
        .filter((id): id is string => id !== undefined),
    );

  const missing = (file: string, field: string, id: string): LintError => ({
    file,
    field,
    message: `${field} inexistente: ${id}`,
  });

  for (const artifact of artifacts) {
    if (artifact.type === "spec") {
      const intent = scalar(artifact.frontmatter.intent);
      if (intent && !intentIds.has(intent)) errors.push(missing(artifact.file, "intent", intent));
    } else if (artifact.type === "plan") {
      const intent = scalar(artifact.frontmatter.intent);
      if (intent && !intentIds.has(intent)) errors.push(missing(artifact.file, "intent", intent));
      const spec = scalar(artifact.frontmatter.spec);
      if (spec && !specIds.has(spec)) errors.push(missing(artifact.file, "spec", spec));
    } else if (artifact.type === "task") {
      const folder = planFolderOf(artifact.file);
      const plan = scalar(artifact.frontmatter.plan);
      if (plan) {
        if (!planIds.has(plan)) errors.push(missing(artifact.file, "plan", plan));
        if (folder && plan !== folder) {
          errors.push({
            file: artifact.file,
            field: "plan",
            message: `plan ${plan} não é a pasta onde a TASK está (${folder})`,
          });
        }
      }
      const known = taskIdsIn(folder ?? "");
      for (const dep of stringList(artifact.frontmatter.depends_on)) {
        if (!known.has(dep)) errors.push(missing(artifact.file, "depends_on", dep));
      }
    }
  }

  for (const artifact of byType("plan")) {
    const folder = planFolderOf(artifact.file);
    if (!folder || (tasksByPlan.get(folder)?.length ?? 0) === 0) {
      errors.push({ file: artifact.file, field: "tasks", message: "PLAN sem nenhuma TASK" });
    }
  }

  for (const type of ["intent", "spec", "plan"] as const) {
    errors.push(...lintNumbering(type, byType(type)));
  }
  for (const [folder, tasks] of tasksByPlan) {
    errors.push(...lintNumbering("task", tasks, folder));
  }

  return errors;
}
