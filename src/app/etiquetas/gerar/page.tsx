import Link from "next/link";
import { prisma } from "@/lib/db";
import { Pagina } from "@/components/ui/Pagina";
import ImprimirEtiquetas from "@/components/itens/ImprimirEtiquetas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gerar etiquetas" };

export default async function Gerar({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const sp = await searchParams;
  const ids = [sp.ids ?? []].flat().flatMap((x) => x.split(",")).filter(Boolean);
  const [produtos, modelos] = await Promise.all([
    ids.length ? prisma.produto.findMany({ where: { id: { in: ids } }, select: { id: true, codigo: true, nome: true, gtin: true, precoVenda: true, unidade: true }, orderBy: { nome: "asc" } }) : [],
    prisma.modeloEtiqueta.findMany({ orderBy: { nome: "asc" } }),
  ]);
  const n = (v: unknown) => Number(v);
  return (
    <Pagina titulo="Gerar etiquetas" icone="etiqueta" trilha={[{ rotulo: "Etiquetas", href: "/etiquetas" }, { rotulo: "Gerar" }]}>
      {!produtos.length ? (
        <div className="cartao p-8 text-center text-[13px] text-slate-600">Nenhum produto escolhido. <Link href="/produtos?acao=etiquetas" className="text-marca hover:underline">Marque os produtos na lista</Link>.</div>
      ) : !modelos.length ? (
        <div className="cartao p-8 text-center text-[13px] text-slate-600">Cadastre um modelo de etiqueta antes. <Link href="/etiquetas/adicionar" className="text-marca hover:underline">Adicionar modelo</Link>.</div>
      ) : (
        <ImprimirEtiquetas produtos={produtos.map(({ precoVenda, ...p }) => ({ ...p, preco: n(precoVenda) }))}
          modelos={modelos.map((m) => ({ ...m, altura: n(m.altura), largura: n(m.largura), margemSuperior: n(m.margemSuperior), margemLateral: n(m.margemLateral), distVertical: n(m.distVertical), distHorizontal: n(m.distHorizontal) }))} />
      )}
    </Pagina>
  );
}
