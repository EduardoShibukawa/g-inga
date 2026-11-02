import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const TOOLS12 = [
  "list_plans",
  "read_plan",
  "list_tasks",
  "read_task",
  "read_log",
  "grep_logs",
  "list_runs",
  "read_run",
  "count_in_runs",
  "plan_deps",
  "task_attempts",
  "paid_attempts",
] as const;

export type MTool = {
  name: (typeof TOOLS12)[number];
  run: (snapshot: string, args?: any) => unknown;
};

const OUTPUT_LIMIT = 8000;

function truncateOutput(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > OUTPUT_LIMIT ? `${value.slice(0, OUTPUT_LIMIT)}...[truncated]` : value;
  }
  if (value === null || value === undefined) return value;
  const encoded = JSON.stringify(value);
  return encoded.length > OUTPUT_LIMIT ? `${encoded.slice(0, OUTPUT_LIMIT)}...[truncated]` : value;
}

export const M_TOOLS: MTool[] = TOOLS12.map((name) => ({
  name,
  run: (snapshot: string, args?: any) => {
    const value = (() => {
      switch (name) {
      case "list_plans": {
        const plansDir = join(snapshot, "plans");
        const names: string[] = [];
        for (const entry of readdirSync(plansDir, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          names.push(entry.name);
        }
        return names.sort((a, b) => a.localeCompare(b));
      }
      case "read_plan": {
        const planName = args?.plan;
        if (!planName) return null;
        const planPath = join(snapshot, "plans", planName, "PLAN.md");
        if (!existsSync(planPath)) return null;
        return readFileSync(planPath, "utf8");
      }
      case "list_tasks": {
        const planName = args?.plan;
        if (!planName) return [];
        const planPath = join(snapshot, "plans", planName);
        if (!existsSync(planPath)) return [];
        const tasks: string[] = [];
        for (const file of readdirSync(planPath).sort()) {
          if (/^TASK-.*\.md$/.test(file)) {
            tasks.push(file.replace(/\.md$/, ""));
          }
        }
        return tasks;
      }
      case "read_task": {
        const planName = args?.plan;
        const taskId = args?.task;
        if (!planName || !taskId) return null;
        const taskPath = join(snapshot, "plans", planName, `${taskId}.md`);
        if (!existsSync(taskPath)) return null;
        return readFileSync(taskPath, "utf8");
      }
      case "read_log": {
        const planName = args?.plan;
        if (!planName) return "";
        const logPath = join(snapshot, "plans", planName, "log.md");
        if (!existsSync(logPath)) return "";
        let content = readFileSync(logPath, "utf8");
        // Truncate to 8000 chars
        if (content.length > 8000) {
          content = content.slice(0, 8000) + "...[truncated]";
        }
        return content;
      }
      case "grep_logs": {
        const planName = args?.plan;
        const pattern = args?.pattern;
        if (!planName || !pattern) return [];
        const logPath = join(snapshot, "plans", planName, "log.md");
        if (!existsSync(logPath)) return [];
        const content = readFileSync(logPath, "utf8");
        const regex = new RegExp(pattern, "g");
        const matches: string[] = [];
        let match;
        while ((match = regex.exec(content)) !== null) {
          matches.push(match[0]);
        }
        return matches;
      }
      case "list_runs": {
        const snapshotDir = join(snapshot, "runs");
        const files: string[] = [];
        if (existsSync(snapshotDir)) {
          for (const file of readdirSync(snapshotDir)) {
            if (file.endsWith(".log") || file.endsWith(".jsonl")) {
              files.push(file);
            }
        }
        }
        return files.sort((a, b) => a.localeCompare(b));
      }
      case "read_run": {
        const runFile = args?.file;
        if (!runFile) return null;
        const runPath = join(snapshot, "runs", runFile);
        if (!existsSync(runPath)) return null;
        return readFileSync(runPath, "utf8");
      }
      case "count_in_runs": {
        const pattern = args?.pattern;
        if (!pattern) return 0;
        const runsDir = join(snapshot, "runs");
        let count = 0;
        if (existsSync(runsDir)) {
          for (const file of readdirSync(runsDir)) {
            if (!file.endsWith(".jsonl")) continue;
            const text = readFileSync(join(runsDir, file), "utf8");
            for (const line of text.split(/\r?\n/)) {
              if (!line.trim()) continue;
              try {
                const event = JSON.parse(line);
                if (event.type === pattern) count += 1;
              } catch {
                // not a valid JSON line
              }
            }
          }
        }
        return count;
      }
      case "plan_deps": {
        const planName = args?.plan;
        if (!planName) return [];
        const plansDir = join(snapshot, "plans");
        // Read this plan's deps
        const planPath = join(plansDir, planName, "PLAN.md");
        const content = existsSync(planPath) ? readFileSync(planPath, "utf8") : "";
        const depMatch = content.match(/depends_on:\s*\[([^\]]*)\]/);
        if (!depMatch) return [];
        const deps = depMatch[1]
          .split(",")
          .map((d) => d.trim().replace(/["']/g, ""))
          .filter((d) => d.length > 0);
        return deps;
      }
      case "task_attempts": {
        const planName = args?.plan;
        const taskId = args?.task;
        if (!planName || !taskId) return { attempts: 0, pass: 0 };
        const logPath = join(snapshot, "plans", planName, "log.md");
        if (!existsSync(logPath)) return { attempts: 0, pass: 0 };
        const log = readFileSync(logPath, "utf8");
        const regex = /\b(#{taskId})\s+tentativa\s+(\d+)\s+(pass|fail)/g;
        let attempts = 0;
        let pass = 0;
        let match;
        while ((match = regex.exec(log)) !== null) {
          attempts += 1;
          if (match[3] === "pass") pass += 1;
        }
        return { attempts, pass };
      }
      case "paid_attempts": {
        const planName = args?.plan;
        if (!planName) return [];
        const logPath = join(snapshot, "plans", planName, "log.md");
        if (!existsSync(logPath)) return [];
        const log = readFileSync(logPath, "utf8");
        const attempts: any[] = [];
        const pattern = /\b(TASK-\d+)\s+(\S+)\s+tentativa\s+paga\s+(\d+)\s*:\s*US\$\s*(\d+(?:\.\d+)?)/g;
        let match;
        while ((match = pattern.exec(log)) !== null) {
          attempts.push({
            task: match[1],
            model: match[2],
            attempt: Number(match[3]),
            cost: Number(match[4]),
          });
        }
        return attempts;
      }
        default:
          return null;
      }
    })();
    return truncateOutput(value);
  },
}));

/**
 * handle - JSON-RPC 2.0 minimal handler for MCP stdio
 * req: { id: number; method: string; params?: any }
 * snapshot: path to the snapshot root
 */
export function handle(req: { id: number; method: string; params?: any }, snapshot: string): unknown {
  const { id, method, params } = req;
  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: M_TOOLS.map((t) => ({
          name: t.name,
          description: `MCP tool: ${t.name}`,
        })),
      },
    };
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    const args = params?.arguments ?? {};
    const tool = M_TOOLS.find((t) => t.name === toolName);
    if (!tool) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unknown tool: ${toolName}` },
      };
    }
    const result = tool.run(snapshot, args);
    return {
      jsonrpc: "2.0",
      id,
      result,
    };
  }

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32600, message: `Method not found: ${method}` },
  };
}