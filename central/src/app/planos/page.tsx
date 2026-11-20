import { prisma } from "@/lib/db";
import { salvarPlano } from "../acoes";
import { Pagina, Bloco, Aviso, Campo } from "@/components/ui";
import type { Plano } from "@prisma/client";

export const dynamic = "force-dynamic";

function Form({ p }: { p?: Plano & { _count?: { clientes: number } } }) {
  return (
    <form action={salvarPlano} className="grid items-end gap-2 md:grid-cols-12">
      <input type="hidden" name="id" value={p?.id ?? ""} />
      <Campo rotulo="Nome" className="md:col-span-2"><input name="nome" defaultValue={p?.nome} className="campo" required /></Campo>
      <Campo rotulo="Descrição" className="md:col-span-4"><input name="descricao" defaultValue={p?.descricao ?? ""} className="campo" /></Campo>
      <Campo rotulo="Mensalidade (R$)" className="md:col-span-2"><input name="valorMensal" defaultValue={p ? Number(p.valorMensal).toFixed(2).replace(".", ",") : ""} className="campo" required /></Campo>
      <Campo rotulo="CNPJs" className="md:col-span-1"><input name="maxEmpresas" type="number" min={1} defaultValue={p?.maxEmpresas ?? 1} className="campo" /></Campo>
      <Campo rotulo="Usuários" className="md:col-span-1"><input name="maxUsuarios" type="number" min={1} defaultValue={p?.maxUsuarios ?? 3} className="campo" /></Campo>
      <label className="flex items-center gap-1 pb-2 text-[13px] md:col-span-1"><input type="checkbox" name="ativo" defaultChecked={p?.ativo ?? true} /> ativo</label>
      <button className={`${p ? "btn-sec" : "btn-marca"} md:col-span-1`}>{p ? "Salvar" : "Criar"}</button>
    </form>
  );
}

export default async function Planos({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sp = await searchParams;
  const planos = await prisma.plano.findMany({ orderBy: { valorMensal: "asc" }, include: { _count: { select: { clientes: true } } } });
  return (
    <Pagina titulo="Planos" sub="Limites de CNPJs e usuários que o sistema do cliente respeita. Mudar o valor do plano vale para as próximas mensalidades.">
      {sp.ok && <Aviso>{sp.ok}</Aviso>}
      {sp.erro && <Aviso tipo="erro">{sp.erro}</Aviso>}
      <Bloco titulo="Novo plano"><Form /></Bloco>
      {planos.map((p) => <Bloco key={p.id} titulo={`${p.nome} · ${p._count.clientes} cliente(s)`}><Form p={p} /></Bloco>)}
    </Pagina>
  );
}
