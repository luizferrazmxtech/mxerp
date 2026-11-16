import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Pagina } from "@/components/ui/Pagina";
import FormCotacao from "@/components/compras/FormCotacao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar cotação" };

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function EditarCotacao({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.cotacao.findUnique({
    where: { id },
    include: { fornecedores: { include: { fornecedor: { select: { nome: true } } } }, itens: { orderBy: { ordem: "asc" } } },
  });
  if (!c) notFound();
  if (c.situacao !== "ABERTA") redirect(`/compras/cotacoes/${id}`);
  const [produtos, servicos, anexos] = await Promise.all([
    prisma.produto.findMany({ where: { id: { in: c.itens.map((i) => i.produtoId).filter((x): x is string => !!x) } }, select: { id: true, codigo: true } }),
    prisma.servico.findMany({ where: { id: { in: c.itens.map((i) => i.servicoId).filter((x): x is string => !!x) } }, select: { id: true, codigo: true } }),
    prisma.anexo.findMany({ where: { entidade: "COTACAO", entidadeId: id }, select: { id: true, nome: true } }),
  ]);
  const cod = new Map([...produtos, ...servicos].map((x) => [x.id, x.codigo]));
  return (
    <Pagina titulo="Editar cotação" trilha={[{ rotulo: "Cotações", href: "/compras/cotacoes" }, { rotulo: `Nº ${c.numero}`, href: `/compras/cotacoes/${id}` }, { rotulo: "Editar" }]}>
      <FormCotacao anexos={anexos} inicial={{
        id, data: ymd(c.data), prazo: ymd(c.prazo), observacoes: c.observacoes ?? "", observacaoInterna: c.observacaoInterna ?? "",
        fornecedores: c.fornecedores.map((f) => ({ id: f.id, fornecedorId: f.fornecedorId, nome: f.fornecedor.nome, email: f.email, celular: f.celular ?? "" })),
        itens: c.itens.map((i) => ({ id: i.id, produtoId: i.produtoId ?? "", servicoId: i.servicoId ?? "", nome: i.nome, codigo: cod.get(i.produtoId ?? i.servicoId ?? ""), detalhes: i.detalhes ?? "", quantidade: Number(i.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 4 }), unidade: i.unidade })),
      }} />
    </Pagina>
  );
}
