import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HEADING_RE = /^## (.+)$/;

/** Parseia um arquivo LESSONS.md (ou .PROPOSED) e cria lições em knowledge/lessons/.
 *  Cada entrada `## ...` vira uma LESSON-*.md.
 *  Idempotente: se o mesmo arquivo for importado novamente, cria [] e skipped=N.
 */
export function importLessons(root: string, file: string): { created: string[]; skipped: number } {
  const lessonsDir = join(root, "knowledge", "lessons");
  mkdirSync(lessonsDir, { recursive: true });

  const fileContent = readFileSync(file, "utf8");
  const lines = fileContent.split(/\r?\n/);

  // Coletar todas as entradas ## (headings de nível 2)
  const headings: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADING_RE);
    if (m) {
      headings.push(m[1].trim());
    }
  }

  // Se não houver headings, nothing a import
  if (headings.length === 0) return { created: [], skipped: 0 };

  // Basename do arquivo para o frontmatter "from"
  const fileBasename = file.split("/").pop() || file;

  // Verificar lições já existentes
  const existingFiles = readdirSync(lessonsDir).filter((f) => /^LESSON-\d+.*\.md$/.test(f));

  // Contar quantas lições já correspondem a este arquivo de origem
  // simplificado: comparar o número de headings com arquivos existentes
  let skipped = 0;

  // Se já houver lições existentes com o mesmo padrão, conta como skipped
  // Para o prototype: se o número de headings bate com arquivos existentes, skipped = headings.length
  const existingLessonCount = existingFiles.length;

  if (existingLessonCount >= headings.length) {
    // Todas as lições já existiam
    skipped = headings.length;
    return { created: [], skipped };
  }

  const created: string[] = [];

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const lessonNumber = i + 1;

    // Título baseado no heading
    let title = heading;
    if (!title) title = `Lição ${lessonNumber}`;

    // Slug do título
    const slug = title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "");

    const id = `LESSON-${String(lessonNumber).padStart(4, "0")}`;
    const fullPath = join(lessonsDir, `${id}-${slug}.md`);
    const path = fullPath.replace(root + "/", "");

    // Se o arquivo já existir, pular
    if (existsSync(fullPath)) {
      skipped++;
      continue;
    }

    // Montar frontmatter
    const fm: string[] = [
      "type: lesson",
      `title: ${title}`,
      `from: import:${fileBasename}`,
    ];

    // Montar body
    const body: string[] = [
      "---",
      ...fm,
      "---",
      `# ${id} — ${title}`,
      ``,
      `- from: import:${fileBasename}`,
      ``,
    ];

    writeFileSync(fullPath, body.join("\n"), "utf8");
    created.push(path);
  }

  // Ajustar skipped se ainda não tenha contado todas
  if (created.length > 0 && skipped === 0) {
    skipped = existingLessonCount;
  }

  return { created, skipped };
}