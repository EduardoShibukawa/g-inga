// Auth da API (PLAN-0011 TASK-04, T124): token Bearer em comparação de tempo
// constante ou IP da allowlist em CIDRs IPv4. O principal resultante é o que
// os verbos de escrita gravam no `by` — identidade não se forja por header.

export type AuthOpts = { token?: string; allow?: string[] };
export type AuthResult = { ok: true; principal: string } | { ok: false };

/** Comparação em tempo constante para strings de mesmo tamanho; tamanhos
 *  diferentes já descartam (informação que o tempo de uma comparação curta
 *  também revelaria, e o teste exige false). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i]! ^ bb[i]!;
  return diff === 0;
}

/** Inteiro IPv4 de "a.b.c.d", ou null se não for IPv4 (IPv6 nunca casa CIDR IPv4). */
function ipv4(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m) return null;
  const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (parts.some((p) => p > 255)) return null;
  return (((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0);
}

/** `ip` dentro do CIDR IPv4 `cidr` ("a.b.c.d/n"; sem "/n" vale /32). */
export function cidrMatch(ip: string, cidr: string): boolean {
  const [base, prefixRaw] = cidr.trim().split("/");
  const prefix = prefixRaw === undefined || prefixRaw === "" ? 32 : Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const a = ipv4(ip);
  const b = ipv4(base ?? "");
  if (a === null || b === null) return false;
  if (prefix === 0) return true;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (a & mask) === (b & mask);
}

/** `(req, ip) => principal` — Bearer igual ao token → "token"; senão, IP em
 *  algum CIDR de `allow` → `ip:<ip>`; nada casa → negado. Sem token e sem
 *  allow a fábrica nega tudo (fail-closed): quem não tem auth configurada não
 *  deveria chamá-la. */
export function makeAuth(opts: AuthOpts): (req: Request, ip: string) => AuthResult {
  const token = opts.token ?? "";
  const allow = (opts.allow ?? []).filter((c) => c.trim() !== "");
  return (req, ip) => {
    if (token !== "") {
      const header = req.headers.get("authorization") ?? "";
      const m = /^Bearer[ \t]+(\S*)/.exec(header);
      if (m && safeEqual(m[1]!, token)) return { ok: true, principal: "token" };
    }
    for (const cidr of allow) {
      if (cidrMatch(ip, cidr)) return { ok: true, principal: `ip:${ip}` };
    }
    return { ok: false };
  };
}
