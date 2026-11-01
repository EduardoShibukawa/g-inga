// Lessons curadas (doc 06 §5): `ginga learning promote PLAN-NNNN#L-NN` copia um
// learning do LEARNINGS.md de um PLAN para `knowledge/lessons/LESSON-NNNN-slug.md`
// (frontmatter `type: lesson` com scope e evidence) e marca o learning original
// como `· promovida`. A promoção é ato explícito (só pelo verbo) — nunca automática.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Uma lição curada em `knowledge/lessons/`. */
export type Lesson = {
  id: string; // LESSON-0001
  title: string;
  path: string; // caminho absoluto do arquivo .md
  from: string; // PLAN-NNNN#L-NN
  status: string; // confirmada | descartada | fato | armadilha
  scope: { repo: string; files: string[]; symbols: string[]; tags: string[] };
  evidence: string;
};

type LearningEntry = {
  id: string; // L-02
  status: string;
  promoted: boolean;
  hypothesis: string;
  evidence: string;
  conclusion: string;
  scope: string;
  headingIndex: number; // índice da linha `## L-NN ...` no LEARNINGS.md
};

const REF_RE = /^(PLAN-\d{4})#(L-\d+)$/i;
const HEADING_RE = /^## (L-\d+) · (.+?)\s*$/;
const FIELD_RE = /^- (hipótese|evidência|conclusão|escopo):\s*(.*)$/;

