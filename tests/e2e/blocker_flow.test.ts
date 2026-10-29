// e2e do blocker pela thread (PLAN-0011 TASK-06, testes congelados):
// 1) evento `blocker` no $GINGA_EVENTS → route do serve → o stub de `hermes
//    send` recebe os 2 envios (discord e telegram) — e só 1 vez por evento.
// 2) resposta simulada na thread → plugin do Hermes (python, default_deps) →
//    `ginga answer` pela CLI → linha em answers/PLAN.md → o próximo tick
//    despacha a TASK (stub de `manda`). Sem rede real: só stubs de processos.
// O plan_thread é semeado no formato que o router grava (target completo,
// ex.: "discord:chan-1") — a resolução thread→blocker do plugin tem de fechar
// com esse formato (alinhamento plugin ↔ router exigido pela AC).

import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";

const ROOT = join(import.meta.dir, "..", "..");
const START_PATH = process.env.PATH ?? "";
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  delete process.env.GINGA_EVENTS;
  delete process.env.GINGA_STATE_DB;
});

const ULID_ID = "01JZZZ0000000000000000ABCD";

function setupBundle(seedThread?: { target: string; thread_id: string }) {
  const D = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "e2e-blocker-")));
  dirs.push(D);
  mkdirSync(join(D, ".ginga/plans/PLAN-0011-e2e"), { recursive: true });
  mkdirSync(join(D, ".ginga/state"), { recursive: true });
  mkdirSync(join(D, "bin"), { recursive: true });
  writeFileSync(join(D, ".ginga/plans/PLAN-0011-e2e/PLAN.md"), "---\ntype: plan\ntitle: e2e\n---\n# PLAN-0011\n");

  const ev = {
    v: 1,
    ts: "2026-10-29T10:00:00Z",
    source: "manda",
    kind: "blocker",
    id: ULID_ID,
    plan: "PLAN-0011",
    task: "TASK-06",
    data: { blocker_id: "b1", question: "qual banco usar?", raised_by: "manda" },
  };
  writeFileSync(join(D, "events.jsonl"), JSON.stringify(ev) + "\n");

  const hermesLog = join(D, "hermes.log");
  const dispatchLog = join(D, "dispatch.log");
  // stubs com caminhos absolutos embutidos: o env do filho pode não herdar
  // mutações de process.env feitas em runtime.
  writeFileSync(join(D, "bin/hermes"), `#!/bin/sh\necho "$@" >> "${hermesLog}"\necho thread_id=${seedThread?.thread_id ?? "t-1"}\n`);
  writeFileSync(join(D, "bin/ginga"), `#!/bin/sh\nexec bun "${join(ROOT, "bin/ginga.ts")}" "$@"\n`);
  chmodSync(join(D, "bin/hermes"), 0o755);
  chmodSync(join(D, "bin/ginga"), 0o755);

  writeFileSync(
    join(D, "queue.ts"),
    `// fila stub: PLAN-0011/TASK-06 fica "blocked" enquanto o blocker b1 não tiver resposta
import { Database } from "bun:sqlite";
const root = process.argv[2] ?? "";
let answered = 0;
try {
  const db = new Database(root + "/.ginga/state/state.db", { readonly: true });
  answered = (db.query("SELECT COUNT(*) c FROM answers WHERE blocker_id = 'b1'").get() as { c: number }).c;
  db.close();
} catch {}
console.log(JSON.stringify({ tasks: [{ task: "PLAN-0011/TASK-06", plan: "PLAN-0011", state: answered > 0 ? "open" : "blocked", blocked_by: [] }] }));
`,
  );
  writeFileSync(join(D, "manda.sh"), `#!/bin/sh\necho "run $1 --task $2" >> "${dispatchLog}"\n`);
  chmodSync(join(D, "manda.sh"), 0o755);

  writeFileSync(
    join(D, ".ginga/project.toml"),
    [
      "[notify.targets]",
      'discord = "discord:chan-1"',
      'telegram = "telegram:chat-1"',
      "[commands]",
      `queue = "bun ${join(D, "queue.ts")} {root}"`,
      `dispatch = "sh ${join(D, "manda.sh")} {plan} {task}"`,
      "",
    ].join("\n"),
  );

  process.env.GINGA_EVENTS = join(D, "events.jsonl");
  process.env.GINGA_STATE_DB = join(D, ".ginga/state/state.db");

  const db = new Database(process.env.GINGA_STATE_DB);
  db.run("CREATE TABLE IF NOT EXISTS plan_thread (plan TEXT NOT NULL, target TEXT NOT NULL, thread_id TEXT, PRIMARY KEY (plan, target))");
  db.run('CREATE TABLE IF NOT EXISTS answers (blocker_id TEXT NOT NULL, answer TEXT NOT NULL, "by" TEXT NOT NULL, via TEXT, ts TEXT)');
  if (seedThread) db.run("INSERT OR REPLACE INTO plan_thread VALUES('PLAN-0011',?, ?)", [seedThread.target, seedThread.thread_id]);
  db.close();

  return { D, hermesLog, dispatchLog };
}

