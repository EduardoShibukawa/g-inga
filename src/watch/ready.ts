// Varredura de ready/ do vigia (PLAN-0025 TASK-02, follow-up 10 do PLAN-0023).
// stale_ready: ready cuja branch não tem commits além da main → move para ready/done + info.
// ready_writer: ready com branch à frente mas sem by/at válidos → warn (arquivo fica).

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Alert } from "./evaluate.ts";

function gitAheadOfMain(repoDir: string, branch: string): number | null {
  // rev-list --count main..<branch>: null = branch (ou main) não resolvível → tratar como sem commits.
  const r = Bun.spawnSync(["git", "-C", repoDir, "rev-list", "--count", `main..${branch}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (r.exitCode !== 0) return null;
  const n = Number(r.stdout.toString().trim());
  return Number.isFinite(n) ? n : null;
}

function stamp(now: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

function hasValidWriter(doc: any): boolean {
  const by = doc?.by;
  if (!by || typeof by !== "object" || Array.isArray(by)) return false;
  if (typeof by.pid !== "number" || !Number.isFinite(by.pid)) return false;
  if (typeof by.cmd !== "string" || by.cmd === "") return false;
  if (typeof doc.at !== "string" || !Number.isFinite(Date.parse(doc.at))) return false;
  return true;
}

export function sweepReady(root: string): Alert[] {
  const alerts: Alert[] = [];
  const plansDir = join(root, ".ginga", "plans");
  if (!existsSync(plansDir)) return alerts;
  for (const plan of readdirSync(plansDir)) {
    const readyDir = join(plansDir, plan, "ready");
    let entries: string[];
    try {
      if (!statSync(readyDir).isDirectory()) continue;
      entries = readdirSync(readyDir);
    } catch {
      continue;
    }
    for (const file of entries) {
      if (!file.endsWith(".json")) continue;
      const path = join(readyDir, file);
      let st;
      try {
        st = statSync(path);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      const repo = file.slice(0, -".json".length);
      const repoDir = join(root, repo);
      if (!existsSync(repoDir)) continue; // repo inexistente: ignora
      let doc: any;
      try {
        doc = JSON.parse(readFileSync(path, "utf8"));
      } catch {
        continue; // JSON inválido: ignora
      }
      const entity = `${plan}/${repo}`;
      const branch = typeof doc?.branch === "string" && doc.branch !== "" ? doc.branch : null;
      const ahead = branch === null ? null : gitAheadOfMain(repoDir, branch);
      if (ahead === null || ahead === 0) {
        // stale_ready: sem commits além da main (ou branch inexistente) → ready/done.
        const doneDir = join(readyDir, "done");
        try {
          mkdirSync(doneDir, { recursive: true });
          renameSync(path, join(doneDir, `${repo}-${stamp(new Date())}.json`));
        } catch {
          continue;
        }
        alerts.push({
          rule_id: "stale_ready",
          severity: "info",
          entity,
          summary: "ready sem commits além da main — movido para ready/done",
          dedupe_key: `stale_ready:${entity}`,
          actions: ["move_to_done"],
        });
        continue;
      }
      if (!hasValidWriter(doc)) {
        // ready_writer: branch à frente, mas ready não parece ter sido gravado pelo writer.
        alerts.push({
          rule_id: "ready_writer",
          severity: "warn",
          entity,
          summary: "ready sem by/at válidos de writer",
          dedupe_key: `ready_writer:${entity}`,
          actions: ["alert"],
        });
      }
    }
  }
  return alerts;
}
