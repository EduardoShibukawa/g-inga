// Stub do contrato (PLAN-0011 TASK-04, T124): RED por asserção; a implementação vem no despacho.
export type AuthOpts = { token?: string; allow?: string[] };
export type AuthResult = { ok: true; principal: string } | { ok: false };

export function safeEqual(_a: string, _b: string): boolean {
  return false;
}

export function cidrMatch(_ip: string, _cidr: string): boolean {
  return false;
}

export function makeAuth(_opts: AuthOpts): (req: Request, ip: string) => AuthResult {
  return () => ({ ok: false });
}
