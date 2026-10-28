import type { LintError } from "./frontmatter.ts";
import { artifactId, planFolderOf, stringList, type Artifact } from "./relations.ts";

type TaskNode = { id: string; file: string; deps: string[]; touch: string[] };

/** TASKs agrupadas por PLAN: `depends_on` e `touch` só valem dentro do PLAN. */
function tasksByPlan(artifacts: Artifact[]): Map<string, TaskNode[]> {
  const out = new Map<string, TaskNode[]>();
  for (const artifact of artifacts) {
    if (artifact.type !== "task") continue;
    const plan = planFolderOf(artifact.file);
    const id = artifactId("task", artifact.file);
    if (!plan || !id) continue;
    const list = out.get(plan) ?? [];
    list.push({
      id,
      file: artifact.file,
      deps: stringList(artifact.frontmatter.depends_on),
      touch: stringList(artifact.frontmatter.touch),
    });
    out.set(plan, list);
  }
  return out;
}

/** Adjacência TASK → dependências que existem de fato (as ausentes já são erro). */
function edgesOf(tasks: TaskNode[]): Map<string, string[]> {
  const ids = new Set(tasks.map((task) => task.id));
  const edges = new Map<string, string[]>();
  for (const task of tasks) edges.set(task.id, task.deps.filter((dep) => ids.has(dep)));
  return edges;
}

/** Ciclos em `depends_on`, por PLAN, com o caminho do ciclo na mensagem. */
function cycles(tasks: TaskNode[], edges: Map<string, string[]>): LintError[] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];
  const seen = new Set<string>();
  const errors: LintError[] = [];
  const fileOf = new Map(tasks.map((task) => [task.id, task.file]));

  const visit = (id: string) => {
    color.set(id, GRAY);
    stack.push(id);
    for (const dep of edges.get(id) ?? []) {
      const state = color.get(dep) ?? WHITE;
      if (state === GRAY) {
        const cycle = [...stack.slice(stack.indexOf(dep)), dep];
        const key = [...cycle].sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          errors.push({
            file: fileOf.get(dep)!,
            field: "depends_on",
            message: `ciclo em depends_on: ${cycle.join(" → ")}`,
          });
        }
      } else if (state === WHITE) {
        visit(dep);
      }
    }
    stack.pop();
    color.set(id, BLACK);
  };

  for (const task of tasks) if ((color.get(task.id) ?? WHITE) === WHITE) visit(task.id);
  return errors;
}

/** Tudo a que a TASK chega seguindo `depends_on` (memoizado por PLAN). */
function reachability(edges: Map<string, string[]>): (id: string) => Set<string> {
  const memo = new Map<string, Set<string>>();
  return (id: string) => {
    const cached = memo.get(id);
    if (cached) return cached;
    const reached = new Set<string>();
    const pending = [...(edges.get(id) ?? [])];
    while (pending.length > 0) {
      const next = pending.pop()!;
      if (reached.has(next)) continue;
      reached.add(next);
      pending.push(...(edges.get(next) ?? []));
    }
    memo.set(id, reached);
    return reached;
  };
}

/** Caminhos são iguais, ou um é prefixo de pasta do outro (`src/lint/` × `src/lint/x.ts`). */
function normalized(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

function overlaps(a: string, b: string): boolean {
  const left = normalized(a);
  const right = normalized(b);
  if (!left || !right) return false;
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

/** `touch` de TASKs sem caminho entre si no DAG não pode colidir. */
function touchConflicts(tasks: TaskNode[], edges: Map<string, string[]>): LintError[] {
  const reaches = reachability(edges);
  const errors: LintError[] = [];
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const a = tasks[i]!;
      const b = tasks[j]!;
      if (a.id === b.id) continue;
      // Serializadas (direta ou transitivamente): podem tocar o mesmo arquivo.
      if (reaches(a.id).has(b.id) || reaches(b.id).has(a.id)) continue;
      for (const pathA of a.touch) {
        for (const pathB of b.touch) {
          if (!overlaps(pathA, pathB)) continue;
          errors.push({
            file: a.file,
            field: "touch",
            message: `touch ${pathA} conflita com ${b.id} (${pathB}) sem dependência entre as TASKs`,
          });
        }
      }
    }
  }
  return errors;
}

/** DAG do PLAN: sem ciclo em `depends_on` e `touch` disjunto entre TASKs paralelas. */
export function lintDag(artifacts: Artifact[]): LintError[] {
  const errors: LintError[] = [];
  for (const tasks of tasksByPlan(artifacts).values()) {
    const edges = edgesOf(tasks);
    errors.push(...cycles(tasks, edges));
    errors.push(...touchConflicts(tasks, edges));
  }
  return errors;
}
