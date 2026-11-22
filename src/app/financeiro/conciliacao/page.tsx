import { Pagina } from "@/components/ui/Pagina";
import Link from "next/link";
import Resumo from "@/components/ui/Resumo";
import { prisma } from "@/lib/db";
import { analisarExtrato, buscarRamos, type LinhaAnalise } from "@/lib/financeiro/conciliacao";
import { idInterAtual, interConfigurado } from "@/lib/financeiro/inter";
import { garantirCategoriasPessoal, garantirPadroes } from "@/lib/financeiro/padroes";
import { brl, data } from "@/lib/ui/format";
import { normalizar } from "@/lib/migracao/planilha";
import { desfazer } from "./actions";
import { EnviarExtrato, PuxarInter } from "./Formularios";
import TabelaConciliacao from "./TabelaConciliacao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conciliação bancária" };

type Sp = { ver?: string; f?: string; conta?: string; ordem?: string; aba?: string; q?: string };
type Aba = "revisar" | "sugestoes" | "conciliados" | "geral";

const ABAS: { chave: Aba; rotulo: string }[] = [
  { chave: "revisar", rotulo: "A revisar" },
  { chave: "sugestoes", rotulo: "Sugestões" },
  { chave: "conciliados", rotulo: "Conciliados" },
  { chave: "geral", rotulo: "Geral" },
];

const FILTROS: Record<string, (l: LinhaAnalise) => boolean> = {
  urgentes: (l) => l.urgencia === "urgente",
  baixar: (l) => l.acao === "BAIXAR",
  lancar: (l) => l.acao === "LANCAR",
};
const ehSugestao = (l: LinhaAnalise) => l.acao !== "REVISAR";

/** Busca das abas: nome/descrição (sem acento), CPF/CNPJ ou valor ("1400", "1.400,00", "-1400"). */
function buscador(q: string | undefined) {
  const bruto = (q ?? "").trim();
  if (!bruto) return null;
  const texto = normalizar(bruto);
  const num = /^-?[\d.,\s]+$/.test(bruto) ? Math.abs(Number(bruto.replace(/[\s.]/g, "").replace(",", "."))) : NaN;
  const doc = bruto.replace(/\D/g, "");
  return (campos: (string | null | undefined)[], valores: number[], docs: (string | null | undefined)[] = []) =>
    (Number.isFinite(num) && num > 0 && valores.some((v) => Math.abs(Math.abs(v) - num) < 0.01))
    || (doc.length >= 5 && docs.some((d) => d?.includes(doc)))
    || normalizar(campos.filter(Boolean).join(" ")).includes(texto);
}
const ehAlta = (l: LinhaAnalise) => ehSugestao(l) && l.nivel === "alta";
const horaSP = (d: Date | null) => (d ? d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : null);
const ordemDe = (d: Date, dh: Date | null, criada: Date) => `${d.toISOString().slice(0, 10)}|${horaSP(dh) ?? "00:00"}|${criada.toISOString()}`;

