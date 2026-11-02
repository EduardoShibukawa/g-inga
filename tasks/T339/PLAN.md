---
mode: mvp
goal: "A skill do modo C explica como responder com bash, rg, jq e sqlite3, e agentConfig gera o opencode.json de cada modo"
title: Superfície C e config do agente por modo
plan: PLAN-0016-validar-code-mode
repo: ginga
depends_on: [T338]
tier: free
touch: [bench/code-mode/surfaces/c-skill.md, bench/code-mode/config.ts, tests/code_mode/config.test.ts]
done_when: "bun test tests/code_mode/config.test.ts"
tests_frozen: [tests/code_mode/config.test.ts]
pinga_task: T339
---
## Context
- PLAN-0016 TASK-04 (depende da 03: a config cita as três superfícies). agentConfig(mode, {snapshot, repoDir}) → opencode.json; M/X desligam bash, C liga bash + skill, sem MCP; permission sem escrita fora do workdir. Não instala nada em ~/.config/opencode.
