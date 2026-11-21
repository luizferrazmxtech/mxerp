import crypto from "node:crypto";
import { prisma } from "./db";

/**
 * O próprio MXERP da MXTECH aparece na Central como "cliente da casa": sem plano, sem cobrança e sem licença,
 * só para acompanhar backups e se está no ar. Vem do ambiente (VPS: slug mxtech; PC: slug mxerp, pasta backups).
 */
export const CLIENTE_ZERO = { slug: process.env.CLIENTE_ZERO_SLUG ?? "", dominio: process.env.CLIENTE_ZERO_DOMINIO ?? "" };

/** Pedidos à VPS (backup agora, restaurar, horários) só existem na VPS; no PC o backup é o do agendador do PC. */
export const naVps = () => !!process.env.URL_SISTEMAS_MODELO;

let feito = false;
export async function garantirClienteZero() {
  if (feito || !/^[a-z][a-z0-9]{1,29}$/.test(CLIENTE_ZERO.slug)) return;
  const dominio = CLIENTE_ZERO.dominio || CLIENTE_ZERO.slug;
  const atual = await prisma.cliente.findUnique({ where: { slug: CLIENTE_ZERO.slug } });
  if (!atual) {
    await prisma.cliente.create({
      data: {
        slug: CLIENTE_ZERO.slug, nome: "MXTECH (sistema da casa)", documento: "", email: "", dominio, interno: true,
        situacao: "ATIVO", inicioCobranca: new Date(), licencaToken: crypto.randomBytes(24).toString("hex"),
      },
    }).catch(() => {}); // duas telas abrindo juntas: a outra já criou
  } else if (!atual.interno || atual.dominio !== dominio) {
    await prisma.cliente.update({ where: { id: atual.id }, data: { interno: true, dominio } });
  }
  feito = true;
}

/** Link para abrir o sistema (localhost no PC é http). */
export const urlSistema = (dominio: string) => (/^(localhost|127\.|\d+\.\d+\.\d+\.\d+)/.test(dominio) ? `http://${dominio}` : `https://${dominio}`);
