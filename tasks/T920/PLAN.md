---
mode: padrao
goal: "ginga doctor confere os [commands] do condutor: para cada comando (padrão ou do project.toml) diz se o binário existe no PATH, num registro ginga/commands que avisa sem mudar o exit"
touch:
  - src/doctor.ts
  - tests/doctor_commands.test.ts
  - tasks/T920/PLAN.md
tests_frozen: ["tests/doctor_commands.test.ts"]
done_when: "bun test tests/doctor_commands.test.ts tests/doctor.test.ts tests/doctor_versions.test.ts tests/doctor_hooks_drift.test.ts"
---
# T920: doctor conhece os comandos do condutor

- O tick chama `pinga` e `manda` pelos padrões de `[commands]`; sem eles no PATH o tick falha em silêncio a cada fase.
- Um registro só: `harness=ginga`, `check=commands`. Tudo achado → ok/pass.
- Falta binário → unverified/blocked, com o binário e as chaves que dependem dele no detalhe. É aviso: o exit não muda (mesma regra do binário ausente no check de versão).
- Vale o que está no project.toml; chave ausente usa o padrão. `builtin` e `none` não pedem binário.
- Com `--only` o check não roda, como o de versões.
