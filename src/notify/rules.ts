// Regras de notificação (PLAN-0010 TASK-05, doc 05 §6): que evento vai a que
// canal. Eventos são fatos (doc 07): o router só decide e envia, nunca age.
// O padrão é sobrescrito por chave por `[notify.rules]` do project.toml.

export type RuleKey =
  | "blocker"
  | "task_blocked"
  | "approval"
  | "budget_warn"
  | "budget_cap"
  | "retry";

/** Canais padrão por chave de regra (05 §6). */
export const DEFAULT_RULES: Record<RuleKey, string[]> = {
  blocker: ["discord", "telegram"],
  task_blocked: ["discord", "telegram"],
  approval: ["discord"],
  budget_warn: ["discord"],
  budget_cap: ["discord", "telegram"],
  retry: [],
};

/** Chave de regra do evento, ou null quando não notifica. */
export function classify(ev: Record<string, any> | null | undefined): RuleKey | null {
  if (!ev || typeof ev !== "object") return null;
  const data = ev.data ?? {};
  switch (ev.kind) {
    case "blocker":
      return "blocker";
    case "budget":
      if (data.level === "warn") return "budget_warn";
      if (data.level === "cap") return "budget_cap";
      return null;
    case "transition":
      if (data.entity === "task" && data.to === "blocked") return "task_blocked";
      if ((data.entity === "plan" || data.entity === "spec") && data.to === "awaiting_approval")
        return "approval";
      return null;
    case "attempt":
      return data.passed === false ? "retry" : null;
    default:
      return null;
  }
}
