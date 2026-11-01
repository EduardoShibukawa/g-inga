// tests_frozen — PLAN-0013 TASK-25 (T315): correções dos achados graves do
// judge no hook de handoff (TASK-12/TASK-19) e no schema do evento (TASK-11/18).
//
// 1) runHook resolve a raiz do bundle (.ginga) a partir do cwd do stdin (subindo
//    diretórios) e grava o handoff em <raiz>/handoffs — com plans/ na raiz o
//    markdown traz o conteúdo do PLAN; nunca <cwd>/handoffs.
// 2) redirect passa model real ao open(): cfg.model ?? GINGA_MODEL ?? "sonnet",
//    nunca "".
// 3) validateEvent aceita evento handoff com trigger "idle" e "manual".

import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHook } from "../src/handoff/hook";
import { validateEvent } from "../src/events/validate";

const ROOT = join(import.meta.dir, "..");
const TRANSCRIPTS = join(ROOT, "tests", "fixtures", "transcripts");

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const CFG_BASE = "idle_min = 55\ncontext_tokens = 110000\nmin_context_tokens = 30000\ncooldown_min = 30\nmax_chain = 3\n";

function ws(mode: string, extraCfg = ""): { ws: string; root: string; repo: string } {
  const ws = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "hook-raiz-")));
  dirs.push(ws);
  const root = join(ws, ".ginga");
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "project.toml"), `[handoff]\nmode = "${mode}"\n${CFG_BASE}${extraCfg}`);
  const planDir = join(root, "plans", "PLAN-0099-teste");
  mkdirSync(planDir, { recursive: true });
  writeFileSync(
    join(planDir, "PLAN.md"),
    "---\nid: PLAN-0099\nstatus: approved\nkind: investigation\n---\n\n## Objetivo\nConteúdo do PLAN-0099 para o handoff.\n",
  );
  const repo = join(ws, "repo");
  mkdirSync(repo, { recursive: true });
  return { ws, root, repo };
}

function stdin(o: Record<string, unknown>): string {
  return JSON.stringify(o);
}

describe("runHook: raiz do bundle (.ginga) e handoff com conteúdo do PLAN", () => {
  test("prepare grava em <raiz>/handoffs (não em <cwd>/handoffs) e inclui o PLAN", async () => {
    const { root, repo } = ws("suggest");
    const out = await runHook(
      "claude",
      stdin({
        session_id: "ses_raiz",
        transcript_path: join(TRANSCRIPTS, "120k.jsonl"),
        cwd: repo,
        hook_event_name: "Stop",
      }),
      { now: new Date() },
    );
    expect(out).toEqual({});

    const handoffs = join(root, "handoffs");
    expect(existsSync(handoffs)).toBe(true);
    const files = readdirSync(handoffs).filter((f) => f.endsWith(".md"));
    expect(files.length).toBe(1);
    const md = readFileSync(join(handoffs, files[0]!), "utf8");
    expect(md).toContain("PLAN-0099");

    // nunca grava fora do .ginga
    expect(existsSync(join(repo, "handoffs"))).toBe(false);

    // estado também na raiz do bundle
    expect(existsSync(join(root, "state", "handoff-ses_raiz.json"))).toBe(true);
  });
});

describe("runHook: model real no redirect", () => {
  async function redirectModel(extraCfg: string, envModel?: string): Promise<string> {
    const { root, repo } = ws("auto", extraCfg);
    const prev = process.env.GINGA_MODEL;
    if (envModel === undefined) delete process.env.GINGA_MODEL;
    else process.env.GINGA_MODEL = envModel;
    try {
      let captured = "<<não chamado>>";
      await runHook(
        "claude",
        stdin({
          session_id: "ses_model",
          transcript_path: join(TRANSCRIPTS, "ocioso.jsonl"),
          cwd: repo,
          hook_event_name: "UserPromptSubmit",
          prompt: "continue",
        }),
        {
          now: new Date(),
          open: async (_path: string, opts: { userPrompt: string; model: string }) => {
            captured = opts.model;
            return { sessionRef: "ses_nova" };
          },
        },
      );
      expect(existsSync(join(root, "handoffs"))).toBe(true);
      return captured;
    } finally {
      if (prev === undefined) delete process.env.GINGA_MODEL;
      else process.env.GINGA_MODEL = prev;
    }
  }

  test("model do project.toml vence", async () => {
    expect(await redirectModel('model = "modelo-toml"\n')).toBe("modelo-toml");
  });

  test("GINGA_MODEL é o fallback", async () => {
    expect(await redirectModel("", "env-model")).toBe("env-model");
  });

  test("default é sonnet e nunca vazio", async () => {
    const m = await redirectModel("");
    expect(m).toBe("sonnet");
    expect(m).not.toBe("");
  });
});

describe("schema do evento handoff aceita idle|manual", () => {
  const ev = (trigger: string) => ({
    v: 1,
    ts: new Date().toISOString(),
    source: "cli",
    kind: "handoff",
    id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    data: { trigger, context_tokens: 10, handoff_tokens: 5, file: "handoffs/x.md" },
  });

  test("boundary continua válido (controle)", () => {
    expect(validateEvent(ev("boundary")).ok).toBe(true);
  });

  test("idle e manual são aceitos", () => {
    const rIdle = validateEvent(ev("idle"));
    const rManual = validateEvent(ev("manual"));
    expect(rIdle.ok).toBe(true);
    expect(rManual.ok).toBe(true);
  });
});
