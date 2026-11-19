import Link from "next/link";
import { prisma } from "@/lib/db";
import { garantirPadroes } from "@/lib/financeiro/padroes";
import { salvarContaBancariaAcao } from "@/lib/financeiro/acoes";
import { brl, data } from "@/lib/ui/format";
import { Bloco, Pagina } from "@/components/ui/Pagina";
import FormAcao from "@/components/financeiro/FormAcao";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contas bancárias" };

export default async function Contas({ searchParams }: { searchParams: Promise<{ novo?: string; editar?: string }> }) {
  const sp = await searchParams;
  await prisma.$transaction((tx) => garantirPadroes(tx));
  const lista = await prisma.$queryRaw<{ id: string; nome: string; banco: string | null; agencia: string | null; conta: string | null; ativa: boolean; saldoInicial: number; saldo: number; ultima: Date | null; pendentes: number }[]>`
    SELECT c.id, c.nome, c.banco, c.agencia, c.conta, c.ativa, c."saldoInicial"::float "saldoInicial",
           (c."saldoInicial" + COALESCE(SUM(CASE WHEN l.tipo = 'RECEBER' THEN l."valorPago" ELSE -l."valorPago" END) FILTER (WHERE l."pagoEm" IS NOT NULL), 0))::float saldo,
           MAX(l."pagoEm") ultima,
           (SELECT COUNT(*) FROM "TransacaoBancaria" t WHERE t."contaBancariaId" = c.id AND t.situacao = 'PENDENTE')::int pendentes
      FROM "ContaBancaria" c LEFT JOIN "Lancamento" l ON l."contaBancariaId" = c.id
     GROUP BY c.id ORDER BY c.ativa DESC, c.nome`;
  const editando = sp.editar ? lista.find((c) => c.id === sp.editar) : undefined;
  const ativas = lista.filter((c) => c.ativa);
  return (
    <Pagina titulo="Contas bancárias" icone="financeiro" trilha={[{ rotulo: "Financeiro", href: "/financeiro" }, { rotulo: "Contas bancárias" }]}>
      <div className="mb-3 grid gap-3 md:grid-cols-3">
        <div className="cartao p-4"><div className="text-xs text-slate-500">Saldo total das contas ({ativas.length} ativas)</div><div className="text-xl font-semibold">{brl(ativas.reduce((s, c) => s + c.saldo, 0))}</div></div>
        <div className="cartao p-4"><div className="text-xs text-slate-500">Conciliações pendentes</div><div className="text-xl font-semibold">{lista.reduce((s, c) => s + c.pendentes, 0)}</div><Link href="/financeiro/conciliacao" className="text-[12px] text-marca hover:underline">Abrir conciliação</Link></div>
        <div className="cartao p-4"><div className="text-xs text-slate-500">Transferir entre contas</div><Link href="/financeiro/transferencias" className="btn-sec mt-1">Nova transferência</Link></div>
      </div>
      {sp.novo || editando ? (
        <FormAcao acao={salvarContaBancariaAcao} limpar={false}>
          {editando && <input type="hidden" name="id" value={editando.id} />}
          <Bloco icone="editar" titulo={<>Preencha os <b>dados</b> da conta</>} subtitulo="O saldo inicial é o saldo da conta no dia em que você começou a usar o sistema.">
            <div className="grid gap-3 md:grid-cols-6">
              <label className="md:col-span-2"><span className="rotulo obrig">Nome da conta</span><input name="nome" required autoFocus defaultValue={editando?.nome} className="campo" placeholder="ex.: Inter PJ" /></label>
              <label><span className="rotulo">Banco</span><input name="banco" defaultValue={editando?.banco ?? ""} className="campo" /></label>
              <label><span className="rotulo">Agência</span><input name="agencia" defaultValue={editando?.agencia ?? ""} className="campo" /></label>
              <label><span className="rotulo">Conta</span><input name="conta" defaultValue={editando?.conta ?? ""} className="campo" /></label>
              <label><span className="rotulo">Saldo inicial</span><input name="saldoInicial" inputMode="decimal" defaultValue={editando ? String(editando.saldoInicial).replace(".", ",") : ""} className="campo" /></label>
              <label><span className="rotulo">Situação</span><select name="ativa" defaultValue={editando?.ativa === false ? "0" : "1"} className="campo"><option value="1">Ativa</option><option value="0">Inativa</option></select></label>
            </div>
          </Bloco>
          <div className="mb-3 flex gap-2"><Link href="/financeiro/contas" className="btn-sec">Cancelar</Link><button className="btn ml-auto px-5">{editando ? "Salvar" : "Cadastrar"}</button></div>
        </FormAcao>
      ) : (
        <div className="mb-3 flex gap-2"><Link href="/financeiro/contas?novo=1" className="btn"><Icone nome="mais" size={15} /> Adicionar</Link></div>
      )}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Conta</th><th>Banco</th><th>Agência / conta</th><th className="text-right">Saldo</th><th>Última movimentação</th><th className="w-20 text-right">Ações</th></tr></thead>
          <tbody>{lista.map((c) => (
            <tr key={c.id} className={c.ativa ? "" : "opacity-50"}>
              <td className="font-medium">{c.nome}{!c.ativa && <span className="ml-2 text-[11px] text-slate-500">(inativa)</span>}</td>
              <td>{c.banco}</td><td>{[c.agencia, c.conta].filter(Boolean).join(" / ")}</td>
              <td className={`text-right ${c.saldo < 0 ? "text-red-600" : ""}`}>{brl(c.saldo)}</td>
              <td>{c.ultima ? data(c.ultima) : "—"}</td>
              <td className="text-right"><span className="inline-flex gap-1">
                <Link href={`/financeiro/fluxo?conta=${c.id}`} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Extrato no fluxo de caixa"><Icone nome="ver" size={15} /></Link>
                <Link href={`/financeiro/contas?editar=${c.id}`} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Editar"><Icone nome="editar" size={15} /></Link>
              </span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Pagina>
  );
}
