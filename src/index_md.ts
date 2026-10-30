import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

function renderSection(title: string, items: Array<{ id: string; title?: string }>): string {
  if (items.length === 0) return `## ${title}\n\n(nenhum)\n`;
  const lines = [`## ${title}`, ""];
  for (const it of items) {
    lines.push(`- [${it.id}] ${it.title ?? it.id}`);
  }
  lines.push("");
  return lines.join("\n");
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

  if (out.includes("<!-- ginga:board:pronto -->")) {
    out = out.replace("<!-- ginga:board:pronto -->", renderSection("Pronto para pegar", pronto));
  }
  if (out.includes("<!-- ginga:board:esperando -->")) {
    out = out.replace("<!-- ginga:board:esperando -->", renderSection("Esperando o dono", esperando));
  }
  if (out.includes("<!-- ginga:board:em_andamento -->")) {
    out = out.replace("<!-- ginga:board:em_andamento -->", renderSection("Em andamento", emAndamento));
  }
  if (out.includes("<!-- ginga:board:concluido -->")) {
    out = out.replace("<!-- ginga:board:concluido -->", renderSection("Concluído", concluido));
  }
  if (out.includes("<!-- ginga:board:backlog -->")) {
    out = out.replace("<!-- ginga:board:backlog -->", renderSection("Backlog (INTENTs sem PLAN)", backlog));
  }

  return out;
}

export function writeIndex(root: string, db: Database): { changed: boolean } {
  const templatePath = existsSync(join(root, ".ginga", "index.template.md")) ? join(root, ".ginga", "index.template.md") : existsSync(join(root, "index.template.md")) ? join(root, "index.template.md") : null;
  const outPath = join(root, ".ginga", "index.md");
  let template: string;
  if (templatePath) {
    template = readFileSync(templatePath, "utf8");
  } else {
    template = DEFAULT_TEMPLATE;
  }
  const board = deriveBoard(root, db);
  const rendered = renderIndex(board, template, new Date());
  const prev = existsSync(outPath) ? readFileSync(outPath, "utf8") : null;
  if (prev === rendered) {
    return { changed: false };
  }
  mkdirSync(join(root, ".ginga"), { recursive: true });
  writeFileSync(outPath, rendered);
  return { changed: true };
}

export function checkIndex(root: string): boolean {
  const templatePath = existsSync(join(root, ".ginga", "index.template.md")) ? join(root, ".ginga", "index.template.md") : existsSync(join(root, "index.template.md")) ? join(root, "index.template.md") : null;
  const outPath = join(root, ".ginga", "index.md");
  if (!existsSync(outPath)) return false;
  let template: string;
  if (templatePath) {
    template = readFileSync(templatePath, "utf8");
  } else {
    template = DEFAULT_TEMPLATE;
  }
  const db = openStateDb(resolveStateDbPath(root));
  try {
    const board = deriveBoard(root, db);
    const rendered = renderIndex(board, template, new Date());
    const cur = readFileSync(outPath, "utf8");
    return cur === rendered;
  } finally {
    db.close();
  }
}
