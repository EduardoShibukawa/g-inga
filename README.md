# ginga

CLI do G-Ingá: cola + UX + async do ecossistema.

## Name origin

*G* (Sol) + *Ingá* = **Ginga** (ver [DECISION-0001](../../.ginga/knowledge/decisions/DECISION-0001-nomes.md)).
A ginga da capoeira: o movimento-base que liga tudo e nunca para.

## Statusline do Claude (quota)

Para que o `ginga quota` registre a quota da assinatura do Claude, adicione ao `~/.claude/settings.json`:

```json
"statusLine": {
  "type": "command",
  "command": "<caminho-do-repo>/contrib/claude-statusline.sh"
}
```

Substitua `<caminho-do-repo>` pelo caminho absoluto do clone deste repositório. O ginga **não** edita o `~/.claude/settings.json`: ativar a statusline é ação do dono.
