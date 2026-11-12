---
mode: padrao
goal: "e2e com as peças reais: o ginga tick, com os comandos padrão, leva um PLAN de approved a mergeado dentro de um monorepo (um repositório, .ginga dentro dele, TASK com repo: apontando um pacote)"
touch:
  - tests/e2e/condutor_monorepo.test.ts
  - tasks/T923/PLAN.md
tests_frozen: ["tests/e2e/condutor_monorepo.test.ts"]
done_when: 'MANDA_BIN="${MANDA_BIN:-$(git rev-parse --path-format=absolute --git-common-dir)/../../manda}" bun test tests/e2e/condutor_monorepo.test.ts tests/e2e/condutor_padrao.test.ts'
---
# T923: condutor num monorepo (PLAN-0003, AC-6)

- É o mesmo cenário do `condutor_padrao`, mas num repositório só: a raiz não tem `package.json`, o código está no pacote `demo/` e o bundle `.ginga/` é arquivo do próprio repositório.
- Reais: ginga tick, manda red/run/judge/merge, pinga prove-red/verify/gate. De mentira: o executor (`pi`) e o juiz (`agy`).
- Confere que há uma worktree só para o PLAN, que o executor roda dentro do pacote e que a `main` só anda no merge.
- O ginga não precisou mudar: o que faltava estava no pinga (T904) e no manda (T915, T916). RED: falha com o manda da `main` de antes do T916.
- O `done_when` usa o manda vizinho; `MANDA_BIN` aponta outro quando o manda do mesmo PLAN ainda está na branch (o juiz julga as branches do PLAN juntas, antes do merge).
