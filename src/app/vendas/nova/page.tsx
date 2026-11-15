import { prisma } from "@/lib/db";
import { novaVenda } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovaVenda() {
  const clientes = await prisma.pessoa.findMany({ where: { cliente: true, ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true }, take: 5000 });
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Novo pedido de venda</h1>
      <form action={novaVenda} className="cartao space-y-3 p-4">
        <select name="clienteId" className="campo">
          <option value="">Consumidor (sem cliente)</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select name="situacao" className="campo" defaultValue="ABERTA">
          <option value="ABERTA">Pedido (reserva o estoque)</option>
          <option value="ORCAMENTO">Orçamento (não reserva)</option>
        </select>
        <button className="btn">Criar</button>
      </form>
    </div>
  );
}
