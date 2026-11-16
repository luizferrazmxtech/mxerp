import { Pagina } from "@/components/ui/Pagina";
import { usuarioAtual } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import FormVenda from "../FormVenda";

export const dynamic = "force-dynamic";
export const metadata = { title: "Adicionar venda" };

export default async function NovaVenda() {
  const [u, vendedores, seq] = await Promise.all([
    usuarioAtual(),
    prisma.usuario.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, vendedor: true } }),
    prisma.sequencia.findUnique({ where: { chave: "VENDA" } }),
  ]);
  const eu = vendedores.find((x) => x.id === u?.id);
  return (
    <Pagina titulo="Adicionar venda" trilha={[{ rotulo: "Vendas de produtos", href: "/vendas" }, { rotulo: "Adicionar" }]}>
      <FormVenda
        vendedores={vendedores.filter((x) => x.vendedor || x.id === u?.id)}
        inicial={{
          numero: seq ? seq.valor + 1 : null, cliente: null, situacao: "ABERTA",
          data: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
          vendedorId: eu?.id ?? "", produtos: [], frete: 0, desconto: 0, observacoes: "",
        }}
      />
    </Pagina>
  );
}
