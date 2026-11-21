import { prisma } from "@/lib/db";
import { todasAsLojas } from "@/lib/empresa/loja";
import { Pagina } from "@/components/ui/Pagina";
import { FormTransferencia } from "@/components/estoque/FormsEstoque";

export const dynamic = "force-dynamic";
export const metadata = { title: "Adicionar transferência" };

export default async function AdicionarTransferencia({ searchParams }: { searchParams: Promise<{ origem?: string; destino?: string }> }) {
  const sp = await searchParams;
  // origem e destino podem ser de lojas (CNPJs) diferentes, ou o carro de uma equipe
  const depositos = await todasAsLojas(() => prisma.deposito.findMany({
    where: { ativo: true }, orderBy: { nome: "asc" },
    select: { id: true, nome: true, equipeId: true, locais: { where: { ativo: true }, select: { id: true, codigo: true }, orderBy: { codigo: "asc" } } },
  }));
  const ids = new Set(depositos.map((d) => d.id));
  return (
    <Pagina titulo="Adicionar transferência" trilha={[{ rotulo: "Transferências", href: "/estoque/transferencias" }, { rotulo: "Adicionar" }]}>
      {depositos.length < 2 && <div className="mb-3 rounded border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-800">Para transferir é preciso ter ao menos dois estoques (loja, depósito ou carro) em <a href="/estoque/locais" className="underline">Locais de estoque</a>.</div>}
      <FormTransferencia depositos={depositos.map((d) => ({ id: d.id, nome: d.nome, carro: !!d.equipeId, locais: d.locais }))}
        origemInicial={sp.origem && ids.has(sp.origem) ? sp.origem : ""} destinoInicial={sp.destino && ids.has(sp.destino) ? sp.destino : ""} />
    </Pagina>
  );
}
