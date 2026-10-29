// Stub do contrato (RED): a implementação vem na TASK-03 (T122).
export type ApiOpts = {
  root: string;
  dbPath: string;
  hostname?: string;
  port?: number;
  ssePollMs?: number;
  eventsPath?: string;
};

export function startApi(_opts: ApiOpts): { port: number; hostname: string; stop(): void } {
  throw new Error("startApi: não implementado");
}
