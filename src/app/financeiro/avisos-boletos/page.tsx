import Link from "next/link";
import { prisma } from "@/lib/db";
import { MOTIVO_AVISO } from "@/lib/financeiro/boletos";
import { candidatasDoAviso } from "@/lib/financeiro/avisosBoleto";
import { resolverAvisoBoletoAcao } from "@/lib/financeiro/acoes";
import { brl, data } from "@/lib/ui/format";
import { Bloco, Pagina, Pilula } from "@/components/ui/Pagina";
import FormAcao from "@/components/financeiro/FormAcao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Boletos pagos sem conta no sistema" };

const doc = (d: string | null) => !d ? "" : d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");

export default async function AvisosBoletos() {
  const [pendentes, resolvidos, categorias] = await Promise.all([
    prisma.avisoBoleto.findMany({ where: { resolvidoEm: null }, orderBy: { pagoEm: "asc" }, include: { lancamento: { select: { id: true, descricao: true, pagoEm: true, valorPago: true } } } }),
    prisma.avisoBoleto.findMany({ where: { resolvidoEm: { not: null } }, orderBy: { resolvidoEm: "desc" }, take: 30, include: { lancamento: { select: { id: true, descricao: true } } } }),
    prisma.categoriaFinanceira.findMany({ where: { tipo: "RECEBER", ativa: true, NOT: { nome: "Transferência entre contas" } }, orderBy: [{ codigo: "asc" }, { nome: "asc" }] }),
  ]);
  const candidatas = await Promise.all(pendentes.map((a) => candidatasDoAviso(a)));
  return (
    <Pagina titulo="Boletos pagos sem conta no sistema" icone="alerta" trilha={[{ rotulo: "Financeiro", href: "/financeiro" }, { rotulo: "Avisos de boletos" }]}>
      <p className="max-w-3xl text-[13px] text-slate-600">
        O dinheiro entrou no Inter, mas nenhuma conta a receber em aberto foi baixada: o boleto não foi gerado pelo MXERP, a conta foi
        excluída ou já estava paga por outro meio (possível pagamento em dobro). Para cada um, lance o recebimento, baixe a conta certa
        ou registre o que foi feito.
      </p>
      {!pendentes.length && <div className="cartao p-8 text-center text-slate-500">Nenhum boleto pago sem conta. Tudo certo.</div>}
      {pendentes.map((a, i) => (
        <Bloco key={a.id} icone="alerta"
          titulo={<><b>{brl(Number(a.valorRecebido ?? a.valor ?? 0))}</b> pago em {a.pagoEm ? data(a.pagoEm) : "—"}{a.pagadorNome ? <> por <b>{a.pagadorNome}</b></> : null}</>}
          subtitulo={`${MOTIVO_AVISO[a.motivo] ?? a.motivo} · ${a.pagadorDocumento ? `${doc(a.pagadorDocumento)} · ` : ""}nosso nº ${a.nossoNumero ?? "—"} · seu nº ${a.seuNumero ?? "—"}${a.origemRecebimento ? ` · via ${a.origemRecebimento}` : ""}`}>
          {a.motivo === "CONTA_JA_PAGA" && a.lancamento && (
            <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              A conta <Link className="underline" href={`/financeiro?periodo=todos&q=${encodeURIComponent(a.lancamento.descricao)}`}>{a.lancamento.descricao}</Link> já
              estava baixada em {a.lancamento.pagoEm ? data(a.lancamento.pagoEm) : "—"} ({brl(Number(a.lancamento.valorPago ?? 0))}). Confira com o cliente se pagou duas vezes.
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-3">
            <FormAcao acao={resolverAvisoBoletoAcao} className="space-y-2" botao="Lançar recebimento" classeBotao="btn w-full">
              <input type="hidden" name="id" value={a.id} /><input type="hidden" name="como" value="lancar" />
              <div className="text-[13px] font-semibold">Lançar como recebimento</div>
              <label className="block"><span className="rotulo obrig">Categoria</span>
                <select name="categoriaId" required className="campo">{categorias.map((c) => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} ` : ""}{c.nome}</option>)}</select></label>
              <label className="block"><span className="rotulo">Descrição</span><input name="descricao" className="campo" placeholder="Boleto pago pelo cliente" /></label>
            </FormAcao>
            <FormAcao acao={resolverAvisoBoletoAcao} className="space-y-2" botao="Baixar a conta escolhida" classeBotao="btn w-full">
              <input type="hidden" name="id" value={a.id} /><input type="hidden" name="como" value="baixar" />
              <div className="text-[13px] font-semibold">Baixar uma conta em aberto</div>
              <label className="block"><span className="rotulo obrig">Conta a receber</span>
                <select name="lancamentoId" required className="campo">
                  <option value="">Escolha…</option>
                  {candidatas[i].map((l) => <option key={l.id} value={l.id}>{data(l.vencimento)} · {brl(Number(l.valor))} · {l.pessoa?.nome ?? "sem cliente"} · {l.descricao}</option>)}
                </select></label>
              {!candidatas[i].length && <p className="text-[12px] text-slate-500">Nenhuma conta em aberto do mesmo pagador ou de valor parecido.</p>}
            </FormAcao>
            <FormAcao acao={resolverAvisoBoletoAcao} className="space-y-2" botao="Encerrar aviso" classeBotao="btn-sec w-full">
              <input type="hidden" name="id" value={a.id} /><input type="hidden" name="como" value="encerrar" />
              <div className="text-[13px] font-semibold">Só registrar o que foi feito</div>
              <label className="block"><span className="rotulo obrig">Explicação</span><input name="explicacao" required minLength={5} className="campo" placeholder="ex.: valor devolvido ao cliente por Pix" /></label>
            </FormAcao>
          </div>
        </Bloco>
      ))}
      {resolvidos.length > 0 && (
        <div className="cartao overflow-x-auto">
          <div className="border-b px-4 py-2 text-[13px] font-semibold">Resolvidos recentemente</div>
          <table className="tabela">
            <thead><tr><th>Pago em</th><th>Pagador</th><th className="text-right">Valor</th><th>Motivo</th><th>Resolução</th><th>Por</th></tr></thead>
            <tbody>
              {resolvidos.map((a) => (
                <tr key={a.id}>
                  <td>{a.pagoEm ? data(a.pagoEm) : "—"}</td><td>{a.pagadorNome ?? "—"}</td><td className="text-right">{brl(Number(a.valorRecebido ?? a.valor ?? 0))}</td>
                  <td><Pilula rotulo={MOTIVO_AVISO[a.motivo]?.split(" (")[0] ?? a.motivo} cor="border-slate-300 bg-slate-50 text-slate-600" /></td>
                  <td>{a.resolucao}</td><td>{a.resolvidoPor} · {a.resolvidoEm ? data(a.resolvidoEm) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Pagina>
  );
}
