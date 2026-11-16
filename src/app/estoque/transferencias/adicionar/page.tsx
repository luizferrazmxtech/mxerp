import { prisma } from "@/lib/db";
import { Pagina } from "@/components/ui/Pagina";
import { FormTransferencia } from "@/components/estoque/FormsEstoque";

export const dynamic = "force-dynamic";
export const metadata = { title: "Adicionar transferência" };

export default async function AdicionarTransferencia() {
  const depositos = await prisma.deposito.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } });
  return (
    <Pagina titulo="Adicionar transferência" trilha={[{ rotulo: "Transferências", href: "/estoque/transferencias" }, { rotulo: "Adicionar" }]}>
      {depositos.length < 2 && <div className="mb-3 rounded border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-800">Para transferir é preciso ter ao menos duas lojas (depósitos) com locais cadastrados em <a href="/estoque/locais" className="underline">Locais de estoque</a>.</div>}
      <FormTransferencia depositos={depositos} />
    </Pagina>
  );
}
