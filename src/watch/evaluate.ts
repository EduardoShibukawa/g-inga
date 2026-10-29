// Avaliador determinístico das regras do vigia (PLAN-0023 TASK-02).
// Cada regra é aplicada com a sua configuração (window_minutes, threshold,
// severity, action) — não apenas filtrada por id.

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
  if (typeof v === "boolean") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function tsMs(e: any): number {
  const t = Date.parse(e?.ts);
  return Number.isFinite(t) ? t : 0;
}

function ruleFor(rules: any[] | null, id: string): any {
  if (!rules) return undefined;
  return rules.find((r: any) => r && r.id === id);
}

function sev(rules: any[] | null, id: string, fallback: string): string {
  const r = ruleFor(rules, id);
  return (r && typeof r.severity === "string" && r.severity !== "") ? r.severity : fallback;
}

function action(rules: any[] | null, id: string): string | undefined {
  const r = ruleFor(rules, id);
  if (!r) return undefined;
  return typeof r.action === "string" && r.action !== "" ? r.action : undefined;
}

function windowMin(rules: any[] | null, id: string, fallback: number): number {
  const r = ruleFor(rules, id);
  const n = num(r?.window_minutes);
  return n !== null && n >= 0 ? n : fallback;
}

function threshold(rules: any[] | null, id: string, fallback: number): number {
  const r = ruleFor(rules, id);
  const n = num(r?.threshold);
  return n !== null && n >= 0 ? n : fallback;
}

