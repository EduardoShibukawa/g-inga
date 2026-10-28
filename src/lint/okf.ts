import { mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { dirname as posixDir, relative as posixRel } from "node:path/posix";

import type { Frontmatter } from "../bundle/read.ts";
import { lintBundle, type LintResult } from "./index.ts";
import { stringList } from "./relations.ts";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/;

export type ExportResult = LintResult & { exported: number };

function scalar(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
}

function walk(root: string, dir = root): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === "node_modules" || name === ".git") continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...walk(root, abs));
    else out.push(abs.slice(root.length).replace(/^\//, ""));
  }
  return out;
}

function planFolderOf(file: string): string | undefined {
  return /^plans\/([^/]+)\//.exec(file)?.[1];
}

/** `type` inferido por convenção de nome quando o frontmatter não declara. */
function inferType(file: string): string {
  if (basename(file) === "index.md") return "index";
  if (basename(file) === "log.md") return "log";
  return "note";
}

type Rel = { field: string; id: string; target: string };

/** Relações estruturais do frontmatter que viram links markdown do OKF. */
function relations(file: string, fm: Frontmatter): Rel[] {
  const rels: Rel[] = [];
  const link = (field: string, dir: string, id: string) =>
    rels.push({ field, id, target: `${dir}/${id}.md` });

  const type = scalar(fm.type);
  if (type === "spec") {
    const intent = scalar(fm.intent);
    if (intent) link("intent", "intents", intent);
  } else if (type === "plan") {
    const intent = scalar(fm.intent);
    if (intent) link("intent", "intents", intent);
    const spec = scalar(fm.spec);
    if (spec) link("spec", "specs", spec);
  } else if (type === "task") {
    const folder = planFolderOf(file);
    const plan = scalar(fm.plan);
    if (plan) rels.push({ field: "plan", id: plan, target: `plans/${plan}/PLAN.md` });
    for (const dep of stringList(fm.depends_on)) {
      if (folder) rels.push({ field: "depends_on", id: dep, target: `plans/${folder}/${dep}.md` });
    }
  }
  return rels;
}

/** Corpo com apêndice `## Relações` (só quando há relações). */
function withRelations(file: string, fm: Frontmatter, body: string): string {
  const lines: string[] = [];
  for (const rel of relations(file, fm)) {
    const path = posixRel(posixDir(file), rel.target);
    lines.push(`- ${rel.field}: [${rel.id}](${path})`);
  }
  if (lines.length === 0) return body;
  const base = body.endsWith("\n") ? body : `${body}\n`;
  return `${base}\n## Relações\n\n${lines.join("\n")}\n`;
}

/** Frontmatter exportado: `type` garantido, `okf: "0.1"` no index raiz, resto preservado. */
function importFm(file: string, fm: Frontmatter): Frontmatter {
  const type = scalar(fm.type) ?? inferType(file);
  const out: Frontmatter = { ...fm, type };
  if (file === "index.md") out.okf = scalar(fm.okf) ?? "0.1";
  return out;
}

function exportText(file: string, fm: Frontmatter, body: string): string {
  const merged = importFm(file, fm);
  const yaml = Bun.YAML.stringify(merged).trimEnd();
  return `---\n${yaml}\n---\n${withRelations(file, merged, body)}`;
}

/** realpath de `p` resolvendo os ancestrais que existem (destino pode ainda não existir). */
function realPath(p: string): string {
  let current = resolve(p);
  const rest: string[] = [];
  for (;;) {
    try {
      return `${realpathSync(current)}${rest.map((r) => `/${r}`).join("")}`;
    } catch {
      rest.unshift(basename(current));
      const parent = dirname(current);
      if (parent === current) return current;
      current = parent;
    }
  }
}

/** Valida o bundle e, se passar, escreve uma cópia OKF v0.1 em `out`. */
export function exportOkf(dir: string, out: string): ExportResult {
  const target = realPath(out);
  const bundle = realPath(dir);
  if (target === bundle || target.startsWith(`${bundle}/`)) {
    return {
      ok: false,
      errors: [
        { file: dir, field: "bundle", message: `saída do export igual ou dentro do bundle: ${out}` },
      ],
      exported: 0,
    };
  }

  const lint = lintBundle(dir);
  if (!lint.ok) return { ...lint, exported: 0 };

  let files: string[];
  try {
    files = walk(dir);
  } catch (e) {
    return { ok: false, errors: [{ file: dir, field: "bundle", message: `não consegui ler: ${(e as Error).message}` }], exported: 0 };
  }

  mkdirSync(out, { recursive: true });
  let exported = 0;
  for (const file of files) {
    const dst = join(out, file);
    mkdirSync(dirname(dst), { recursive: true });
    const raw = readFileSync(join(dir, file), "utf8");
    if (!file.endsWith(".md")) {
      writeFileSync(dst, raw);
      exported++;
      continue;
    }
    const match = raw.match(FRONTMATTER);
    const fm = (match ? Bun.YAML.parse(match[1] ?? "") : null) as Frontmatter | null;
    const body = match ? match[2] ?? "" : raw;
    writeFileSync(dst, exportText(file, fm ?? {}, body));
    exported++;
  }
  return { ...lint, exported };
}
