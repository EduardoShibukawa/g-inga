export type NotifyInput = { target: string; text: string; thread?: string };

export async function send(input: NotifyInput, deps: any = {}): Promise<{ ok: boolean; via: string; attempts: any[] }> {
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
      return { ok: true, via: "hermes", attempts };
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
    try {
      const res = await deps.fetch(`https://discord.com/api/v10/channels/${channel}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${token}` },
        body: JSON.stringify({ content: text }),
      });
      if (res && res.ok) {
        attempts.push({ adapter: "discord", ok: true });
        return { ok: true, via: "discord", attempts };
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
  return { ok: true, via: "stdout", attempts };
}
