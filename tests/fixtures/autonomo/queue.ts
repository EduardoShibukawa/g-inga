// Fila do fixture e2e (PLAN-0028 TASK-08): `pinga queue` real (ledger
// temporário via PINGA_LEDGER), com os ids qualificados pelo PLAN e state
// "fail" quando o executor stub já falhou 3x (attempts em task_exec do
// state.db lido pelo tick) — espelha "3 falhas → replan".
import { Database } from "bun:sqlite";

const root = process.env.STUB_ROOT!;
const plan = process.env.STUB_PLAN!;
const r = Bun.spawnSync(
  ["pinga", "queue", "--json", "--root", root, "--ledger", process.env.PINGA_LEDGER!],
  { stdout: "pipe", stderr: "pipe" },
);
if (r.exitCode !== 0) {
  process.stderr.write(r.stderr.toString());
  process.exit(1);
}
const q = JSON.parse(r.stdout.toString());
let attempts = 0;
try {
  const db = new Database(process.env.GINGA_STATE_DB!, { readonly: true });
  const row = db.query("SELECT attempts FROM task_exec WHERE plan = ?").get(plan) as
    | { attempts: number }
    | undefined;
  attempts = Number(row?.attempts ?? 0);
  db.close();
} catch {}
const failMode = process.env.STUB_FAIL === "1" && attempts >= 3;
// só as TASKs pinga (tasks/T<N>); os TASK-*.md do bundle não são fila
q.tasks = (q.tasks ?? []).filter((t: any) => /^T\d+$/.test(String(t.task)));
for (const t of q.tasks) {
  t.plan = plan;
  t.task = `${plan}/${t.task}`;
  if (failMode && t.state !== "done") t.state = "fail";
}
console.log(JSON.stringify(q));
