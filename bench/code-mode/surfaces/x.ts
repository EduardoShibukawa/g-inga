import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type ToolSignature = { name: string; signature: string };

const TOOL_SIGNATURES: ToolSignature[] = [
  { name: "list_plans", signature: "list_plans(snapshot: string): string[]" },
  { name: "read_plan", signature: "read_plan(snapshot: string, plan: string): string | null" },
  { name: "list_tasks", signature: "list_tasks(snapshot: string, plan: string): string[]" },
  { name: "read_task", signature: "read_task(snapshot: string, plan: string, task: string): string | null" },
  { name: "read_log", signature: "read_log(snapshot: string, plan: string): string" },
  { name: "grep_logs", signature: "grep_logs(snapshot: string, plan: string, pattern: string): string[]" },
  { name: "list_runs", signature: "list_runs(snapshot: string): string[]" },
  { name: "read_run", signature: "read_run(snapshot: string, file: string): string | null" },
  { name: "count_in_runs", signature: "count_in_runs(snapshot: string, pattern: string): number" },
  { name: "plan_deps", signature: "plan_deps(snapshot: string, plan: string): string[]" },
  { name: "task_attempts", signature: "task_attempts(snapshot: string, plan: string, task: string): { attempts: number; pass: number }" },
  { name: "paid_attempts", signature: "paid_attempts(snapshot: string, plan: string): Array<{ task: string; model: string; attempt: number; cost: number }>" },
];

/** Lista as assinaturas de leitura disponíveis para scripts do modo X. */
export function search_tools(query: string): ToolSignature[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return TOOL_SIGNATURES.map((tool) => ({ ...tool }));
  return TOOL_SIGNATURES
    .filter((tool) => `${tool.name} ${tool.signature}`.toLowerCase().includes(needle))
    .map((tool) => ({ ...tool }));
}

export function bwrapArgv(snapshot: string, script: string, minimal: boolean): string[] {
  const base = ["bwrap", "--unshare-net", "--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp"];
  const parts: string[] = [...base];

  if (minimal) {
    parts.push("--ro-bind", "/usr", "/usr");
  } else {
    parts.push("--ro-bind", "/", "/");
  }

  parts.push("--ro-bind", snapshot, snapshot);
  parts.push("--ro-bind", script, script);
  parts.push("--", "bun", script);

  return parts;
}

export function truncate(out: string, max = 8000): string {
  if (out.length > max) {
    return out.slice(0, max) + " [truncated]";
  }
  return out;
}

export async function execute(
  script: string,
  o: { snapshot: string; minimal: boolean; run: (argv: string[]) => Promise<string> }
): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "ginga-code-mode-"));
  const scriptPath = join(dir, "script.ts");
  writeFileSync(scriptPath, script, "utf8");
  try {
    const argv = bwrapArgv(o.snapshot, scriptPath, o.minimal);
    const output = await o.run(argv);
    return truncate(output);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}