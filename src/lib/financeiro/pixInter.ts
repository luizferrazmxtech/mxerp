import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { diaSP } from "@/lib/datas";
import { baixarLancamento } from "./lancamentos";
import { contaDoInter } from "./boletos";
import { ClienteInter, ESCOPOS_PIX, explicar, idInterAtual, lerConfigInter, temPix } from "./inter";

/**
 * Pix do Banco Inter no PDV (API Pix v2, cobrança imediata): o caixa mostra o QR/copia e cola, a tela consulta o
 * Inter até o pagamento cair e a venda fecha sozinha, já recebida na conta do Inter (sem taxa de maquininha).
 * A linha do extrato desse Pix é amarrada à conta da venda pelo endToEndId/txid (conciliarPixDoPdv).
 *
 * Cada empresa usa a integração do Inter dela (idInterAtual); a cobrança guarda o interId para consultar sempre na
 * mesma conta.
 */

export class PixInterError extends Error {}
const API = "/pix/v2/cob";
export const MINUTOS_PIX_INTER = 15;

/** txid: 26 a 35 letras/números (padrão do Bacen). */
export const novoTxid = () => `MXPDV${randomBytes(15).toString("hex")}`.slice(0, 35);

/** Integração do Inter da loja atual com o Pix do PDV ligado (permissão cob.write e chave Pix), ou null. */
export async function pixInterAtivo(interId?: string | null) {
  const id = interId === undefined ? await idInterAtual() : interId;
  if (!id) return null;
  const r = await prisma.integracaoInter.findUnique({ where: { id }, select: { id: true, pixPdv: true, chavePix: true, escopos: true } });
  return r && r.pixPdv && r.chavePix?.trim() && temPix(r.escopos) ? { interId: r.id, chave: r.chavePix.trim() } : null;
}

type Opcoes = { cliente?: ClienteInter; agora?: Date };

async function clienteDo(interId: string, opts: Opcoes) {
  if (opts.cliente) return opts.cliente;
  const cfg = await lerConfigInter(interId);
  if (!cfg) throw new PixInterError("A integração do Banco Inter desta empresa não está configurada");
  return new ClienteInter(cfg);
}

function falha(o: string, r: { status: number; corpo: string }): never {
  let detalhe = r.corpo.slice(0, 300);
  try {
    const j = JSON.parse(r.corpo) as { title?: string; detail?: string; violacoes?: { razao?: string; propriedade?: string }[] };
    detalhe = [j.title, j.detail, ...(j.violacoes ?? []).map((v) => `${v.propriedade ?? ""}: ${v.razao ?? ""}`)].filter(Boolean).join(" · ") || detalhe;
  } catch { /* corpo não é JSON */ }
  throw new PixInterError(`Inter: ${o} (HTTP ${r.status}): ${explicar({ ...r, corpo: detalhe }, ESCOPOS_PIX)}`);
}

type CobInter = { txid?: string; status?: string; pixCopiaECola?: string; pix?: { endToEndId?: string; valor?: string; horario?: string }[] };

/** Cria a cobrança Pix do valor (em reais) no Inter e guarda. Volta o copia e cola e o QR em imagem. */
export async function criarPixInter(a: { valor: number; caixaId?: string | null; usuarioId?: string | null; descricao?: string; interId?: string | null }, opts: Opcoes = {}) {
  const ativo = await pixInterAtivo(a.interId);
  if (!ativo) throw new PixInterError("O Pix do Inter no PDV está desligado (Financeiro → Conciliação → Configurar Banco Inter)");
  if (!(Math.round(a.valor * 100) >= 1)) throw new PixInterError("Valor do Pix inválido");
  const cliente = await clienteDo(ativo.interId, opts);
  const txid = novoTxid();
  const agora = opts.agora ?? new Date();
  const r = await cliente.chamar("PUT", `${API}/${txid}`, {
    escopo: ESCOPOS_PIX,
    json: { calendario: { expiracao: MINUTOS_PIX_INTER * 60 }, valor: { original: a.valor.toFixed(2) }, chave: ativo.chave, solicitacaoPagador: (a.descricao ?? "Venda no balcão").slice(0, 140) },
  });
  if (r.status !== 200 && r.status !== 201) falha("não gerou a cobrança Pix", r);
  const j = JSON.parse(r.corpo) as CobInter;
  if (!j.pixCopiaECola) throw new PixInterError("O Inter não devolveu o Pix copia e cola");
  const expira = new Date(agora.getTime() + MINUTOS_PIX_INTER * 60000);
  const cob = await prisma.cobrancaPix.create({
    data: { provedor: "INTER", interId: ativo.interId, pedidoId: txid, texto: j.pixCopiaECola, valor: new Prisma.Decimal(a.valor.toFixed(2)), caixaId: a.caixaId ?? null, usuarioId: a.usuarioId ?? null, expiraEm: expira },
  });
  return { id: cob.id, texto: cob.texto, valor: a.valor, expiraEm: expira.toISOString(), imagem: await QRCode.toDataURL(cob.texto, { margin: 1, width: 280 }) };
}

