---
mode: mvp
goal: "ginga doctor reporta o estado dos adapters de host como o pinga doctor faz hoje"
done_when: "bun test tests/doctor.test.ts"
tests_frozen: [tests/doctor.test.ts]
touch:
  - src/doctor.ts
  - src/cli.ts
  - tests/doctor.test.ts
---

## Context
- Portar de p-inga/src/doctor.ts só o que usa ADAPTER_ORDER, Adapter, Probe, pickSource.
