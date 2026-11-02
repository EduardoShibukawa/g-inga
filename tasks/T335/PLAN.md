---
mode: padrao
goal: "As 10 tasks do code mode têm schema de resposta, Oracle que dá 10/10 no snapshot sintético e verifier exato que aceita uma solução alternativa"
title: Tasks, Oracle e verifier (H5) — PLAN-0016 TASK-01
plan: PLAN-0016-validar-code-mode
repo: ginga
depends_on: []
tier: medium
touch: [bench/code-mode/tasks.ts, bench/code-mode/oracle.ts, tests/code_mode/oracle.test.ts, tests/fixtures/code-mode/snapshot/]
done_when: "bun test tests/code_mode/oracle.test.ts"
tests_frozen: [tests/code_mode/oracle.test.ts, tests/fixtures/code-mode/snapshot/plans/PLAN-0001-alpha/PLAN.md, tests/fixtures/code-mode/snapshot/plans/PLAN-0001-alpha/TASK-01-a.md, tests/fixtures/code-mode/snapshot/plans/PLAN-0001-alpha/TASK-02-b.md, tests/fixtures/code-mode/snapshot/plans/PLAN-0001-alpha/log.md, tests/fixtures/code-mode/snapshot/plans/PLAN-0002-beta/PLAN.md, tests/fixtures/code-mode/snapshot/plans/PLAN-0002-beta/TASK-01-x.md, tests/fixtures/code-mode/snapshot/plans/PLAN-0002-beta/log.md, tests/fixtures/code-mode/snapshot/plans/PLAN-0003-gamma/PLAN.md, tests/fixtures/code-mode/snapshot/plans/PLAN-0003-gamma/log.md, tests/fixtures/code-mode/snapshot/plans/PLAN-0004-delta/PLAN.md, tests/fixtures/code-mode/snapshot/plans/PLAN-0004-delta/log.md, tests/fixtures/code-mode/snapshot/runs/a.log, tests/fixtures/code-mode/snapshot/runs/b.log, tests/fixtures/code-mode/snapshot/runs/c.jsonl, tests/fixtures/code-mode/snapshot/runs/d.jsonl]
pinga_task: T335
---
## Context
- PLAN-0016 TASK-01 (H5): tasks de pergunta com resposta exata sobre o snapshot; Oracle sem LLM; verifier exato.
- Só o fixture sintético em tests/fixtures/code-mode/snapshot/; nunca dado real do workspace.
## Interface
- bench/code-mode/tasks.ts: CMTask, TASKS (exatamente 10, ids t01..t10), oracle(task, snapshot), verify(task, answer, snapshot): 0|1 (normaliza ordem de listas e números com 2 casas).
- Oracle lê arquivos do snapshot (plans/*/PLAN.md, TASK-*.md, log.md, runs/*); verify compara com a resposta do Oracle normalizada.
