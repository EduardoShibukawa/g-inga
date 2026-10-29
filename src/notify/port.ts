export type NotifyInput = { target: string; text: string; thread?: string };

export async function send(input: NotifyInput, deps: any = {}): Promise<{ ok: boolean; via: string; attempts: any[]; thread_id?: string }> {
  // thread_id devolvido ao router (T22): no hermes, o id que ele imprime no
  // stdout; no discord, a thread usada no POST; no stdout, nada. Sem isso o
  // router nunca persiste a thread por PLAN.
  const finish = (ok: boolean, via: string, thread_id?: string) =>
    ({ ok, via, attempts, ...(thread_id !== undefined ? { thread_id } : {}) });
  const hermesThread = (stdout: unknown): string | undefined => {
    const s = typeof stdout === "string" ? stdout : stdout == null ? "" : stdout.toString();
    const m = /(?:^|\s)thread_id[=:]\s*([A-Za-z0-9_-]+)/.exec(s);
    return m && m[1] !== "" ? m[1] : undefined;
  };
  const env = deps?.env ?? {};
  const config = deps?.config ?? {};
  const attempts: any[] = [];

  const target = input.target;
  const text = input.text;
  const thread = input.thread;

  // 1. hermes
  const hermesTarget = thread ? `${target}:${thread}` : target;
  let hermesReason = "";
  try {
    const res = await deps.spawn(["hermes", "send", "-t", hermesTarget, text]);
    if (res && res.exitCode === 0) {
      attempts.push({ adapter: "hermes", ok: true });
      return finish(true, "hermes", hermesThread(res?.stdout) ?? input.thread ?? undefined);
    }
    hermesReason = (res && (res.stderr || `exit ${res.exitCode}`)) || "hermes failed";
  } catch (e: any) {
    hermesReason = (e && e.message) || String(e);
  }
  attempts.push({ adapter: "hermes", ok: false, reason: hermesReason });

  // 2. discord
  const discordConfig = (config && config.discord) || {};
  const token = env.DISCORD_BOT_TOKEN ?? discordConfig.token;
  const parts = String(target).split(":");
  const platform = parts[0];
  const chat = parts[1];
  let channel: string | undefined;
  if (thread) channel = thread;
  else if (platform === "discord") channel = chat;
  else channel = env.DISCORD_CHANNEL_ID ?? discordConfig.channel;

  if (!token) {
    attempts.push({ adapter: "discord", ok: false, reason: "missing discord token" });
  } else if (!channel) {
    attempts.push({ adapter: "discord", ok: false, reason: "missing discord channel" });
  } else {
    // T22: `fetch` vem injetado; sem injeção, o fetch global do runtime.
    const doFetch = typeof deps.fetch === "function" ? deps.fetch : globalThis.fetch;
    try {
      const res = await doFetch(`https://discord.com/api/v10/channels/${channel}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${token}` },
        body: JSON.stringify({ content: text }),
      });
      if (res && res.ok) {
        attempts.push({ adapter: "discord", ok: true });
        if (input.thread) return finish(true, "discord", input.thread);
        // T26: sem thread de entrada, o ID da mensagem criada vira a thread
        // (o router grava em plan_thread e reusa nos envios seguintes).
        // JSON indisponível ou sem `id`: devolve sem thread_id, sem falhar.
        let msgId: string | undefined;
        try {
          const body = await res.json();
          if (body && typeof body.id === "string" && body.id !== "") msgId = body.id;
        } catch {}
        return finish(true, "discord", msgId);
      }
      const reason = `discord http ${res ? res.status : "error"}`;
      attempts.push({ adapter: "discord", ok: false, reason });
    } catch (e: any) {
      const reason = (e && e.message) || String(e);
      attempts.push({ adapter: "discord", ok: false, reason });
    }
  }

  // 3. stdout
  if (typeof deps.out === "function") deps.out(text);
  attempts.push({ adapter: "stdout", ok: true });
  return finish(true, "stdout");
}
