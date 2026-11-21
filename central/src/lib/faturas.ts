import { prisma } from "./db";
import { ler } from "./config";
import { competenciaDe, dataBR, diaSP, moeda, proximaCompetencia, somarDias, vencimentoDe } from "./datas";
import { emitirBoleto, pdfBoleto, sincronizarBoletos, type ClienteInter, clienteInter } from "./inter";
import { enviarEmail } from "./email";

export const valorDoCliente = (c: { valorMensal: unknown; plano: { valorMensal: unknown } | null }) => Number(c.valorMensal ?? c.plano?.valorMensal ?? 0);

/**
 * Competências que já deveriam ter fatura: do início da cobrança até a que vence dentro da antecedência.
 * Pura, para testar.
 */
export function competenciasDevidas(inicio: Date, dia: number, hoje: Date, antecedencia: number) {
  const limite = somarDias(hoje, antecedencia);
  const out: { competencia: string; vencimento: Date }[] = [];
  let c = competenciaDe(inicio);
  for (let i = 0; i < 240; i++, c = proximaCompetencia(c)) {
    const v = vencimentoDe(c, dia);
    if (v > limite) break;
    if (v >= inicio) out.push({ competencia: c, vencimento: v });
  }
  return out;
}

/** Cria as faturas que faltam dos clientes ativos (não refaz as que existem, nem as canceladas). */
export async function gerarFaturas(hoje = diaSP()) {
  const regua = await ler("regua");
  const clientes = await prisma.cliente.findMany({ where: { situacao: "ATIVO", interno: false }, include: { plano: true, faturas: { select: { competencia: true } } } });
  let criadas = 0;
  for (const c of clientes) {
    const existentes = new Set(c.faturas.map((f) => f.competencia));
    for (const d of competenciasDevidas(c.inicioCobranca, c.diaVencimento, hoje, regua.diasAntecedencia)) {
      if (existentes.has(d.competencia)) continue;
      await prisma.fatura.create({ data: { clienteId: c.id, competencia: d.competencia, vencimento: d.vencimento, valor: valorDoCliente(c) } }).then(() => criadas++).catch(() => {});
    }
  }
  return criadas;
}

function textoFatura(f: { competencia: string; vencimento: Date; valor: unknown; linhaDigitavel: string | null; pixCopiaECola: string | null }, nome: string, empresa: string, lembrete: string | null) {
  return [
    `Olá, ${nome}.`,
    "",
    lembrete ?? `Segue a mensalidade do sistema MXERP referente a ${f.competencia.slice(5)}/${f.competencia.slice(0, 4)}.`,
    "",
    `Valor: ${moeda(f.valor as number)}`,
    `Vencimento: ${dataBR(f.vencimento)}`,
    f.linhaDigitavel ? `Linha digitável: ${f.linhaDigitavel}` : "",
    f.pixCopiaECola ? `\nPix copia e cola:\n${f.pixCopiaECola}` : "",
    "",
    "O boleto em PDF vai em anexo. Se já pagou, desconsidere.",
    "",
    empresa,
  ].filter((l) => l !== null).join("\n");
}

async function mandar(faturaId: string, lembrete: string | null, cliente: ClienteInter | null) {
  const f = await prisma.fatura.findUniqueOrThrow({ where: { id: faturaId }, include: { cliente: true } });
  const geral = await ler("geral");
  const pdf = cliente && f.codigoSolicitacao ? await pdfBoleto(f.id, cliente).catch(() => null) : null;
  await enviarEmail({
    para: f.cliente.email,
    assunto: lembrete ? `Lembrete: mensalidade MXERP vence ${dataBR(f.vencimento)}` : `Mensalidade MXERP ${f.competencia.slice(5)}/${f.competencia.slice(0, 4)}`,
    texto: textoFatura(f, f.cliente.nome, geral.nomeEmpresa, lembrete),
    anexos: pdf ? [{ nome: `boleto-${f.competencia}.pdf`, conteudo: pdf }] : [],
  });
}

/** Rotina de hora em hora: baixa pagos, cria faturas, emite boletos, manda e-mail e lembretes. */
export async function processar(opts: { cliente?: ClienteInter | null; hoje?: Date } = {}) {
  const hoje = opts.hoje ?? diaSP();
  const inter = opts.cliente !== undefined ? opts.cliente : await clienteInter();
  const res = { criadas: 0, boletos: 0, emails: 0, lembretes: 0, pagas: 0, erros: [] as string[] };
  if (inter) {
    const s = await sincronizarBoletos(inter);
    res.pagas = s?.pagas ?? 0;
    res.erros.push(...(s?.erros ?? []));
  }
  res.criadas = await gerarFaturas(hoje);
  const abertas = await prisma.fatura.findMany({ where: { situacao: "ABERTA", cliente: { situacao: "ATIVO" } }, orderBy: { vencimento: "asc" } });
  for (const f of abertas) {
    try {
      if (inter && (!f.codigoSolicitacao || ["CANCELADO", "EXPIRADO"].includes(f.boletoSituacao ?? "")) && f.boletoSituacao !== "ERRO") {
        await emitirBoleto(f.id, inter);
        res.boletos++;
      }
      const atual = await prisma.fatura.findUniqueOrThrow({ where: { id: f.id } });
      // a primeira mensagem sai quando o boleto existe (ou na hora, se a Central ainda não tem Inter)
      if (!atual.emailEnviadoEm && (atual.linhaDigitavel || !inter)) {
        await mandar(f.id, null, inter);
        await prisma.fatura.update({ where: { id: f.id }, data: { emailEnviadoEm: new Date() } });
        res.emails++;
      } else if (atual.emailEnviadoEm && f.vencimento <= hoje && (!atual.lembreteEm || atual.lembreteEm < somarDias(hoje, -5))) {
        // no vencimento e depois a cada 5 dias enquanto estiver em aberto
        const atraso = Math.round((hoje.getTime() - f.vencimento.getTime()) / 86400000);
        await mandar(f.id, atraso > 0 ? `A mensalidade abaixo está em aberto há ${atraso} dia(s). Para evitar o bloqueio do sistema, pague pelo boleto ou Pix.` : "A mensalidade abaixo vence hoje.", inter);
        await prisma.fatura.update({ where: { id: f.id }, data: { lembreteEm: new Date() } });
        res.lembretes++;
      }
    } catch (e) {
      res.erros.push(`${f.competencia}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return res;
}
