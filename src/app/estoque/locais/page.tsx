import Link from "next/link";
import { Bloco, Campo, Pagina } from "@/components/ui/Pagina";
import Icone from "@/components/Icone";
import { prisma } from "@/lib/db";
import { criarEstoqueTecnicoAcao, criarLocal } from "../actions";

export const dynamic = "force-dynamic";

export default async function LocaisPage() {
  const [locais, funcionarios] = await Promise.all([
    prisma.local.findMany({
      include: { deposito: { include: { tecnico: { select: { nome: true } } } }, _count: { select: { saldos: { where: { quantidade: { not: 0 } } } } } },
      orderBy: { codigo: "asc" },
    }),
    prisma.usuario.findMany({ where: { ativo: true, estoqueTecnico: null }, select: { id: true, nome: true, tecnico: true, papel: true }, orderBy: { nome: "asc" } }),
  ]);
  const doTecnico = locais.filter((l) => l.deposito.tecnicoId);
  const tecnicosSem = funcionarios.filter((f) => f.tecnico || f.papel === "TECNICO");
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
    <Bloco icone="equipe" titulo={<>Estoque dos <b>técnicos</b></>} subtitulo="O carro de cada técnico é um estoque à parte: fica fora do disponível da loja, abastece por transferência (sem gerar venda) e a peça que o técnico lança na OS sai dele." corpo="p-0">
      <form action={criarEstoqueTecnicoAcao} className="flex flex-wrap items-end gap-2 border-b p-3">
        <Campo rotulo="Técnico"><select name="tecnicoId" className="campo min-w-56" required defaultValue="">
          <option value="" disabled>Selecione</option>
          {tecnicosSem.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          {funcionarios.length > tecnicosSem.length && <optgroup label="Outros funcionários">{funcionarios.filter((f) => !tecnicosSem.includes(f)).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</optgroup>}
        </select></Campo>
        <Campo rotulo="Nome do estoque"><input name="nome" className="campo min-w-56" placeholder="automático: Carro - Nome" /></Campo>
        <button className="btn"><Icone nome="mais" size={14} /> Criar estoque do técnico</button>
      </form>
      <table className="tabela">
        <thead><tr><th>Técnico</th><th>Estoque</th><th>Local</th><th className="text-right">Produtos com saldo</th><th className="text-right">Ações</th></tr></thead>
        <tbody>
          {doTecnico.map((l) => (
            <tr key={l.id}>
              <td className="font-semibold">{l.deposito.tecnico?.nome ?? "—"}</td>
              <td>{l.deposito.nome}</td>
              <td className="font-mono text-[12px]">{l.codigo}</td>
              <td className="text-right">{l._count.saldos}</td>
              <td className="text-right">
                <div className="flex justify-end gap-1 whitespace-nowrap">
                  <Link href={`/tecnico/estoque?tec=${l.deposito.tecnicoId}`} className="btn-sec py-1"><Icone nome="ver" size={13} /> Ver</Link>
                  <Link href={`/estoque/transferencias/adicionar?destino=${l.depositoId}`} className="btn-sec py-1">Abastecer</Link>
                  <Link href={`/estoque/transferencias/adicionar?origem=${l.depositoId}`} className="btn-sec py-1">Devolver à loja</Link>
                </div>
              </td>
            </tr>
          ))}
          {!doTecnico.length && <tr><td colSpan={5} className="py-6 text-center text-slate-500">Nenhum técnico com estoque próprio.</td></tr>}
        </tbody>
      </table>
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
