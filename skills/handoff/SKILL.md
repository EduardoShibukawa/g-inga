---
name: handoff
description: Skill que orquestra o handoff automático e manual de sessões do ginga para Claude, opencode e Pi.
---

# Skill: handoff

Esta skill é a fonte única do comportamento de handoff do ginga. Instruções para o modelo:

1. **notes** — ao final de cada task, escreva `notes/` com decisões, preferências e hipóteses em `tests/fixtures/handoff-session/bundle/notes.md`.
2. **handoff --open** — rode `ginga handoff --open --runtime claude` para abrir uma nova sessão com o plano em contexto. Passe `--trigger idle` ou `--trigger context` conforme o gatilho.
3. **encerrar** — após o handoff, encerre o turno para liberar a lane do ginga.

## Formato do notes
```
- Decisão: <o que foi decidido>
- Preferência: <prioridade ou estilo>
- Hipótese: <o que esperamos testar>
```

## Comando de handoff
```bash
ginga handoff --open --runtime claude --trigger idle
```

## Ver também
- [`scripts/handoff.ts`](scripts/handoff.ts) — invoca a CLI e imprime `{path, tokens, open}`
- [`references/formato.md`](references/formato.md) — spec do formato
