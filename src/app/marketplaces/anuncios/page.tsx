import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { exigirArea } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { vincularAnuncioAcao } from "@/lib/marketplaces/acoes";
import { cadaPalavra, contem } from "@/lib/busca/palavras";
import { Pagina, Pilula, RodapeLista } from "@/components/ui/Pagina";
import BotaoForm from "@/components/marketplaces/BotaoForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anúncios dos marketplaces" };

export default async function Anuncios({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  await exigirArea("/marketplaces/anuncios");
  const sp = await searchParams;
  const sem = sp.f !== "todos";
  const where: Prisma.AnuncioMarketplaceWhereInput = {
    ...(sem ? { produtoId: null } : {}),
    AND: cadaPalavra(sp.q, (p) => [{ titulo: contem(p) }, { sku: contem(p) }, { anuncioId: contem(p) }, { produto: { nome: contem(p) } }, { produto: { codigo: contem(p) } }]),
  };
  const [anuncios, total, semVinculo] = await Promise.all([
    prisma.anuncioMarketplace.findMany({ where, orderBy: [{ produtoId: { sort: "asc", nulls: "first" } }, { titulo: "asc" }], take: 300, include: { produto: { select: { id: true, codigo: true, nome: true } } } }),
    prisma.anuncioMarketplace.count({ where }),
    prisma.anuncioMarketplace.count({ where: { produtoId: null } }),
  ]);
  const aba = (f: string, r: string) => <Link href={`/marketplaces/anuncios?${new URLSearchParams({ f, ...(sp.q ? { q: sp.q } : {}) })}`} className={`rounded px-2 py-1 text-[13px] ${(sem ? "sem" : "todos") === f ? "bg-marca text-white" : "hover:bg-slate-100"}`}>{r}</Link>;
  return (
    <Pagina titulo="Anúncios dos marketplaces" icone="etiqueta" trilha={[{ rotulo: "Vendas", href: "/vendas" }, { rotulo: "Marketplaces", href: "/marketplaces" }, { rotulo: "Anúncios" }]}>
      <p className="mb-3 max-w-4xl text-[13px] text-slate-600">
        Cada anúncio vendido aparece aqui. Quando o SKU do anúncio é igual ao código (ou código de barras) de um produto, ele é ligado sozinho.
        Para os outros, informe o código do produto: os pedidos que estavam esperando viram venda na hora. Dica: preencha o SKU dos anúncios no Mercado Livre com o código do MXERP.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {aba("sem", `Sem produto (${semVinculo})`)}{aba("todos", "Todos")}
        <form className="ml-auto flex gap-2"><input type="hidden" name="f" value={sem ? "sem" : "todos"} /><input name="q" defaultValue={sp.q} placeholder="Título, SKU, anúncio ou produto" className="campo h-8 w-64 text-[13px]" /><button className="btn-sec h-8 text-[12px]">Buscar</button></form>
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Anúncio</th><th>SKU</th><th>Produto no MXERP</th><th className="min-w-80">Ligar ao produto (código)</th></tr></thead>
          <tbody>
            {anuncios.map((a) => (
              <tr key={a.id}>
                <td>{a.titulo}<div className="font-mono text-[11px] text-slate-500">{a.anuncioId}{a.variacaoId ? ` · variação ${a.variacaoId}` : ""}</div></td>
                <td className="font-mono text-[13px]">{a.sku ?? <span className="text-slate-400">sem SKU</span>}</td>
                <td>{a.produto ? <Link className="text-marca hover:underline" href={`/produtos/${a.produto.id}`}>{a.produto.codigo} · {a.produto.nome}</Link> : <Pilula rotulo="Sem produto" cor="border-amber-300 bg-amber-50 text-amber-800" />}</td>
                <td>
                  <BotaoForm acao={vincularAnuncioAcao} campos={{ id: a.id }} rotulo={a.produto ? "Trocar" : "Ligar"} secundario={!!a.produto}>
                    <input name="codigo" defaultValue={a.produto?.codigo ?? ""} placeholder="Código do produto" className="campo h-8 w-40 font-mono text-[12px]" />
                  </BotaoForm>
                </td>
              </tr>
            ))}
            {!anuncios.length && <tr><td colSpan={4} className="py-8 text-center text-slate-500">{sem ? "Todos os anúncios vendidos estão ligados a um produto." : "Nenhum anúncio ainda: eles aparecem quando chegam os pedidos."}</td></tr>}
          </tbody>
        </table>
        <RodapeLista total={total} mostrando={anuncios.length} />
      </div>
    </Pagina>
  );
}
