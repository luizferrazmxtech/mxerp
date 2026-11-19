import Link from "next/link";
import { prisma } from "@/lib/db";
import { garantirPadroes } from "@/lib/financeiro/padroes";
import { planoDeContas } from "@/lib/financeiro/plano";
import { ROTULO_GRUPO_DRE } from "@/lib/financeiro/tipos";
import { excluirCategoriaAcao, salvarCategoriaAcao } from "@/lib/financeiro/acoes";
import { Bloco, Pagina, Pilula } from "@/components/ui/Pagina";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import FormAcao from "@/components/financeiro/FormAcao";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plano de contas" };

export default async function PlanoContas({ searchParams }: { searchParams: Promise<{ novo?: string; editar?: string; tipo?: string }> }) {
  const sp = await searchParams;
  await prisma.$transaction((tx) => garantirPadroes(tx));
  const lista = await prisma.$transaction((tx) => planoDeContas(tx));
  const editando = sp.editar ? lista.find((c) => c.id === sp.editar) : undefined;
  const aberto = !!sp.novo || !!editando;
  const tipoForm = editando?.tipo ?? (sp.tipo === "RECEBER" ? "RECEBER" : "PAGAR");
  const maes = lista.filter((c) => c.tipo === tipoForm && c.id !== editando?.id);
  return (
    <Pagina titulo="Plano de contas" icone="lista" trilha={[{ rotulo: "Financeiro", href: "/financeiro" }, { rotulo: "Plano de contas" }]}>
      {aberto ? (
        <FormAcao acao={salvarCategoriaAcao} limpar={false}>
          {editando && <input type="hidden" name="id" value={editando.id} />}
          <Bloco icone="editar" titulo={<>Informe os <b>dados</b> do plano de contas</>} subtitulo="A classificação ordena a lista (1, 1.1, 1.1.2…). O grupo do DRE define em que linha da DRE o valor aparece.">
            <div className="grid gap-3 md:grid-cols-4">
              <label><span className="rotulo">Classificação</span><input name="codigo" defaultValue={editando?.codigo ?? ""} placeholder="ex.: 2.06" className="campo" /></label>
              <label className="md:col-span-2"><span className="rotulo obrig">Nome</span><input name="nome" required autoFocus defaultValue={editando?.nome} className="campo" /></label>
              <label><span className="rotulo obrig">Movimentação</span>
                {editando ? <><input type="hidden" name="tipo" value={tipoForm} /><input disabled value={tipoForm === "PAGAR" ? "Pagamentos" : "Recebimentos"} className="campo" /></> : (
                  <select name="tipo" defaultValue={tipoForm} className="campo"><option value="PAGAR">Pagamentos</option><option value="RECEBER">Recebimentos</option></select>
                )}
              </label>
              <label className="md:col-span-2"><span className="rotulo obrig">Grupo do DRE</span>
                <select name="grupoDre" defaultValue={editando?.grupoDre ?? (tipoForm === "PAGAR" ? "DESPESA_OPERACIONAL" : "RECEITA_BRUTA")} className="campo">
                  {Object.entries(ROTULO_GRUPO_DRE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></label>
              <label><span className="rotulo">Conta mãe</span>
                <select name="paiId" defaultValue={editando?.paiId ?? ""} className="campo">
                  <option value="">Nenhuma (nível principal)</option>
                  {maes.map((m) => <option key={m.id} value={m.id}>{"  ".repeat(m.nivel)}{m.codigo ? `${m.codigo} ` : ""}{m.nome}</option>)}
                </select>
                {!editando && <span className="text-[11px] text-slate-500">A lista mostra as de {tipoForm === "PAGAR" ? "pagamentos" : "recebimentos"}. <Link className="text-marca hover:underline" href={`/financeiro/plano-contas?novo=1&tipo=${tipoForm === "PAGAR" ? "RECEBER" : "PAGAR"}`}>Trocar</Link></span>}
              </label>
              <label><span className="rotulo">Situação</span>
                <select name="ativa" defaultValue={editando?.ativa === false ? "0" : "1"} className="campo"><option value="1">Ativo</option><option value="0">Inativo</option></select></label>
            </div>
          </Bloco>
          <div className="mb-3 flex gap-2"><Link href="/financeiro/plano-contas" className="btn-sec">Cancelar</Link><button className="btn ml-auto px-5">{editando ? "Salvar" : "Cadastrar"}</button></div>
        </FormAcao>
      ) : (
        <div className="mb-3 flex gap-2"><Link href="/financeiro/plano-contas?novo=1" className="btn"><Icone nome="mais" size={15} /> Adicionar</Link></div>
      )}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th className="w-28">Classificação</th><th>Nome</th><th className="w-36">Movimentação</th><th>Grupo do DRE</th><th className="w-24">Lançamentos</th><th className="w-24 text-right">Ações</th></tr></thead>
          <tbody>{lista.map((c) => (
            <tr key={c.id} className={c.ativa ? "" : "opacity-50"}>
              <td className="font-mono text-[12px]">{c.codigo}</td>
              <td style={{ paddingLeft: 12 + c.nivel * 20 }} className={c.nivel === 0 ? "font-medium" : ""}>{c.nome}{!c.ativa && <span className="ml-2 text-[11px] text-slate-500">(inativo)</span>}</td>
              <td><Pilula rotulo={c.tipo === "PAGAR" ? "Pagamentos" : "Recebimentos"} cor={c.tipo === "PAGAR" ? "border-red-300 bg-red-50 text-red-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"} /></td>
              <td className="text-[12px] text-slate-600">{ROTULO_GRUPO_DRE[c.grupoDre]}</td>
              <td>{c.usos}</td>
              <td className="text-right"><span className="inline-flex gap-1">
                <Link href={`/financeiro/plano-contas?editar=${c.id}`} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Editar"><Icone nome="editar" size={15} /></Link>
                {c.usos === 0 && <BotaoExcluir acao={excluirCategoriaAcao.bind(null, c.id)} pergunta={`Excluir o plano ${c.nome}?`} />}
              </span></td>
            </tr>
          ))}</tbody>
        </table>
        <div className="border-t px-3 py-2.5 text-[12px] text-slate-600">Registros <span className="mx-1 text-slate-300">|</span> <b>{lista.length}</b> no total</div>
      </div>
    </Pagina>
  );
}
