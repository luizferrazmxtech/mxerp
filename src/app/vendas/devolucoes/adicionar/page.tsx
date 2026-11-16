import Link from "next/link";
import { prisma } from "@/lib/db";
import { devolvidoPorItem } from "@/lib/vendas/pedidos";
import { Bloco, Pagina } from "@/components/ui/Pagina";
import FormDevolucao from "@/components/vendas/FormDevolucao";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Adicionar troca ou devolução" };

const POR = [["venda", "Número da venda"], ["nfe", "Número da NF-e"], ["nfce", "Número da NFC-e"]] as const;

export default async function AdicionarDevolucao({ searchParams }: { searchParams: Promise<{ por?: string; tipo?: string; numero?: string; venda?: string }> }) {
  const sp = await searchParams;
  const por = sp.venda ? "venda" : POR.some(([k]) => k === sp.por) ? sp.por! : "venda";
  const numero = Number(sp.venda ?? sp.numero ?? "") || 0;
  const tipo = sp.tipo === "TROCA" ? "TROCA" : "DEVOLUCAO";
  let vendaId: string | null = null;
  let aviso = "";
  if (numero) {
    if (por === "venda") vendaId = (await prisma.venda.findUnique({ where: { numero }, select: { id: true } }))?.id ?? null;
    else {
      const n = await prisma.notaFiscal.findFirst({ where: { numero, modelo: por === "nfe" ? "NFE" : "NFCE", origemTipo: "VENDA", status: "AUTORIZADA" }, select: { origemId: true } });
      vendaId = n?.origemId ?? null;
    }
    if (!vendaId) aviso = `Nenhuma venda encontrada com esse número.`;
  }
  const v = vendaId ? await prisma.venda.findUnique({
    where: { id: vendaId },
    include: { cliente: { select: { nome: true } }, vendedor: { select: { nome: true } }, itens: { orderBy: { ordem: "asc" }, include: { produto: { select: { codigo: true, nome: true, unidade: true } } } } },
  }) : null;
  if (v && v.situacao !== "CONCLUIDA") aviso = "Esta venda não saiu do estoque (a situação dela não lança estoque), então não há o que devolver.";
  const ja = v ? await devolvidoPorItem(v.id) : new Map<string, number>();
  const empresa = await prisma.empresa.findFirst({ select: { nomeFantasia: true, razaoSocial: true } });
  const bruto = v ? v.itens.reduce((s, i) => s + Number(i.subtotal), 0) : 0;
  const fator = v && bruto > 0 ? 1 - Number(v.desconto) / bruto : 1;

  return (
    <Pagina titulo="Adicionar troca ou devolução" trilha={[{ rotulo: "Trocas e devoluções", href: "/vendas/devolucoes" }, { rotulo: "Adicionar" }]}>
      <Bloco icone="buscar" titulo={<>Escolha a <b>venda</b> que volta para a loja</>} subtitulo="Busque o pedido pelo número da venda ou da nota.">
        <form className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label><span className="rotulo obrig">Buscar pedido por</span><select name="por" defaultValue={por} className="campo">{POR.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></label>
          <label><span className="rotulo obrig">Tipo de movimentação</span><select name="tipo" defaultValue={tipo} className="campo"><option value="DEVOLUCAO">Devolução</option><option value="TROCA">Troca</option></select></label>
          <label><span className="rotulo obrig">Número</span><div className="flex"><input name="numero" defaultValue={numero || ""} className="campo rounded-r-none" inputMode="numeric" required /><button className="btn rounded-l-none px-2.5" title="Buscar"><Icone nome="buscar" size={15} /></button></div></label>
        </form>
        {aviso && <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{aviso}</p>}
      </Bloco>
      {v && v.situacao === "CONCLUIDA" && (
        <>
          <div className="cartao mb-3 grid gap-2 p-4 text-[13px] sm:grid-cols-5">
            <div><span className="text-slate-500">Pedido</span><br /><Link href={`/vendas/${v.id}`} className="font-semibold text-marca hover:underline">#{v.numero}</Link></div>
            <div><span className="text-slate-500">Cliente</span><br /><b>{v.cliente?.nome ?? "Consumidor"}</b></div>
            <div><span className="text-slate-500">Data da venda</span><br /><b>{v.data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</b></div>
            <div><span className="text-slate-500">Vendedor</span><br /><b>{v.vendedor?.nome ?? "—"}</b></div>
            <div><span className="text-slate-500">Loja</span><br /><b>{empresa?.nomeFantasia || empresa?.razaoSocial}</b></div>
          </div>
          <FormDevolucao vendaId={v.id} tipo={tipo} desconto={Number(v.desconto)} frete={Number(v.frete)}
            itens={v.itens.map((i) => ({ id: i.id, codigo: i.produto.codigo, nome: i.produto.nome, unidade: i.produto.unidade, vendido: Number(i.quantidade), jaDevolvido: ja.get(i.id) ?? 0,
              unit: Math.round((Number(i.subtotal) / Number(i.quantidade)) * fator * 100) / 100 }))} />
        </>
      )}
    </Pagina>
  );
}
