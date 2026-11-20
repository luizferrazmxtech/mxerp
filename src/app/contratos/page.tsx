import Link from "next/link";
import type { Prisma, SituacaoContrato } from "@prisma/client";
import { prisma } from "@/lib/db";
import { processarAgoraAcao } from "@/lib/contratos/acoes";
import { SITUACOES_CONTRATO, rotuloPeriodicidade, situacaoContrato, type PeriodicidadeContrato } from "@/lib/contratos/tipos";
import { cor } from "@/lib/orcamentos/tipos";
import { Pagina } from "@/components/ui/Pagina";
import BotaoResultado from "@/components/contratos/BotaoResultado";
import Icone from "@/components/Icone";
import { cadaPalavra, contem, numeroPalavra } from "@/lib/busca/palavras";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contratos" };

const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataUtc = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");

export default async function Contratos({ searchParams }: { searchParams: Promise<{ s?: string; q?: string }> }) {
  const sp = await searchParams;
  const filtro = sp.s === "todos" ? null : SITUACOES_CONTRATO.some((x) => x.valor === sp.s) ? (sp.s as SituacaoContrato) : "ATIVO";
  const q = sp.q?.trim();
  const where: Prisma.ContratoWhereInput = {
    ...(filtro ? { situacao: filtro } : {}),
    // cada palavra em qualquer ordem: nº, cliente (nome, fantasia, CPF/CNPJ) ou serviço do contrato
    AND: cadaPalavra(q, (p): Prisma.ContratoWhereInput[] => {
      const n = numeroPalavra(p), d = p.replace(/\D/g, "");
      return [...(n ? [{ numero: n }] : []), { cliente: { nome: contem(p) } }, { cliente: { fantasia: contem(p) } },
        ...(d.length >= 3 ? [{ cliente: { documento: { contains: d } } }] : []), { servicos: { some: { servico: { nome: contem(p) } } } }];
    }),
  };
  const [lista, contagem, erros] = await Promise.all([
    prisma.contrato.findMany({ where, orderBy: [{ proximoVencimento: "asc" }, { numero: "asc" }], take: 500, include: { cliente: { select: { nome: true } }, servicos: { orderBy: { ordem: "asc" }, include: { servico: { select: { nome: true } } } } } }),
    prisma.contrato.groupBy({ by: ["situacao"], _count: true }),
    prisma.contratoCobranca.count({ where: { OR: [{ situacao: "ERRO" }, { envioErro: { not: null } }], contrato: { situacao: "ATIVO" } } }),
  ]);
  const qtd = (s: string) => contagem.find((c) => c.situacao === s)?._count ?? 0;
  const mensal = lista.filter((c) => c.situacao === "ATIVO").reduce((s, c) => s + Number(c.total) / ({ MENSAL: 1, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 }[c.periodicidade] ?? 1), 0);
  const aba = (s: string, rotulo: string, n?: number) => (
    <Link href={`/contratos?s=${s}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`aba ${(filtro ?? "todos") === s ? "aba-ativa" : ""}`}>{rotulo}{n != null ? ` (${n})` : ""}</Link>
  );

  return (
    <Pagina titulo="Contratos" icone="contratos" trilha={[{ rotulo: "Contratos" }]}
      acoes={<div className="flex flex-wrap items-center gap-2">
        <Link href="/contratos/adicionar" className="btn-verde"><Icone nome="mais" size={15} /> Adicionar</Link>
        <BotaoResultado acao={processarAgoraAcao} icone="atualizar">Processar agora</BotaoResultado>
      </div>}>
      {erros > 0 && <p className="mb-3 flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"><Icone nome="alerta" size={15} /> {erros === 1 ? "Uma cobrança precisa" : `${erros} cobranças precisam`} de atenção (venda ou e-mail com erro). Abra o contrato para ver o motivo.</p>}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap gap-1">
          {aba("ATIVO", "Ativos", qtd("ATIVO"))}{aba("EM_ABERTO", "Em aberto", qtd("EM_ABERTO"))}{aba("PAUSADO", "Pausados", qtd("PAUSADO"))}
          {aba("FINALIZADO", "Finalizados", qtd("FINALIZADO"))}{aba("CANCELADO", "Cancelados", qtd("CANCELADO"))}{aba("todos", "Todos")}
        </nav>
        <form className="ml-auto flex gap-1">
          {sp.s && <input type="hidden" name="s" value={sp.s} />}
          <input name="q" defaultValue={q} placeholder="Cliente, CNPJ ou nº" className="campo w-56" />
          <button className="btn-sec"><Icone nome="buscar" size={14} /></button>
        </form>
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr>
            <th className="w-16">Nº</th><th>Cliente</th><th>Serviços</th><th>Periodicidade</th><th className="text-center">Dia</th><th>Próximo venc.</th><th className="text-right">Valor</th><th>Automático</th><th>Situação</th>
          </tr></thead>
          <tbody>
            {lista.map((c) => {
              const s = situacaoContrato(c.situacao); const k = cor(s.cor);
              return (
                <tr key={c.id}>
                  <td><Link href={`/contratos/${c.id}`} className="text-marca hover:underline">{c.numero}</Link></td>
                  <td><Link href={`/contratos/${c.id}`} className="hover:underline">{c.cliente.nome}</Link></td>
                  <td className="text-[12px] text-slate-600">{c.servicos.map((x) => x.servico.nome).join(", ")}</td>
                  <td>{rotuloPeriodicidade(c.periodicidade as PeriodicidadeContrato)}</td>
                  <td className="text-center">{c.diaVencimento}</td>
                  <td>{["ATIVO", "EM_ABERTO", "PAUSADO"].includes(c.situacao) ? dataUtc(c.proximoVencimento) : "—"}</td>
                  <td className="text-right font-semibold">{brl(c.total)}</td>
                  <td className="text-[11px] text-slate-600">
                    {c.diasAntecedencia} dias antes{c.enviarBoleto ? " · e-mail" : ""}{c.diasLembrete != null ? ` · lembrete ${c.diasLembrete}d` : ""}{c.emitirNota ? " · NFS-e" : ""}
                  </td>
                  <td><span className={`pilula ${k.pilula}`}>{s.rotulo}</span></td>
                </tr>
              );
            })}
            {!lista.length && (
              <tr><td colSpan={9} className="py-10 text-center text-slate-500">
                Nenhum contrato {filtro ? "nesta situação" : ""}. Cadastre os clientes que pagam um valor fixo (ex.: manutenção de TI mensal): o sistema gera a venda, o boleto e manda a cobrança sozinho.
              </td></tr>
            )}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-4 border-t border-slate-200 px-3 py-2.5 text-[12px] text-slate-600">
          <span>Registros <span className="mx-1 text-slate-300">|</span> <b>{lista.length}</b></span>
          {mensal > 0 && <span>Receita recorrente (contratos ativos da lista, por mês): <b>{brl(mensal)}</b></span>}
        </div>
      </div>
    </Pagina>
  );
}
