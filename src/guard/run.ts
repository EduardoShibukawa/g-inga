import { appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { checkCall, redact, type Deny, type Verdict } from "./core";
import denyDefault from "./deny.json";

export type Env = Record<string, string | undefined>;
export type Mode = "enforce" | "shadow" | "off";
export type GuardOptions = { env?: Env; cwd?: string; home?: string; deny?: Deny };
type EventName = "guard.block" | "guard.redact" | "guard.error";
type Event = { event: EventName; tool: string; rule: string; mode: Mode; call: string };

const laneByEnv = new WeakMap<Env, string>();

/** O escopo só existe em uma lane; fora dela o guard permanece inerte. */
export function mode(env: Env): Mode {
  const lane = env.GINGA_GUARD_LANE;
  if (!lane) {
    laneByEnv.delete(env);
    return "off";
  }
  laneByEnv.set(env, lane);
  const requested = env.GINGA_GUARD;
  return requested === "shadow" || requested === "off" ? requested : "enforce";
}

function digest(payload: string): string {
  return createHash("sha256").update(payload).digest("hex").slice(0, 12);
}

function shaJson(value: unknown): string {
  let payload = "";
  try { payload = JSON.stringify(value) ?? ""; } catch {}
  return digest(payload);
}

function writeEvent(env: Env, event: Event): void {
  const path = env.GINGA_GUARD_LOG;
  if (!path) return;
  try {
    const record = { ts: new Date().toISOString(), lane: laneByEnv.get(env) ?? "", ...event };
    appendFileSync(path, JSON.stringify(record) + "\n");
  } catch {}
}

export function guardCall(tool: string, input: Record<string, unknown>, o: GuardOptions = {}): Verdict {
  const env = o.env ?? process.env;
  const currentMode = mode(env);
  if (currentMode === "off") return { block: false };

  try {
    const deny = o.deny === undefined ? (denyDefault as Deny) : o.deny;
    const verdict = checkCall({
      tool,
      input,
      cwd: o.cwd ?? process.cwd(),
      home: o.home ?? env.HOME ?? homedir(),
    }, deny);
    if (verdict.block) {
      writeEvent(env, {
        event: "guard.block",
        tool,
        rule: verdict.rule,
        mode: currentMode,
        call: shaJson(input),
      });
      if (currentMode === "shadow") return { block: false };
    }
    return verdict;
  } catch {
    writeEvent(env, {
      event: "guard.error",
      tool,
      rule: "guard_error",
      mode: currentMode,
      call: shaJson(input),
    });
    return currentMode === "shadow"
      ? { block: false }
      : { block: true, rule: "guard_error", reason: "falha interna do guard (fail-closed)" };
  }
}

const SECRET_NAME = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i;

export function secretEnvValues(env: Env): string[] {
  const values: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (SECRET_NAME.test(name) && value && value.length >= 12) values.push(value);
  }
  return [...new Set(values)];
}

export function guardResult(text: string, o: GuardOptions = {}): string {
  const env = o.env ?? process.env;
  const currentMode = mode(env);
  if (currentMode === "off") return text;

  try {
    const deny = o.deny === undefined ? (denyDefault as Deny) : o.deny;
    const result = redact(text, deny, secretEnvValues(env));
    for (const rule of new Set(result.hits)) {
      writeEvent(env, {
        event: "guard.redact",
        tool: "result",
        rule,
        mode: currentMode,
        call: digest(text),
      });
    }
    return currentMode === "shadow" ? text : result.text;
  } catch {
    writeEvent(env, {
      event: "guard.error",
      tool: "result",
      rule: "guard_error",
      mode: currentMode,
      call: digest(text),
    });
    return currentMode === "shadow" ? text : "[REDACTED:guard_error]";
  }
}
