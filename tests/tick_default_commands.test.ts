import { describe, expect, test } from "bun:test";
import { join } from "node:path";

/**
 * T907: os comandos padrão do `ginga tick` precisam bater com a CLI real do
 * manda. Antes: `manda red {plan}` (sem --repo → exit 2), `manda run {plan}
 * {task}` (a TASK é `--task`) e merge em `bin/merge-gate.sh`, fora dos repos.
 */
const load = async (): Promise<any> => import(join(import.meta.dir, "..", "src", "tick.ts"));

describe("DEFAULT_COMMANDS do tick", () => {
  test("cada fase chama um verbo do manda com --root", async () => {
    const { DEFAULT_COMMANDS: c } = await load();
    expect(c.red).toBe("manda red {plan} --root {root}");
    expect(c.run).toBe("manda run {plan} --task {task} --root {root}");
    expect(c.judge).toBe("manda judge {plan} --root {root}");
    expect(c.merge).toBe("manda merge {plan} --root {root}");
    expect(c.dispatch).toBe("manda run {plan} --task {task} --root {root}");
  });

  test("nenhum padrão aponta para script fora dos repos", async () => {
    const { DEFAULT_COMMANDS: c } = await load();
    for (const v of Object.values(c)) {
      expect(String(v)).not.toContain("bin/");
      expect(String(v)).not.toContain(".sh");
    }
  });

  test("a fila continua vindo do pinga, por comando configurável", async () => {
    const { DEFAULT_COMMANDS: c, parseCommands } = await load();
    expect(c.queue).toBe("pinga queue --json --root {root}");
    expect(parseCommands('[commands]\nmerge = "meu-merge {plan}"\n').merge).toBe("meu-merge {plan}");
  });
});
