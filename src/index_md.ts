import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
try { (global as any).mkdirSync = (global as any).mkdirSync || mkdirSync; } catch {}
import { basename, join } from "node:path";
import type { Database } from "bun:sqlite";
import { deriveBoard, type Board } from "./board";
import { openStateDb, resolveStateDbPath } from "./state/db";

const DEFAULT_TEMPLATE = `---
okf: "0.1"
---
# Bundle do workspace

> gerado por ginga

## Pronto para pegar

<!-- ginga:board:pronto -->

## Esperando o dono

<!-- ginga:board:esperando -->

## Em andamento

<!-- ginga:board:em_andamento -->

## Concluído

<!-- ginga:board:concluido -->

## Backlog (INTENTs sem PLAN)

<!-- ginga:board:backlog -->
`;

function renderSection(title: string, items: Array<{ id: string; title?: string }>, includeHeading = true): string {
  const lines: string[] = [];
  if (includeHeading) lines.push(`## ${title}`, "");
  if (items.length === 0) {
    lines.push("(nenhum)");
  } else {
    for (const it of items) {
      lines.push(`- [${it.id}] ${it.title ?? it.id}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function replaceSection(out: string, marker: string, title: string, items: Array<{ id: string; title?: string }>): string {
  const markerAt = out.indexOf(marker);
  if (markerAt < 0) return out;
  const previousLine = out
    .slice(0, markerAt)
    .split("\n")
    .map((line) => line.trim())
    .reverse()
    .find((line) => line !== "") ?? "";
  const hasHeading = previousLine.startsWith("## ");
  return out.replace(marker, () => renderSection(title, items, !hasHeading));
}

function resolveBundleRoot(root: string): string {
  return basename(root) === ".ginga" ? root : join(root, ".ginga");
}

function findTemplatePath(root: string, bundleRoot: string): string | null {
  const bundleTemplate = join(bundleRoot, "index.template.md");
  if (existsSync(bundleTemplate)) return bundleTemplate;
  const legacyTemplate = join(root, "index.template.md");
  if (bundleRoot !== root && existsSync(legacyTemplate)) return legacyTemplate;
  return null;
}

export function renderIndex(b: Board, template: string, now: Date = new Date()): string {
  let out = template;
  if (!out.trimStart().startsWith("---")) {
    out = `---\nokf: "0.1"\n---\n\n> gerado por ginga\n\n` + out;
  }
  if (!out.includes("> gerado por ginga")) {
    out = out.replace(/^(---[\s\S]*?---\n+)/, `$1\n> gerado por ginga\n\n`);
  }

  const pronto: any[] = [];
  try {
    if (b.columns?.PLAN) {
      pronto.push(...b.columns.PLAN.filter((c: any) => c.status === "approved" && (c.tasks?.pass ?? 0) === 0 && (c.tasks?.total ?? 0) > 0));
      pronto.push(...b.columns.PLAN.filter((c: any) => c.status === "draft"));
    }
  } catch {}
  const esperando = (b.inbox || []).map((i: any) => ({ id: i.id, title: i.title ?? i.entity ?? i.id }));
  const emAndamento: any[] = [];
  try {
    if (b.columns?.EXECUTANDO) emAndamento.push(...b.columns.EXECUTANDO);
    if (b.columns?.VERIFICANDO) emAndamento.push(...b.columns.VERIFICANDO);
    if (b.columns?.PLAN) emAndamento.push(...b.columns.PLAN.filter((c: any) => (c.tasks?.running ?? 0) > 0 || ((c.tasks?.pass ?? 0) > 0 && (c.tasks?.pass ?? 0) < (c.tasks?.total ?? 1))));
  } catch {}
  const concluido = b.columns?.FEITO || [];
  const backlog = b.columns?.INTENT || [];

  out = replaceSection(out, "<!-- ginga:board:pronto -->", "Pronto para pegar", pronto);
  out = replaceSection(out, "<!-- ginga:board:esperando -->", "Esperando o dono", esperando);
  out = replaceSection(out, "<!-- ginga:board:em_andamento -->", "Em andamento", emAndamento);
  out = replaceSection(out, "<!-- ginga:board:concluido -->", "Concluído", concluido);
  out = replaceSection(out, "<!-- ginga:board:backlog -->", "Backlog (INTENTs sem PLAN)", backlog);

  return out;
}

export function writeIndex(root: string, db: Database): { changed: boolean } {
  const bundleRoot = resolveBundleRoot(root);
  const templatePath = findTemplatePath(root, bundleRoot);
  const outPath = join(bundleRoot, "index.md");
  let template: string;
  if (templatePath) {
    template = readFileSync(templatePath, "utf8");
  } else {
    template = DEFAULT_TEMPLATE;
  }
  const board = deriveBoard(bundleRoot, db);
  const rendered = renderIndex(board, template, new Date());
  const prev = existsSync(outPath) ? readFileSync(outPath, "utf8") : null;
  if (prev === rendered) {
    return { changed: false };
  }
  mkdirSync(bundleRoot, { recursive: true });
  writeFileSync(outPath, rendered);
  return { changed: true };
}

export function checkIndex(root: string): boolean {
  const bundleRoot = resolveBundleRoot(root);
  const templatePath = findTemplatePath(root, bundleRoot);
  const outPath = join(bundleRoot, "index.md");
  if (!existsSync(outPath)) return false;
  let template: string;
  if (templatePath) {
    template = readFileSync(templatePath, "utf8");
  } else {
    template = DEFAULT_TEMPLATE;
  }
  const envDbPath = process.env.GINGA_STATE_DB;
  const dbPath = envDbPath && envDbPath !== ""
    ? envDbPath
    : root === bundleRoot
      ? join(bundleRoot, "state", "state.db")
      : resolveStateDbPath(root);
  const db = openStateDb(dbPath);
  try {
    const board = deriveBoard(bundleRoot, db);
    const rendered = renderIndex(board, template, new Date());
    const cur = readFileSync(outPath, "utf8");
    return cur === rendered;
  } finally {
    db.close();
  }
}
