import { Pagina } from "@/components/ui/Pagina";
import Link from "next/link";
import Resumo from "@/components/ui/Resumo";
import { prisma } from "@/lib/db";
import { analisarExtrato, type LinhaAnalise } from "@/lib/financeiro/conciliacao";
import { interConfigurado } from "@/lib/financeiro/inter";
import { garantirPadroes } from "@/lib/financeiro/padroes";
import { brl, data } from "@/lib/ui/format";
import { desfazer } from "./actions";
import { EnviarExtrato, PuxarInter } from "./Formularios";
import TabelaConciliacao from "./TabelaConciliacao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conciliação bancária" };

type Sp = { ver?: string; f?: string; conta?: string; ordem?: string };

const FILTROS: Record<string, (l: LinhaAnalise) => boolean> = {
  urgentes: (l) => l.urgencia === "urgente",
  atencao: (l) => l.urgencia !== "normal",
  baixar: (l) => l.acao === "BAIXAR",
  alta: (l) => l.acao !== "REVISAR" && l.nivel === "alta",
  lancar: (l) => l.acao === "LANCAR",
  revisar: (l) => l.acao === "REVISAR",
};

export default async function Conciliacao({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  await prisma.$transaction((tx) => garantirPadroes(tx));
  const [contas, analise, recentes, categorias, centros, inter, totalConc] = await Promise.all([
    prisma.contaBancaria.findMany({ where: { ativa: true }, orderBy: { nome: "asc" } }),
    analisarExtrato({ contaBancariaId: sp.conta || undefined }),
    prisma.transacaoBancaria.findMany({
      where: { situacao: { in: ["CONCILIADA", "IGNORADA"] }, ...(sp.conta ? { contaBancariaId: sp.conta } : {}) },
      include: { contaBancaria: true, lancamentos: { include: { pessoa: true, categoria: true, centroCusto: true } } },
      orderBy: [{ data: "desc" }, { createdAt: "desc" }], take: sp.ver === "todas" ? 500 : 30,
    }),
    prisma.categoriaFinanceira.findMany({ where: { ativa: true }, orderBy: [{ codigo: "asc" }, { nome: "asc" }], select: { id: true, nome: true, tipo: true, codigo: true } }),
    prisma.centroCusto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.integracaoInter.findUnique({ where: { id: "inter" }, select: { ultimoTesteOk: true, ultimoTesteMsg: true, ultimaSincEm: true, ultimaSincMsg: true } }),
    prisma.transacaoBancaria.count({ where: { situacao: { in: ["CONCILIADA", "IGNORADA"] }, ...(sp.conta ? { contaBancariaId: sp.conta } : {}) } }),
  ]);
  const configurado = await interConfigurado();

  const ordem = sp.ordem === "recentes" || sp.ordem === "urgencia" ? sp.ordem : "data";
  const filtro = sp.f && FILTROS[sp.f] ? sp.f : "";
  const linhas = analise
    .filter(filtro ? FILTROS[filtro] : () => true)
    .sort((a, b) =>
      ordem === "urgencia" ? b.pontosUrgencia - a.pontosUrgencia || a.data.localeCompare(b.data)
        : ordem === "recentes" ? b.data.localeCompare(a.data)
          : a.data.localeCompare(b.data));

  const n = analise.length;
  const pct = (x: number) => (n ? (x / n) * 100 : 0);
  const soma = (ls: LinhaAnalise[]) => ls.reduce((s, l) => s + Math.abs(l.valor), 0);
  const urg = analise.filter(FILTROS.urgentes), aten = analise.filter((l) => l.urgencia === "atencao");
  const baixar = analise.filter(FILTROS.baixar), lancar = analise.filter(FILTROS.lancar), revisar = analise.filter(FILTROS.revisar);
  const altas = analise.filter(FILTROS.alta);
  const link = (mudar: Partial<Sp>) => {
    const q = new URLSearchParams(Object.entries({ conta: sp.conta, ordem: sp.ordem, f: sp.f, ...mudar }).filter((x): x is [string, string] => !!x[1]));
    return `/financeiro/conciliacao${q.size ? `?${q}` : ""}`;
  };
  const alterna = (f: string) => link({ f: filtro === f ? undefined : f });
  const entradas = analise.filter((l) => l.valor > 0), saidas = analise.filter((l) => l.valor < 0);

  return (
    <Pagina titulo="Conciliação bancária" icone="conciliacao" trilha={[{ rotulo: "Financeiro", href: "/financeiro" }, { rotulo: "Conciliação bancária" }]}>
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <EnviarExtrato contas={contas.map((c) => ({ id: c.id, nome: c.nome }))} />
          <PuxarInter
            configurado={configurado}
            aviso={inter?.ultimoTesteOk === false ? inter.ultimoTesteMsg : null}
            ultima={inter?.ultimaSincEm ? `Última busca: ${inter.ultimaSincEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })} · ${inter.ultimaSincMsg ?? ""}` : null}
          />
        </div>

        <Resumo cartoes={[
          { rotulo: "A conciliar", valor: String(n), legenda: <>entradas {brl(soma(entradas))} · saídas {brl(soma(saidas))}<br />anel: parte do extrato já conciliada</>, icone: "conciliacao", cor: "tinta", pct: totalConc + n ? (totalConc / (totalConc + n)) * 100 : 0, href: link({ f: undefined }), ativo: !filtro },
          { rotulo: "Urgentes pelo prazo", valor: String(urg.length), legenda: aten.length ? `+ ${aten.length} pedem atenção` : "conta vencida ou linha antiga", icone: "urgente", cor: "vermelho", pct: pct(urg.length), href: alterna("urgentes"), ativo: filtro === "urgentes" },
          { rotulo: "Sugestão de baixa", valor: String(baixar.length), legenda: `${baixar.filter((l) => l.nivel === "alta").length} com confiança alta`, icone: "confirmado", cor: "verde", pct: pct(baixar.length), href: alterna("baixar"), ativo: filtro === "baixar" },
          { rotulo: "Lançar despesa/receita", valor: String(lancar.length), legenda: "categoria pelo histórico", icone: "etiqueta", cor: "azul", pct: pct(lancar.length), href: alterna("lancar"), ativo: filtro === "lancar" },
          { rotulo: "Sem sugestão", valor: String(revisar.length), legenda: "escolha você o que fazer", icone: "alerta", cor: "amarelo", pct: pct(revisar.length), href: alterna("revisar"), ativo: filtro === "revisar" },
        ]} />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-slate-600">Ordem:</span>
          {[["data", "Data do lançamento"], ["recentes", "Mais recentes"], ["urgencia", "Mais urgentes"]].map(([k, r]) => (
            <Link key={k} href={link({ ordem: k === "data" ? undefined : k })} className={ordem === k ? "btn" : "btn-sec"}>{r}</Link>
          ))}
          {contas.length > 1 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="ml-2 text-[13px] text-slate-600">Conta:</span>
              <Link href={link({ conta: undefined })} className={!sp.conta ? "btn" : "btn-sec"}>Todas</Link>
              {contas.filter((c) => c.nome !== "Caixa").map((c) => (
                <Link key={c.id} href={link({ conta: c.id })} className={sp.conta === c.id ? "btn" : "btn-sec"}>{c.nome}</Link>
              ))}
            </div>
          )}
          <Link href="/openfinance" className="btn-sec ml-auto">Outros bancos (Open Finance)</Link>
        </div>

        <TabelaConciliacao
          linhas={linhas}
          categorias={categorias.map((c) => ({ id: c.id, nome: c.codigo ? `${c.codigo} ${c.nome}` : c.nome, tipo: c.tipo }))}
          centros={centros}
          altas={filtro ? linhas.filter(FILTROS.alta).length : altas.length}
        />

        <details className="cartao p-3 text-[13px] text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-700">Como as sugestões são feitas</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><b>Baixar conta:</b> só sugere quando a linha do extrato é ligada ao cliente/fornecedor da conta por algo além do valor: nosso número/txid do boleto, CPF/CNPJ na descrição, nome que confere (duas palavras próprias em comum; sobrenomes comuns e palavras como &quot;organização&quot;, &quot;contábil&quot;, &quot;ltda&quot; não contam) ou o histórico de conciliações desse favorecido. Depois pesam o valor (igual, ou até 2% de diferença, que vira juros ou desconto) e a data perto do vencimento. Cada conta é sugerida para uma linha só.</li>
            <li><b>Quem paga por outro</b> (um escritório de contabilidade pagando boleto de um cliente, por exemplo) não vira sugestão: abra a linha e escolha a conta. Depois disso o sistema aprende que aquele favorecido paga por aquele cliente.</li>
            <li><b>Lançar despesa/receita:</b> usa a categoria mais usada para o mesmo favorecido nas conciliações anteriores; sem histórico, o ramo de atividade (CNAE) do CNPJ de quem recebeu (do cadastro, das notas de compra ou informado na linha) e, por último, a descrição (tarifa, IOF/juros, impostos, rendimentos).</li>
            <li><b>Centro de custo:</b> o da própria conta; se ela não tiver, o que esse favorecido costuma usar, depois o da pessoa e por último o mais usado na categoria.</li>
            <li><b>Urgência:</b> conta que já foi paga no banco mas aparece vencida ou vencendo no sistema (cobrança indevida ao cliente, risco de pagar de novo), linha pendente há 15, 30 ou 60 dias e linha de mês que já fechou.</li>
          </ul>
        </details>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-semibold">Já conciliadas</h2>
            {sp.ver !== "todas" && <Link href={link({ ver: "todas" })} className="text-sm underline">ver mais</Link>}
          </div>
          <div className="cartao overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Data</th><th>Extrato</th><th className="text-right">Valor</th><th>Baixou</th><th>Categoria</th><th>Centro de custo</th><th className="w-20"></th></tr></thead>
              <tbody>
                {recentes.map((t) => {
                  const cats = [...new Set(t.lancamentos.map((l) => l.categoria.nome))].join(", ");
                  const ccs = [...new Set(t.lancamentos.map((l) => l.centroCusto?.nome).filter(Boolean))].join(", ");
                  return (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap">{data(t.data)}</td>
                      <td>{t.descricao}<div className="text-xs text-slate-500">{t.contaBancaria.nome}</div></td>
                      <td className={`whitespace-nowrap text-right ${Number(t.valor) < 0 ? "text-red-600" : "text-emerald-700"}`}>{brl(t.valor)}</td>
                      <td className="text-slate-600">
                        {t.situacao === "IGNORADA" ? <span className="pilula border-slate-300 bg-slate-50 text-slate-600">Ignorada</span>
                          : t.lancamentos.map((l) => (
                            <div key={l.id}>
                              {l.idLegado === `extrato:${t.id}` ? <span className="etiqueta mr-1 border-sky-300 bg-sky-50 text-sky-700">avulso</span> : null}
                              <Link href={`/financeiro/lancamentos/${l.id}`} className="hover:underline">{l.descricao}</Link>{l.pessoa ? ` (${l.pessoa.nome})` : ""}
                            </div>
                          ))}
                      </td>
                      <td className="text-slate-600">{cats || "—"}</td>
                      <td className="text-slate-600">{ccs || "—"}</td>
                      <td>
                        <form action={desfazer}>
                          <input type="hidden" name="transacaoId" value={t.id} />
                          <button className="text-sm text-slate-600 underline">desfazer</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Pagina>
  );
}
