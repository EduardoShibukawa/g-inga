import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * PLAN-0010 TASK-05: event router (`src/notify/router.ts` + regras em `src/notify/rules.ts`).
 *
 * - `classify(event)` → chave de regra: `blocker`; `transition` de task para `blocked` → `task_blocked`;
 *   `transition` de spec/plan para `awaiting_approval` → `approval`; `budget` com `level: warn` → `budget_warn`,
 *   `level: cap` → `budget_cap`; `attempt` com `passed: false` → `retry`; o resto → `null`.
 * - `DEFAULT_RULES` (05 §6): blocker/task_blocked/budget_cap → ["discord","telegram"]; approval/budget_warn → ["discord"]; retry → [].
 * - `routeEvents(db, { send, targets, mention?, rules? })`: lê da tabela `events` do state.db (TASK-01) os eventos ainda não
 *   notificados, aplica `{...DEFAULT_RULES, ...rules}` (rules = `[notify.rules]` do project.toml) e chama
 *   `send({target, text, thread?})` uma vez por canal da regra (`targets` mapeia canal → target do port). Cada evento é notificado
 *   no máximo uma vez (marca no db). Devolve `{ routed }` (nº de eventos que geraram envio).
 * - Thread por PLAN no discord: `send` pode devolver `thread_id`; o router grava em `plan_thread(plan, target, thread_id)` e
 *   passa `thread` nos envios seguintes do mesmo PLAN. `mention` (ex.: `<@42>`) entra no texto das mensagens de discord.
 * - O texto cita o PLAN/TASK e, no blocker, a pergunta. O router só envia: não chama verbos.
 */

const ROOT = join(import.meta.dir, "..");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
let n = 0;
const ulid = () => {
  n += 1;
  return "0".repeat(24) + ALPHA[Math.floor(n / 32) % 32] + ALPHA[n % 32];
};
const E = (kind: string, data: Record<string, unknown>, scope: Record<string, string> = { plan: "PLAN-0001", task: "TASK-01" }) => ({ v: 1, ts: "2026-10-28T00:00:00Z", source: "manda", kind, id: ulid(), ...scope, data });

const BLOCKER = () => E("blocker", { blocker_id: "b1", question: "qual banco usar?", raised_by: "manda" });
const BLOCKED = () => E("transition", { entity: "task", from: "running", to: "blocked", by: "system", via: "cli" });
const APPROVAL = () => E("transition", { entity: "plan", from: "draft", to: "awaiting_approval", by: "system", via: "cli" }, { plan: "PLAN-0001" });
const WARN = () => E("budget", { scope: "plan", spent_usd: 1.2, cap_usd: 1.5, level: "warn" }, { plan: "PLAN-0001" });
const CAP = () => E("budget", { scope: "plan", spent_usd: 1.5, cap_usd: 1.5, level: "cap" }, { plan: "PLAN-0001" });
const RETRY = () => E("attempt", { runtime: "pi", passed: false, failure: "done_when" });
const DONE = () => E("transition", { entity: "task", from: "running", to: "done", by: "system", via: "cli" });

async function load() {
  const rules: any = await import(join(ROOT, "src", "notify", "rules.ts")).catch(() => null);
  const router: any = await import(join(ROOT, "src", "notify", "router.ts")).catch(() => null);
  const dbmod: any = await import(join(ROOT, "src", "state", "db.ts")).catch(() => null);
  expect(rules).not.toBeNull();
  expect(router).not.toBeNull();
  return { rules, router, dbmod };
}

async function harness(evs: any[], o: { threadFor?: (plan: string) => string | undefined } = {}) {
  const { rules, router, dbmod } = await load();
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-router-")));
  dirs.push(dir);
  const db = dbmod.openStateDb(join(dir, "state.db"));
  const add = (e: any) => db.run("INSERT INTO events(id, ts, kind, plan, task, json) VALUES(?, ?, ?, ?, ?, ?)", [e.id, e.ts, e.kind, e.plan ?? null, e.task ?? null, JSON.stringify(e)]);
  evs.forEach(add);
  const sent: { target: string; text: string; thread?: string }[] = [];
  const send = async (m: any) => {
    sent.push(m);
    const thread_id = o.threadFor?.(m.text.match(/PLAN-\d+/)?.[0] ?? "");
    return { ok: true, via: "hermes", ...(thread_id && m.target.startsWith("discord") && !m.thread ? { thread_id } : {}) };
  };
  const targets = { discord: "discord:123", telegram: "telegram:77" };
  const run = (extra: Record<string, unknown> = {}) => router.routeEvents(db, { send, targets, ...extra });
  return { db, add, sent, run, rules };
}
const chans = (sent: { target: string }[]) => sent.map((s) => s.target.split(":")[0]).sort();

