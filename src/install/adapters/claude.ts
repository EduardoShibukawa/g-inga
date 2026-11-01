import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Adapter, AdapterContext, Probe } from "../install";

export const CLAUDE_MARKETPLACE = "pi-" + "harness-local";
export const CLAUDE_PLUGIN_KEY = "pi-" + "harness" + "@" + "pi-" + "harness-local";

/** true quando o último apply projetou os hooks de handoff (entra no owned). */
let handoffHooksProjected = false;

/** Comando dos hooks de handoff projetados no settings.json (Stop + UserPromptSubmit). */
export const CLAUDE_HANDOFF_HOOK_CMD = "ginga handoff hook --runtime claude";
export const CLAUDE_HANDOFF_HOOK_EVENTS = ["Stop", "UserPromptSubmit"] as const;

/** Acrescenta (idempotente) as entradas de hook de handoff em `settings.hooks`, sem tocar as alheias. */
export function ensureHandoffHooks(settings: Record<string, unknown>): void {
  const raw = settings.hooks;
  const hooks: Record<string, unknown> =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  for (const ev of CLAUDE_HANDOFF_HOOK_EVENTS) {
    const cur = hooks[ev];
    const arr: unknown[] = Array.isArray(cur) ? [...cur] : [];
    const already = arr.some(
      (e) =>
        e !== null &&
        typeof e === "object" &&
        Array.isArray((e as Record<string, unknown>).hooks) &&
        ((e as Record<string, unknown>).hooks as unknown[]).some(
          (h) =>
            h !== null &&
            typeof h === "object" &&
            (h as Record<string, unknown>).command === CLAUDE_HANDOFF_HOOK_CMD,
        ),
    );
    if (!already) {
      arr.push({
        matcher: "",
        hooks: [{ type: "command", command: CLAUDE_HANDOFF_HOOK_CMD }],
      });
    }
    hooks[ev] = arr;
  }
  settings.hooks = hooks;
}


function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function configInvalid(message: string): Error {
  const err = new Error(message) as Error & { code?: string };
  err.code = "config_invalid";
  return err;
}

export const claudePluginListProbe: Probe = {
  check: "plugin_list",
  cmd: () => ["plugin", "list"],
  classify: (r: { exit: number; stdout: string }) => {
    if (r.exit !== 0) {
      return { status: "broken", detail: `plugin list exit ${r.exit}` };
    }
    const lines = r.stdout.split(/\r?\n/);
    const start = lines.findIndex((l) =>
      l.includes(CLAUDE_PLUGIN_KEY),
    );
    if (start === -1) {
      return {
        status: "degraded",
        detail: "plugin ausente em plugin list",
      };
    }
    let end = start + 1;
    while (end < lines.length && lines[end]!.trim() !== "") end++;
    const block = lines.slice(start, end).join("\n");
    if (block.includes("disabled")) {
      return { status: "degraded", detail: "plugin desabilitado" };
    }
    return { status: "ok", detail: "plugin habilitado" };
  },
};

export const claudePluginValidateProbe: Probe = {
  check: "plugin_validate",
  cmd: (ctx: { source: string }) => ["plugin", "validate", ctx.source],
  classify: (r: { exit: number; stdout: string }) => {
    if (r.exit !== 0) {
      return { status: "broken", detail: `plugin validate exit ${r.exit}` };
    }
    return { status: "ok", detail: "validação do plugin passou" };
  },
};

function claudePluginOf(ctx?: { plugin?: string } | undefined, self?: { plugin?: string }): string {
  return (ctx?.plugin ?? self?.plugin ?? ("pi-" + "harness")).trim() || ("pi-" + "harness");
}
function claudeMarketplace(plugin: string): string {
  return `${plugin}-local`;
}
function claudeKey(plugin: string): string {
  return `${plugin}@${plugin}-local`;
}