/** spawn para o port de notificação: resolve o stub pelo caminho absoluto e
 *  espera o filho (o PATH visto pelo Bun.spawn não é re-resolvido em runtime). */
function stubSpawn(stubDir: string) {
  return (cmd: string[]) => {
    const child = Bun.spawn([join(stubDir, cmd[0]!), ...cmd.slice(1)], { stdout: "pipe", stderr: "pipe" });
    return child.exited.then(() => child);
  };
}

function readIfExists(p: string): string | null {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

async function load() {
  const serve: any = await import(join(ROOT, "src/serve.ts"));
  const tick: any = await import(join(ROOT, "src/tick.ts"));
  return { routePending: serve.routePending as (r: string, d?: any) => Promise<number>, runTick: tick.runTick as (a: string[]) => Promise<number> };
}

describe("e2e blocker pela thread", () => {
  test("blocker sai para discord e telegram via hermes, uma única vez", async () => {
    const { D, hermesLog } = setupBundle();
    const { routePending } = await load();

    await routePending(D, { spawn: stubSpawn(join(D, "bin")) });
    const lines = (readIfExists(hermesLog) ?? "").trim().split("\n").filter(Boolean);
    expect(lines.length).toBe(2);
    expect(lines.some((l) => l.startsWith("send -t discord:chan-1") && l.includes("qual banco usar?"))).toBe(true);
    expect(lines.some((l) => l.startsWith("send -t telegram:chat-1") && l.includes("qual banco usar?"))).toBe(true);

    // segundo route: o mesmo evento não sai de novo
    await routePending(D, { spawn: stubSpawn(join(D, "bin")) });
    const again = (readIfExists(hermesLog) ?? "").trim().split("\n").filter(Boolean);
    expect(again.length).toBe(2);
  });

  test("resposta na thread vira answer e o próximo tick despacha o PLAN", async () => {
    // thread semeada no formato que o router grava: target completo do envio
    const { D, hermesLog, dispatchLog } = setupBundle({ target: "discord:chan-1", thread_id: "t-1" });
    const { routePending, runTick } = await load();

    await routePending(D, { spawn: stubSpawn(join(D, "bin")) });

    // sem resposta: tick não despacha
    await runTick(["--root", D, "--json"]);
    expect(readIfExists(dispatchLog)).toBe(null);

    // payload simulado de resposta na thread → plugin (default_deps) → CLI
    const msgFile = join(D, "msg.json");
    writeFileSync(msgFile, JSON.stringify({ text: "pode seguir com sqlite", user: "dono", via: "discord", thread_id: "t-1" }));
    const replyPy = join(D, "reply.py");
    writeFileSync(
      replyPy,
      `import sys, json, importlib.util
spec = importlib.util.spec_from_file_location("hp", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
msg = json.load(open(sys.argv[2]))
print(json.dumps(mod.handle(msg, mod.default_deps())))
`,
    );
    const py = Bun.spawnSync(["python3", replyPy, join(ROOT, "contrib/hermes-plugin/__init__.py"), msgFile], {
      cwd: D,
      env: {
        ...process.env,
        PATH: join(D, "bin") + ":" + START_PATH,
        GINGA_STATE_DB: join(D, ".ginga/state/state.db"),
        GINGA_HERMES_ALLOW: "dono",
        GINGA_EVENTS: join(D, "events.jsonl"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(py.stderr.toString()).toBe("");
    expect(JSON.parse(py.stdout.toString())["action"]).toBe("answer");

    const db = new Database(join(D, ".ginga/state/state.db"));
    const rows = db.query('SELECT blocker_id, "by", via FROM answers WHERE blocker_id = \'b1\'').all() as { blocker_id: string; by: string; via: string }[];
    db.close();
    expect(rows.length).toBe(1);
    expect(rows[0]!.by).toBe("dono");
    expect(rows[0]!.via).toBe("discord");

    const planMd = readFileSync(join(D, ".ginga/plans/PLAN-0011-e2e/PLAN.md"), "utf8");
    expect(planMd).toContain("## Respostas");
    expect(planMd).toContain("pode seguir com sqlite (by dono via discord)");

    // com resposta: o próximo tick despacha
    await runTick(["--root", D, "--json"]);
    const dispatch = readIfExists(dispatchLog);
    expect(dispatch).not.toBe(null);
    expect(dispatch!.trim()).toBe("run PLAN-0011 --task TASK-06");

    // o envio inicial saiu para o channel com a thread salva pelo router
    const lines = (readIfExists(hermesLog) ?? "").trim().split("\n").filter(Boolean);
    expect(lines.some((l) => l.startsWith("send -t discord:chan-1"))).toBe(true);
  });
});
