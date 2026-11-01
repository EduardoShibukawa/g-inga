import { realpathSync } from "node:fs";
import { resolve, basename } from "node:path";

export type Deny = typeof import("./deny.json");
export type Call = { tool: string; input: Record<string, unknown>; cwd: string; home: string };
export type Verdict = { block: false } | { block: true; rule: string; reason: string };

const PATH_KEYS = new Set(["path", "filePath", "file_path", "file", "files", "paths", "dir", "directory", "workdir", "cwd"]);
const CMD_KEYS = new Set(["command", "cmd", "script", "code"]);
const TEXT_KEYS = new Set(["content", "newString", "oldString", "new_string", "old_string", "text", "patch", "body"]);
const ok: Verdict = { block: false };
const no = (rule: string, reason: string): Verdict => ({ block: true, rule, reason });

const rx = (list: string[]) => list.map((s) => new RegExp(s));

function expand(p: string, home: string): string {
  return p.replace(/^~(?=\/|$)/, home).replace(/\$\{?HOME\}?/g, home);
}

export function checkPath(raw: string, c: { cwd: string; home: string }, d: Deny): Verdict {
  if (!raw || raw.includes("\0")) return ok;
  let p = resolve(c.cwd, expand(raw, c.home));
  const cands = [p];
  try { cands.push(realpathSync(p)); } catch {}
  const cwdReal = (() => { try { return realpathSync(c.cwd); } catch { return c.cwd; } })();
  for (const q of cands) {
    for (const dir of d.home_dirs) { const h = expand(dir, c.home); if (q === h || q.startsWith(h + "/")) return no("path_dir", `caminho protegido: ${dir}`); }
    for (const f of d.home_files) if (q === expand(f, c.home)) return no("path_file", `arquivo protegido: ${f}`);
    for (const r of rx(d.abs_globs)) if (r.test(q)) return no("path_abs", "caminho de sistema protegido");
    const b = basename(q);
    const allowed = rx(d.basename_allow).some((r) => r.test(b));
    if (!allowed && rx(d.basename_any).some((r) => r.test(b))) return no("basename_env", `arquivo de ambiente protegido: ${b}`);
    const inside = q === cwdReal || q.startsWith(cwdReal + "/") || q === c.cwd || q.startsWith(c.cwd + "/");
    if (!allowed && !inside && rx(d.basename_outside_cwd).some((r) => r.test(b))) return no("basename_secret", `arquivo de credencial fora do projeto: ${b}`);
  }
  return ok;
}

export function checkShell(cmd: string, c: { cwd: string; home: string }, d: Deny): Verdict {
  const e = expand(cmd, c.home);
  for (const s of d.shell) if (new RegExp(s.re).test(e)) return no(s.id, "listar o ambiente expõe chaves");
  for (const tok of e.split(/[\s;|&<>()'"`=,@:{}]+/)) {
    if (!tok || !(tok.includes("/") || tok.startsWith(".") || /[.]/.test(tok))) continue;
    const v = checkPath(tok, c, d);
    if (v.block) return v;
  }
  return ok;
}

export function checkContent(text: string, d: Deny): Verdict {
  for (const s of d.content) if (new RegExp(s.re).test(text)) return no(s.id, "texto com formato de chave");
  return ok;
}

export function checkCall(call: Call, d: Deny): Verdict {
  for (const [k, v] of Object.entries(call.input ?? {})) {
    const vals = Array.isArray(v) ? v : [v];
    for (const x of vals) {
      if (typeof x !== "string") continue;
      let r: Verdict = ok;
      if (PATH_KEYS.has(k)) r = checkPath(x, call, d);
      else if (CMD_KEYS.has(k)) { r = checkShell(x, call, d); if (!r.block) r = checkContent(x, d); }
      else if (TEXT_KEYS.has(k)) r = checkContent(x, d);
      if (r.block) return r;
    }
  }
  return ok;
}

export function redact(text: string, d: Deny, envValues: string[] = []): { text: string; hits: string[] } {
  const hits: string[] = []; let out = text;
  for (const v of envValues) if (v.length >= 12 && out.includes(v)) { out = out.split(v).join("[REDACTED:env]"); hits.push("env_value"); }
  for (const s of d.content) { const r = new RegExp(s.re, "g"); if (r.test(out)) { hits.push(s.id); out = out.replace(new RegExp(s.re, "g"), `[REDACTED:${s.id}]`); } }
  return { text: out, hits };
}
