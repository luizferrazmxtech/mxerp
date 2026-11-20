import Link from "next/link";
import { Bloco, Campo, Pagina } from "@/components/ui/Pagina";
import Icone from "@/components/Icone";
import { prisma } from "@/lib/db";
import { criarLocal } from "../actions";

export const dynamic = "force-dynamic";

export default async function LocaisPage() {
  const locais = await prisma.local.findMany({
    include: { deposito: true, _count: { select: { saldos: { where: { quantidade: { not: 0 } } } } } },
    orderBy: { codigo: "asc" },
  });
  return (
    <Pagina titulo="Locais de estoque" icone="locais" trilha={[{ rotulo: "Estoque", href: "/estoque" }, { rotulo: "Locais" }]}>
    <div className="no-print mb-3 flex flex-wrap items-center gap-2">
      <Link href="/estoque" className="btn-sec"><Icone nome="direita" size={14} className="rotate-180" /> Voltar ao estoque</Link>
      <span className="ml-auto text-[13px] text-slate-500">{locais.length} local(is) cadastrado(s)</span>
    </div>
    <Bloco icone="mais" titulo={<>Adicionar <b>local</b></>} subtitulo="O código é montado sozinho (ex.: LOJA-A-03-2) se ficar em branco.">
      <form action={criarLocal} className="grid items-end gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Campo rotulo="Depósito"><input name="deposito" className="campo" defaultValue="Loja" /></Campo>
        <Campo rotulo="Corredor"><input name="corredor" className="campo" placeholder="A" /></Campo>
        <Campo rotulo="Prateleira"><input name="prateleira" className="campo" placeholder="03" /></Campo>
        <Campo rotulo="Nível"><input name="nivel" className="campo" placeholder="2" /></Campo>
        <Campo rotulo="Código"><input name="codigo" className="campo" placeholder="automático" /></Campo>
        <button className="btn"><Icone nome="mais" size={14} /> Adicionar local</button>
      </form>
    </Bloco>
    <div className="cartao overflow-x-auto">
      <table className="tabela">
        <thead><tr><th>Código</th><th>Depósito</th><th>Corredor</th><th>Prateleira</th><th>Nível</th><th className="text-center">Situação</th><th className="text-right">Produtos com saldo</th></tr></thead>
        <tbody>
          {locais.map((l) => (
            <tr key={l.id}>
              <td className="font-semibold">{l.codigo}</td>
              <td>{l.deposito.nome}</td>
              <td>{l.corredor ?? "—"}</td>
              <td>{l.prateleira ?? "—"}</td>
              <td>{l.nivel ?? "—"}</td>
              <td className="text-center"><span className={`pilula ${l.ativo ? "text-emerald-700" : "text-slate-500"}`}>{l.ativo ? "Ativo" : "Inativo"}</span></td>
              <td className="text-right">{l._count.saldos}</td>
            </tr>
          ))}
          {!locais.length && <tr><td colSpan={7} className="py-10 text-center text-slate-500">Nenhum local cadastrado.</td></tr>}
        </tbody>
      </table>
    </div>
    </Pagina>
  );
}
