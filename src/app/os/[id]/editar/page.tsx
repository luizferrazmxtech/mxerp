import { notFound } from "next/navigation";
import { Pagina } from "@/components/ui/Pagina";
import { prisma } from "@/lib/db";
import { estadoEstoque } from "@/lib/os/os";
import FormOs from "../../FormOs";
import { opcoesFormOs, paraCampo } from "../../opcoesForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar OS" };

export default async function EditarOs({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [os, op] = await Promise.all([
    prisma.ordemServico.findUnique({
      where: { id },
      include: {
        cliente: { select: { id: true, nome: true, fantasia: true, documento: true, cidade: true } },
        equipamentos: { orderBy: { ordem: "asc" } },
        produtos: { include: { produto: true }, orderBy: { createdAt: "asc" } },
        servicos: { include: { servico: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    opcoesFormOs(),
  ]);
  if (!os) notFound();
  const reservas = await prisma.reserva.findMany({
    where: { origemTipo: "OS", origemId: id, status: { in: ["ATIVA", "BAIXADA"] } },
    include: { local: { select: { codigo: true } } },
  });
  const onde = (itemId: string) =>
    reservas.filter((r) => r.origemItemId === itemId).map((r) => `${r.local?.codigo ?? "EM FALTA"} (${Number(r.quantidade)})`).join(", ") || null;
  const s = (v: string | null) => v ?? "";
  return (
    <Pagina titulo={`Editar OS #${os.numero}`} trilha={[{ rotulo: "Ordens de serviços", href: "/os" }, { rotulo: "Editar" }]}>
      <FormOs
        {...op}
        produtosTravados={estadoEstoque(os.situacao) !== "RESERVADO"}
        inicial={{
          id: os.id, numero: os.numero, cliente: os.cliente, situacao: os.situacao,
          entrada: paraCampo(os.entrada), saida: paraCampo(os.saida),
          previsao: os.previsao ? paraCampo(os.previsao).slice(0, 10) : "",
          canal: os.canal, prioridade: os.prioridade ?? "", vendedorId: os.vendedorId ?? "", tecnicoId: os.tecnicoId ?? "",
          equipamentos: os.equipamentos.map((e) => ({
            equipamento: e.equipamento, marca: s(e.marca), modelo: s(e.modelo), serie: s(e.serie), condicoes: s(e.condicoes), defeitos: s(e.defeitos),
            acessorios: s(e.acessorios), solucao: s(e.solucao), laudo: s(e.laudo), garantia: s(e.garantia),
          })),
          produtos: os.produtos.map((i) => ({
            id: i.id, produtoId: i.produtoId, codigo: i.produto.codigo, nome: i.produto.nome, unidade: i.produto.unidade,
            quantidade: Number(i.quantidade), valorUnit: Number(i.valorUnit), locais: onde(i.id), disponivel: null,
          })),
          servicos: os.servicos.map((i) => ({ id: i.id, servicoId: i.servicoId, nome: i.servico.nome, quantidade: Number(i.quantidade), valorUnit: Number(i.valorUnit) })),
          frete: Number(os.frete), outros: Number(os.outros), desconto: Number(os.desconto),
          observacoes: s(os.observacoes), observacaoInterna: s(os.observacaoInterna),
        }}
      />
    </Pagina>
  );
}
