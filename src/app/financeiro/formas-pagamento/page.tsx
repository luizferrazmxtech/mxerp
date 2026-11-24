import Link from "next/link";
import { prisma } from "@/lib/db";
import { exigirArea } from "@/lib/auth/atual";
import { garantirPadroes } from "@/lib/financeiro/padroes";
import { planoDeContas } from "@/lib/financeiro/plano";
import { salvarFormaPagamentoAcao } from "@/lib/financeiro/acoes";
import { MAX_VEZES, calcularTaxa, lerTabela, pct, taxaCredito, tipoCartao } from "@/lib/financeiro/taxasCartao";
import { Bloco, Pagina } from "@/components/ui/Pagina";
import FormAcao from "@/components/financeiro/FormAcao";
import EditorTaxas from "@/components/financeiro/EditorTaxas";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Formas de pagamento" };

const TIPO: Record<string, string> = { "01": "Dinheiro", "02": "Cheque", "03": "Cartão de crédito", "04": "Cartão de débito", "05": "Crediário", "10": "Vale alimentação", "11": "Vale refeição", "15": "Boleto", "16": "Depósito", "17": "PIX", "99": "Outros" };

/** Resumo da taxa na lista: "1,55%" (débito) ou "3,05% a 13,97%" (crédito 1x a 12x). */
function resumoTaxa(f: { tPag: string; taxa: number; taxas: unknown }) {
  const tipo = tipoCartao(f.tPag);
  const tab = lerTabela(f.taxas);
  if (!tipo || !tab.grupos.length) return f.taxa > 0 ? pct(f.taxa) : "—";
  const vals = tab.grupos.flatMap((g) => (tipo === "DEBITO" ? [g.debito] : Array.from({ length: MAX_VEZES }, (_, k) => taxaCredito(g, k + 1)))).filter((x): x is number => x !== null);
  if (!vals.length) return "—";
  const min = Math.min(...vals), max = Math.max(...vals);
  return min === max ? pct(min) : `${pct(min)} a ${pct(max)}`;
}

