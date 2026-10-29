export type Alert = {
  rule_id: string;
  severity: string;
  entity: string;
  summary: string;
  dedupe_key: string;
  actions: string[];
};

function asEvents(input: any[]): any[] {
  return Array.isArray(input) ? input : [];
}

function num(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function tsMs(e: any): number {
  const t = Date.parse(e?.ts);
  return Number.isFinite(t) ? t : 0;
}

export function evaluateWatch(events: any[], rules?: any[]): Alert[] {
  const evs = asEvents(events);
  const rs = Array.isArray(rules) && rules.length > 0 ? rules : null;
  // default rules if none
  const ruleIds = (rs ?? []).map((r: any) => r.id);
  const has = (id: string) => rs === null || ruleIds.includes(id);

  const alerts: Alert[] = [];
  const seen = new Set<string>();

  const push = (rule_id: string, severity: string, entity: string, summary: string, action?: string) => {
    const key = `${rule_id}:${entity}`;
    if (seen.has(key)) return;
    seen.add(key);
    alerts.push({
      rule_id,
      severity,
      entity,
      summary,
      dedupe_key: key,
      actions: action ? [action] : [],
    });
  };

  // no_progress: heartbeat com progress constante (>=2) e alive
  if (has("no_progress")) {
    const hearts = evs.filter((e) => e?.kind === "heartbeat");
    const byEntity = new Map<string, any[]>();
    for (const h of hearts) {
      const ent = String(h?.data?.entity ?? "unknown");
      if (!byEntity.has(ent)) byEntity.set(ent, []);
      byEntity.get(ent)!.push(h);
    }
    for (const [ent, hs] of byEntity) {
      hs.sort((a, b) => tsMs(a) - tsMs(b));
      if (hs.length < 2) continue;
      const progresses = hs.map((h) => h?.data?.progress);
      const allSame = progresses.every((p) => p === progresses[0]);
      const anyAlive = hs.some((h) => h?.data?.alive === true || h?.data?.alive === undefined);
      if (allSame && anyAlive) {
        const sev = (rs?.find((r: any) => r.id === "no_progress")?.severity) ?? "high";
        const action = (rs?.find((r: any) => r.id === "no_progress")?.action);
        push("no_progress", sev, ent, "heartbeat sem progresso novo na janela", action);
      }
    }
  }

  // lane_dead: lane.round start sem end
  if (has("lane_dead")) {
    const rounds = evs.filter((e) => e?.kind === "lane.round");
    const starts = rounds.filter((e) => e?.data?.phase === "start");
    const ends = new Set(rounds.filter((e) => e?.data?.phase === "end").map((e) => e?.data?.lane));
    for (const s of starts) {
      const lane = String(s?.data?.lane ?? "unknown");
      if (ends.has(lane)) continue;
      const sev = (rs?.find((r: any) => r.id === "lane_dead")?.severity) ?? "high";
      const action = (rs?.find((r: any) => r.id === "lane_dead")?.action);
      push("lane_dead", sev, lane, "lane sem heartbeat/end na janela", action);
    }
  }

  // main_moved_outside_gate: heartbeats presentes e nenhum gate.result
  if (has("main_moved_outside_gate")) {
    const hearts = evs.filter((e) => e?.kind === "heartbeat");
    const gates = evs.filter((e) => e?.kind === "gate.result");
    if (hearts.length > 0 && gates.length === 0) {
      const ent = String(hearts[0]?.data?.entity ?? "repo");
      const sev = (rs?.find((r: any) => r.id === "main_moved_outside_gate")?.severity) ?? "critical";
      const action = (rs?.find((r: any) => r.id === "main_moved_outside_gate")?.action);
      push("main_moved_outside_gate", sev, ent, "mudança em main sem gate.result", action);
    }
  }

  // judge_shopping: >=2 receipts judge com mesmo hash
  if (has("judge_shopping")) {
    const receipts = evs.filter((e) => e?.kind === "receipt" && (e?.data?.check === "judge" || e?.source === "judge"));
    if (receipts.length >= 2) {
      // same hash or same plan
      const hashes = receipts.map((r) => r?.data?.hash);
      const allSameHash = hashes.every((h) => h === hashes[0]) && hashes[0] !== undefined;
      if (allSameHash || receipts.length >= 2) {
        const sev = (rs?.find((r: any) => r.id === "judge_shopping")?.severity) ?? "warn";
        const action = (rs?.find((r: any) => r.id === "judge_shopping")?.action);
        push("judge_shopping", sev, "judge", "mais de um veredito para o mesmo HEAD", action);
      }
    }
  }

  // report_mismatch: attempt passed true + receipt verify fail/blocked
  if (has("report_mismatch")) {
    const attempts = evs.filter((e) => e?.kind === "attempt");
    const receipts = evs.filter((e) => e?.kind === "receipt" && e?.data?.check === "verify");
    const claimedPass = attempts.some((a) => a?.data?.passed === true);
    const receiptFail = receipts.some((r) => r?.data?.status === "fail" || r?.data?.status === "blocked");
    if (claimedPass && receiptFail) {
      const sev = (rs?.find((r: any) => r.id === "report_mismatch")?.severity) ?? "warn";
      const action = (rs?.find((r: any) => r.id === "report_mismatch")?.action);
      push("report_mismatch", sev, "report", "afirmação de pass com receipt não done", action);
    }
  }

  // goal_reached: gate.result code 0 presentes + alvo.check ok, sem falha
  if (has("goal_reached")) {
    const gates = evs.filter((e) => e?.kind === "gate.result");
    const alvos = evs.filter((e) => e?.kind === "alvo.check");
    const allPass = gates.length > 0 && gates.every((g) => num(g?.data?.code) === 0);
    const alvoOk = alvos.length > 0 && alvos.some((a) => a?.data?.ok === true);
    const noFailGate = gates.every((g) => num(g?.data?.code) === 0);
    if (allPass && alvoOk && noFailGate) {
      const sev = (rs?.find((r: any) => r.id === "goal_reached")?.severity) ?? "info";
      const action = (rs?.find((r: any) => r.id === "goal_reached")?.action);
      push("goal_reached", sev, "goal", "nenhuma pendência e checks do ALVO verdes", action);
    }
  }

  return alerts;
}
