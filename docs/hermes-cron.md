# HERMES CRON — o cron do Hermes chama `ginga tick` (PLAN-0010 TASK-03)

## Por que

O `ginga serve` (systemd --user, `contrib/systemd/ginga-serve.service`) já roda
o tick por timer interno (`[serve].tick_seconds`) e por evento
(`fs.watch` em `$GINGA_EVENTS`). O cron do Hermes existe como segunda via
independente: se o serve (ou o usuário) estiver fora do ar, o `ginga tick`
periódico varre a fila do mesmo jeito. Tudo passa pelo **mesmo `ginga tick`** —
a decisão de QUANDO muda (timer, evento, cron), a de O QUE despachar é sempre
`src/tick.ts` com claim atômico em `task_exec` (lease), então `serve` + timer +
cron rodando juntos não despacham a mesma TASK duas vezes.

## Passo a passo (cron user crontab)

1. Instale o ginga no PATH do usuário (`bun link`/`npm link` no repo) — o
   crontab roda com `/bin/sh`, sem o rc do usuário, então o caminho precisa ser
   absoluto:

       which ginga          # confirme o caminho absoluto
       ginga tick --dry-run # projeção do que estaria na fila

2. Edite o crontab do usuário:

       crontab -e

3. Adicione a entrada (a cada 5 minutos; `--json` devolve
   `{"dispatched":[…]}` e `--dry-run` só lista o que despacharia):

       */5 * * * * $HOME/.local/bin/ginga tick --json >> $HOME/.ginga/serve/cron.log 2>&1

   (use o caminho absoluto de `which ginga`; `tick_seconds` de `project.toml`
   não se aplica ao cron — o intervalo é a própria linha `*/5`.)

4. Confirme o ciclo no log e no board:

       tail -f $HOME/.local/state/ginga/cron.log 2>/dev/null || tail -f $HOME/.ginga/serve/cron.log

## Alternativa systemd --user (preferencial)

Em vez do cron, o timer nativo cobre o mesmo papel:

    systemctl --user enable --now ginga-serve.service   # preferencial
    systemctl --user enable --now ginga-tick.timer      # sem serve de pé

Unidades em `contrib/systemd/`. O cron do Hermes e o timer podem coexistir sem
conflito (lease atômico).
