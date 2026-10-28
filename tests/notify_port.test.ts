import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * PLAN-0010 TASK-04: porta de notificação (`src/notify/port.ts`, adapters em hermes.ts/discord.ts/stdout.ts).
 *
 * `send({ target, text, thread? }, deps?)` → `{ ok, via, attempts: [{ adapter, ok, reason? }] }`, na cadeia
 * hermes → discord → stdout. `deps` injeta `spawn(cmd) → {exitCode, stdout, stderr}`, `fetch`, `env` e `out(texto)`;
 * `config.discord = { token?, channel? }` equivale a `[notify.discord]`.
 * - hermes: `["hermes","send","-t","<plataforma:chat[:thread]>", text]` (thread, se houver, vira o 3º segmento). Exit 0 → fim.
 * - discord: POST `https://discord.com/api/v10/channels/<id>/messages`, `Authorization: Bot <token>`, corpo `{content}`.
 *   Canal = thread, senão o chat do target (quando a plataforma é discord), senão `DISCORD_CHANNEL_ID`/config; sem canal → falha.
 *   Token = `DISCORD_BOT_TOKEN`/config; sem token → falha. Nunca lê `~/.hermes` nem tem canal padrão no código.
 * - stdout: último recurso, sempre ok; escreve o texto em `out`.
 * - Falha de um adapter cai para o próximo e fica registrada em `attempts[].reason`.
 */

const ROOT = join(import.meta.dir, "..");
const mod = async (): Promise<any> => {
  try {
    return await import(join(ROOT, "src", "notify", "port.ts"));
  } catch {
    return null;
  }
};

type Deps = Record<string, any>;
function deps(o: { hermes?: { exitCode: number; stderr?: string } | "throw"; http?: number | "throw"; env?: Record<string, string>; config?: any } = {}) {
  const spawned: string[][] = [];
  const fetched: { url: string; init: any }[] = [];
  const out: string[] = [];
  const d: Deps = {
    env: o.env ?? {},
    config: o.config ?? {},
    out: (s: string) => out.push(s),
    spawn: async (cmd: string[]) => {
      spawned.push(cmd);
      if (o.hermes === "throw") throw new Error("spawn hermes ENOENT");
      const h = o.hermes ?? { exitCode: 0 };
      return { exitCode: h.exitCode, stdout: "", stderr: h.stderr ?? "" };
    },
    fetch: async (url: string, init: any) => {
      fetched.push({ url, init });
      if (o.http === "throw") throw new Error("rede caiu");
      const status = o.http ?? 200;
      return new Response("{}", { status });
    },
  };
  return { d, spawned, fetched, out };
}
const DISCORD_ENV = { DISCORD_BOT_TOKEN: "tok", DISCORD_CHANNEL_ID: "999" };

describe("hermes primeiro", () => {
  test("hermes ok: um spawn com -t plataforma:chat:thread e nenhuma chamada HTTP", async () => {
    const m = await mod();
    expect(m).not.toBeNull();
    const x = deps();
    const r = await m.send({ target: "discord:123", thread: "456", text: "olá" }, x.d);
    expect(r).toMatchObject({ ok: true, via: "hermes" });
    expect(x.spawned).toEqual([["hermes", "send", "-t", "discord:123:456", "olá"]]);
    expect(x.fetched).toEqual([]);
    expect(x.out).toEqual([]);
  });

  test("sem thread o target vai como está", async () => {
    const m = await mod();
    const x = deps();
    await m.send({ target: "telegram:77", text: "oi" }, x.d);
    expect(x.spawned[0]).toEqual(["hermes", "send", "-t", "telegram:77", "oi"]);
  });
});

