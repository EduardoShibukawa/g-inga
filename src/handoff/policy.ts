// Política de handoff automático (doc 11 §1): decide quando sugerir ou
// redirecionar a sessão para o ginga, a partir de [handoff] no project.toml.

export type HandoffCfg = {
  mode: "off" | "suggest" | "auto";
  idle_min: number;        // minutos de inatividade para gatilhar idle
  context_tokens: number;  // threshold para gatilhar contexto
  min_context_tokens: number; // threshold mínimo de contexto para idle
  cooldown_min: number;    // minutos de cooldown após um handoff
  max_chain: number;       // depth máximo antes de recusar
  summary: boolean;        // inclui resumo no handoff
  model?: string;          // modelo usado na abertura da sessão seguinte
};

export type HandoffState = {
  now: Date;
  lastApiTs: Date;
  contextTokens: number;
  interactive: boolean;
  depth: number;
  lastHandoffTs: Date | null;
  event: "prompt" | "turn_end";
};

export type HandoffDecision = {
  action: "none" | "prepare" | "redirect";
  trigger: "idle" | "context" | null;
  reason: string;
};

const DEFAULTS: HandoffCfg = {
  mode: "suggest",
  idle_min: 55,
  context_tokens: 110000,
  min_context_tokens: 30000,
  cooldown_min: 30,
  max_chain: 3,
  summary: false,
};

const VALID_MODES = new Set(["off", "suggest", "auto"]);
const NUM_FIELDS = ["idle_min", "context_tokens", "min_context_tokens", "cooldown_min", "max_chain"] as const;
const BOOL_FIELDS = ["summary"] as const;
const STRING_FIELDS = ["model"] as const;

function applyFields(cfg: HandoffCfg, src: Record<string, unknown> | undefined) {
  if (!src) return;
  if (typeof src.mode === "string" && VALID_MODES.has(src.mode)) {
    cfg.mode = src.mode as HandoffCfg["mode"];
  }
  for (const k of NUM_FIELDS) {
    if (typeof src[k] === "number") (cfg as any)[k] = src[k];
  }
  for (const k of BOOL_FIELDS) {
    if (typeof src[k] === "boolean") (cfg as any)[k] = src[k];
  }
  for (const k of STRING_FIELDS) {
    if (typeof src[k] === "string" && src[k].trim() !== "") {
      (cfg as any)[k] = src[k].trim();
    }
  }
}

/** Parseia o config `[handoff]` + `[handoff.<runtime>]` de um project.toml (objeto já parseado). */
export function parseHandoffCfg(toml: Record<string, unknown>, runtime: string): HandoffCfg {
  const cfg: HandoffCfg = { ...DEFAULTS };
  applyFields(cfg, (toml?.handoff ?? undefined) as Record<string, unknown> | undefined);
  applyFields(cfg, (toml?.[`handoff.${runtime}`] ?? undefined) as Record<string, unknown> | undefined);
  return cfg;
}

/** Decide a ação de handoff a partir do estado atual da sessão. */
export function decideHandoff(cfg: HandoffCfg, s: HandoffState): HandoffDecision {
  const MIN = 60 * 1000;

  // sessão não interativa → none
  if (!s.interactive) {
    return { action: "none", trigger: null, reason: "sessão não interativa" };
  }

  // dentro do cooldown → none
  if (s.lastHandoffTs) {
    const sinceLast = (s.now.getTime() - s.lastHandoffTs.getTime()) / MIN;
    if (sinceLast < cfg.cooldown_min) {
      return { action: "none", trigger: null, reason: `dentro do cooldown (${Math.round(sinceLast)} < ${cfg.cooldown_min} min)` };
    }
  }

  // depth >= max_chain → none
  if (s.depth >= cfg.max_chain) {
    return { action: "none", trigger: null, reason: `cadeia máxima atingida (depth ${s.depth} >= ${cfg.max_chain})` };
  }

  // modo off → none
  if (cfg.mode === "off") {
    return { action: "none", trigger: null, reason: "handoff desativado (mode=off)" };
  }

  // idle: evento "prompt", ocioso > idle_min, contexto >= min_context_tokens
  if (s.event === "prompt" && cfg.idle_min > 0) {
    const idleMin = (s.now.getTime() - s.lastApiTs.getTime()) / MIN;
    if (idleMin > cfg.idle_min && s.contextTokens >= cfg.min_context_tokens) {
      if (cfg.mode === "auto") {
        return { action: "redirect", trigger: "idle", reason: `ocioso ${Math.round(idleMin)} min > ${cfg.idle_min}` };
      }
      // mode = "suggest": prepara, nunca redireciona
      return { action: "prepare", trigger: "idle", reason: `ocioso ${Math.round(idleMin)} min (suggest)` };
    }
  }

  // context: evento "turn_end", contexto >= context_tokens
  if (s.event === "turn_end" && s.contextTokens >= cfg.context_tokens) {
    return { action: "prepare", trigger: "context", reason: `contexto ${s.contextTokens} >= ${cfg.context_tokens}` };
  }

  return { action: "none", trigger: null, reason: "fora dos gatilhos" };
}
