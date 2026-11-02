---
mode: padrao
goal: "writeIndex/checkIndex derivam o quadro do bundle <ws>/.ginga (não da raiz do workspace) e o render não duplica os cabeçalhos ## do template; teste verifica o conteúdo gerado"
title: Gerador de index deriva da raiz certa e sem cabeçalho duplicado (follow-up do judge na TASK-06/14)
plan: PLAN-0012-roda-web
repo: ginga
depends_on: [TASK-14-index-verbo]
tier: free
touch: [src/index_md.ts, tests/index_md_raiz.test.ts]
done_when: "bun test tests/index_md_raiz.test.ts tests/index_md.test.ts tests/index_cli.test.ts"
tests_frozen: [tests/index_md_raiz.test.ts]
pinga_task: T333
---
## Context
- Judge 2026-11-01T221449 (TASK-06/14 grave): writeIndex passa a raiz do workspace a deriveBoard (que espera o bundle .ginga); renderSection duplica os `## Seção` do template; Concluído nunca lista PLAN done.
- Corrigir dentro de writeIndex/checkIndex: derivar de `join(root, ".ginga")` (se root já for o bundle, usa root). Os chamadores (src/verbs/index.ts, src/serve.ts) passam a raiz do workspace e continuam válidos.
- renderSection/renderIndex: ao substituir `<!-- ginga:board:x -->`, se a linha anterior não vazia já é `## ...`, não emitir outro cabeçalho.
- O hack `global.mkdirSync` em src/index_md.ts:2 fica: tests/index_md.test.ts (frozen T160) usa mkdirSync sem import.
- Não quebrar tests/index_md.test.ts nem tests/index_cli.test.ts (frozen).