describe("fallback para o webhook do Discord", () => {
  test("hermes com exit ≠ 0 cai no REST v10 com Bot token, no canal da thread", async () => {
    const m = await mod();
    const x = deps({ hermes: { exitCode: 1, stderr: "sem perfil" }, env: DISCORD_ENV });
    const r = await m.send({ target: "discord:123", thread: "456", text: "olá" }, x.d);
    expect(r).toMatchObject({ ok: true, via: "discord" });
    expect(r.attempts[0]).toMatchObject({ adapter: "hermes", ok: false });
    expect(r.attempts[0].reason).toContain("sem perfil");
    expect(x.fetched.length).toBe(1);
    expect(x.fetched[0]!.url).toBe("https://discord.com/api/v10/channels/456/messages");
    expect(x.fetched[0]!.init.method).toBe("POST");
    expect(x.fetched[0]!.init.headers.Authorization).toBe("Bot tok");
    expect(JSON.parse(x.fetched[0]!.init.body)).toMatchObject({ content: "olá" });
  });

  test("sem thread usa o chat do target; token e canal também podem vir do config", async () => {
    const m = await mod();
    const x = deps({ hermes: { exitCode: 1 }, config: { discord: { token: "cfg-tok" } } });
    await m.send({ target: "discord:123", text: "oi" }, x.d);
    expect(x.fetched[0]!.url).toBe("https://discord.com/api/v10/channels/123/messages");
    expect(x.fetched[0]!.init.headers.Authorization).toBe("Bot cfg-tok");
    const y = deps({ hermes: "throw", config: { discord: { token: "t", channel: "555" } } });
    await m.send({ target: "telegram:77", text: "oi" }, y.d);
    expect(y.fetched[0]!.url).toBe("https://discord.com/api/v10/channels/555/messages");
  });

  test("spawn que explode (hermes ausente) também cai no discord", async () => {
    const m = await mod();
    const x = deps({ hermes: "throw", env: DISCORD_ENV });
    const r = await m.send({ target: "discord:123", text: "oi" }, x.d);
    expect(r.via).toBe("discord");
    expect(r.attempts[0].reason).toContain("ENOENT");
  });
});

describe("stdout por último", () => {
  test("hermes e discord falham: escreve o texto em out e devolve ok com as duas razões", async () => {
    const m = await mod();
    const x = deps({ hermes: { exitCode: 2 }, http: 401, env: DISCORD_ENV });
    const r = await m.send({ target: "discord:123", text: "alerta" }, x.d);
    expect(r).toMatchObject({ ok: true, via: "stdout" });
    expect(x.out).toEqual(["alerta"]);
    expect(r.attempts.map((a: any) => [a.adapter, a.ok])).toEqual([["hermes", false], ["discord", false], ["stdout", true]]);
    expect(r.attempts[1].reason).toContain("401");
  });

  test("sem token: discord falha citando o token e não faz HTTP; rede caindo também cai no stdout", async () => {
    const m = await mod();
    const a = deps({ hermes: { exitCode: 1 } });
    const ra = await m.send({ target: "discord:123", text: "x" }, a.d);
    expect(ra.via).toBe("stdout");
    expect(a.fetched).toEqual([]);
    expect(ra.attempts[1].reason).toMatch(/token/i);
    const b = deps({ hermes: { exitCode: 1 }, http: "throw", env: DISCORD_ENV });
    const rb = await m.send({ target: "discord:123", text: "x" }, b.d);
    expect(rb.via).toBe("stdout");
    expect(rb.attempts[1].reason).toContain("rede caiu");
  });

  test("target que não é discord e sem canal configurado: discord falha por falta de canal", async () => {
    const m = await mod();
    const x = deps({ hermes: { exitCode: 1 }, env: { DISCORD_BOT_TOKEN: "tok" } });
    const r = await m.send({ target: "telegram:77", text: "x" }, x.d);
    expect(r.via).toBe("stdout");
    expect(x.fetched).toEqual([]);
    expect(r.attempts[1].reason).toMatch(/canal|channel/i);
  });
});

describe("sem segredos nem canal no código", () => {
  test("src/notify não cita ~/.hermes nem o canal padrão antigo", () => {
    const dir = join(ROOT, "src", "notify");
    let files: string[] = [];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    } catch {}
    expect(files).toEqual(expect.arrayContaining(["port.ts", "hermes.ts", "discord.ts", "stdout.ts"]));
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src).not.toContain("1563272747591803110");
      expect(src).not.toContain(".hermes");
    }
  });
});
