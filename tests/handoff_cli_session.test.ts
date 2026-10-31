// tests_frozen — PLAN-0013 TASK-18 (T308): correções do judge na TASK-11.
// O argv real deve aceitar --from-session, ler --notes de arquivo e inferir
// o PLAN pela branch plan/NNNN, pelo state.db ou pelo log.md mais recente.

import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStateDb } from "../src/state/db.ts";

const ROOT = join(import.meta.dir, "..");
const BIN = join(ROOT, "bin", "ginga.ts");
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Fixture = {
  dir: string;
  root: string;
  db: string;
  events: string;
  notes: string;
};

function plan(root: string, id: string, title: string): void {
  const dir = join(root, "plans", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "PLAN.md"),
    `---\ntype: plan\ntitle: ${title}\nstatus: approved\n---\n## Objetivo\n${title}\n`,
  );
  writeFileSync(
    join(dir, "TASK-01-proximo.md"),
    `---\ntype: task\ntitle: ${title}\n---\nTarefa de teste.\n`,
  );
}

function fixture(branch = "plan/0013"): Fixture {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "handoff-cli-session-")));
  dirs.push(dir);
  const root = join(dir, ".ginga");
  mkdirSync(join(root, "plans"), { recursive: true });
  plan(root, "PLAN-0013-jwt", "Autenticação");
  writeFileSync(
    join(root, "index.md"),
    "# Índice\n\n## Pendências\n- [ ] PLAN-0013/TASK-01-proximo continuar\n",
  );
  const notes = join(dir, "notes.md");
  writeFileSync(notes, "Decisão do dono: manter o modo suggest.\nTOKEN=abcdef1234567890abcdef\n");

  Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
  Bun.spawnSync(["git", "checkout", "-q", "-b", branch], { cwd: dir });

  return {
    dir,
    root,
    db: join(dir, "state.db"),
    events: join(dir, "events.jsonl"),
    notes,
  };
}

function cli(fx: Fixture, args: string[]): { code: number; out: string; err: string } {
  const env = {
    ...process.env,
    GINGA_STATE_DB: fx.db,
    GINGA_EVENTS: fx.events,
    GINGA_BY: "",
    GINGA_ROOT: "",
  };
  const proc = Bun.spawnSync([process.execPath, BIN, ...args, "--root", fx.root], {
    cwd: fx.dir,
    env,
    stdin: "ignore",
  });
  return {
    code: proc.exitCode,
    out: proc.stdout.toString(),
    err: proc.stderr.toString(),
  };
}

function handoffText(fx: Fixture, result: { path: string }): string {
  return readFileSync(join(fx.root, result.path), "utf8");
}

describe("CLI do handoff em modo sessão", () => {
  test("--from-session e --notes arquivo chegam ao handoff; branch plan/NNNN infere o PLAN", () => {
    const fx = fixture();
    const result = cli(fx, [
      "handoff",
      "--trigger",
      "idle",
      "--runtime",
      "claude",
      "--from-session",
      "ses_cli",
      "--notes",
      fx.notes,
      "--json",
    ]);

    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.out) as { path: string };
    const markdown = handoffText(fx, parsed);
    expect(markdown).toMatch(/^plan: PLAN-0013$/m);
    expect(markdown).toMatch(/^from_session: ses_cli$/m);
    expect(markdown).toContain("Decisão do dono");
    expect(markdown).not.toContain(fx.notes);
    expect(markdown).not.toContain("abcdef1234567890abcdef");
    expect(markdown).toContain("[REDACTED]");

    const event = JSON.parse(readFileSync(fx.events, "utf8").trim());
    expect(event.plan).toBe("PLAN-0013");
    expect(event.data.from_session).toBe("ses_cli");
  });

  test("sem branch plan/NNNN, o PLAN ativo no state.db é inferido", () => {
    const fx = fixture("main");
    const db = openStateDb(fx.db);
    db.query("INSERT INTO task_exec(plan, task, status, attempts) VALUES('PLAN-0013', 'TASK-01', 'running', 1)").run();
    db.close();

    const result = cli(fx, ["handoff", "--trigger", "context", "--json"]);
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    const markdown = handoffText(fx, JSON.parse(result.out) as { path: string });
    expect(markdown).toMatch(/^plan: PLAN-0013$/m);
  });

  test("sem branch e sem state.db, o log.md mais recente infere o PLAN", () => {
    const fx = fixture("main");
    plan(fx.root, "PLAN-0002-antigo", "Antigo");
    const oldLog = join(fx.root, "plans", "PLAN-0013-jwt", "log.md");
    const newLog = join(fx.root, "plans", "PLAN-0002-antigo", "log.md");
    writeFileSync(oldLog, "old\n");
    writeFileSync(newLog, "new\n");
    utimesSync(oldLog, new Date("2026-10-30T10:00:00Z"), new Date("2026-10-30T10:00:00Z"));
    utimesSync(newLog, new Date("2026-10-30T11:00:00Z"), new Date("2026-10-30T11:00:00Z"));

    const result = cli(fx, ["handoff", "--trigger", "idle", "--json"]);
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    const markdown = handoffText(fx, JSON.parse(result.out) as { path: string });
    expect(markdown).toMatch(/^plan: PLAN-0002$/m);
  });
});