describe("routePending (serve)", () => {
  // T23: o serve ingere $GINGA_EVENTS antes de rotear, abre o db pelo root
  // ($GINGA_STATE_DB ou <root>/.ginga/state/state.db, como o tick) e fornece
  // `fetch` ao port — a cadeia de fallback (discord) funciona sem o hermes.
  test("ingere antes de rotear, db no root e fallback discord com fetch injetável", async () => {
    const { router, dbmod } = await load();
    const serve: any = await import(join(ROOT, "src", "serve.ts"));
    expect(dbmod.resolveStateDbPath).toBeDefined();
    const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-routepending-")));
    dirs.push(dir);
    const dbPath = join(dir, "state.db");
    const stateDir = join(dir, ".ginga", "state");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(dir, ".ginga", "project.toml"), [
      "[notify.targets]",
      'discord = "discord:123"',
      "[notify.rules]",
      'blocker = ["discord"]',
    ].join("\n"));
    const eventsPath = join(dir, "events.jsonl");
    const e1 = BLOCKER();
    writeFileSync(eventsPath, JSON.stringify(e1) + "\n");
    const fetched: { url: string; init: any }[] = [];
    const deps = {
      spawn: async (_cmd: string[]) => ({ exitCode: 1, stderr: "hermes down" }),
      fetch: async (url: string, init: any) => {
        fetched.push({ url, init });
        return new Response(JSON.stringify({ id: "m1" }), { status: 200, headers: { "content-type": "application/json" } });
      },
    };
    const savedEnv = process.env.GINGA_STATE_DB;
    process.env.GINGA_STATE_DB = dbPath;
    process.env.GINGA_EVENTS = eventsPath;
    try {
      const routed = await serve.routePending(dir, deps);
      expect(routed).toBe(1);
      // db no GINGA_STATE_DB (não pelo cwd), com o evento ingerido e marcado como notificado
      const db = dbmod.openStateDb(dbPath);
      expect(db.query("SELECT id FROM events WHERE id = ?").get(e1.id)).not.toBeNull();
      expect(db.query("SELECT id FROM notification_log WHERE id = ?").get(e1.id)).not.toBeNull();
      db.close();
      // hermes falhou e a cadeia caiu para o discord via fetch do port
      expect(fetched.length).toBe(1);
      expect(fetched[0]!.url).toBe("https://discord.com/api/v10/channels/123/messages");
    } finally {
      if (savedEnv === undefined) delete process.env.GINGA_STATE_DB;
      else process.env.GINGA_STATE_DB = savedEnv;
      delete process.env.GINGA_EVENTS;
    }
  });

  test("sem $INGA_EVENTS a ingestão é pulada e o roteamento segue com o db existente", async () => {
    const { router, dbmod } = await load();
    const serve: any = await import(join(ROOT, "src", "serve.ts"));
    const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "ginga-routepending2-")));
    dirs.push(dir);
    const dbPath = join(dir, "state.db");
    writeFileSync(join(dir, ".ginga", "project.toml"), [
      "[notify.targets]",
      'discord = "discord:123"',
    ].join("\n"));
    const db = dbmod.openStateDb(dbPath);
    const ev = BLOCKER();
    db.run("INSERT INTO events(id, ts, kind, plan, task, json) VALUES(?, ?, ?, ?, ?, ?)", [ev.id, ev.ts, ev.kind, ev.plan, ev.task, JSON.stringify(ev)]);
    db.close();
    const savedEnv = process.env.GINGA_STATE_DB;
    process.env.GINGA_STATE_DB = dbPath;
    delete process.env.GINGA_EVENTS;
    const spawned: string[][] = [];
    try {
      const routed = await serve.routePending(dir, {
        spawn: async (cmd: string[]) => { spawned.push(cmd); return { exitCode: 0, stdout: "", stderr: "" }; },
      });
      expect(routed).toBe(1);
      expect(spawned.length).toBe(1);
      expect(spawned[0]!.slice(0, 2)).toEqual(["hermes", "send"]);
      expect(spawned[0]![3]).toBe("discord:123");
    } finally {
      if (savedEnv === undefined) delete process.env.GINGA_STATE_DB;
      else process.env.GINGA_STATE_DB = savedEnv;
    }
  });
});

