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
  const priority = (t: string) => (t.includes("armadilha") ? 0 : t.includes("confirmada") ? 1 : 2);
  entries.sort((a, b) => priority(a.type) - priority(b.type));
  return entries.map(e => e.text);
}

function listTasks(planDir: string): string[] {
  if (!existsSync(planDir)) return [];
  const files = readdirSync(planDir).filter(f => /^TASK-.*\.md$/.test(f));
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

export function buildHandoff(root: string, opts: { plan?: string; now?: Date; git?: (args: string[], cwd: string) => string } = {}) {
  const now = opts.now ?? new Date();
  const git = opts.git ?? (() => "");
  let planNames: string[] = [];
  if (opts.plan) {
    // find directory matching prefix
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
    planNames = findPlans(root, (_, fm) => fm.status === "approved" && fm.kind);
  }
  // For simplicity, if no plan found, fallback to all plans
  const effectivePlans = planNames.length ? planNames : findPlans(root);

  const sections: string[] = [];
  let totalTokens = 0;

  for (const plan of effectivePlans) {
    const planDir = join(root, "plans", plan);
    const planPath = join(planDir, "PLAN.md");
    const planText = readFileSafe(planPath);
    const fm = parseFrontmatter(planText);
    const objetivo = extractSection(planText, "Objetivo");
    const tasks = listTasks(planDir);
    const learningsPath = join(planDir, "LEARNINGS.md");
    const learningsContent = readFileSafe(learningsPath);
    const learnings = parseLearnings(learningsContent);

    const repoRoot = planDir;
    const status = git(["status", "--porcelain"], repoRoot);
    const diff = git(["diff", "--stat"], repoRoot);

    let md = `## Plano ${plan}\n`;
    md += `\n### Objetivo\n${objetivo || ""}\n`;
    md += `\n### Tasks\n`;
    for (const t of tasks) md += `- ${t}\n`;
    md += `\n### Learnings\n`;
    for (const l of learnings) md += `${l}\n`;
    md += `\n### Git\nStatus:\n${status}\nDiff:\n${diff}\n`;

    sections.push(md);
    totalTokens += Math.ceil(md.length / 4);
  }

  const markdown = sections.join("\n");
  const dateStr = now.toISOString().slice(0, 10);
  const planId = opts.plan ?? "all";
  const path = join(root, "handoffs", `HANDOFF-${dateStr}-${planId}.md`);

  return { markdown, path, tokens: totalTokens };
}