/** Consulta a cobrança no Inter: CONCLUIDA com o valor certo = PAGA (guarda o endToEndId e a hora do Pix). */
export async function consultarPixInter(id: string, opts: Opcoes = {}) {
  const cob = await prisma.cobrancaPix.findUniqueOrThrow({ where: { id } });
  if (cob.situacao === "PAGA" || cob.situacao === "CANCELADA" || cob.provedor !== "INTER") return cob;
  const cliente = await clienteDo(cob.interId ?? "inter", opts);
  const r = await cliente.chamar("GET", `${API}/${cob.pedidoId}`, { escopo: ESCOPOS_PIX });
  if (r.status !== 200) falha("não respondeu a consulta do Pix", r);
  const j = JSON.parse(r.corpo) as CobInter;
  const pagos = j.pix ?? [];
  const valor = pagos.reduce((s, p) => s + Number(p.valor ?? 0), 0);
  if (j.status === "CONCLUIDA" || pagos.length) {
    if (Math.abs(valor - Number(cob.valor)) > 0.009) throw new PixInterError(`O Pix foi pago com valor diferente (${valor.toFixed(2)})`);
    const p = pagos[0];
    return prisma.cobrancaPix.update({ where: { id }, data: { situacao: "PAGA", pagaEm: p?.horario ? new Date(p.horario) : new Date(), e2eId: p?.endToEndId ?? null } });
  }
  if (j.status?.startsWith("REMOVIDA")) return prisma.cobrancaPix.update({ where: { id }, data: { situacao: "CANCELADA" } });
  if (cob.expiraEm < (opts.agora ?? new Date())) return prisma.cobrancaPix.update({ where: { id }, data: { situacao: "EXPIRADA" } });
  return cob;
}

/** Desiste do Pix no PDV: consulta antes (se já caiu, avisa) e remove a cobrança no Inter. */
export async function cancelarPixInter(id: string, opts: Opcoes = {}) {
  const cob = await consultarPixInter(id, opts).catch(() => prisma.cobrancaPix.findUniqueOrThrow({ where: { id } }));
  if (cob.situacao === "PAGA") throw new PixInterError("Este Pix já foi pago: finalize a venda");
  if (cob.situacao === "PENDENTE") {
    const cliente = await clienteDo(cob.interId ?? "inter", opts).catch(() => null);
    // se o Inter não remover, o QR expira sozinho em 15 minutos
    await cliente?.chamar("PATCH", `${API}/${cob.pedidoId}`, { escopo: ESCOPOS_PIX, json: { status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" } }).catch(() => null);
  }
  return prisma.cobrancaPix.update({ where: { id }, data: { situacao: "CANCELADA" } });
}

/**
 * Depois de fechar a venda paga com o Pix do Inter: as contas da venda nas formas Pix ficam recebidas na conta do
 * Inter, no dia do pagamento.
 */
export async function receberVendaPeloPix(cobrancaId: string, vendaId: string, formaIds: string[]) {
  const cob = await prisma.cobrancaPix.findUniqueOrThrow({ where: { id: cobrancaId } });
  if (cob.provedor !== "INTER" || cob.situacao !== "PAGA") return 0;
  const conta = await contaDoInter(await lerConfigInter(cob.interId ?? "inter"));
  const dia = diaSP(cob.pagaEm ?? new Date());
  return prisma.$transaction(async (tx) => {
    await tx.cobrancaPix.update({ where: { id: cobrancaId }, data: { vendaId } });
    const ls = await tx.lancamento.findMany({ where: { origemTipo: "VENDA", origemId: vendaId, tipo: "RECEBER", formaPagamentoId: { in: formaIds }, transacaoId: null } });
    for (const l of ls) {
      if (!l.pagoEm) await baixarLancamento(tx, l.id, { data: dia, contaBancariaId: conta.id });
      else await tx.lancamento.update({ where: { id: l.id }, data: { pagoEm: dia, contaBancariaId: conta.id } });
    }
    return ls.length;
  });
}

/**
 * Extrato: a entrada do Pix pago no PDV (documento = endToEndId ou txid) é amarrada às contas da venda, já recebidas.
 * Se a conta ainda estiver em aberto, baixa na data do extrato.
 */
export async function conciliarPixDoPdv(contaBancariaId: string) {
  const ts = await prisma.transacaoBancaria.findMany({ where: { contaBancariaId, situacao: "PENDENTE", valor: { gt: 0 }, documento: { not: null } }, select: { id: true, documento: true, valor: true, data: true } });
  if (!ts.length) return 0;
  const docs = ts.map((t) => t.documento!.trim());
  const cobs = await prisma.cobrancaPix.findMany({ where: { provedor: "INTER", situacao: "PAGA", vendaId: { not: null }, OR: [{ e2eId: { in: docs } }, { pedidoId: { in: docs } }] } });
  let n = 0;
  for (const t of ts) {
    const cob = cobs.find((c) => c.e2eId === t.documento!.trim() || c.pedidoId === t.documento!.trim());
    if (!cob || Math.abs(Number(cob.valor) - Number(t.valor)) > 0.009) continue;
    const ls = await prisma.lancamento.findMany({ where: { origemTipo: "VENDA", origemId: cob.vendaId!, tipo: "RECEBER", transacaoId: null } });
    // as contas da venda pagas por este Pix: as que somam o valor dele
    const pix = ls.filter((l) => Math.abs(Number(l.valorPago ?? l.valor) - Number(t.valor)) < 0.009).slice(0, 1);
    const alvo = pix.length ? pix : ls.filter((l) => !l.pagoEm || l.contaBancariaId === contaBancariaId);
    if (!alvo.length || Math.abs(alvo.reduce((s, l) => s + Number(l.valorPago ?? l.valor), 0) - Number(t.valor)) > 0.009) continue;
    await prisma.$transaction(async (tx) => {
      for (const l of alvo) {
        if (!l.pagoEm) await baixarLancamento(tx, l.id, { data: t.data, contaBancariaId });
        await tx.lancamento.update({ where: { id: l.id }, data: { transacaoId: t.id } });
      }
      await tx.transacaoBancaria.update({ where: { id: t.id }, data: { situacao: "CONCILIADA" } });
    });
    n++;
  }
  return n;
}