export default async function FormasPagamento({ searchParams }: { searchParams: Promise<{ novo?: string; editar?: string }> }) {
  await exigirArea("/financeiro/formas-pagamento");
  const sp = await searchParams;
  await prisma.$transaction((tx) => garantirPadroes(tx));
  const [formas, contas, categorias] = await Promise.all([
    prisma.formaPagamento.findMany({ orderBy: [{ ativa: "desc" }, { nome: "asc" }], include: { _count: { select: { lancamentos: true } } } }),
    prisma.contaBancaria.findMany({ where: { ativa: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.$transaction((tx) => planoDeContas(tx, { tipo: "PAGAR", ativas: true })),
  ]);
  const contaNome = new Map(contas.map((c) => [c.id, c.nome]));
  const catNome = new Map(categorias.map((c) => [c.id, `${c.codigo ? `${c.codigo} ` : ""}${c.nome}`]));
  const editando = sp.editar ? formas.find((f) => f.id === sp.editar) : undefined;
  const ex = editando ? calcularTaxa({ tPag: editando.tPag, taxa: Number(editando.taxa), taxas: editando.taxas }, 100, null, 1) : null;

  return (
    <Pagina titulo="Formas de pagamento" icone="dinheiro" trilha={[{ rotulo: "Financeiro", href: "/financeiro" }, { rotulo: "Formas de pagamento" }]}>
      {sp.novo || editando ? (
        <FormAcao acao={salvarFormaPagamentoAcao} limpar={false}>
          {editando && <input type="hidden" name="id" value={editando.id} />}
          <Bloco icone="editar" titulo={<>Preencha os <b>dados</b> da forma de pagamento</>}
            subtitulo="No cartão, a venda pede a bandeira e as vezes; o sistema calcula a taxa, a conta a receber cai na conta de destino e a taxa vira uma despesa paga na mesma conta, no plano de contas da taxa.">
            <div className="mb-3 grid gap-3 md:grid-cols-6">
              <label className="md:col-span-2"><span className="rotulo obrig">Nome</span><input name="nome" required autoFocus defaultValue={editando?.nome} className="campo" placeholder="ex.: Cartão de crédito" /></label>
              <label className="md:col-span-2"><span className="rotulo">Conta de destino</span>
                <select name="contaBancariaId" defaultValue={editando?.contaBancariaId ?? ""} className="campo"><option value="">Caixa (padrão)</option>{contas.filter((c) => c.nome !== "Caixa").map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                <span className="text-[11px] text-slate-500">Onde o dinheiro cai (ex.: PagSeguro).</span></label>
              <label className="md:col-span-2"><span className="rotulo">Plano de contas da taxa</span>
                <select name="categoriaTaxaId" defaultValue={editando?.categoriaTaxaId ?? ""} className="campo"><option value="">Automático: &quot;conta de destino taxas&quot;</option>{categorias.map((c) => <option key={c.id} value={c.id}>{" ".repeat(c.nivel * 2)}{c.codigo ? `${c.codigo} ` : ""}{c.nome}</option>)}</select>
                <span className="text-[11px] text-slate-500">Automático cria &quot;PagSeguro taxas&quot; para a conta PagSeguro.</span></label>
            </div>
            <EditorTaxas inicial={{ tPag: editando?.tPag ?? "03", taxa: Number(editando?.taxa ?? 0), diasPrazo: editando?.diasPrazo ?? 0, taxas: editando?.taxas ?? {} }} />
            <div className="mt-3 grid gap-3 md:grid-cols-6">
              <label><span className="rotulo">Situação</span><select name="ativa" defaultValue={editando?.ativa === false ? "0" : "1"} className="campo"><option value="1">Ativa</option><option value="0">Inativa</option></select></label>
              <label className="md:col-span-2"><span className="rotulo">Boleto pelo Banco Inter</span><select name="boletoInter" defaultValue={editando?.boletoInter ? "1" : "0"} className="campo"><option value="0">Não</option><option value="1">Sim, as parcelas viram boleto registrado</option></select></label>
            </div>
          </Bloco>
          {ex && ex.taxa > 0 && <p className="mb-2 text-[12px] text-slate-500">Hoje: R$ 100,00 à vista paga {pct(ex.percentual)} de taxa.</p>}
          <div className="mb-3 flex gap-2"><Link href="/financeiro/formas-pagamento" className="btn-sec">Cancelar</Link><button className="btn ml-auto px-5">{editando ? "Salvar" : "Cadastrar"}</button></div>
        </FormAcao>
      ) : (
        <div className="mb-3 flex gap-2"><Link href="/financeiro/formas-pagamento?novo=1" className="btn"><Icone nome="mais" size={15} /> Adicionar</Link></div>
      )}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Forma</th><th>Tipo</th><th>Conta de destino</th><th>Taxa</th><th>Plano de contas da taxa</th><th className="text-right">Contas</th><th className="w-16 text-right">Ações</th></tr></thead>
          <tbody>{formas.map((f) => (
            <tr key={f.id} className={f.ativa ? "" : "opacity-50"}>
              <td className="font-medium"><Link href={`/financeiro/formas-pagamento?editar=${f.id}`} className="hover:underline">{f.nome}</Link>{!f.ativa && <span className="ml-2 text-[11px] text-slate-500">(inativa)</span>}</td>
              <td>{TIPO[f.tPag] ?? f.tPag}</td>
              <td>{f.contaBancariaId ? contaNome.get(f.contaBancariaId) ?? "—" : "Caixa"}</td>
              <td>{resumoTaxa({ tPag: f.tPag, taxa: Number(f.taxa), taxas: f.taxas })}</td>
              <td className="text-[12px]">{f.categoriaTaxaId ? catNome.get(f.categoriaTaxaId) ?? "—" : <span className="text-slate-400">automático</span>}</td>
              <td className="text-right">{f._count.lancamentos}</td>
              <td className="text-right"><Link href={`/financeiro/formas-pagamento?editar=${f.id}`} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Editar"><Icone nome="editar" size={15} /></Link></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Pagina>
  );
}
