// lessons import: converte LESSONS.md (formato livre da raiz) e LESSONS-PROPOSED.md
// (cabeçalho `# LESSONS-PROPOSED — pinga learn propose v1`) em LESSON-*.md.
// Cada entrada vira uma LESSON; idempotente por hash do texto da entrada.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { createHash } from "node:crypto";

const PROPOSALS_MARKER = "# LESSONS-PROPOSED";
const LESSON_BULLET_RE = /^- \*\*L-\d+/;

function yamlScalar(value: string): string {
  if (value === "" || /[:#\[\]{}&*!|>'"%@`]/.test(value) || /^\s|\s$/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
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

/** Hash sha256 (curto) do texto da entrada para idempotência. */
function entryHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** Extrai entradas de um LESSONS.md ou LESSONS-PROPOSED.md.
 *  - PROPOSED (cabeçalho `# LESSONS-PROPOSED`): cada `## ...` é uma entrada.
 *  - LESSONS.md (formato livre): cada `- **L-N ...` é uma entrada.
 */
function parseEntries(fileContent: string): { title: string; text: string }[] {
  const lines = fileContent.split(/\r?\n/);
  const isProposed = lines[0]?.startsWith(PROPOSALS_MARKER) ?? false;
  const entries: { title: string; text: string }[] = [];

  if (isProposed) {
    const headingRe = /^## .+/;
    for (let i = 0; i < lines.length; i++) {
      if (headingRe.test(lines[i]!)) {
        let end = i + 1;
        while (end < lines.length && !headingRe.test(lines[end]!)) end++;
        entries.push({
          title: lines[i]!.replace(/^## /, "").trim(),
          text: lines.slice(i, end).join("\n"),
        });
      }
    }
  } else {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (LESSON_BULLET_RE.test(line)) {
        let end = i + 1;
        while (end < lines.length && !LESSON_BULLET_RE.test(lines[end]!) && !/^## /.test(lines[end]!)) end++;
        entries.push({
          title: line.replace(/^- /, "").trim(),
          text: lines.slice(i, end).join("\n"),
        });
      }
    }
  }
  return entries;
}

/** Parseia um arquivo LESSONS.md (ou .PROPOSED) e cria lições em `knowledge/lessons/`.
 *  Cada entrada vira uma LESSON-*.md.
 *  Idempotente: se o mesmo arquivo for importado novamente, cria [] e skipped=N.
 *  Os arquivos de origem não são apagados nem editados.
 */
export function importLessons(root: string, file: string): { created: string[]; skipped: number } {
  const lessonsDir = join(root, "knowledge", "lessons");
  mkdirSync(lessonsDir, { recursive: true });

  const fileContent = readFileSync(file, "utf8");
  const fileBasename = basename(file);
  const entries = parseEntries(fileContent);

  if (entries.length === 0) return { created: [], skipped: 0 };

  const entryHashes = entries.map((e) => entryHash(e.text));

  // Varre LESSON-*.md existentes: coleta hashes já importados e o próximo número.
  const existingFiles = readdirSync(lessonsDir).filter((f) => /^LESSON-\d+.*\.md$/.test(f));
  const existingHashes: Set<string> = new Set();
  let maxNum = 0;
  for (const f of existingFiles) {
    const content = readFileSync(join(lessonsDir, f), "utf8");
    const pm = content.match(/^---\n([\s\S]*?)\n---/);
    if (pm) {
      const fm = Bun.YAML.parse(pm[1]);
      const h = (fm as any)?.import_hash;
      if (h) existingHashes.add(h);
    }
    const m = /^LESSON-(\d+)/.exec(f);
    if (m) maxNum = Math.max(maxNum, Number(m[1]));
  }

  const created: string[] = [];
  let skipped = 0;
  let nextNum = maxNum + 1;

  for (let i = 0; i < entries.length; i++) {
    const h = entryHashes[i]!;
    if (existingHashes.has(h)) {
      skipped++;
      continue;
    }
    const num = String(nextNum).padStart(4, "0");
    const slug = slugify(entries[i]!.title);
    const filename = `LESSON-${num}-${slug}.md`;
    const fullPath = join(lessonsDir, filename);
    const relPath = relative(root, fullPath);

    const fm: string[] = [
      "type: lesson",
      `title: ${yamlScalar(entries[i]!.title)}`,
      `from: import:${fileBasename}`,
      `import_hash: ${h}`,
      "scope:",
      "  repo: ginga",
      "  files: []",
    ];
    const body: string[] = [
      "---",
      ...fm,
      "---",
      `# LESSON-${num} — ${entries[i]!.title}`,
      "",
      `- from: import:${fileBasename}`,
      "",
    ];
    writeFileSync(fullPath, body.join("\n"), "utf8");
    created.push(relPath);
    nextNum++;
  }

  return { created, skipped };
}