export const claudeAdapter: Adapter = {
  harness: "claude",
  bin: "claude",
  plugin: "pi-" + "harness",

  targets: [
    ".claude/plugins/known_marketplaces.json",
    ".claude/plugins/installed_plugins.json",
    ".claude/settings.json",
  ],

  get owned() {
    const plugin = this.plugin ?? ("pi-" + "harness");
    const market = claudeMarketplace(plugin);
    const key = claudeKey(plugin);
    const settingsOwned = [`/enabledPlugins/${key}`];
    if (handoffHooksProjected) {
      settingsOwned.push("/hooks/Stop");
      settingsOwned.push("/hooks/UserPromptSubmit");
    }
    return {
      ".claude/plugins/known_marketplaces.json": [`/${market}`],
      ".claude/plugins/installed_plugins.json": [`/plugins/${key}`],
      ".claude/settings.json": settingsOwned,
    };
  },

  get volatile() {
    const plugin = this.plugin ?? ("pi-" + "harness");
    const market = claudeMarketplace(plugin);
    const key = claudeKey(plugin);
    return {
      ".claude/plugins/known_marketplaces.json": [`/${market}/lastUpdated`],
      ".claude/plugins/installed_plugins.json": [
        `/plugins/${key}/0/installedAt`,
        `/plugins/${key}/0/lastUpdated`,
      ],
      ".claude/settings.json": [],
    };
  },

  append: { ".claude/settings.json": ["/hooks"] },

  probes: [claudePluginListProbe, claudePluginValidateProbe],

  apply(shadowHome: string, ctx: AdapterContext): void {
    const plugin = claudePluginOf(ctx, this);
    const market = claudeMarketplace(plugin);
    const key = claudeKey(plugin);
    // 1. known_marketplaces.json (ausente -> criado em cima de {})
    const mktPath = join(shadowHome, ".claude/plugins/known_marketplaces.json");
    const mkt = readJsonObject(mktPath);
    mkt[market] = {
      source: { source: "directory", path: ctx.source },
      installLocation: ctx.source,
      lastUpdated: ctx.now,
    };
    writeJson(mktPath, mkt);

    // 2. installed_plugins.json (version != 2 -> config_invalid; exit 12)
    const ipPath = join(shadowHome, ".claude/plugins/installed_plugins.json");
    let ip: Record<string, unknown>;
    if (existsSync(ipPath)) {
      ip = JSON.parse(readFileSync(ipPath, "utf8")) as Record<string, unknown>;
      if (ip.version !== 2) {
        throw configInvalid(
          `.claude/plugins/installed_plugins.json: version != 2 (config_invalid)`,
        );
      }
    } else {
      ip = { version: 2, plugins: {} };
    }
    if (
      ip.plugins === null ||
      typeof ip.plugins !== "object" ||
      Array.isArray(ip.plugins)
    ) {
      ip.plugins = {};
    }
    (ip.plugins as Record<string, unknown>)[key] = [
      {
        scope: "user",
        installPath: join(ctx.source, "claude-plugin"),
        version: "local",
        installedAt: ctx.now,
        lastUpdated: ctx.now,
      },
    ];
    writeJson(ipPath, ip);

    // 3. Verify handoff artifacts in source
    const hasHandoffSkills = existsSync(join(ctx.source, "skills", "handoff"));
    const hasHandoffMod = existsSync(join(ctx.source, "contrib", "claude-mod-handoff"));
    const sourceHasHandoff = hasHandoffSkills || hasHandoffMod;

    // 3. settings.json (ausente -> criado em cima de {})
    const settingsPath = join(shadowHome, ".claude/settings.json");
    const settings = readJsonObject(settingsPath);
    const plugins =
      settings.enabledPlugins === null ||
      typeof settings.enabledPlugins !== "object" ||
      Array.isArray(settings.enabledPlugins)
        ? {}
        : (settings.enabledPlugins as Record<string, unknown>);
    plugins[key] = true;

    // Project handoff hooks if condition met: ctx.plugin === undefined OR source has artifacts
    const shouldProjectHooks = ctx.plugin === undefined || sourceHasHandoff;
    handoffHooksProjected = shouldProjectHooks;

    if (shouldProjectHooks) {
      ensureHandoffHooks(settings);
    }

    // Register mod if source has contrib/claude-mod-handoff with plugin.json
    const modPluginPath = join(ctx.source, "contrib", "claude-mod-handoff", ".claude-plugin", "plugin.json");
    if (existsSync(modPluginPath)) {
      const modPlugin = readJsonObject(modPluginPath);
      const modName = modPlugin.name || "claude-mod-handoff";
      const modVersion = modPlugin.version || "local";
      const modKey = `${modName}@${CLAUDE_MARKETPLACE}`;

      // Register in installed_plugins.json
      if (
        ip.plugins === null ||
        typeof ip.plugins !== "object" ||
        Array.isArray(ip.plugins)
      ) {
        ip.plugins = {};
      }
      ip.plugins[modKey] = [
        {
          scope: "user",
          installPath: join(ctx.source, "contrib", "claude-mod-handoff"),
          version: modVersion,
          installedAt: ctx.now,
          lastUpdated: ctx.now,
        },
      ];

      // Enable in settings.enabledPlugins
      plugins[modKey] = true;
    }

    settings.enabledPlugins = plugins;
    writeJson(settingsPath, settings);

    // Update lastUpdated timestamps
    mkt[market].lastUpdated = ctx.now;
    writeJson(mktPath, mkt);

    ip.plugins[key][0].lastUpdated = ctx.now;
    writeJson(ipPath, ip);
  },
};