describe("regras", () => {
  test("classify e DEFAULT_RULES seguem 05 §6", async () => {
    const { rules } = await load();
    expect(rules.classify(BLOCKER())).toBe("blocker");
    expect(rules.classify(BLOCKED())).toBe("task_blocked");
    expect(rules.classify(APPROVAL())).toBe("approval");
    expect(rules.classify(WARN())).toBe("budget_warn");
    expect(rules.classify(CAP())).toBe("budget_cap");
    expect(rules.classify(RETRY())).toBe("retry");
    expect(rules.classify(DONE())).toBeNull();
    expect(rules.DEFAULT_RULES).toEqual({
      blocker: ["discord", "telegram"],
      task_blocked: ["discord", "telegram"],
      approval: ["discord"],
      budget_warn: ["discord"],
      budget_cap: ["discord", "telegram"],
      retry: [],
    });
  });
});

describe("routeEvents", () => {
  test("blocker e task blocked vão ao discord e ao telegram; aprovação só ao discord; retry e done não enviam", async () => {
    const h = await harness([BLOCKER(), BLOCKED(), APPROVAL(), RETRY(), DONE()]);
    const r = await h.run();
    expect(r.routed).toBe(3);
    expect(chans(h.sent)).toEqual(["discord", "discord", "discord", "telegram", "telegram"]);
    expect(h.sent.find((s) => s.text.includes("qual banco usar?"))).toBeTruthy();
    expect(h.sent.every((s) => s.text.includes("PLAN-0001"))).toBe(true);
  });

  test("budget: warn só no discord, cap no discord e no telegram", async () => {
    const h = await harness([WARN()]);
    await h.run();
    expect(chans(h.sent)).toEqual(["discord"]);
    const g = await harness([CAP()]);
    await g.run();
    expect(chans(g.sent)).toEqual(["discord", "telegram"]);
  });

  test("cada evento é notificado no máximo uma vez, mesmo rodando o router de novo", async () => {
    const h = await harness([BLOCKER()]);
    await h.run();
    expect(h.sent.length).toBe(2);
    const again = await h.run();
    expect(again.routed).toBe(0);
    expect(h.sent.length).toBe(2);
    h.add(CAP());
    await h.run();
    expect(h.sent.length).toBe(4);
  });

  test("[notify.rules] sobrescreve o padrão por chave", async () => {
    const h = await harness([BLOCKER(), RETRY()]);
    await h.run({ rules: { blocker: ["telegram"], retry: ["discord"] } });
    expect(h.sent.map((s) => s.target).sort()).toEqual(["discord:123", "telegram:77"]);
    expect(h.sent.find((s) => s.target.startsWith("telegram"))!.text).toContain("qual banco usar?");
  });
});

describe("thread por PLAN e menção", () => {
  test("a thread devolvida pelo envio é gravada em plan_thread e reusada nos envios do mesmo PLAN", async () => {
    const h = await harness([BLOCKER()], { threadFor: () => "THREAD-1" });
    await h.run();
    expect(h.db.query("SELECT plan, target, thread_id FROM plan_thread").all()).toEqual([{ plan: "PLAN-0001", target: "discord:123", thread_id: "THREAD-1" }]);
    expect(h.sent.find((s) => s.target.startsWith("discord"))!.thread).toBeUndefined();
    h.add(CAP());
    await h.run();
    const second = h.sent.filter((s) => s.target.startsWith("discord"))[1]!;
    expect(second.thread).toBe("THREAD-1");
    expect(h.sent.filter((s) => s.target.startsWith("telegram")).every((s) => s.thread === undefined)).toBe(true);
  });

  test("PLANs diferentes têm threads diferentes", async () => {
    const other = E("blocker", { blocker_id: "b2", question: "outra?", raised_by: "manda" }, { plan: "PLAN-0002", task: "TASK-01" });
    const h = await harness([BLOCKER(), other], { threadFor: (plan) => `T-${plan}` });
    await h.run();
    expect(h.db.query("SELECT plan, thread_id FROM plan_thread ORDER BY plan").all()).toEqual([
      { plan: "PLAN-0001", thread_id: "T-PLAN-0001" },
      { plan: "PLAN-0002", thread_id: "T-PLAN-0002" },
    ]);
  });

  test("mention entra só nas mensagens de discord", async () => {
    const h = await harness([BLOCKER()]);
    await h.run({ mention: "<@42>" });
    expect(h.sent.find((s) => s.target.startsWith("discord"))!.text).toContain("<@42>");
    expect(h.sent.find((s) => s.target.startsWith("telegram"))!.text).not.toContain("<@42>");
  });
});
