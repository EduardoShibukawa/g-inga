---
mode: padrao
goal: "readCodexQuota e readClaudeQuota aceitam resets_at em epoch numérico (segundos ou ms), normalizando para string ISO; com o formato real do Codex a quota sai completa (não stale), o evento quota é emitido e quotaCapOk bloqueia com used_pct >= 100"
done_when: "bun test tests/quota_resets_epoch.test.ts tests/quota_codex.test.ts tests/quota.test.ts tests/quota_cap.test.ts"
touch:
  - src/quota/codex.ts
  - src/quota/claude.ts
  - tests/quota_resets_epoch.test.ts
tests_frozen:
  - tests/quota_resets_epoch.test.ts
---

## Contexto
- Achado grave do judge 2026-11-03T11:23 (gate fail, PLAN-0014, AC/TASK-02): rollouts reais do Codex
  (`~/.codex/sessions/**/rollout-*.jsonl`) bring `"resets_at":1795285686` (epoch numérico), mas
  `primaryLimits` (src/quota/codex.ts) e `readWindow` (src/quota/claude.ts) só aceitam `string` →
  `resets_at: null` → `complete: false` → `source: "stale"` com dados reais; o evento `quota` nunca é
  emitido e `quotaCapOk` ignora stale, então o `cap_ok` do tick não bloqueia com o Codex esgotado.
- Normalize número finito → ISO string: `v >= 1e12` é ms, senão segundos
  (`new Date(v >= 1e12 ? v : v * 1000).toISOString()`). String continua aceita; outro tipo → null.
- `Quota.resets_at` continua `string | null` (o schema do evento exige string em src/events/validate.ts).
