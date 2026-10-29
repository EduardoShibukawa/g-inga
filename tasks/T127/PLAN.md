---
mode: padrao
goal: "ginga init cria .ginga/ e project.toml num repo novo a partir do que detecta, sem sobrescrever nada"
done_when: "bun test tests/init.test.ts"
touch:
  - src/init.ts
  - src/verbs/init.ts
  - src/verbs/registry.ts
  - src/cli.ts
  - tests/init.test.ts
  - tasks/T127/PLAN.md
tests_frozen: [tests/init.test.ts]
---

## Contexto
- PLAN-0015 TASK-01. Contrato: .ginga/plans/PLAN-0015-init-e-homelab/TASK-01-ginga-init.md.
- `init` vira verbo do registro (write) — CLI e API são geradas dele; `--yes` exige aceitar flag booleana sem valor no parser de `src/cli.ts` (linhas ~74-82).
- Detecção: stack (package.json com "bun" → `bun test`; package.json → `npm test`; go.mod → `go test ./...`; pom.xml → `mvn test`), provider gira só com binário no PATH e `.gira/` na raiz, runtimes do PATH (pi claude opencode codex agy), notify se `hermes` no PATH.
- Idempotente: nunca sobrescreve; sem `--yes` mostra o TOML e pede confirmação ("n" não cria nada).
- Referência de detectStack: pi-harness/.pi/extensions/scaffold.ts (só leitura). Não instalar plugins (é o `ginga install`).
