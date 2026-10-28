// Tabela de kinds/data do 07 (docs/events-v1.md). Campos de data com enum
// são checados; os demais são aceitos do tipo certo. Campos desconhecidos
// (no envelope ou dentro de data) são ignorados.

type DataSpec = {
  required: string[];
  enums?: Record<string, readonly string[]>;
  booleans?: readonly string[];
  strings?: readonly string[];
  numbers?: readonly string[];
};

const KINDS: Record<string, DataSpec> = {
  attempt: {
    required: ["runtime", "passed"],
    booleans: ["passed"],
    strings: ["runtime", "provider", "model", "family", "tier", "failure", "cost_source"],
    enums: { failure: ["done_when", "quota_exhausted", "timeout", "infra", "judge"] },
    numbers: ["attempt_n", "duration_ms", "tokens_in", "tokens_out"],
  },
  receipt: {
    // `check: "bdd"` (pi-harness) não tem ledger: ledger_n/hash só são
    // obrigatórios para os demais checks (ver validateEvent).
    required: ["status", "check"],
    strings: ["hash", "reason_code"],
    enums: {
      status: ["pass", "fail", "blocked", "not run"],
      check: ["prove-red", "verify", "judge", "bdd", "plan"],
    },
    numbers: ["ledger_n"],
  },
  transition: {
    required: ["entity", "from", "to", "by", "via"],
    strings: ["from", "to", "by"],
    enums: {
      entity: ["spec", "plan", "task"],
      via: ["web", "discord", "telegram", "cli", "tui"],
    },
  },
  blocker: {
    required: ["blocker_id", "question", "raised_by"],
    strings: ["blocker_id", "question", "raised_by"],
  },
  answer: {
    required: ["blocker_id", "answer"],
    strings: ["blocker_id", "answer", "by", "via"],
  },
  budget: {
    required: ["scope", "spent_usd", "cap_usd", "level"],
    strings: [],
    enums: { scope: ["task", "plan", "month"], level: ["warn", "cap"] },
    numbers: ["spent_usd", "cap_usd"],
  },
  quota: {
    required: ["provider", "used_pct"],
    strings: ["provider", "resets_at", "source"],
    numbers: ["used_pct", "window_minutes"],
  },
  handoff: {
    required: ["trigger", "context_tokens", "handoff_tokens"],
    strings: ["trigger", "file"],
    enums: { trigger: ["boundary", "context", "cache"] },
    numbers: ["context_tokens", "handoff_tokens", "est_saved_usd"],
  },
  learning: {
    required: ["learning_id", "status"],
    strings: ["learning_id"],
    enums: { status: ["confirmada", "descartada", "fato", "armadilha"] },
    booleans: ["promoted"],
  },
};

const REQUIRED = ["v", "ts", "source", "kind", "id"] as const;
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function validateEvent(ev: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof ev !== "object" || ev === null || Array.isArray(ev)) {
    return { ok: false, errors: ["envelope deve ser um objeto"] };
  }
  const obj = ev as Record<string, unknown>;

  for (const campo of REQUIRED) {
    if (obj[campo] === undefined || obj[campo] === null || obj[campo] === "") {
      errors.push(`campo obrigatório ausente: ${campo}`);
    }
  }
  if (obj.v !== undefined && typeof obj.v !== "number") errors.push("v deve ser um número");
  else if (typeof obj.v === "number" && obj.v !== 1) errors.push("v deve ser 1");
  if (obj.ts !== undefined && tsInvalida(obj.ts)) errors.push("ts não é um ISO válido");
  if (typeof obj.id === "string" && obj.id !== "" && !ULID.test(obj.id)) {
    errors.push("id não é um ULID");
  }
  if (obj.source !== undefined && typeof obj.source !== "string") {
    errors.push("source deve ser string");
  }
  if (obj.kind !== undefined && typeof obj.kind !== "string") errors.push("kind deve ser string");

  const spec = KINDS[obj.kind as string];
  if (!spec && typeof obj.kind === "string" && obj.kind !== "") {
    errors.push(`kind desconhecido: ${obj.kind}`);
  }
  if (spec) {
    if (obj.data === undefined || obj.data === null) {
      errors.push(`data obrigatório para kind ${obj.kind}`);
    } else if (typeof obj.data !== "object" || Array.isArray(obj.data)) {
      errors.push("data deve ser um objeto");
    } else {
      const data = obj.data as Record<string, unknown>;
      for (const campo of spec.required) {
        if (data[campo] === undefined || data[campo] === null || data[campo] === "") {
          errors.push(`data.${campo} obrigatório para kind ${obj.kind}`);
        }
      }
      // Receipt check "bdd" (pi-harness) não tem ledger: ledger_n/hash
      // opcionais; os demais checks continuam exigindo os dois.
      if (obj.kind === "receipt" && data.check !== "bdd") {
        for (const campo of ["ledger_n", "hash"]) {
          if (data[campo] === undefined || data[campo] === null || data[campo] === "") {
            errors.push(`data.${campo} obrigatório para kind receipt (check ${JSON.stringify(data.check)})`);
          }
        }
      }
      for (const [campo, valores] of Object.entries(spec.enums ?? {})) {
        if (data[campo] !== undefined && !valores.includes(data[campo] as string)) {
          errors.push(`data.${campo} inválido: ${JSON.stringify(data[campo])}`);
        }
      }
      for (const campo of spec.booleans ?? []) {
        if (campo in (spec.enums ?? {}) === false && data[campo] !== undefined && typeof data[campo] !== "boolean") {
          errors.push(`data.${campo} deve ser boolean`);
        }
      }
      for (const campo of spec.strings ?? []) {
        if (data[campo] !== undefined && !(spec.enums?.[campo] ?? []).includes(data[campo] as string) && typeof data[campo] !== "string") {
          errors.push(`data.${campo} deve ser string`);
        }
      }
      for (const campo of spec.numbers ?? []) {
        if (data[campo] !== undefined && typeof data[campo] !== "number") {
          errors.push(`data.${campo} deve ser número`);
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

function tsInvalida(ts: unknown): boolean {
  // ISO 8601 estrito em UTC: YYYY-MM-DDTHH:MM:SS(.sss)?Z
  if (typeof ts !== "string") return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{3})?Z$/.exec(ts);
  if (!match) return true;
  const date = new Date(ts);
  if (isNaN(date.getTime())) return true;
  // Date.parse normaliza valores fora da faixa (2026-02-30 → 03-02, 24:00 →
  // dia seguinte), então cada componente precisa bater com o instante em UTC.
  const [, y, mo, dia, h, mi, s] = match;
  return (
    date.getUTCFullYear() !== Number(y)
    || date.getUTCMonth() + 1 !== Number(mo)
    || date.getUTCDate() !== Number(dia)
    || date.getUTCHours() !== Number(h)
    || date.getUTCMinutes() !== Number(mi)
    || date.getUTCSeconds() !== Number(s)
  );
}
