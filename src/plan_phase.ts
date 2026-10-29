import { Database } from "bun:sqlite";
import { emitEvent } from "./events/emit";

export type Phase =
  | "approved"
  | "red"
  | "tasks"
  | "judge"
  | "merge"
  | "done"
  | "replan"
  | "blocked";

export type PlanPhase = {
  phase: Phase;
  since: string;
  replans: number;
};

function ensureTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS plan_phase (
      plan PRIMARY KEY,
      phase TEXT,
      since TEXT,
      replans INTEGER NOT NULL DEFAULT 0
    )
  `);
}

export function getPhase(db: Database, plan: string): PlanPhase | null {
  ensureTable(db);
  const row = db
    .query("SELECT phase, since, replans FROM plan_phase WHERE plan = ?")
    .get(plan) as { phase: Phase; since: string; replans: number } | undefined;
  if (!row) return null;
  return {
    phase: row.phase,
    since: row.since,
    replans: Number(row.replans ?? 0),
  };
}

export function setPhase(db: Database, plan: string, phase: Phase, reason: string): void {
  ensureTable(db);
  const existing = db
    .query("SELECT phase, since, replans FROM plan_phase WHERE plan = ?")
    .get(plan) as { phase: Phase; since: string; replans: number } | undefined;

  const now = new Date().toISOString();
  if (!existing) {
    db.query("INSERT INTO plan_phase(plan, phase, since, replans) VALUES(?, ?, ?, 0)").run(
      plan,
      phase,
      now,
    );
    // Emite transition na primeira mudança? Teste diz: approved -> red -> tasks gera 2 eventos
    // Primeira chamada setPhase para approved não gera evento no teste - só quando muda para red e depois para tasks
    // Olhando teste: setPhase(db, "PLAN-0028", "approved", "inicio") - depois red e tasks geram 2 eventos
    // Então só emite transition quando há from/to (mudança). Na primeira vez, não tem "from" anterior? Ou emite mesmo assim?
    // Teste espera 2 eventos após as 2 mudanças (red, tasks). approved foi o primeiro set, não gerou evento.
    return;
  }

  if (existing.phase === phase) {
    if (phase === "replan") {
      const replans = Number(existing.replans ?? 0) + 1;
      db.query("UPDATE plan_phase SET replans = ? WHERE plan = ?").run(replans, plan);
      // Também atualiza phase? Mantém replan
      db.query("UPDATE plan_phase SET phase = ?, since = ? WHERE plan = ?").run(phase, now, plan);
      emitEvent({
        source: "ginga",
        kind: "transition",
        plan,
        data: {
          entity: "plan",
          from: existing.phase,
          to: phase,
          reason,
          by: "system",
          via: "cli",
        },
      });
    } else {
      // mesma fase, não emite transition? Só conta replans em caso de replan
      db.query("UPDATE plan_phase SET since = ? WHERE plan = ?").run(now, plan);
    }
    return;
  }

  if (phase === "replan") {
    const replans = Number(existing.replans ?? 0) + 1;
    db.query("UPDATE plan_phase SET phase = ?, since = ?, replans = ? WHERE plan = ?").run(
      phase,
      now,
      replans,
      plan,
    );
  } else {
    db.query("UPDATE plan_phase SET phase = ?, since = ? WHERE plan = ?").run(phase, now, plan);
  }

  emitEvent({
    source: "ginga",
    kind: "transition",
    plan,
    data: {
      entity: "plan",
      from: existing.phase,
      to: phase,
      reason,
      by: "system",
      via: "cli",
    },
  });
}
