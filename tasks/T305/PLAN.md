---
mode: mvp
goal: "guard sweep <dir> lista arquivo:linha e regra de formato de chave nos logs, sai 3 com ocorrência, nunca imprime o trecho; guard-sweep.sh avisa no Discord quando acha"
done_when: "bun test tests/guard_sweep.test.ts"
touch:
  - src/guard/sweep.ts
  - src/guard/cli.ts
  - tests/guard_sweep.test.ts
tests_frozen: [tests/guard_sweep.test.ts]
---

## Contexto
- PLAN-0033 TASK-08. Contrato completo (Fazer/Interface/Não fazer): .ginga/plans/PLAN-0033-guard-de-segredos/TASK-08-varredor.md. Testes RED copiados byte a byte de red/ginga/ (congelados; o executor não os toca). Protótipo de referência só leitura: .ginga/plans/PLAN-0033-guard-de-segredos/ref/ginga/. Python do done_when com -B (sandbox perde PYTHONDONTWRITEBYTECODE). Sem segredo real em lugar nenhum: os testes montam chaves falsas em runtime.