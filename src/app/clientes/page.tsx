import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function criarCliente(form: FormData) {
  "use server";
  const doc = String(form.get("documento") || "").replace(/\D/g, "") || null;
  await prisma.pessoa.create({
    data: {
      nome: String(form.get("nome")).trim(),
      documento: doc,
      tipoPessoa: doc && doc.length === 11 ? "FISICA" : "JURIDICA",
      telefone: String(form.get("telefone") || "") || null,
      email: String(form.get("email") || "") || null,
    },
  });
  revalidatePath("/clientes");
}

export default async function Clientes({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const lista = await prisma.pessoa.findMany({
    where: { cliente: true, ...(q ? { OR: [{ nome: { contains: q, mode: "insensitive" } }, { documento: { contains: q.replace(/\D/g, "") || q } }] } : {}) },
    orderBy: { nome: "asc" },
    take: 100,
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Clientes</h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} className="campo w-64" placeholder="Nome ou CPF/CNPJ" />
          <button className="btn-sec">Buscar</button>
        </form>
      </div>
      <form action={criarCliente} className="cartao grid gap-2 p-4 md:grid-cols-5">
        <input name="nome" required className="campo md:col-span-2" placeholder="Nome / razão social" />
        <input name="documento" className="campo" placeholder="CPF/CNPJ" />
        <input name="telefone" className="campo" placeholder="Telefone" />
        <button className="btn">Adicionar</button>
      </form>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>Telefone</th><th>Cidade</th></tr></thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}><td>{c.nome}</td><td className="font-mono text-xs">{c.documento}</td><td>{c.telefone}</td><td>{c.cidade}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
