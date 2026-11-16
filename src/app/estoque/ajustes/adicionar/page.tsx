import { prisma } from "@/lib/db";
import { Pagina } from "@/components/ui/Pagina";
import { FormAjuste } from "@/components/estoque/FormsEstoque";

export const dynamic = "force-dynamic";
export const metadata = { title: "Adicionar ajuste de estoque" };

const n2 = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export default async function AdicionarAjuste({ searchParams }: { searchParams: Promise<{ clonar?: string }> }) {
  const { clonar } = await searchParams;
  const a = clonar ? await prisma.ajusteEstoque.findUnique({ where: { id: clonar }, include: { itens: { orderBy: { ordem: "asc" }, include: { produto: { select: { nome: true, codigo: true, unidade: true } } } } } }) : null;
  const inicial = a ? {
    tipo: a.tipo === "SAIDA" ? "SAIDA" as const : "ENTRADA" as const, frete: n2(a.frete), observacoes: a.observacoes ?? "",
    itens: a.itens.map((i) => ({ produtoId: i.produtoId, nome: i.produto.nome, codigo: i.produto.codigo, unidade: i.produto.unidade, quantidade: n2(i.quantidade).replace(/,00$/, ""), custo: n2(i.custoUnit) })),
  } : undefined;
  return (
    <Pagina titulo="Adicionar ajuste de estoque" trilha={[{ rotulo: "Ajustes de estoque", href: "/estoque/ajustes" }, { rotulo: "Adicionar" }]}>
      <FormAjuste inicial={inicial} />
    </Pagina>
  );
}
