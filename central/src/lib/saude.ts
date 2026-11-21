/** O sistema do cliente responde? (rede interna da VPS: http://app-<slug>:3000; no PC, o MXERP da casa em CLIENTE_ZERO_URL) */
export async function noAr(c: { slug: string; interno?: boolean }): Promise<boolean | null> {
  const base = c.interno && process.env.CLIENTE_ZERO_URL ? process.env.CLIENTE_ZERO_URL : process.env.URL_SISTEMAS_MODELO?.replace("{slug}", c.slug);
  if (!base) return null;
  try {
    const r = await fetch(`${base}/api/saude`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch { return false; }
}
