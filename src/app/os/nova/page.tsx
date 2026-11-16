import { Pagina } from "@/components/ui/Pagina";
import { usuarioAtual } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import FormOs from "../FormOs";
import { opcoesFormOs, paraCampo } from "../opcoesForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Adicionar OS" };

export default async function NovaOs({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const [{ cliente: clienteId }, op, u, seq] = await Promise.all([
    searchParams, opcoesFormOs(), usuarioAtual(),
    prisma.sequencia.findUnique({ where: { chave: "OS" } }),
  ]);
  const cliente = clienteId ? await prisma.pessoa.findUnique({ where: { id: clienteId }, select: { id: true, nome: true, fantasia: true, documento: true, cidade: true } }) : null;
  const eu = op.usuarios.find((x) => x.id === u?.id);
  return (
    <Pagina titulo="Adicionar OS" trilha={[{ rotulo: "Ordens de serviços", href: "/os" }, { rotulo: "Adicionar" }]}>
      <FormOs
        {...op}
        produtosTravados={false}
        inicial={{
          numero: seq ? seq.valor + 1 : null,
          cliente, situacao: "ABERTA", entrada: paraCampo(new Date()), saida: "", previsao: "",
          canal: "Presencial", prioridade: "",
          vendedorId: eu?.vendedor ? eu.id : "", tecnicoId: eu?.tecnico ? eu.id : "",
          equipamentos: [], produtos: [], servicos: [], frete: 0, outros: 0, desconto: 0, observacoes: "", observacaoInterna: "",
        }}
      />
    </Pagina>
  );
}
