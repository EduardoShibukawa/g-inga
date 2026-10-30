// log.md automático (PLAN-0013 TASK-01): cada evento de um PLAN vira uma linha
// no log.md da pasta dele (doc 06 §2), no formato que as lanes já escrevem.
// Idempotência: por `ev.id` — a linha ganha a cauda `<!-- id -->`, que não
// interfere no texto (as lanes grep-pam o prefixo) e permite reprocessar o
// stream sem duplicar. Dois eventos com o mesmo texto mas ids diferentes são
// duas linhas legítimas (uma tentativa nova tem outro id).
// O gancho de integração vive em src/notify/router.ts (routeEvents), que deriva
// a raiz do bundle do caminho do state.db (PRAGMA database_list).

import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

type AnyEv = Record<string, any>;

const LOGGED_KINDS: readonly string[] = ["transition", "receipt", "answer", "handoff", "learning"];

function resumo(kind: string, d: AnyEv): string {
  if (kind === "transition") return `${d.entity ?? "?"} ${d.from ?? "?"} → ${d.to ?? "?"}`;
  if (kind === "receipt") return `${d.check ?? "?"} ${d.status ?? "?"}`;
  if (kind === "answer") return `blocker ${d.blocker_id ?? "?"}`;
  if (kind === "handoff") return `${d.trigger ?? "?"} tokens ${d.handoff_tokens ?? "?"}`;
  if (kind === "learning") return `${d.learning_id ?? "?"} ${d.status ?? "?"}`;
  return kind;
}

/** Linha do log para o evento; null = evento que não vai para o log. */
export function formatLogLine(ev: AnyEv): string | null {
  if (typeof ev !== "object" || ev === null) return null;
  const ts = typeof ev.ts === "string" ? ev.ts.slice(0, 10) : "";
  const kind = typeof ev.kind === "string" ? ev.kind : "";
  if (ts === "" || kind === "") return null;
  const d = (ev.data ?? {}) as AnyEv;
  if (kind === "attempt") {
    const task = typeof ev.task === "string" ? ev.task : "";
    const model = typeof d.model === "string" ? d.model : typeof d.runtime === "string" ? d.runtime : "";
    if (task === "" || model === "") return null;
    const n = typeof d.attempt_n === "number" ? d.attempt_n : 1;
    const verdict = d.passed === true ? "pass" : d.passed === false ? `fail${typeof d.failure === "string" && d.failure !== "" ? `: ${d.failure}` : ""}` : null;
    if (verdict === null) return null;
    return `${ts} ${task} ${model} tentativa ${n} ${verdict}`;
  }
  if (LOGGED_KINDS.includes(kind)) return `${ts} ${kind} ${resumo(kind, d)}`;
  return null;
}

function findPlanFolder(root: string, plan: unknown): string | null {
  if (typeof plan !== "string" || plan === "") return null;
  const plansDir = join(root, "plans");
  if (!existsSync(plansDir)) return null;
  for (const name of readdirSync(plansDir).sort()) {
    if (name === plan || name.startsWith(`${plan}-`)) {
      const folder = join(plansDir, name);
      if (existsSync(join(folder, "PLAN.md"))) return folder;
    }
  }
  return null;
}

/** Append da linha no log.md da pasta do PLAN (criado se não existir). Idempotente por ev.id. */
export function appendPlanLog(root: string, ev: AnyEv): { appended: boolean } {
  const line = formatLogLine(ev);
  const id = typeof ev?.id === "string" ? ev.id : "";
  if (line === null || id === "") return { appended: false };
  const folder = findPlanFolder(root, ev?.plan);
  if (folder === null) return { appended: false };
  const logPath = join(folder, "log.md");
  const marker = `<!-- ${id} -->`;
  try {
    if (existsSync(logPath) && readFileSync(logPath, "utf8").includes(marker)) return { appended: false };
  } catch {
    return { appended: false };
  }
  appendFileSync(logPath, `${line} ${marker}\n`);
  return { appended: true };
}
