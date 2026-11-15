/**
 * Cria (ou redefine a senha de) um administrador. A senha é digitada aqui e não aparece na tela.
 *   npm run usuario:admin -- voce@empresa.com.br "Seu Nome"
 */
import readline from "node:readline";
import { prisma } from "../src/lib/db";
import { hashSenha } from "../src/lib/auth/senha";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
let mascarar = false;
const original = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput?.bind(rl);
(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
  if (mascarar && !s.includes(":")) process.stdout.write(s.replace(/[^\r\n]/g, "*"));
  else original?.(s);
};
const linhas = rl[Symbol.asyncIterator]();
async function perguntar(texto: string) {
  mascarar = false;
  process.stdout.write(texto);
  mascarar = true;
  const r = await linhas.next();
  mascarar = false;
  if (!process.stdin.isTTY) process.stdout.write("\n");
  return r.done ? "" : String(r.value);
}

async function main() {
  const [email, nome] = process.argv.slice(2);
  if (!email?.includes("@")) { console.error('uso: npm run usuario:admin -- email@empresa.com.br "Nome"'); process.exit(1); }
  const senha = await perguntar("Senha (mín. 8): ");
  if (senha !== (await perguntar("Repita a senha: "))) { console.error("As senhas não batem"); process.exit(1); }
  rl.close();
  const senhaHash = await hashSenha(senha);
  const u = await prisma.usuario.upsert({
    where: { email: email.toLowerCase() },
    create: { email: email.toLowerCase(), nome: nome || email, papel: "ADMIN", senhaHash },
    update: { papel: "ADMIN", ativo: true, senhaHash },
  });
  console.log(`Administrador pronto: ${u.email}`);
}
main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
