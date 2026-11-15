import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (s: string, salt: Buffer, len: number, o: object) => Promise<Buffer>;
const N = 16384;

/** "scrypt$N$sal$hash" (base64). */
export async function hashSenha(senha: string) {
  if (senha.length < 8) throw new Error("A senha precisa de pelo menos 8 caracteres");
  const sal = randomBytes(16);
  const h = await scrypt(senha, sal, 32, { N, r: 8, p: 1 });
  return `scrypt$${N}$${sal.toString("base64")}$${h.toString("base64")}`;
}

export async function conferirSenha(senha: string, guardado: string) {
  const [alg, n, sal, hash] = guardado.split("$");
  if (alg !== "scrypt" || !sal || !hash) return false;
  const esperado = Buffer.from(hash, "base64");
  const h = await scrypt(senha, Buffer.from(sal, "base64"), esperado.length, { N: Number(n), r: 8, p: 1 });
  return timingSafeEqual(h, esperado);
}