export function evaluateWatch(events: any[], rules?: any[]): Alert[] {
  const evs = asEvents(events);
  const rs = Array.isArray(rules) && rules.length > 0 ? rules : null;
  // default rules when none provided
  const effectiveRules = rs ?? null;

  const alerts: Alert[] = [];
  const seen = new Set<string>();

  const push = (rule_id: string, severity: string, entity: string, summary: string, act?: string | string[]) => {
    const key = `${rule_id}:${entity}`;
    if (seen.has(key)) return;
    seen.add(key);
    const acts = Array.isArray(act) ? act : (act ? [act] : []);
    alerts.push({
      rule_id,
      severity,
      entity,
      summary,
      dedupe_key: key,
      actions: acts,
    });
  };

  const has = (id: string) => effectiveRules === null || effectiveRules.some((r: any) => r && r.id === id);

  // no_progress: heartbeat com progress constante por >= window_minutes.
  if (has("no_progress")) {
    const hearts = evs.filter((e) => e?.kind === "heartbeat");
    const byEntity = new Map<string, any[]>();
    for (const h of hearts) {
      const ent = String(h?.data?.entity ?? "unknown");
      if (!byEntity.has(ent)) byEntity.set(ent, []);
      byEntity.get(ent)!.push(h);
    }
    const win = windowMin(effectiveRules, "no_progress", 30);
    const thr = Math.max(1, threshold(effectiveRules, "no_progress", 1));
    for (const [ent, hs] of byEntity) {
      hs.sort((a, b) => tsMs(a) - tsMs(b));
      if (hs.length < thr + 1) continue;
      const progresses = hs.map((h) => h?.data?.progress);
      const allSame = progresses.every((p) => p === progresses[0]);
      const anyAlive = hs.some((h) => h?.data?.alive === true || h?.data?.alive === undefined);
      if (!allSame || !anyAlive) continue;
      if (win > 0) {
        const span = tsMs(hs[hs.length - 1]) - tsMs(hs[0]);
        if (span < win * 60 * 1000) continue;
      }
      const sevV = sev(effectiveRules, "no_progress", "high");
      const act = action(effectiveRules, "no_progress") ?? "kill_and_retry";
      const acts = act === "kill_and_retry" ? ["kill_and_retry", "rotate_model"] : [act, "rotate_model"];
      push("no_progress", sevV, ent, "heartbeat sem progresso novo na janela", acts);
    }
  }

  // lane_dead: lane.round start sem end correspondente.
  if (has("lane_dead")) {
    const rounds = evs.filter((e) => e?.kind === "lane.round");
    const starts = rounds.filter((e) => e?.data?.phase === "start");
    const ends = new Set(rounds.filter((e) => e?.data?.phase === "end").map((e) => e?.data?.lane));
    const thr = Math.max(1, threshold(effectiveRules, "lane_dead", 1));
    let count = 0;
    for (const s of starts) {
      const lane = String(s?.data?.lane ?? "unknown");
      if (ends.has(lane)) continue;
      count++;
    }
    if (count >= thr) {
      // alert per unended lane
      for (const s of starts) {
        const lane = String(s?.data?.lane ?? "unknown");
        if (ends.has(lane)) continue;
        const sevV = sev(effectiveRules, "lane_dead", "high");
        const act = action(effectiveRules, "lane_dead");
        push("lane_dead", sevV, lane, "lane sem heartbeat/end na janela", act ?? "restart_lane");
      }
    }
  }

  const MAIN_SHA_KEYS = ["main_sha", "main_head", "head_sha", "git_sha", "ref_sha", "main_ref", "head", "sha", "main", "main_commit", "refs_heads_main"];
  const mainShaOf = (h: any): string | null => {
    const d = h?.data ?? {};
    for (const k of MAIN_SHA_KEYS) {
      const v = d[k];
      if (typeof v === "string" && v !== "") return v;
    }
    return null;
  };

  // main_moved_outside_gate: SHA de refs/heads/main mudou entre ticks sem gate.result.
  if (has("main_moved_outside_gate")) {
    const hearts = evs.filter((e) => e?.kind === "heartbeat");
    const gates = evs.filter((e) => e?.kind === "gate.result");
    let moved = false;
    const shas = hearts.map(mainShaOf);
    const hasSha = shas.some((s) => s !== null);
    if (!hasSha) {
      // Sem SHA de main disponível: não avalia (resultado unknown) e avisa.
      if (hearts.length > 0) {
        const ent = String(hearts[0]?.data?.entity ?? "repo");
        push("main_moved_outside_gate", "warn", ent, "sem SHA de main no heartbeat", "alert");
      }
      moved = false;
    } else {
      const distinct = new Set(shas.filter((s) => s !== null));
      moved = distinct.size >= 2;
    }
    if (moved && gates.length === 0) {
      const ent = String(hearts[0]?.data?.entity ?? "repo");
      const sevV = sev(effectiveRules, "main_moved_outside_gate", "critical");
      const act = action(effectiveRules, "main_moved_outside_gate");
      push("main_moved_outside_gate", sevV, ent, "mudança em main sem gate.result", act ?? "alert_critical");
    }
  }

  // judge_shopping: >= threshold vereditos judge com mesmo hash.
  if (has("judge_shopping")) {
    const receipts = evs.filter((e) => e?.kind === "receipt" && (e?.data?.check === "judge" || e?.source === "judge"));
    const thr = Math.max(2, threshold(effectiveRules, "judge_shopping", 2));
    if (receipts.length >= thr) {
      const hashes = receipts.map((r) => r?.data?.hash);
      const allSameHash = hashes.length > 0 && hashes.every((h) => h === hashes[0]) && hashes[0] !== undefined;
      if (allSameHash) {
        const sevV = sev(effectiveRules, "judge_shopping", "warn");
        const act = action(effectiveRules, "judge_shopping");
        push("judge_shopping", sevV, "judge", "mais de um veredito para o mesmo HEAD", act ?? "alert");
      }
    }
  }

  // report_mismatch: attempt passed true + receipt verify fail/blocked.
  if (has("report_mismatch")) {
    const attempts = evs.filter((e) => e?.kind === "attempt");
    const receipts = evs.filter((e) => e?.kind === "receipt" && e?.data?.check === "verify");
    const claimedPass = attempts.some((a) => a?.data?.passed === true);
    const receiptFail = receipts.some((r) => r?.data?.status === "fail" || r?.data?.status === "blocked");
    if (claimedPass && receiptFail) {
      const sevV = sev(effectiveRules, "report_mismatch", "warn");
      const act = action(effectiveRules, "report_mismatch");
      push("report_mismatch", sevV, "report", "afirmação de pass com receipt não done", act ?? "alert");
    }
  }

  // goal_reached: todos os gate.result code 0 + todos os alvo.check ok + sem pendência.
  if (has("goal_reached")) {
    const gates = evs.filter((e) => e?.kind === "gate.result");
    const alvos = evs.filter((e) => e?.kind === "alvo.check");
    const rounds = evs.filter((e) => e?.kind === "lane.round");
    const starts = rounds.filter((e) => e?.data?.phase === "start");
    // Pareia start/end por ordem temporal: um end só fecha um start anterior.
    const lanesSet = new Set(rounds.map((r: any) => String(r?.data?.lane ?? "unknown")));
    let hasPendingLane = false;
    for (const lane of lanesSet) {
      const lr = rounds
        .filter((r: any) => String(r?.data?.lane ?? "unknown") === lane)
        .sort((a: any, b: any) => tsMs(a) - tsMs(b));
      let open = 0;
      for (const r of lr) {
        if (r?.data?.phase === "start") open++;
        else if (r?.data?.phase === "end") { if (open > 0) open--; }
      }
      if (open > 0) { hasPendingLane = true; break; }
    }
    const allPass = gates.length > 0 && gates.every((g) => num(g?.data?.code) === 0);
    const alvoOk = alvos.length > 0 && alvos.every((a) => a?.data?.ok === true);
    if (allPass && alvoOk && !hasPendingLane) {
      const sevV = sev(effectiveRules, "goal_reached", "info");
      const act = action(effectiveRules, "goal_reached");
      push("goal_reached", sevV, "goal", "nenhuma pendência e checks do ALVO verdes", act ?? "notify_done");
    }
  }

  return alerts;
}
