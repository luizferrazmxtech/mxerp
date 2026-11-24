import Link from "next/link";
import { prisma } from "@/lib/db";
import Icone from "@/components/Icone";

/**
 * Faixa da venda/OS que mostra os vínculos criados por "Juntar" e "Agrupar contas":
 * a original juntada aponta para a nova; a nova lista as que juntou; conta agrupada aponta para o título no financeiro.
 */
export default async function AvisoJuncao({ tipo, id }: { tipo: "VENDA" | "OS"; id: string }) {
  const venda = tipo === "VENDA";
  const sel = { id: true, numero: true } as const;
  const [doc, juntadas, agrupados] = await Promise.all([
    venda ? prisma.venda.findUnique({ where: { id }, select: { juntadaEm: { select: sel } } }) : prisma.ordemServico.findUnique({ where: { id }, select: { juntadaEm: { select: sel } } }),
    venda ? prisma.venda.findMany({ where: { juntadaEmId: id }, select: sel, orderBy: { numero: "asc" } }) : prisma.ordemServico.findMany({ where: { juntadaEmId: id }, select: sel, orderBy: { numero: "asc" } }),
    prisma.lancamentoAgrupado.findMany({ where: { origemTipo: tipo, origemId: id }, select: { descricao: true, lancamento: { select: { id: true, descricao: true, pagoEm: true, vencimento: true } } } }),
  ]);
  const rota = venda ? "/vendas" : "/os";
  const nome = venda ? "venda" : "OS";
  const titulos = [...new Map(agrupados.map((a) => [a.lancamento.id, a.lancamento])).values()];
  if (!doc?.juntadaEm && !juntadas.length && !titulos.length) return null;
  return (
    <div className="no-print mb-3 space-y-1.5">
      {doc?.juntadaEm && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
          <Icone nome="alerta" size={15} />
          Esta {nome} foi juntada com outras e cancelada. Os itens e o financeiro estão na
          <Link href={`${rota}/${doc.juntadaEm.id}`} className="font-semibold underline">{venda ? "venda" : "OS"} nº {doc.juntadaEm.numero}</Link>.
        </div>
      )}
      {juntadas.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-[#dee2e6] bg-white px-4 py-2.5 text-[13px] text-[#495057]">
          <Icone nome="copiar" size={15} /> {venda ? "Venda criada juntando as vendas" : "OS criada juntando as OS"}
          {juntadas.map((j, i) => <span key={j.id}><Link href={`${rota}/${j.id}`} className="font-semibold text-[#0c1b25] underline">nº {j.numero}</Link>{i < juntadas.length - 1 ? "," : ""}</span>)}
        </div>
      )}
      {titulos.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-[13px] text-slate-800">
          <Icone nome="financeiro" size={15} /> A conta a receber desta {nome} foi agrupada no título
          <Link href={`/financeiro/lancamentos/${t.id}`} className="font-semibold underline">{t.descricao}</Link>
          <span className="text-slate-500">(venc. {t.vencimento.toLocaleDateString("pt-BR", { timeZone: "UTC" })}{t.pagoEm ? ", recebido" : ", em aberto"})</span>
        </div>
      ))}
    </div>
  );
}
