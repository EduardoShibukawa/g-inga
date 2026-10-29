// T26 (PLAN-0010 TASK-07): o fallback Discord extrai o ID da mensagem da
// resposta e devolve thread_id mesmo sem thread de entrada (follow-up do judge
// da 20:55 — ver REPORT-2026-10-28). O router grava o id em plan_thread e reusa
// nos envios seguintes do PLAN.
import { describe, expect, test } from "bun:test";
import { send } from "../src/notify/port";

describe("T26 — thread_id do fallback Discord", () => {
  test("discord OK sem thread de entrada: devolve o id da resposta como thread_id", async () => {
    const res = await send(
      { target: "discord:123", text: "msg" },
      {
        spawn: async () => ({ exitCode: 1, stderr: "quota esgotada" }),
        env: { DISCORD_BOT_TOKEN: "tok" },
        fetch: async () => ({
          ok: true,
          status: 200,
          json: async () => ({ id: "MSG-42" }),
        }),
      },
    );
    expect(res.ok).toBe(true);
    expect(res.via).toBe("discord");
    expect(res.thread_id).toBe("MSG-42");
  });

  test("discord OK com thread de entrada: devolve a thread usada (comportamento atual mantido)", async () => {
    const res = await send(
      { target: "discord:123", text: "msg", thread: "THREAD-9" },
      {
        spawn: async () => ({ exitCode: 1, stderr: "quota esgotada" }),
        env: { DISCORD_BOT_TOKEN: "tok" },
        fetch: async () => ({
          ok: true,
          status: 200,
          json: async () => ({ id: "MSG-42" }),
        }),
      },
    );
    expect(res.via).toBe("discord");
    expect(res.thread_id).toBe("THREAD-9");
  });

  test("resposta sem JSON/sem id: envio segue ok, sem thread_id", async () => {
    const res = await send(
      { target: "discord:123", text: "msg" },
      {
        spawn: async () => ({ exitCode: 1, stderr: "quota esgotada" }),
        env: { DISCORD_BOT_TOKEN: "tok" },
        fetch: async () => ({ ok: true, status: 200 }),
      },
    );
    expect(res.ok).toBe(true);
    expect(res.via).toBe("discord");
    expect(res.thread_id).toBeUndefined();
  });
});