function readSafe(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** Diretório `plans/PLAN-NNNN-...` que contém o PLAN.md do PLAN pedido. */
function findPlanDir(root: string, planId: string): string | null {
  const plansDir = join(root, "plans");
  if (!existsSync(plansDir)) return null;
  for (const entry of readdirSync(plansDir).sort()) {
    if (!entry.startsWith(`${planId}-`)) continue;
    const dir = join(plansDir, entry);
    if (existsSync(join(dir, "PLAN.md"))) return dir;
  }
  return null;
}

/** `repo` do PLAN (frontmatter `repos: [ginga]`); vazio se não declarado. */
function planRepo(planDir: string): string {
  const m = readSafe(join(planDir, "PLAN.md")).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return "";
  try {
    const fm = Bun.YAML.parse(m[1] ?? "") as Record<string, unknown>;
    const repos = fm.repos;
    if (Array.isArray(repos) && typeof repos[0] === "string") return repos[0];
    if (typeof repos === "string" && repos.trim() !== "") return repos.trim();
  } catch {
    // frontmatter ilegível: segue sem repo
  }
  return "";
}

/** Entradas do LEARNINGS.md (doc 06 §2), com índice do cabeçalho de cada uma. */
function parseLearnings(text: string): LearningEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: LearningEntry[] = [];
  let cur: LearningEntry | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const h = line.match(HEADING_RE);
    if (h) {
      const rest = (h[2] ?? "").split(" · ").map((s) => s.trim()).filter(Boolean);
      const dateIdx = rest.findIndex((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
      const head = dateIdx > 0 ? rest.slice(0, dateIdx) : rest;
      cur = {
        id: h[1]!.toUpperCase(),
        status: head[0] ?? "",
        promoted: head.includes("promovida"),
        hypothesis: "",
        evidence: "",
        conclusion: "",
        scope: "",
        headingIndex: i,
      };
      entries.push(cur);
      continue;
    }
    if (!cur) continue;
    const f = line.match(FIELD_RE);
    if (!f) continue;
    const value = (f[2] ?? "").trim();
    if (f[1] === "hipótese") cur.hypothesis = value;
    else if (f[1] === "evidência") cur.evidence = value;
    else if (f[1] === "conclusão") cur.conclusion = value;
    else cur.scope = value;
  }
  return entries;
}

/** Busca lições pelo prefixo/glob de scope.files e filtro de repo.
 *  Retorna array de { id, title, path, why } onde `why` é o trecho do match.
 *  Sem busca semântica/LLM: match por prefixo/glob de scope.files do learning.
 *  Repo diferente não traz a lesson.
 */
export function findLessons(root: string, filePaths: string[], repo?: string): (Lesson & { why: string })[] {
  const lessonsDir = join(root, "knowledge", "lessons");
  if (!existsSync(lessonsDir)) return [];

  const lessons = readdirSync(lessonsDir).filter((f) => /^LESSON-\d+.*\.md$/.test(f));

  const result: (Lesson & { why: string })[] = [];

  // Função simples de match de glob: converte "pattern" para comparação de prefixo
  function globMatch(pattern: string, str: string): boolean {
    // Se o pattern termina com "/", faz match de prefixo de diretório
    if (pattern.endsWith("/")) {
      const prefix = pattern.slice(0, -1);
      return str.startsWith(prefix + "/") || str === prefix;
    }
    // Converte pattern para regex simples: * vira .* e ? vira .
    const regexStr = "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$";
    return new RegExp(regexStr).test(str);
  }

  for (const lessonFile of lessons) {
    const content = readSafe(join(lessonsDir, lessonFile));
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;
    const fm = Bun.YAML.parse(fmMatch[1]) as {
      title?: string;
      scope?: { repo: string; files: string[]; symbols: string[]; tags: string[] };
    };
    const lessonScope = fm.scope;

    // Filtro de repo
    if (repo) {
      if (lessonScope?.repo && lessonScope.repo !== repo) continue;
      if (!lessonScope?.repo) continue; // só considera se o learning tem repo e o filtro pediu repo
    }

    // Filtro de scope.files
    if (lessonScope?.files) {
      for (const pattern of lessonScope.files) {
        let matched = false;
        for (const fp of filePaths) {
          if (globMatch(pattern, fp)) {
            matched = true;
            break;
          }
        }
        if (matched) {
          // Extrair o "why" do evidence do learning
          const whyMatch = content.match(/evidence:\s*(.+)/i);
          const why = whyMatch ? whyMatch[1].trim() : "match por scope.files";
          const lessonIdMatch = lessonFile.match(/^LESSON-\d+/);
          const lessonId = lessonIdMatch ? lessonIdMatch[0] : lessonFile.replace(/\.md$/, "");
          result.push({
            id: lessonId,
            title: typeof fm.title === "string" ? fm.title : "",
            path: join("knowledge", "lessons", lessonFile),
            why,
          });
          break; // só precisa de um match por learning (para esse pattern)
        }
      }
    }
  }
  return result;
}

/** Próximo número LESSON-NNNN pelo máximo existente em knowledge/lessons/. */
function nextLessonNumber(lessonsDir: string): number {
  let next = 1;
  if (existsSync(lessonsDir)) {
    for (const entry of readdirSync(lessonsDir)) {
      const m = /^LESSON-(\d+)-/.exec(entry);
      if (m) next = Math.max(next, Number(m[1]) + 1);
    }
  }
  return next;
}

function slugify(text: string): string {
  const slug = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug !== "" ? slug : "licao";
}

function yamlScalar(value: string): string {
  // Valor simples (sem quebrar linha); aspas só quando pode confundir o YAML.
  if (value === "" || /[:#\[\]{}&*!|>'"%@`]/.test(value) || /^\s|\s$/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function yamlList(items: string[]): string {
  if (items.length === 0) return "[]";
  return `[${items.map((i) => yamlScalar(i)).join(", ")}]`;
}

/**
 * Promove `ref` (PLAN-NNNN#L-NN) para `knowledge/lessons/LESSON-NNNN-<slug>.md`
 * e marca o learning no LEARNINGS.md como `· promovida`. Lança erro se o PLAN
 * ou o learning não existirem, ou se já estiver promovida.
 */
export function promote(root: string, ref: string): Lesson {
  const m = REF_RE.exec(ref.trim());
  if (!m) throw new Error(`learning promote: ref inválida: ${JSON.stringify(ref)} (uso: PLAN-NNNN#L-NN)`);
  const planId = m[1]!.toUpperCase();
  const learningId = m[2]!.toUpperCase();

  const planDir = findPlanDir(root, planId);
  if (!planDir) throw new Error(`learning promote: PLAN não encontrado: ${planId}`);

  const learningsPath = join(planDir, "LEARNINGS.md");
  const raw = readSafe(learningsPath);
  if (!raw) throw new Error(`learning promote: LEARNINGS.md não encontrado em ${planDir}`);
  const entries = parseLearnings(raw);
  const entry = entries.find((e) => e.id === learningId);
  if (!entry) throw new Error(`learning promote: learning não encontrado: ${planId}#${learningId}`);
  if (entry.promoted) throw new Error(`learning promote: ${planId}#${learningId} já está promovida`);

  const lessonsDir = join(root, "knowledge", "lessons");
  mkdirSync(lessonsDir, { recursive: true });
  const id = `LESSON-${String(nextLessonNumber(lessonsDir)).padStart(4, "0")}`;

  const title = entry.conclusion || entry.evidence || `${entry.status} ${learningId}`;
  const repo = planRepo(planDir);
  const files = entry.scope.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  const scope = { repo, files, symbols: [] as string[], tags: [entry.status].filter(Boolean) };

  const slug = slugify(entry.conclusion || entry.evidence || learningId);
  const fullPath = join(lessonsDir, `${id}-${slug}.md`);
  const path = fullPath;

  const fm: string[] = [
    "type: lesson",
    `title: ${yamlScalar(title)}`,
    `from: ${planId}#${learningId}`,
    `status: ${yamlScalar(entry.status)}`,
    "scope:",
    `  repo: ${yamlScalar(repo)}`,
    `  files: ${yamlList(files)}`,
    `  symbols: ${yamlList(scope.symbols)}`,
    `  tags: ${yamlList(scope.tags)}`,
    `evidence: ${yamlScalar(entry.evidence)}`,
  ];
  const body: string[] = [
    `---`,
    ...fm,
    `---`,
    `# ${id} — ${title}`,
    ``,
    `- from: ${planId}#${learningId} (${entry.status})`,
  ];
  if (entry.hypothesis) body.push(`- hipótese: ${entry.hypothesis}`);
  if (entry.evidence) body.push(`- evidência: ${entry.evidence}`);
  if (entry.conclusion) body.push(`- conclusão: ${entry.conclusion}`);
  if (entry.scope) body.push(`- escopo: ${entry.scope}`);
  body.push("");
  writeFileSync(fullPath, body.join("\n"), "utf8");

  // Marca o learning original como promovida no cabeçalho (`· promovida`).
  const lines = raw.split(/\r?\n/);
  const heading = lines[entry.headingIndex] ?? "";
  lines[entry.headingIndex] = heading.replace(/^(## L-\d+ · [^·]+?) · /, "$1 · promovida · ");
  writeFileSync(learningsPath, lines.join("\n"), "utf8");

  return {
    id,
    title,
    path: fullPath.replace(root + "/", ""),
    from: `${planId}#${learningId}`,
    status: entry.status,
    scope,
    evidence: entry.evidence,
  };
}
