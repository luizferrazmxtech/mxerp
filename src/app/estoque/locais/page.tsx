import Link from "next/link";
import { Bloco, Campo, Pagina } from "@/components/ui/Pagina";
import Icone from "@/components/Icone";
import { prisma } from "@/lib/db";
import { criarEstoqueEquipeAcao, criarLocal, renomearDepositoAcao } from "../actions";

export const dynamic = "force-dynamic";

export default async function LocaisPage({ searchParams }: { searchParams: Promise<{ renomear?: string; erro?: string }> }) {
  const sp = await searchParams;
  const [locais, semCarro, usuarios, temEquipes] = await Promise.all([
    prisma.local.findMany({
      include: { deposito: { include: { equipe: { select: { nome: true, membros: true } } } }, _count: { select: { saldos: { where: { quantidade: { not: 0 } } } } } },
      orderBy: { codigo: "asc" },
    }),
    prisma.equipe.findMany({ where: { ativo: true, carro: null }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.usuario.findMany({ select: { id: true, nome: true } }),
    prisma.equipe.count({ where: { ativo: true } }),
  ]);
  const doCarro = locais.filter((l) => l.deposito.equipeId);
  const renomear = sp.renomear ? locais.find((l) => l.depositoId === sp.renomear)?.deposito : undefined;
  const lojaPadrao = locais.find((l) => !l.deposito.equipeId)?.deposito.nome ?? "Loja";
  const editarNome = (depositoId: string) => (
    <Link href={`/estoque/locais?renomear=${depositoId}`} className="ml-1 inline-flex align-middle text-slate-400 hover:text-marca" title="Editar o nome do estoque"><Icone nome="editar" size={13} /></Link>
  );
  const nome = new Map(usuarios.map((x) => [x.id, x.nome]));
  return (
    <Pagina titulo="Locais de estoque" icone="locais" trilha={[{ rotulo: "Estoque", href: "/estoque" }, { rotulo: "Locais" }]}>
    <div className="no-print mb-3 flex flex-wrap items-center gap-2">
      <Link href="/estoque" className="btn-sec"><Icone nome="direita" size={14} className="rotate-180" /> Voltar ao estoque</Link>
      <span className="ml-auto text-[13px] text-slate-500">{locais.length} local(is) cadastrado(s)</span>
    </div>
    {renomear && (
      <Bloco icone="editar" titulo={<>Editar o nome do <b>estoque</b></>} subtitulo="Vale para todos os locais (prateleiras) deste estoque. O histórico e as transferências passam a mostrar o nome novo.">
        <form action={renomearDepositoAcao} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={renomear.id} />
          <Campo rotulo="Nome" obrigatorio><input name="nome" className="campo min-w-72" defaultValue={renomear.nome} required maxLength={80} autoFocus /></Campo>
          <button className="btn">Salvar</button>
          <Link href="/estoque/locais" className="btn-sec">Cancelar</Link>
        </form>
        {sp.erro && <p className="mt-2 text-[13px] text-red-600">{sp.erro}</p>}
      </Bloco>
    )}
    <Bloco icone="mais" titulo={<>Adicionar <b>local</b></>} subtitulo="O código é montado sozinho (ex.: LOJA-A-03-2) se ficar em branco.">
      <form action={criarLocal} className="grid items-end gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Campo rotulo="Depósito"><input name="deposito" className="campo" defaultValue={lojaPadrao} /></Campo>
        <Campo rotulo="Corredor"><input name="corredor" className="campo" placeholder="A" /></Campo>
        <Campo rotulo="Prateleira"><input name="prateleira" className="campo" placeholder="03" /></Campo>
        <Campo rotulo="Nível"><input name="nivel" className="campo" placeholder="2" /></Campo>
        <Campo rotulo="Código"><input name="codigo" className="campo" placeholder="automático" /></Campo>
        <button className="btn"><Icone nome="mais" size={14} /> Adicionar local</button>
      </form>
    </Bloco>
    <Bloco icone="frete" titulo={<>Estoque dos <b>carros</b></>} subtitulo="Cada equipe é um carro (sempre os mesmos técnicos) com estoque à parte: fica fora do disponível da loja e a peça que a equipe lança na OS sai dele." corpo="p-0">
      <ol className="space-y-1 border-b bg-slate-50 p-3 text-[13px] text-slate-700">
        <li><b>1. Crie a equipe</b> em <Link href="/os/equipes" className="text-sky-700 underline">Ordens de serviço › Equipes</Link>, com os técnicos que andam no carro.</li>
        <li><b>2. Crie o carro</b> da equipe aqui embaixo.</li>
        <li><b>3. Abasteça</b> o carro com uma transferência (botão Abastecer na lista). Não gera venda.</li>
      </ol>
      {!temEquipes ? (
        <div className="flex flex-wrap items-center gap-2 border-b p-3 text-[13px] text-slate-600">
          Nenhuma equipe cadastrada ainda.
          <Link href="/os/equipes?novo=1" className="btn"><Icone nome="mais" size={14} /> Cadastrar equipe</Link>
        </div>
      ) : !semCarro.length ? (
        <div className="flex flex-wrap items-center gap-2 border-b p-3 text-[13px] text-slate-600">
          Todas as equipes já têm carro. Para outro carro, cadastre uma nova equipe.
          <Link href="/os/equipes" className="btn-sec">Equipes</Link>
        </div>
      ) : (
        <form action={criarEstoqueEquipeAcao} className="flex flex-wrap items-end gap-2 border-b p-3">
          <Campo rotulo="Equipe" obrigatorio><select name="equipeId" className="campo min-w-56" required defaultValue="">
            <option value="" disabled>Selecione</option>
            {semCarro.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select></Campo>
          <Campo rotulo="Nome do carro (opcional)"><input name="nome" className="campo min-w-64" placeholder="em branco: Carro - nome da equipe" /></Campo>
          <button className="btn"><Icone nome="mais" size={14} /> Criar carro</button>
          <Link href="/os/equipes" className="btn-sec">Equipes</Link>
        </form>
      )}
      <table className="tabela">
        <thead><tr><th>Equipe</th><th>Técnicos</th><th>Local</th><th className="text-right">Produtos com saldo</th><th className="text-right">Ações</th></tr></thead>
        <tbody>
          {doCarro.map((l) => (
            <tr key={l.id}>
              <td className="font-semibold">{l.deposito.nome}{editarNome(l.depositoId)}</td>
              <td className="text-[13px]">{(l.deposito.equipe?.membros ?? []).map((m) => nome.get(m)).filter(Boolean).join(", ") || "—"}</td>
              <td className="font-mono text-[12px]">{l.codigo}</td>
              <td className="text-right">{l._count.saldos}</td>
              <td className="text-right">
                <div className="flex justify-end gap-1 whitespace-nowrap">
                  <Link href={`/tecnico/estoque?equipe=${l.deposito.equipeId}`} className="btn-sec py-1"><Icone nome="ver" size={13} /> Ver</Link>
                  <Link href={`/estoque/transferencias/adicionar?destino=${l.depositoId}`} className="btn-sec py-1">Abastecer</Link>
                  <Link href={`/estoque/transferencias/adicionar?origem=${l.depositoId}`} className="btn-sec py-1">Devolver à loja</Link>
                </div>
              </td>
            </tr>
          ))}
          {!doCarro.length && <tr><td colSpan={5} className="py-6 text-center text-slate-500">Nenhuma equipe com estoque de carro.</td></tr>}
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
              <td>{l.deposito.nome}{editarNome(l.depositoId)}</td>
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
