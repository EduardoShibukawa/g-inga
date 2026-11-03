---
mode: padrao
goal: "syncCost grava o evento cost com ts = session.created (time_created da sessão, não a hora do sync) e atribui plan/task via planTaskForDirectory(root, directory) — corrige quota do zen, cap_ok do tick e cost_by (judge 2026-11-03T05:35)"
done_when: "bun test tests/cost_sync_ts.test.ts tests/cost_opencode_db.test.ts tests/quota.test.ts tests/quota_cap.test.ts tests/cost_cli_coverage.test.ts"
touch:
  - src/cost/opencode_db.ts
  - src/verbs/cost.ts
  - tests/cost_sync_ts.test.ts
tests_frozen:
  - tests/cost_sync_ts.test.ts
---
## Context
- PLAN-0014 TASK-17, follow-up do judge (gate 11 em 2026-11-03T05:35): `syncCost` grava ts=new Date() → sessão de 2026-10-05 US$40 vira evento de hoje, zen used_pct=400, quotaCapOk false, tick para; cost por dia e --since errados; plan/task nulos → cost_by por PLAN/SPEC não vê o importado.
- Em `src/cost/opencode_db.ts`: `syncCost(db, sessions, resolve?)` usa `session.created` como coluna `ts` e `event.ts`; novo export `planTaskForDirectory(root, directory)` (componente `<repo>-plan-NNNN` → nome completo resolvido em `<root>/plans/PLAN-<NNNN>-*` com PLAN.md, fallback `PLAN-<NNNN>`; componente `tasks/T(\d+)` → task `T<N>`). Com `resolve`, grava colunas plan/task e campos do envelope.
- `src/verbs/cost.ts` `costSync` passa `resolve = (dir) => planTaskForDirectory(ctx.root, dir)`.
- RED em `tests/cost_sync_ts.test.ts` (novo): ts da sessão antiga fica na data da sessão; readQuotas zen do mês corrente used_pct=0 com evento antigo de US$40; planTaskForDirectory resolve worktree/tasks; computeMetrics traz cost_by.plan. Não altere os frozen da TASK-07.
