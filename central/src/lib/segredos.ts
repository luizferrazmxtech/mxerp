import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Cifra segredos guardados no banco (client secret, chave privada) com AES-256-GCM.
 * A chave mestra NÃO fica no banco: vem do .env do servidor (CHAVE_SEGREDOS, ou o CRON_SECRET gerado na instalação).
 * Assim um backup do banco sozinho não expõe as credenciais.
 */
function chaveMestra(): Buffer {
  const base = process.env.CHAVE_SEGREDOS || process.env.CRON_SECRET;
  if (!base || base.length < 16)
    throw new Error("Falta a chave do servidor para guardar senhas: defina CHAVE_SEGREDOS (ou CRON_SECRET) com 16+ caracteres no .env");
  return Buffer.from(hkdfSync("sha256", base, "mxerp-segredos", "aes-256-gcm v1", 32));
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chaveMestra(), iv);
  const ct = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64")}`;
}

export function decifrar(guardado: string): string {
  const [v, b64] = guardado.split(":", 2);
  if (v !== "v1" || !b64) throw new Error("Segredo guardado em formato desconhecido");
  const buf = Buffer.from(b64, "base64");
  try {
    const d = createDecipheriv("aes-256-gcm", chaveMestra(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
  } catch {
    throw new Error("Não foi possível abrir as credenciais salvas (a chave do servidor no .env mudou?). Salve as credenciais de novo.");
  }
}
