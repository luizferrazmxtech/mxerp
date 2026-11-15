import { prisma } from "@/lib/db";
import { criarLocal } from "../actions";

export const dynamic = "force-dynamic";

export default async function LocaisPage() {
  const locais = await prisma.local.findMany({
    include: { deposito: true, _count: { select: { saldos: { where: { quantidade: { not: 0 } } } } } },
    orderBy: { codigo: "asc" },
  });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Locais de estoque</h1>
      <form action={criarLocal} className="cartao grid gap-2 p-4 md:grid-cols-6">
        <input name="deposito" className="campo" placeholder="Depósito (ex.: Loja)" defaultValue="Loja" />
        <input name="corredor" className="campo" placeholder="Corredor (A)" />
        <input name="prateleira" className="campo" placeholder="Prateleira (03)" />
        <input name="nivel" className="campo" placeholder="Nível (2)" />
        <input name="codigo" className="campo" placeholder="Código (automático)" />
        <button className="btn">Adicionar local</button>
      </form>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Código</th><th>Depósito</th><th>Corredor</th><th>Prateleira</th><th>Nível</th><th className="text-right">Produtos</th></tr></thead>
          <tbody>
            {locais.map((l) => (
              <tr key={l.id}>
                <td className="font-mono">{l.codigo}</td>
                <td>{l.deposito.nome}</td>
                <td>{l.corredor}</td>
                <td>{l.prateleira}</td>
                <td>{l.nivel}</td>
                <td className="text-right">{l._count.saldos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
