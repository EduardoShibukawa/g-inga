import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function readFileSafe(p: string): string {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function parseFrontmatter(text: string): Record<string, string> {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fm = m[1];
  const out: Record<string, string> = {};
  for (const line of fm.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) {
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      out[k] = v;
    }
  }
  return out;
}

function parseFrontmatterMultiline(text: string): Record<string, any> {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fm = m[1];
  const out: Record<string, any> = {};
  for (const line of fm.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) {
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      // try to parse array like [ginga]
      if (v.startsWith("[") && v.endsWith("]")) {
        const inner = v.slice(1, -1).trim();
        if (inner === "") out[k] = [];
        else out[k] = inner.split(",").map(s => s.trim().replace(/^["']|["']$/g, ""));
      } else {
        out[k] = v;
      }
    }
  }
  return out;
}

function extractSection(text: string, heading: string): string {
  const re = new RegExp(`## ${heading}[\\s\\S]*?(?=\\n## |$)`, "i");
  const m = text.match(re);
  if (!m) return "";
  return m[0].replace(new RegExp(`^## ${heading}\\s*\\n?`, "i"), "").trim();
}

function parseLearnings(content: string): string[] {
  const entries: { type: string; text: string }[] = [];
  const parts = content.split(/^## /m).slice(1);
  for (const part of parts) {
    const lines = part.split("\n");
    const header = lines[0] ?? "";
    const m = header.match(/·\s*([^·]+?)\s*·/);
    const type = m?.[1]?.trim().toLowerCase() ?? "";
    const text = `## ${part}`;
    entries.push({ type, text });
  }
  // descartada before armadilha before others (confirmada etc)
  const priority = (t: string) => {
    if (t.includes("descartada")) return 0;
    if (t.includes("armadilha")) return 1;
    return 2;
  };
  entries.sort((a, b) => priority(a.type) - priority(b.type));
  return entries.map(e => e.text);
}

function listTasks(planDir: string): string[] {
  if (!existsSync(planDir)) return [];
  const files = readdirSync(planDir).filter(f => /^TASK-.*\.md$/.test(f)).sort();
  return files;
}

function findPlans(root: string, filter?: (name: string, fm: Record<string, string>) => boolean): string[] {
  const plansDir = join(root, "plans");
  if (!existsSync(plansDir)) return [];
  const names = readdirSync(plansDir);
  const out: string[] = [];
  for (const n of names) {
    const p = join(plansDir, n, "PLAN.md");
    if (!existsSync(p)) continue;
    const fm = parseFrontmatter(readFileSafe(p));
    if (!filter || filter(n, fm)) out.push(n);
  }
  return out;
}

function parseQueueItem(item: any): { task: string; state: string; receiptStatus?: string } | null {
  if (!item) return null;
  const task = item.task || item.t || item.pinga_task || item.id || item.name;
  const state = item.state || item.status || item.phase || "";
  let receiptStatus: string | undefined;
  if (item.receipt) {
    if (typeof item.receipt === "string") receiptStatus = item.receipt;
    else if (typeof item.receipt === "object") receiptStatus = item.receipt.status || item.receipt.state;
  } else if (item.receipt_status) {
    receiptStatus = item.receipt_status;
  }
  if (!task) return null;
  return { task: String(task), state: String(state), receiptStatus };
}

function loadQueueForRepo(repoDir: string, queueOpt?: (repoDir: string) => any[] | Promise<any[]>): any[] {
  try {
    if (typeof queueOpt === "function") {
      const res = queueOpt(repoDir);
      if (Array.isArray(res)) return res;
      // if promise, try to not await in sync context? but tests pass sync function
      return [];
    }
    // default: try to spawn pinga queue --json --root <repoDir>
    if (!existsSync(repoDir)) return [];
    const proc = Bun.spawnSync(["pinga", "queue", "--json", "--root", repoDir], { cwd: repoDir });
    if (proc.exitCode !== 0) return [];
    const out = new TextDecoder().decode(proc.stdout || new Uint8Array());
    try {
      const parsed = JSON.parse(out);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.items)) return parsed.items;
      if (Array.isArray(parsed?.tasks)) return parsed.tasks;
      return [];
    } catch {
      return [];
    }
  } catch {
    return [];
  }
}

export function buildHandoff(root: string, opts: { plan?: string; now?: Date; git?: (args: string[], cwd: string) => string; queue?: (repoDir: string) => any[] } = {}) {
  const now = opts.now ?? new Date();
  const git = opts.git ?? (() => "");
  let planNames: string[] = [];
  if (opts.plan) {
    const plansDir = join(root, "plans");
    if (existsSync(plansDir)) {
      for (const name of readdirSync(plansDir)) {
        if (name === opts.plan || name.startsWith(opts.plan + "-") || name.startsWith(opts.plan)) {
          planNames.push(name);
        }
      }
    }
    if (planNames.length === 0) planNames = [opts.plan];
  } else {
    planNames = findPlans(root, (_, fm) => fm.status === "approved" && (fm.kind || fm.status));
  }
  const effectivePlans = planNames.length ? planNames : findPlans(root);

  const sections: string[] = [];
  let totalTokens = 0;

  for (const plan of effectivePlans) {
    const planDir = join(root, "plans", plan);
    const planPath = join(planDir, "PLAN.md");
    const planText = readFileSafe(planPath);
    const fm = parseFrontmatterMultiline(planText);
    const objetivo = extractSection(planText, "Objetivo");
    const tasksFiles = listTasks(planDir);
    const learningsPath = join(planDir, "LEARNINGS.md");
    const learningsContent = readFileSafe(learningsPath);
    const learnings = parseLearnings(learningsContent);

    // determine repos
    let repos: string[] = [];
    if (Array.isArray(fm.repos)) {
      repos = fm.repos;
    } else if (typeof fm.repos === "string" && fm.repos) {
      repos = [fm.repos];
    }
    if (repos.length === 0) repos = [""];

    // load queue info across repos (merge)
    const queueMap = new Map<string, { state: string; receiptStatus?: string }>();
    let hasQueue = false;
    for (const repo of repos) {
      const repoDir = repo ? join(root, repo) : root;
      const q = loadQueueForRepo(repoDir, opts.queue);
      if (Array.isArray(q) && q.length > 0) {
        hasQueue = true;
        for (const item of q) {
          const parsed = parseQueueItem(item);
          if (parsed) {
            // key by task number like T900
            queueMap.set(parsed.task, { state: parsed.state, receiptStatus: parsed.receiptStatus });
            // also try without T prefix
            const num = parsed.task.replace(/^T/i, "");
            if (num) queueMap.set(num, { state: parsed.state, receiptStatus: parsed.receiptStatus });
          }
        }
      }
    }

    // build git output using repos
    let gitSection = "";
    for (const repo of repos) {
      const repoDir = repo ? join(root, repo) : root;
      const status = git(["status", "--porcelain"], repoDir) || "";
      const diff = git(["diff", "--stat"], repoDir) || "";
      gitSection += `Status:\n${status}\nDiff:\n${diff}\n`;
    }

    let md = `## Plano ${plan}\n`;
    md += `\n### Objetivo\n${objetivo || ""}\n`;
    md += `\n### SPEC\n${fm.spec || ""}\n`;
    md += `\n### Blockers\n${extractSection(planText, "Blockers") || ""}\n`;
    md += `\n### Tasks\n`;
    // show each task with state
    for (const t of tasksFiles) {
      const tpath = join(planDir, t);
      const ttext = readFileSafe(tpath);
      const tfm = parseFrontmatter(ttext);
      const tnum = tfm.pinga_task || "";
      let stateStr = "";
      if (tnum) {
        // try to find in queue
        const qv = queueMap.get(String(tnum).replace(/^T/i, "")) || queueMap.get(String(tnum));
        if (qv) {
          stateStr = qv.receiptStatus ? `${qv.state}/${qv.receiptStatus}` : qv.state;
        }
      }
      if (stateStr) {
        md += `- ${t} (${tnum}) — ${stateStr}\n`;
      } else {
        md += `- ${t}\n`;
      }
    }
    md += `\n### Próxima TASK aberta\n`;
    if (!hasQueue) {
      md += "sem fila\n";
    } else {
      // find first task (order of files) whose state is not done/superseded
      let found: string | null = null;
      for (const t of tasksFiles) {
        const tpath = join(planDir, t);
        const ttext = readFileSafe(tpath);
        const tfm = parseFrontmatter(ttext);
        const tnum = tfm.pinga_task || "";
        const qv = tnum ? (queueMap.get(String(tnum).replace(/^T/i, "")) || queueMap.get(String(tnum))) : null;
        const st = qv?.state?.toLowerCase() || "";
        if (st === "done" || st === "superseded") continue;
        found = t;
        break;
      }
      if (found) md += `${found}\n`;
      else md += "\n";
    }
    md += `\n### Learnings\n`;
    for (const l of learnings) md += `${l}\n`;
    md += `\n### Git\n${gitSection}`;

    sections.push(md);
    totalTokens += Math.ceil(md.length / 4);
  }

  const body = sections.join("\n");
  const dateStr = now.toISOString().slice(0, 10);
  const planId = opts.plan ?? "all";
  const frontmatter = `---\ntype: handoff\nplan: ${planId}\ndate: ${dateStr}\n---\n\n`;
  const markdown = frontmatter + body;
  const path = join(root, "handoffs", `HANDOFF-${dateStr}-${planId}.md`);

  return { markdown, path, tokens: totalTokens };
}
