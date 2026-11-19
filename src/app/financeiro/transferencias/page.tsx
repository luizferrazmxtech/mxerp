import { prisma } from "@/lib/db";
import { diaSP } from "@/lib/datas";
import { listarTransferencias } from "@/lib/financeiro/transferencias";
import { excluirTransferenciaAcao, transferirAcao } from "@/lib/financeiro/acoes";
import { brl, data } from "@/lib/ui/format";
import { Bloco, Pagina } from "@/components/ui/Pagina";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import FormAcao from "@/components/financeiro/FormAcao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transferências entre contas" };

export default async function Transferencias() {
  const [contas, lista] = await Promise.all([
    prisma.contaBancaria.findMany({ where: { ativa: true }, orderBy: { nome: "asc" } }),
    prisma.$transaction((tx) => listarTransferencias(tx)),
  ]);
  const hoje = diaSP().toISOString().slice(0, 10);
  return (
    <Pagina titulo="Transferências entre contas" icone="conciliacao" trilha={[{ rotulo: "Financeiro", href: "/financeiro" }, { rotulo: "Transferências" }]}>
      <Bloco icone="conciliacao" titulo={<>Informe a <b>transferência</b></>} subtitulo="O valor sai da conta de origem e entra na de destino em um passo, já baixado. Não aparece na DRE nem como entrada/saída no fluxo de todas as contas.">
        <FormAcao acao={transferirAcao} className="grid gap-3 md:grid-cols-6" botao="Transferir" classeBotao="btn self-end">
          <label className="md:col-span-1"><span className="rotulo obrig">De onde sai</span>
            <select name="origemId" required className="campo">{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
          <label className="md:col-span-1"><span className="rotulo obrig">Para onde vai</span>
            <select name="destinoId" required defaultValue={contas[1]?.id} className="campo">{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
          <label><span className="rotulo obrig">Data</span><input type="date" name="data" required defaultValue={hoje} className="campo" /></label>
          <label><span className="rotulo obrig">Valor (R$)</span><input name="valor" required inputMode="decimal" className="campo" placeholder="0,00" /></label>
          <label className="md:col-span-2"><span className="rotulo">Descrição</span><input name="descricao" className="campo" placeholder="ex.: Depósito do caixa no Inter" /></label>
          <label className="md:col-span-5"><span className="rotulo">Observação</span><input name="observacao" className="campo" /></label>
        </FormAcao>
      </Bloco>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th className="w-28">Data</th><th>Descrição</th><th>Origem</th><th>Destino</th><th className="text-right">Valor</th><th className="w-16 text-right">Ações</th></tr></thead>
          <tbody>
            {lista.map((t) => (
              <tr key={t.id}>
                <td>{data(t.data)}</td><td>{t.descricao}{t.observacao && <div className="text-[11px] text-slate-500">{t.observacao}</div>}</td>
                <td className="text-red-700">{t.origem}</td><td className="text-emerald-700">{t.destino}</td><td className="text-right">{brl(t.valor)}</td>
                <td className="text-right"><BotaoExcluir acao={excluirTransferenciaAcao.bind(null, t.id)} pergunta="Excluir esta transferência (as duas pernas)?" /></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={6} className="py-8 text-center text-slate-500">Nenhuma transferência ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </Pagina>
  );
}
