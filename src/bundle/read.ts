import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

/** Mapa YAML do frontmatter de um arquivo do bundle. */
export type Frontmatter = Record<string, unknown>;

export type BundleEntry =
  | { file: string; ok: true; frontmatter: Frontmatter; body: string }
  | { file: string; ok: false; message: string };

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/;

/** Diretórios em que todo arquivo (fora dos gerados) carrega um artefato tipado. */
const ARTIFACT_DIRS = ["intents", "specs", "plans", "handoffs"] as const;

/** Arquivos que vivem dentro de um diretório de artefato sem serem artefatos. */
const UNTYPED = new Set(["log.md", "index.md", "LEARNINGS.md", "VERDICT.json"]);

function walk(root: string, dir = root): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === "node_modules" || name === ".git") continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...walk(root, abs));
    else if (name.endsWith(".md")) out.push(relative(root, abs).split(sep).join("/"));
  }
  return out;
}

/** Um arquivo em local de artefato precisa de frontmatter; log/index/LEARNINGS não. */
function expectsFrontmatter(file: string): boolean {
  if (UNTYPED.has(basename(file))) return false;
  const top = file.split("/")[0];
  if (!ARTIFACT_DIRS.includes(top as (typeof ARTIFACT_DIRS)[number])) return false;
  // knowledge/ é livre: lessons/decisions só são validados quando declaram type.
  return !file.startsWith("knowledge/");
}

/** Lê recursivamente os `.md` do bundle, separando frontmatter e corpo. */
export function readBundle(root: string): BundleEntry[] {
  const entries: BundleEntry[] = [];
  for (const file of walk(root)) {
    let raw: string;
    try {
      raw = readFileSync(join(root, file), "utf8");
    } catch (e) {
      entries.push({ file, ok: false, message: `não consegui ler: ${(e as Error).message}` });
      continue;
    }

    const match = raw.match(FRONTMATTER);
    if (!match) {
      if (expectsFrontmatter(file)) entries.push({ file, ok: false, message: "frontmatter ausente" });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = Bun.YAML.parse(match[1] ?? "");
    } catch (e) {
      entries.push({ file, ok: false, message: `YAML inválido: ${(e as Error).message}` });
      continue;
    }

    if (parsed === null || parsed === undefined) parsed = {};
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      entries.push({ file, ok: false, message: "frontmatter não é um mapa YAML" });
      continue;
    }

    entries.push({
      file,
      ok: true,
      frontmatter: parsed as Frontmatter,
      body: match[2] ?? "",
    });
  }
  return entries;
}
