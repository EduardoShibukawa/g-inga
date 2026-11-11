// Verbo `spec <id>` (T915, leitura): a SPEC como a tela "SPEC aberta" precisa
// — frontmatter, seções do arquivo, blockers abertos e respostas já dadas.
// Não escreve nada: aprovar, pedir mudança e responder são outros verbos.

import { readFileSync } from "node:fs";
import { findArtifact, fmGet } from "./write.ts";
import type { VerbArgs, VerbCtx } from "./registry.ts";

type Section = { title: string; body: string };

const OBJECTIVE = /^objetivo$/i;
const ACS = /^(acs?|crit[ée]rios de aceite)$/i;
// O verbo `answer` grava esta seção no arquivo; aqui as respostas já saem estruturadas.
const ANSWERS = /^respostas$/i;

function sections(raw: string): Section[] {
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, "");
  const out: Section[] = [];
  let current: { title: string; lines: string[] } | null = null;
  for (const line of body.split(/\r?\n/)) {
    const head = /^##\s+(.+?)\s*$/.exec(line);
    if (head) {
      if (current) out.push({ title: current.title, body: current.lines.join("\n").trim() });
      current = { title: head[1]!, lines: [] };
    } else if (current) current.lines.push(line);
  }
  if (current) out.push({ title: current.title, body: current.lines.join("\n").trim() });
  return out;
}

function acList(body: string): Array<{ id: string; text: string }> {
  const out: Array<{ id: string; text: string }> = [];
  for (const line of body.split("\n")) {
    const item = /^\s*(?:[-*]|\d+\.)\s+(?:\[[ xX]\]\s+)?(.+?)\s*$/.exec(line);
    if (!item) continue;
    const named = /^\**(AC-?\d+)\**\s*[:·—-]\s*(.+)$/i.exec(item[1]!);
    out.push(named ? { id: named[1]!.toUpperCase().replace(/^AC(\d)/, "AC-$1"), text: named[2]! } : { id: `AC-${out.length + 1}`, text: item[1]! });
  }
  return out;
}

function eventData(json: unknown): Record<string, any> {
  try {
    const parsed = JSON.parse(String(json));
    const data = parsed?.data ?? parsed;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export function spec(ctx: VerbCtx, args: VerbArgs): unknown {
  const art = findArtifact(ctx.root, args.id!);
  if (!art || art.kind !== "spec") throw new Error(`SPEC não encontrada: ${args.id!.trim().toUpperCase()}`);
  const raw = readFileSync(art.file, "utf8");
  const all = sections(raw);
  const objective = all.find((s) => OBJECTIVE.test(s.title))?.body ?? "";
  const acs = acList(all.find((s) => ACS.test(s.title))?.body ?? "");

  // Blockers desta SPEC: eventos `blocker` com plan = id; respondido = tem linha em `answers`.
  const answered = new Map<string, Record<string, any>>();
  try {
    for (const row of ctx.db.query('SELECT blocker_id, answer, "by", via, ts FROM answers ORDER BY ts').all() as Array<Record<string, any>>) {
      answered.set(String(row.blocker_id), row);
    }
  } catch {
    // tabela `answers` só existe depois da primeira resposta
  }
  const blockers: unknown[] = [];
  const answers: unknown[] = [];
  let rows: Array<Record<string, any>> = [];
  try {
    rows = ctx.db.query("SELECT json FROM events WHERE kind = 'blocker' AND plan = ? ORDER BY ts, id").all(art.id) as Array<Record<string, any>>;
  } catch {
    rows = [];
  }
  for (const row of rows) {
    const data = eventData(row.json);
    if (typeof data.blocker_id !== "string") continue;
    const question = typeof data.question === "string" ? data.question : data.blocker_id;
    const done = answered.get(data.blocker_id);
    if (done) {
      answers.push({ blocker_id: data.blocker_id, question, answer: done.answer, by: done.by, via: done.via ?? null, ts: done.ts ?? null });
    } else {
      blockers.push({
        id: data.blocker_id,
        question,
        raised_by: data.raised_by ?? null,
        ...(Array.isArray(data.options) ? { options: data.options.map(String) } : {}),
      });
    }
  }

  return {
    id: art.id,
    file: art.file.slice(ctx.root.length + 1),
    title: fmGet(raw, "title") ?? art.id,
    status: fmGet(raw, "status") ?? "draft",
    intent: fmGet(raw, "intent"),
    bench: fmGet(raw, "bench"),
    objective,
    acs,
    blockers,
    answers,
    sections: all.filter((s) => !OBJECTIVE.test(s.title) && !ACS.test(s.title) && !ANSWERS.test(s.title)),
  };
}
