import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * T908: a fila traz o id curto do PLAN (`PLAN-0001`) e o dir do bundle tem
 * slug (`PLAN-0001-demo`). O tick precisa achar o PLAN.md assim mesmo, senão
 * a fase `approved` nunca é semeada e o fluxo de fases não começa.
 */
const GINGA = join(import.meta.dir, "..", "bin", "ginga.ts");
const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});

function fixture(status: string) {
  const ws = realpathSync(mkdtempSync(join(tmpdir(), "ginga-slug-")));
  tmps.push(ws);
  const put = (rel: string, text: string) => {
    mkdirSync(dirname(join(ws, rel)), { recursive: true });
    writeFileSync(join(ws, rel), text);
  };
  put(".ginga/plans/PLAN-0001-demo/PLAN.md", `---\ntype: plan\ntitle: t\nstatus: ${status}\n---\n`);
  const queue = JSON.stringify({ tasks: [{ task: "PLAN-0001/TASK-01", plan: "PLAN-0001", state: "open", blocked_by: [] }] });
  put("queue.json", queue);
  put(
    ".ginga/project.toml",
    `[commands]\nqueue = "cat ${ws}/queue.json"\nred = "echo red {plan} >> ${ws}/calls.log"\ndispatch = "echo dispatch {plan} {task} >> ${ws}/calls.log"\n`,
  );
  const db = join(ws, "state.db");
  const tick = () =>
    Bun.spawnSync([process.execPath, GINGA, "tick"], {
      cwd: ws,
      env: { ...process.env, GINGA_STATE_DB: db, GINGA_EVENTS: join(ws, "events.jsonl"), GINGA_ROOT: "" },
      stdout: "pipe",
      stderr: "pipe",
    });
  const phase = () => {
    const d = new Database(db, { readonly: true });
    const row = d.query("SELECT phase FROM plan_phase WHERE plan = ?").get("PLAN-0001") as { phase: string } | undefined;
    d.close();
    return row?.phase ?? null;
  };
  const calls = () => Bun.spawnSync(["cat", join(ws, "calls.log")], { stdout: "pipe" }).stdout.toString();
  return { tick, phase, calls };
}

describe("tick com dir de PLAN com slug", () => {
  test("PLAN approved em PLAN-0001-demo entra no fluxo de fases e roda o red", () => {
    const f = fixture("approved");
    expect(f.tick().exitCode).toBe(0);
    expect(f.phase()).toBe("red");
    expect(f.calls()).toContain("red PLAN-0001");
    expect(f.calls()).not.toContain("dispatch");
  });

  test("PLAN draft não é semeado", () => {
    const f = fixture("draft");
    expect(f.tick().exitCode).toBe(0);
    expect(f.phase()).toBeNull();
  });
});
