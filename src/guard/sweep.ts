import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Deny } from "./core";
import denyDefault from "./deny.json";

export type Hit = { file: string; line: number; rule: string };
export type SweepResult = { files: number; hits: Hit[] };

const ELIGIBLE = /\.(log|md|out|events|tsv|json|txt|jsonl)$/;
const MAX_FILE_SIZE = 20_000_000;
const IGNORED_DIRECTORIES = new Set(["node_modules", ".git"]);

/** Sweep logs for key formats. The matching text never leaves this module. */
export function sweep(root: string, deny: Deny = denyDefault as Deny): SweepResult {
  const rules = deny.content.map((rule) => ({ id: rule.id, re: new RegExp(rule.re) }));
  const hits: Hit[] = [];
  let files = 0;

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) walk(path);
        continue;
      }
      if (!ELIGIBLE.test(entry.name) || statSync(path).size > MAX_FILE_SIZE) continue;

      files++;
      const lines = readFileSync(path, "utf8").split("\n");
      for (let index = 0; index < lines.length; index++) {
        for (const rule of rules) {
          if (rule.re.test(lines[index])) {
            hits.push({ file: relative(root, path), line: index + 1, rule: rule.id });
          }
        }
      }
    }
  };

  walk(root);
  return { files, hits };
}
