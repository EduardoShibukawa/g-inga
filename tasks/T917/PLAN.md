---
mode: padrao
goal: "a Roda Web ganha a tela Onboarding do protótipo: o verbo detect mostra o que o ginga init leria do projeto (teste, contexto, runtimes, notificação) e o project.toml proposto; o botão cria o .ginga pelo verbo init"
touch:
  - src/verbs/detect.ts
  - src/verbs/registry.ts
  - web/onboarding.js
  - web/index.html
  - web/app.js
  - web/style.css
  - tests/detect_verb.test.ts
  - tests/web_onboarding.test.ts
  - tests/cli_verbs.test.ts
  - tasks/T917/PLAN.md
tests_frozen: ["tests/detect_verb.test.ts", "tests/web_onboarding.test.ts"]
done_when: "bun test tests/detect_verb.test.ts tests/web_onboarding.test.ts tests/verbs.test.ts tests/api.test.ts tests/init.test.ts tests/web_shell.test.ts tests/web_shell_casca.test.ts tests/web_shell_install.test.ts"
---
# T917: tela Onboarding (protótipo Onboarding.dc.html)

- `detect` só lê: reaproveita `detectContract` e `renderProjectToml` do `ginga init`.
- A tela mostra o que foi lido e o TOML; criar é o verbo `init` com `yes`.
- O init nunca sobrescreve: com `.ginga/project.toml` já presente a tela avisa e o botão só completa o que falta.
- Escolher runtime, provider e canal pela tela (do protótipo) fica de fora: hoje se ajusta no project.toml.
- `tests/cli_verbs.test.ts` só ganha o caso do verbo novo.
