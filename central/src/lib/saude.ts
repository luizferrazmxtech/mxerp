/** O sistema do cliente responde? (rede interna da VPS: http://app-<slug>:3000) */
export async function noAr(slug: string): Promise<boolean | null> {
  const base = process.env.URL_SISTEMAS_MODELO; // ex.: http://app-{slug}:3000 ; vazio fora da VPS
  if (!base) return null;
  try {
    const r = await fetch(`${base.replace("{slug}", slug)}/api/saude`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch { return false; }
}
