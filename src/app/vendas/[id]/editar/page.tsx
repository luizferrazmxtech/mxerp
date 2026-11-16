import { notFound } from "next/navigation";
import { Pagina } from "@/components/ui/Pagina";
import { prisma } from "@/lib/db";
import FormVenda from "../../FormVenda";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar venda" };

export default async function EditarVenda({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [v, vendedores] = await Promise.all([
    prisma.venda.findUnique({
      where: { id },
      include: { cliente: { select: { id: true, nome: true, fantasia: true, documento: true, cidade: true } }, itens: { include: { produto: true } } },
    }),
    prisma.usuario.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, vendedor: true } }),
  ]);
  if (!v) notFound();
  const reservas = await prisma.reserva.findMany({ where: { origemTipo: "VENDA", origemId: id, status: { in: ["ATIVA", "BAIXADA"] } }, include: { local: { select: { codigo: true } } } });
  const onde = (itemId: string) => reservas.filter((r) => r.origemItemId === itemId).map((r) => `${r.local?.codigo ?? "EM FALTA"} (${Number(r.quantidade)})`).join(", ") || null;
  return (
    <Pagina titulo={`Editar venda #${v.numero}`} trilha={[{ rotulo: "Vendas de produtos", href: "/vendas" }, { rotulo: "Editar" }]}>
      <FormVenda
        vendedores={vendedores.filter((x) => x.vendedor || x.id === v.vendedorId)}
        inicial={{
          id: v.id, numero: v.numero, cliente: v.cliente, situacao: v.situacao,
          data: v.data.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
          vendedorId: v.vendedorId ?? "",
          produtos: v.itens.map((i) => ({ id: i.id, produtoId: i.produtoId, codigo: i.produto.codigo, nome: i.produto.nome, quantidade: Number(i.quantidade), valorUnit: Number(i.valorUnit), locais: onde(i.id), disponivel: null })),
          frete: Number(v.frete), desconto: Number(v.desconto), observacoes: v.observacoes ?? "",
        }}
      />
    </Pagina>
  );
}
