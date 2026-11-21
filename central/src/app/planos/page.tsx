import { prisma } from "@/lib/db";
import { moeda } from "@/lib/datas";
import { salvarPlano } from "../acoes";
import { Pagina, Bloco, Aviso, Campo, Lista, Pilula } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Planos({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sp = await searchParams;
  const planos = await prisma.plano.findMany({ orderBy: { valorMensal: "asc" }, include: { _count: { select: { clientes: true } } } });
  const valor = (v: unknown) => Number(v).toFixed(2).replace(".", ",");
  return (
    <Pagina titulo="Planos" icone="planos" trilha={[{ rotulo: "Planos" }]}
      sub="Limites de CNPJs e usuários que o sistema do cliente respeita. Mudar o valor vale para as próximas mensalidades.">
      {sp.ok && <Aviso>{sp.ok}</Aviso>}
      {sp.erro && <Aviso tipo="erro">{sp.erro}</Aviso>}
      <Bloco titulo={<>Informe os <b>dados</b> do novo plano</>} icone="mais">
        <form action={salvarPlano} className="grid items-end gap-3 md:grid-cols-12">
          <input type="hidden" name="id" value="" />
          <Campo rotulo="Nome" obrig className="md:col-span-2"><input name="nome" className="campo" required /></Campo>
          <Campo rotulo="Descrição" className="md:col-span-4"><input name="descricao" className="campo" /></Campo>
          <Campo rotulo="Mensalidade (R$)" obrig className="md:col-span-2"><input name="valorMensal" className="campo" required /></Campo>
          <Campo rotulo="CNPJs" className="md:col-span-1"><input name="maxEmpresas" type="number" min={1} defaultValue={1} className="campo" /></Campo>
          <Campo rotulo="Usuários" className="md:col-span-1"><input name="maxUsuarios" type="number" min={1} defaultValue={3} className="campo" /></Campo>
          <input type="hidden" name="ativo" value="on" />
          <button className="btn md:col-span-2">Cadastrar plano</button>
        </form>
      </Bloco>
      <Lista total={planos.length}>
        <table className="tabela">
          <thead><tr><th>Plano</th><th>Descrição</th><th className="w-36">Mensalidade (R$)</th><th className="w-24">CNPJs</th><th className="w-24">Usuários</th><th>Clientes</th><th>Situação</th><th></th></tr></thead>
          <tbody>
            {planos.length === 0 && <tr><td colSpan={8} className="text-slate-500">Nenhum plano ainda.</td></tr>}
            {planos.map((p) => {
              const f = `plano-${p.id}`;
              return (
                <tr key={p.id}>
                  <td><input form={f} name="nome" defaultValue={p.nome} className="campo font-semibold" required /></td>
                  <td><input form={f} name="descricao" defaultValue={p.descricao ?? ""} className="campo" /></td>
                  <td><input form={f} name="valorMensal" defaultValue={valor(p.valorMensal)} className="campo text-right" title={moeda(Number(p.valorMensal))} required /></td>
                  <td><input form={f} name="maxEmpresas" type="number" min={1} defaultValue={p.maxEmpresas} className="campo" /></td>
                  <td><input form={f} name="maxUsuarios" type="number" min={1} defaultValue={p.maxUsuarios} className="campo" /></td>
                  <td className="align-middle">{p._count.clientes}</td>
                  <td className="align-middle"><label className="flex items-center gap-1.5"><input form={f} type="checkbox" name="ativo" defaultChecked={p.ativo} /> <Pilula valor={p.ativo ? "ATIVO" : "CANCELADO"} rotulo={p.ativo ? "à venda" : "fora de venda"} /></label></td>
                  <td className="align-middle"><form id={f} action={salvarPlano}><input type="hidden" name="id" value={p.id} /><button className="btn-sec">Salvar</button></form></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Lista>
    </Pagina>
  );
}