export default async function Conciliacao({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const aba: Aba = (ABAS.find((a) => a.chave === sp.aba)?.chave) ?? "revisar";
  // categorias de pessoal antes das consultas: a tela precisa delas na lista de categorias
  await prisma.$transaction(async (tx) => { await garantirPadroes(tx); await garantirCategoriasPessoal(tx); });
  // ramo de atividade dos favorecidos com CNPJ conhecido: consulta em segundo plano, sem segurar a tela
  void buscarRamos({ limite: 10 }).catch(() => null);
  const verTodas = sp.ver === "todas" || aba === "geral";
  const [contas, analise, recentes, categorias, centros, inter, totalConc] = await Promise.all([
    prisma.contaBancaria.findMany({ where: { ativa: true }, orderBy: { nome: "asc" } }),
    analisarExtrato({ contaBancariaId: sp.conta || undefined }),
    aba === "conciliados" || aba === "geral" || sp.q
      ? prisma.transacaoBancaria.findMany({
        where: { situacao: { in: ["CONCILIADA", "IGNORADA"] }, ...(sp.conta ? { contaBancariaId: sp.conta } : {}) },
        include: { contaBancaria: true, lancamentos: { include: { pessoa: true, categoria: true, centroCusto: true } } },
        orderBy: [{ data: "desc" }, { dataHora: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], take: verTodas || sp.q ? 1000 : 50,
      })
      : Promise.resolve([]),
    prisma.categoriaFinanceira.findMany({ where: { ativa: true }, orderBy: [{ codigo: "asc" }, { nome: "asc" }], select: { id: true, nome: true, tipo: true, codigo: true } }),
    prisma.centroCusto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    idInterAtual().then((id) => (id ? prisma.integracaoInter.findUnique({ where: { id }, select: { ultimoTesteOk: true, ultimoTesteMsg: true, ultimaSincEm: true, ultimaSincMsg: true } }) : null)),
    prisma.transacaoBancaria.count({ where: { situacao: { in: ["CONCILIADA", "IGNORADA"] }, ...(sp.conta ? { contaBancariaId: sp.conta } : {}) } }),
  ]);
  const configurado = await interConfigurado();

  // padrão: do mais novo para o mais antigo (data e hora do banco)
  const ordem = sp.ordem === "antigos" || sp.ordem === "urgencia" ? sp.ordem : "recentes";
  const filtro = sp.f && FILTROS[sp.f] ? sp.f : "";
  const ordenar = (ls: LinhaAnalise[]) => [...ls].sort((a, b) =>
    ordem === "urgencia" ? b.pontosUrgencia - a.pontosUrgencia || b.ordem.localeCompare(a.ordem)
      : ordem === "antigos" ? a.ordem.localeCompare(b.ordem)
        : b.ordem.localeCompare(a.ordem));
  const bate = buscador(sp.q);
  const achadas = bate ? analise.filter((l) => bate([l.descricao, l.favorecido, l.funcionario, ...l.candidatos.slice(0, 1).flatMap((c) => [c.descricao, c.pessoa])], [l.valor], [l.documentoFavorecido])) : analise;
  const revisar = achadas.filter((l) => !ehSugestao(l));
  const sugestoes = achadas.filter(ehSugestao);
  const conciliadosBusca = bate ? recentes.filter((t) => bate([t.descricao, ...t.lancamentos.flatMap((l) => [l.descricao, l.pessoa?.nome, l.pessoa?.fantasia])], [Number(t.valor)], [t.contraparteDocumento, ...t.lancamentos.map((l) => l.pessoa?.documento)])) : recentes;
  const daAba = aba === "revisar" ? revisar : aba === "sugestoes" ? sugestoes : [];
  const linhas = ordenar(daAba.filter(filtro ? FILTROS[filtro] : () => true));

  const n = analise.length;
  const pct = (x: number) => (n ? (x / n) * 100 : 0);
  const soma = (ls: LinhaAnalise[]) => ls.reduce((s, l) => s + Math.abs(l.valor), 0);
  const urg = analise.filter(FILTROS.urgentes);
  const contagem: Record<Aba, number> = bate
    ? { revisar: revisar.length, sugestoes: sugestoes.length, conciliados: conciliadosBusca.length, geral: achadas.length + conciliadosBusca.length }
    : { revisar: revisar.length, sugestoes: sugestoes.length, conciliados: totalConc, geral: n + totalConc };
  const link = (mudar: Partial<Sp>) => {
    const q = new URLSearchParams(Object.entries({ aba: sp.aba, conta: sp.conta, ordem: sp.ordem, f: sp.f, q: sp.q, ...mudar }).filter((x): x is [string, string] => !!x[1]));
    return `/financeiro/conciliacao${q.size ? `?${q}` : ""}`;
  };

  // aba Geral: pendentes e conciliados juntos, do mais novo para o mais antigo
  type LinhaGeral = { id: string; ordem: string; data: string; hora: string | null; conta: string; descricao: string; valor: number; situacao: React.ReactNode; detalhe: React.ReactNode; acao: React.ReactNode };
  const geral: LinhaGeral[] = aba !== "geral" ? [] : [
    ...achadas.map((l): LinhaGeral => ({
      id: l.transacaoId, ordem: l.ordem, data: l.data, hora: l.hora, conta: l.conta, descricao: l.descricao, valor: l.valor,
      situacao: ehSugestao(l) ? <span className="pilula border-emerald-300 bg-emerald-50 text-emerald-700">Sugestão {l.confianca}%</span> : <span className="pilula border-amber-300 bg-amber-50 text-amber-800">A revisar</span>,
      detalhe: l.acao === "BAIXAR" ? `Baixar: ${l.candidatos[0]?.descricao ?? ""}${l.candidatos[0]?.pessoa ? ` (${l.candidatos[0].pessoa})` : ""}`
        : l.acao === "LANCAR" ? `Lançar em ${categorias.find((c) => c.id === l.categoriaId)?.nome ?? "categoria"}` : "—",
      acao: <Link href={link({ aba: ehSugestao(l) ? "sugestoes" : "revisar", f: undefined })} className="text-sm underline">abrir</Link>,
    })),
    ...conciliadosBusca.map((t): LinhaGeral => ({
      id: t.id, ordem: ordemDe(t.data, t.dataHora, t.createdAt), data: t.data.toISOString().slice(0, 10), hora: horaSP(t.dataHora), conta: t.contaBancaria.nome, descricao: t.descricao, valor: Number(t.valor),
      situacao: t.situacao === "IGNORADA" ? (t.motivo === "BOLETO_INTER" ? <span className="pilula border-sky-300 bg-sky-50 text-sky-700">Boleto (cobrança Inter)</span> : <span className="pilula border-slate-300 bg-slate-50 text-slate-600">Ignorada</span>) : <span className="pilula border-sky-300 bg-sky-50 text-sky-700">Conciliada</span>,
      detalhe: t.lancamentos.map((l) => `${l.descricao}${l.pessoa ? ` (${l.pessoa.nome})` : ""}`).join("; ") || "—",
      acao: <form action={desfazer}><input type="hidden" name="transacaoId" value={t.id} /><button className="text-sm text-slate-600 underline">desfazer</button></form>,
    })),
  ].sort((a, b) => b.ordem.localeCompare(a.ordem));
  const dataBr = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

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
          { rotulo: "A revisar", valor: String(revisar.length), legenda: `${brl(soma(revisar))} · escolha você o que fazer`, icone: "alerta", cor: "amarelo", pct: pct(revisar.length), href: link({ aba: "revisar", f: undefined }), ativo: aba === "revisar" && !filtro },
          { rotulo: "Sugestões", valor: String(sugestoes.length), legenda: `${sugestoes.filter((l) => l.nivel === "alta").length} com confiança alta`, icone: "confirmado", cor: "verde", pct: pct(sugestoes.length), href: link({ aba: "sugestoes", f: undefined }), ativo: aba === "sugestoes" && !filtro },
          { rotulo: "Urgentes pelo prazo", valor: String(urg.length), legenda: "conta vencida ou linha antiga", icone: "urgente", cor: "vermelho", pct: pct(urg.length), href: link({ aba: aba === "revisar" || aba === "sugestoes" ? aba : "sugestoes", f: filtro === "urgentes" ? undefined : "urgentes" }), ativo: filtro === "urgentes" },
          { rotulo: "Conciliados", valor: String(totalConc), legenda: "anel: parte do extrato já conciliada", icone: "conciliacao", cor: "tinta", pct: totalConc + n ? (totalConc / (totalConc + n)) * 100 : 0, href: link({ aba: "conciliados", f: undefined }), ativo: aba === "conciliados" },
        ]} />

        {/* abas */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#dee2e6] pb-2">
          {ABAS.map((a) => (
            <Link key={a.chave} href={link({ aba: a.chave, f: undefined, ver: undefined })} className={`aba ${aba === a.chave ? "aba-ativa" : ""}`}>
              {a.rotulo}
              <span className={`rounded px-1.5 text-[11px] ${aba === a.chave ? "bg-white/20" : "bg-slate-200 text-slate-700"}`}>{contagem[a.chave]}</span>
            </Link>
          ))}
          <div className="ml-auto flex flex-wrap gap-2">
            <Link href="/financeiro/conciliacao/saldos" className="btn-sec">Conferência de saldo</Link>
            <Link href="/financeiro/conciliacao/regras" className="btn-sec">Regras e aviso diário</Link>
            <Link href="/financeiro/mao-de-obra" className="btn-sec">Mão de obra</Link>
            <Link href="/openfinance" className="btn-sec">Outros bancos (Open Finance)</Link>
          </div>
        </div>

        <form className="flex flex-wrap items-center gap-2" action="/financeiro/conciliacao">
          {Object.entries({ aba: sp.aba, conta: sp.conta, ordem: sp.ordem }).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input name="q" defaultValue={sp.q ?? ""} className="campo w-[440px] max-w-full" placeholder="Buscar em todas as abas: nome, descrição, CPF/CNPJ ou valor" />
          <button className="btn-sec">Buscar</button>
          {sp.q && <Link href={link({ q: undefined })} className="text-[13px] underline">limpar busca</Link>}
          {sp.q && <span className="text-[13px] text-slate-600">{contagem.geral} lançamento{contagem.geral === 1 ? "" : "s"} com &quot;{sp.q}&quot; · os números das abas já mostram só o que bate</span>}
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-slate-600">Ordem:</span>
          {[["recentes", "Mais novos primeiro"], ["antigos", "Mais antigos primeiro"], ...(aba === "revisar" || aba === "sugestoes" ? [["urgencia", "Mais urgentes"]] : [])].map(([k, r]) => (
            <Link key={k} href={link({ ordem: k === "recentes" ? undefined : k })} className={ordem === k ? "btn" : "btn-sec"}>{r}</Link>
          ))}
          {aba === "sugestoes" && (
            <>
              <span className="ml-2 text-[13px] text-slate-600">Mostrar:</span>
              {[["", "Todas"], ["baixar", "Baixar conta"], ["lancar", "Lançar despesa/receita"]].map(([k, r]) => (
                <Link key={k} href={link({ f: k || undefined })} className={filtro === k ? "btn" : "btn-sec"}>{r}</Link>
              ))}
            </>
          )}
          {contas.filter((c) => c.nome !== "Caixa").length > 1 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="ml-2 text-[13px] text-slate-600">Conta:</span>
              <Link href={link({ conta: undefined })} className={!sp.conta ? "btn" : "btn-sec"}>Todas</Link>
              {contas.filter((c) => c.nome !== "Caixa").map((c) => (
                <Link key={c.id} href={link({ conta: c.id })} className={sp.conta === c.id ? "btn" : "btn-sec"}>{c.nome}</Link>
              ))}
            </div>
          )}
        </div>

        {(aba === "revisar" || aba === "sugestoes") && (
          <TabelaConciliacao
            key={`${aba}-${filtro}-${ordem}-${sp.q ?? ""}`}
            linhas={linhas}
            categorias={categorias.map((c) => ({ id: c.id, nome: c.codigo ? `${c.codigo} ${c.nome}` : c.nome, tipo: c.tipo }))}
            centros={centros}
            altas={linhas.filter(ehAlta).length}
          />
        )}

        {aba === "conciliados" && (
          <section className="space-y-2">
            <div className="cartao overflow-x-auto">
              <table className="tabela">
                <thead><tr><th>Data</th><th>Extrato</th><th className="text-right">Valor</th><th>Baixou</th><th>Categoria</th><th>Centro de custo</th><th className="w-20"></th></tr></thead>
                <tbody>
                  {conciliadosBusca.length === 0 && <tr><td colSpan={7} className="text-slate-500">{bate ? "Nada encontrado com esta busca." : "Nada conciliado ainda."}</td></tr>}
                  {conciliadosBusca.map((t) => {
                    const cats = [...new Set(t.lancamentos.map((l) => l.categoria.nome))].join(", ");
                    const ccs = [...new Set(t.lancamentos.map((l) => l.centroCusto?.nome).filter(Boolean))].join(", ");
                    return (
                      <tr key={t.id}>
                        <td className="whitespace-nowrap">{data(t.data)}{horaSP(t.dataHora) && <span className="ml-1 text-[12px] text-slate-500">{horaSP(t.dataHora)}</span>}</td>
                        <td>{t.descricao}<div className="text-xs text-slate-500">{t.contaBancaria.nome}</div></td>
                        <td className={`whitespace-nowrap text-right ${Number(t.valor) < 0 ? "text-red-600" : "text-emerald-700"}`}>{brl(t.valor)}</td>
                        <td className="text-slate-600">
                          {t.situacao === "IGNORADA" ? (t.motivo === "BOLETO_INTER" ? <span className="pilula border-sky-300 bg-sky-50 text-sky-700" title="Boleto recebido: a cobrança do Inter já baixou, não precisa conciliar">Boleto (cobrança Inter)</span> : <span className="pilula border-slate-300 bg-slate-50 text-slate-600">Ignorada</span>)
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
            {!verTodas && !bate && totalConc > recentes.length && <div className="text-center"><Link href={link({ ver: "todas" })} className="btn-sec">Mostrar mais (até 1.000)</Link></div>}
          </section>
        )}

        {aba === "geral" && (
          <div className="cartao overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Data</th><th>Extrato</th><th className="text-right">Valor</th><th>Situação</th><th>O que foi / será feito</th><th className="w-20"></th></tr></thead>
              <tbody>
                {geral.length === 0 && <tr><td colSpan={6} className="text-slate-500">Nenhum lançamento do extrato.</td></tr>}
                {geral.map((g) => (
                  <tr key={g.id}>
                    <td className="whitespace-nowrap">{dataBr(g.data)}{g.hora && <span className="ml-1 text-[12px] text-slate-500">{g.hora}</span>}<div className="text-[11px] text-slate-500">{g.conta}</div></td>
                    <td className="min-w-56">{g.descricao}</td>
                    <td className={`whitespace-nowrap text-right font-semibold ${g.valor < 0 ? "text-red-600" : "text-emerald-700"}`}>{brl(g.valor)}</td>
                    <td>{g.situacao}</td>
                    <td className="text-slate-600">{g.detalhe}</td>
                    <td>{g.acao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <details className="cartao p-3 text-[13px] text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-700">Como as sugestões são feitas</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><b>Baixar conta:</b> só sugere quando a linha do extrato é ligada ao cliente/fornecedor da conta por algo além do valor: nosso número/txid do boleto, CPF/CNPJ na descrição, nome que confere (duas palavras próprias em comum; sobrenomes comuns e palavras como &quot;organização&quot;, &quot;contábil&quot;, &quot;ltda&quot; não contam) ou o histórico de conciliações desse favorecido. Depois pesam o valor (igual, ou até 2% de diferença, que vira juros ou desconto) e a data perto do vencimento. Cada conta é sugerida para uma linha só.</li>
            <li><b>Quem paga por outro</b> (um escritório de contabilidade pagando boleto de um cliente, por exemplo) não vira sugestão: abra a linha e escolha a conta. Depois disso o sistema aprende que aquele favorecido paga por aquele cliente.</li>
            <li><b>Lançar despesa/receita:</b> usa a categoria mais usada para o mesmo favorecido nas conciliações anteriores; sem histórico, o ramo de atividade (CNAE) de quem recebeu. O CNPJ vem do próprio banco (o Inter manda o CPF/CNPJ de quem recebeu em cada Pix e pagamento), do CNPJ escrito na linha, do cadastro ou das notas de compra com o mesmo nome, ou de uma conciliação anterior; o ramo é consultado sozinho na Receita, sem precisar digitar nada. Não existe consulta pública de CNPJ só pelo nome, por isso o CNPJ informado na linha fica como último recurso e, depois a descrição (tarifa, IOF/juros, impostos, rendimentos) e, por último, o próprio nome de quem recebeu (&quot;Hapvida Assistência Médica&quot; é plano de saúde, &quot;Sabesp&quot; é água, &quot;Auto Posto&quot; é combustível, &quot;Contabilidade&quot; é serviço contábil...), procurando a categoria parecida no seu plano de contas. Quando você confirma uma, as outras empresas do mesmo ramo passam a ir para a mesma categoria.</li>
            <li><b>Funcionários:</b> pagamento a quem está cadastrado em Cadastros › Funcionários (CPF que o banco manda, ou o nome completo do extrato batendo com o cadastro) vira pagamento de pessoal, na subcategoria pelo tipo: dia 1 a 10 é salário do mês anterior, dia 26 em diante salário do mês, dia 11 a 25 adiantamento (ou férias, se passar de 125% do último salário). &quot;Férias&quot;, &quot;13º&quot;, &quot;adiantamento/vale&quot; ou &quot;rescisão&quot; escritos no extrato mandam. O resto fica como outros pagamentos, para conferir.</li>
            <li><b>Centro de custo:</b> o da própria conta; se ela não tiver, o que esse favorecido costuma usar, depois o da pessoa e por último o mais usado na categoria.</li>
            <li><b>Urgência:</b> conta que já foi paga no banco mas aparece vencida ou vencendo no sistema (cobrança indevida ao cliente, risco de pagar de novo), linha pendente há 15, 30 ou 60 dias e linha de mês que já fechou.</li>
          </ul>
        </details>
      </div>
    </Pagina>
  );
}
