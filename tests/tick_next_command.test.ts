import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * T910: quem decide o próximo passo de um PLAN é o orquestrador. O tick
 * manda o estado por stdin para `[commands].next` (padrão `manda next`) e
 * executa a ação que volta; a regra embutida é só reserva.
 */
const GINGA = join(import.meta.dir, "..", "bin", "ginga.ts");
const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});

function fixture(next: string | null) {
  const ws = realpathSync(mkdtempSync(join(tmpdir(), "ginga-next-")));
  tmps.push(ws);
  const put = (rel: string, text: string) => {
    mkdirSync(dirname(join(ws, rel)), { recursive: true });
    writeFileSync(join(ws, rel), text);
  };
  put(".ginga/plans/PLAN-0001-demo/PLAN.md", "---\ntype: plan\ntitle: t\nstatus: approved\n---\n");
  put("queue.json", JSON.stringify({ tasks: [{ task: "PLAN-0001/TASK-01", plan: "PLAN-0001", state: "open", blocked_by: [] }] }));
  put(
    ".ginga/project.toml",
    [
      "[commands]",
      `queue = "cat ${ws}/queue.json"`,
      `red = "echo red {plan} >> ${ws}/calls.log"`,
      `judge = "echo judge {plan} >> ${ws}/calls.log"`,
      ...(next === null ? [] : [`next = "${next}"`]),
      "",
    ].join("\n"),
  );
  const db = join(ws, "state.db");
  const tick = () =>
    Bun.spawnSync([process.execPath, GINGA, "tick"], {
      cwd: ws,
      // PATH sem manda: o padrão `manda next` não responde e a reserva assume
      env: { ...process.env, PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, GINGA_STATE_DB: db, GINGA_EVENTS: join(ws, "events.jsonl"), GINGA_ROOT: "" },
      stdout: "pipe",
      stderr: "pipe",
    });
  const phase = () => {
    const d = new Database(db, { readonly: true });
    const row = d.query("SELECT phase FROM plan_phase WHERE plan = ?").get("PLAN-0001") as { phase: string } | undefined;
    d.close();
    return row?.phase ?? null;
  };
  const calls = () => (existsSync(join(ws, "calls.log")) ? readFileSync(join(ws, "calls.log"), "utf8") : "");
  return { ws, tick, phase, calls };
}

describe("tick pergunta o próximo passo a [commands].next", () => {
  test("executa a ação que o comando devolve e manda o estado por stdin", () => {
    const f = fixture(`cat > ${"$"}{STATE_OUT}; echo '{\\"cmd\\":\\"judge\\",\\"plan\\":\\"PLAN-0001\\",\\"reason\\":\\"stub\\"}'`.replace("${STATE_OUT}", "state.json"));
    expect(f.tick().exitCode).toBe(0);
    expect(f.calls()).toBe("judge PLAN-0001\n");
    expect(f.phase()).toBe("judge");
    const state = JSON.parse(readFileSync(join(f.ws, "state.json"), "utf8"));
    expect(state.phase).toBe("approved");
    expect(state.plan).toBe("PLAN-0001");
    expect(state.tasks).toEqual([{ id: "PLAN-0001/TASK-01", status: "open", attempts: 0, deps_done: true }]);
    expect(typeof state.cap_ok).toBe("boolean");
  });

  test("comando que falha: vale a regra embutida (approved → red)", () => {
    const f = fixture("exit 3");
    expect(f.tick().exitCode).toBe(0);
    expect(f.calls()).toBe("red PLAN-0001\n");
  });

  test("resposta que não é uma ação válida: vale a regra embutida", () => {
    const f = fixture(`echo '{\\"cmd\\":\\"apagar-tudo\\"}'`);
    expect(f.tick().exitCode).toBe(0);
    expect(f.calls()).toBe("red PLAN-0001\n");
  });

  test('next = "builtin" nem tenta chamar comando', () => {
    const f = fixture("builtin");
    expect(f.tick().exitCode).toBe(0);
    expect(f.calls()).toBe("red PLAN-0001\n");
  });

  test("o padrão é `manda next`; sem manda no PATH a reserva assume", async () => {
    const { DEFAULT_COMMANDS } = await import(join(import.meta.dir, "..", "src", "tick.ts"));
    expect(DEFAULT_COMMANDS.next).toBe("manda next");
    const f = fixture(null);
    expect(f.tick().exitCode).toBe(0);
    expect(f.calls()).toBe("red PLAN-0001\n");
  });
});
