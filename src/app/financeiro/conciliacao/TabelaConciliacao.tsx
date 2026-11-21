"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Icone from "@/components/Icone";
import type { LinhaAnalise, Nivel, Urgencia } from "@/lib/financeiro/conciliacao";
import { buscarRamosAcao, confirmarLote, ignorarLote, informarCnpjFavorecido, juntarLinhas, type ContaAberta, type ItemLote } from "./actions";
import BuscaContas, { Somatoria } from "./BuscaContas";

type Cat = { id: string; nome: string; tipo: "PAGAR" | "RECEBER" };
type Escolha = {
  acao: "BAIXAR" | "LANCAR" | "REVISAR"; lancamentoId: string | null; categoriaId: string | null; centroCustoId: string | null;
  /** várias contas com esta linha (escolhidas à mão, a soma é conferida) */
  varias?: ContaAberta[]; aceitarDiferenca?: boolean;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

const NIVEL: Record<Nivel, [string, string]> = {
  alta: ["border-emerald-300 bg-emerald-50 text-emerald-700", "alta"],
  media: ["border-amber-300 bg-amber-50 text-amber-800", "média"],
  baixa: ["border-slate-300 bg-slate-50 text-slate-600", "baixa"],
};
const URG: Record<Urgencia, [string, string]> = {
  urgente: ["border-red-300 bg-red-50 text-red-700", "Urgente"],
  atencao: ["border-amber-300 bg-amber-50 text-amber-800", "Atenção"],
  normal: ["border-slate-300 bg-slate-50 text-slate-600", "No prazo"],
};
const nivelDe = (c: number): Nivel => (c >= 80 ? "alta" : c >= 60 ? "media" : "baixa");
const POR_PAGINA = 100;

export default function TabelaConciliacao({ linhas, categorias, centros, altas }: { linhas: LinhaAnalise[]; categorias: Cat[]; centros: { id: string; nome: string }[]; altas: number }) {
  const inicial = useMemo(() => Object.fromEntries(linhas.map((l) => [l.transacaoId, { acao: l.acao, lancamentoId: l.lancamentoId, categoriaId: l.categoriaId, centroCustoId: l.centroCustoId } as Escolha])), [linhas]);
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>(inicial);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [aberta, setAberta] = useState<string | null>(null);
  const [limite, setLimite] = useState(POR_PAGINA);
  const [msg, setMsg] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [pendente, start] = useTransition();
  const [linhaPendente, setLinhaPendente] = useState<string | null>(null);
  const [cnpjs, setCnpjs] = useState<Record<string, string>>({});
  const [variasAberta, setVariasAberta] = useState<string | null>(null);
  const [juntar, setJuntar] = useState(false);
  const [contaJuntar, setContaJuntar] = useState<ContaAberta[]>([]);
  const [deixarRestante, setDeixarRestante] = useState(false);

  const porId = useMemo(() => new Map(linhas.map((l) => [l.transacaoId, l])), [linhas]);
  const esc = (id: string) => escolhas[id] ?? inicial[id];
  const mudar = (id: string, m: Partial<Escolha>) => setEscolhas((e) => ({ ...e, [id]: { ...(e[id] ?? inicial[id]), ...m } }));
  const somaVarias = (e: Escolha) => Math.round((e.varias ?? []).reduce((s, c) => s + c.valor, 0) * 100) / 100;
  const variasOk = (id: string, e: Escolha) => {
    const v = Math.abs(porId.get(id)?.valor ?? 0);
    return !!e.varias?.length && (e.aceitarDiferenca || Math.abs(v - somaVarias(e)) < 0.01);
  };
  const pronta = (id: string) => {
    const e = esc(id);
    if (e.acao === "BAIXAR" && e.varias?.length) return variasOk(id, e);
    return (e.acao === "BAIXAR" && !!e.lancamentoId) || (e.acao === "LANCAR" && !!e.categoriaId);
  };
  const item = (id: string): ItemLote => {
    const e = esc(id);
    const l = porId.get(id);
    // descrição/competência sugeridas (ex.: "Salário 10/2026 - FULANO") só valem se a categoria continua a sugerida
    const sugerida = e.acao === "LANCAR" && l && e.categoriaId === l.categoriaId && l.acao === "LANCAR";
    const varias = e.acao === "BAIXAR" && e.varias?.length ? e.varias.map((c) => c.lancamentoId) : null;
    return { transacaoId: id, acao: e.acao as "BAIXAR" | "LANCAR", lancamentoId: varias ? null : e.lancamentoId, categoriaId: e.categoriaId, centroCustoId: e.centroCustoId,
      descricao: sugerida ? l.descricaoLancamento : null, competencia: sugerida ? l.competencia : null,
      lancamentoIds: varias, aceitarDiferenca: !!e.aceitarDiferenca, funcionarioId: sugerida ? l.funcionarioId : null };
  };
  const visiveis = linhas.slice(0, limite);
  const marcar = (id: string, v: boolean) => setMarcadas((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });
  const prontasMarcadas = [...marcadas].filter(pronta);
  const linhasMarcadas = [...marcadas].map((id) => porId.get(id)).filter((l): l is LinhaAnalise => !!l);
  const mesmoTipo = linhasMarcadas.length >= 2 && linhasMarcadas.every((l) => l.tipo === linhasMarcadas[0].tipo);
  const somaMarcadas = Math.round(linhasMarcadas.reduce((s, l) => s + Math.abs(l.valor), 0) * 100) / 100;

  function rodar(fn: () => Promise<{ ok: boolean; mensagem: string } | null>, linha?: string) {
    setLinhaPendente(linha ?? null);
    start(async () => {
      const r = await fn();
      setMsg(r);
      setMarcadas(new Set());
      setLinhaPendente(null);
      if (r?.ok) { setJuntar(false); setContaJuntar([]); setDeixarRestante(false); setVariasAberta(null); }
    });
  }

  if (!linhas.length) return <p className="cartao p-4 text-sm text-slate-600">Nada pendente com este filtro.</p>;

  return (
    <section className="space-y-2">
      {/* barra de ações em lote */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-md border border-[#dee2e6] bg-white px-3 py-2 shadow-sm">
        <span className="text-[14px] font-semibold">{linhas.length} linha{linhas.length === 1 ? "" : "s"}</span>
        <button type="button" className="btn-sec" disabled={!altas}
          onClick={() => setMarcadas(new Set(linhas.filter((l) => l.acao !== "REVISAR" && nivelDe(l.confianca) === "alta").map((l) => l.transacaoId)))}>
          <Icone nome="ok" size={14} /> Marcar as {altas} de confiança alta
        </button>
        <button type="button" className="btn-sec" onClick={() => setMarcadas(new Set(linhas.filter((l) => pronta(l.transacaoId)).map((l) => l.transacaoId)))}>Marcar todas com sugestão</button>
        <button type="button" className="btn-sec" disabled={pendente} title="Consulta o CNPJ de quem recebeu as despesas para sugerir a categoria pelo ramo de atividade"
          onClick={() => rodar(() => buscarRamosAcao(), "ramos")}>
          <Icone nome="buscar" size={14} /> {linhaPendente === "ramos" ? "Consultando…" : "Buscar ramo de atividade"}
        </button>
        {marcadas.size > 0 && <button type="button" className="text-[13px] text-slate-600 underline" onClick={() => setMarcadas(new Set())}>limpar ({marcadas.size})</button>}
        {mesmoTipo && (
          <button type="button" className={juntar ? "btn" : "btn-sec"} title="Várias linhas do extrato que pagam uma conta só (ex.: cliente que pagou em duas vezes)" onClick={() => setJuntar((x) => !x)}>
            Juntar {linhasMarcadas.length} linhas numa conta
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className="btn-verde" disabled={pendente || !prontasMarcadas.length}
            onClick={() => rodar(() => confirmarLote(prontasMarcadas.map(item)))}>
            <Icone nome="confirmado" size={15} /> {pendente && !linhaPendente ? "Conciliando…" : `Confirmar ${prontasMarcadas.length || ""} selecionada${prontasMarcadas.length === 1 ? "" : "s"}`}
          </button>
          <button type="button" className="btn-sec" disabled={pendente || !marcadas.size}
            onClick={() => { if (window.confirm(`Ignorar ${marcadas.size} linha(s) do extrato? Elas saem da lista sem baixar nada.`)) rodar(() => ignorarLote([...marcadas])); }}>
            Ignorar selecionadas
          </button>
        </div>
        {msg && <p className={`w-full text-[13px] ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.mensagem}</p>}
      </div>

      {juntar && mesmoTipo && (() => {
        const conta = contaJuntar[0];
        const resto = conta ? Math.round((conta.valor - somaMarcadas) * 100) / 100 : 0;
        const podeJuntar = !!conta && resto > -0.01 && (resto < 0.01 || deixarRestante);
        return (
          <div className="cartao space-y-2 p-3">
            <div className="text-[14px] font-semibold">Juntar {linhasMarcadas.length} linhas do extrato numa conta {linhasMarcadas[0].tipo === "PAGAR" ? "a pagar" : "a receber"}</div>
            <p className="text-[12px] text-slate-600">A conta é dividida em uma parte por linha (cada parte baixada na data da sua linha). A soma das linhas não pode passar do valor da conta.</p>
            <BuscaContas tipo={linhasMarcadas[0].tipo} alvo={somaMarcadas} multiplo={false} escolhidas={contaJuntar} onChange={(c) => { setContaJuntar(c); setDeixarRestante(false); }} />
            {conta && <Somatoria rotuloSoma={`Soma das ${linhasMarcadas.length} linhas`} soma={somaMarcadas} rotuloAlvo="Valor da conta" alvo={conta.valor} falta="falta pagar (pode ficar em aberto)" sobra="as linhas passam do valor da conta" />}
            {conta && resto >= 0.01 && (
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={deixarRestante} onChange={(e) => setDeixarRestante(e.target.checked)} /> Deixar os {brl(resto)} que faltam em aberto, numa parte a mais da conta</label>
            )}
            <div className="flex gap-2">
              <button type="button" className="btn-verde" disabled={pendente || !podeJuntar}
                onClick={() => rodar(() => juntarLinhas(linhasMarcadas.map((l) => l.transacaoId), conta!.lancamentoId, { centroCustoId: conta!.centroCustoId, deixarRestante }))}>
                Baixar a conta com as {linhasMarcadas.length} linhas
              </button>
              <button type="button" className="btn-sec" onClick={() => { setJuntar(false); setContaJuntar([]); }}>Cancelar</button>
            </div>
          </div>
        );
      })()}

      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th className="w-8"><input type="checkbox" aria-label="Marcar todas da página" checked={visiveis.length > 0 && visiveis.every((l) => marcadas.has(l.transacaoId))}
                onChange={(e) => setMarcadas((s) => { const n = new Set(s); for (const l of visiveis) if (e.target.checked) n.add(l.transacaoId); else n.delete(l.transacaoId); return n; })} /></th>
              <th>Data</th>
              <th>Extrato</th>
              <th className="text-right">Valor</th>
              <th className="min-w-64">Sugestão e confiança</th>
              <th className="min-w-40">Centro de custo</th>
              <th>Prazo</th>
              <th className="w-28 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => {
              const e = esc(l.transacaoId);
              const cand = e.lancamentoId ? l.candidatos.find((c) => c.lancamentoId === e.lancamentoId) : null;
              const cat = e.categoriaId ? categorias.find((c) => c.id === e.categoriaId) : null;
              const conf = e.acao === "BAIXAR" ? cand?.confianca ?? 0 : e.acao === "LANCAR" ? (e.categoriaId === l.categoriaId && l.acao === "LANCAR" ? l.confianca : 0) : 0;
              const motivos = e.acao === "BAIXAR" ? cand?.motivos ?? [] : l.acao === e.acao ? l.motivos : [];
              const avisos = l.motivos.filter((m) => !motivos.includes(m));
              const [corU, rotU] = URG[l.urgencia];
              const abertaAqui = aberta === l.transacaoId;
              const trocada = e.acao !== l.acao || e.lancamentoId !== l.lancamentoId || !!e.varias?.length || (e.acao === "LANCAR" && e.categoriaId !== l.categoriaId);
              const pilulaConf = e.acao === "REVISAR" ? null : trocada && !conf
                ? <span className="pilula border-sky-300 bg-sky-50 text-sky-700">sua escolha</span>
                : <span className={`pilula ${NIVEL[nivelDe(conf)][0]}`} title="Confiança da sugestão">{conf}% {NIVEL[nivelDe(conf)][1]}</span>;
              return (
                <Fragment key={l.transacaoId}>
                  <tr className={l.urgencia === "urgente" ? "[&>td]:!bg-red-50/40" : undefined}>
                    <td><input type="checkbox" aria-label="Marcar linha" checked={marcadas.has(l.transacaoId)} onChange={(ev) => marcar(l.transacaoId, ev.target.checked)} /></td>
                    <td className="whitespace-nowrap">{dataBr(l.data)}{l.hora && <span className="ml-1 text-[12px] text-slate-500">{l.hora}</span>}<div className="text-[11px] text-slate-500">{l.conta}</div></td>
                    <td className="min-w-48 max-w-80 break-words">{l.descricao}</td>
                    <td className={`whitespace-nowrap text-right font-semibold ${l.valor < 0 ? "text-red-600" : "text-emerald-700"}`}>{brl(l.valor)}</td>
                    <td>
                      {e.acao === "BAIXAR" && e.varias?.length ? (
                        <div>
                          <span className="etiqueta mr-1 border-emerald-300 bg-emerald-50 text-emerald-700">Baixar {e.varias.length} contas</span>
                          <span className="pilula border-sky-300 bg-sky-50 text-sky-700">sua escolha</span>
                          {e.varias.map((c) => <div key={c.lancamentoId} className="text-[12px] text-slate-600">{c.descricao}{c.pessoa ? ` · ${c.pessoa}` : ""} · {brl(c.valor)}</div>)}
                          <div className={`text-[12px] font-medium ${variasOk(l.transacaoId, e) ? "text-emerald-700" : "text-amber-800"}`}>
                            Soma {brl(somaVarias(e))} {Math.abs(Math.abs(l.valor) - somaVarias(e)) < 0.01 ? "· bate com o extrato" : e.aceitarDiferenca ? "· diferença vira juros/desconto" : "· não bate com o extrato"}
                          </div>
                        </div>
                      ) : e.acao === "BAIXAR" && cand ? (
                        <div>
                          <span className="etiqueta mr-1 border-emerald-300 bg-emerald-50 text-emerald-700">Baixar {l.tipo === "PAGAR" ? "conta a pagar" : "conta a receber"}</span>{pilulaConf}
                          <div className="mt-0.5 font-medium">{cand.descricao}</div>
                          <div className="text-[12px] text-slate-600">{cand.pessoa ? `${cand.pessoa} · ` : ""}venc. {dataBr(cand.vencimento)} · {brl(cand.valor)}</div>
                        </div>
                      ) : e.acao === "LANCAR" && cat ? (
                        <div>
                          <span className="etiqueta mr-1 border-sky-300 bg-sky-50 text-sky-700">Lançar {l.tipo === "PAGAR" ? "despesa" : "receita"}</span>{pilulaConf}
                          {l.funcionario && <span className="etiqueta mr-1 border-violet-300 bg-violet-50 text-violet-700">Funcionário · {l.tipoPessoal}</span>}
                          <div className="mt-0.5 font-medium">{cat.nome}</div>
                          {l.descricaoLancamento && e.categoriaId === l.categoriaId && <div className="text-[12px] text-slate-600">{l.descricaoLancamento}{l.competencia ? ` · competência ${l.competencia.slice(5, 7)}/${l.competencia.slice(0, 4)}` : ""}</div>}
                        </div>
                      ) : (
                        <div className="text-[13px] text-slate-500">
                          Sem sugestão. <button type="button" className="underline" onClick={() => setAberta(l.transacaoId)}>Escolher o que fazer</button>
                        </div>
                      )}
                      {motivos.length > 0 && <div className="mt-1 text-[11px] text-slate-500">{motivos.join(" · ")}</div>}
                      {l.tipo === "PAGAR" && l.ramo && !motivos.some((m) => m.includes("ramo")) && <div className="mt-0.5 text-[11px] text-slate-500">Ramo: {l.ramo}</div>}
                    </td>
                    <td>
                      <select className="campo w-full min-w-40 !py-1 text-[13px]" value={e.centroCustoId ?? ""} onChange={(ev) => mudar(l.transacaoId, { centroCustoId: ev.target.value || null })}>
                        <option value="">— sem centro —</option>
                        {centros.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                      {l.centroCustoId && e.centroCustoId === l.centroCustoId && <div className="mt-0.5 text-[11px] text-slate-500">sugerido</div>}
                    </td>
                    <td className="min-w-32 max-w-48" title={avisos.join("\n") || undefined}>
                      <span className={`pilula ${corU}`}>{rotU}</span>
                      <div className="mt-1 text-[12px] text-slate-600">{l.prazo}</div>
                      {avisos.length > 0 && <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{avisos[0]}</div>}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <div className="inline-flex items-center gap-1">
                        <button type="button" className="btn !px-2 !py-1 text-[13px]" disabled={pendente || !pronta(l.transacaoId)} title="Confirmar esta linha"
                          onClick={() => rodar(() => confirmarLote([item(l.transacaoId)]), l.transacaoId)}>
                          {linhaPendente === l.transacaoId ? "…" : "Confirmar"}
                        </button>
                        <button type="button" className="btn-icone" title="Outras opções" aria-expanded={abertaAqui} onClick={() => setAberta(abertaAqui ? null : l.transacaoId)}>
                          <Icone nome={abertaAqui ? "cima" : "opcoes"} size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {abertaAqui && (
                    <tr>
                      <td colSpan={8} className="!bg-[#f7f7f7]">
                        <div className="grid gap-3 md:grid-cols-[2fr_1.4fr_auto]">
                          <label className="block">
                            <span className="rotulo">Baixar a conta</span>
                            <select className="campo w-full" value={e.acao === "BAIXAR" ? e.lancamentoId ?? "" : ""}
                              onChange={(ev) => {
                                const c = l.candidatos.find((x) => x.lancamentoId === ev.target.value);
                                mudar(l.transacaoId, ev.target.value ? { acao: "BAIXAR", lancamentoId: ev.target.value, varias: [], centroCustoId: c?.centroCustoId ?? e.centroCustoId } : { acao: e.categoriaId ? "LANCAR" : "REVISAR", lancamentoId: null, varias: [] });
                              }}>
                              <option value="">{l.candidatos.length ? "— não baixar conta —" : "Nenhuma conta parecida em aberto"}</option>
                              {l.candidatos.map((c) => (
                                <option key={c.lancamentoId} value={c.lancamentoId}>{c.confianca}% · venc. {dataBr(c.vencimento)} · {brl(c.valor)} · {c.descricao}{c.pessoa ? ` · ${c.pessoa}` : ""}</option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="rotulo">Ou lançar como {l.tipo === "PAGAR" ? "despesa" : "receita"}</span>
                            <select className="campo w-full" value={e.acao === "LANCAR" ? e.categoriaId ?? "" : ""}
                              onChange={(ev) => mudar(l.transacaoId, ev.target.value ? { acao: "LANCAR", categoriaId: ev.target.value, lancamentoId: null, varias: [] } : { acao: l.lancamentoId ? "BAIXAR" : "REVISAR", lancamentoId: l.lancamentoId })}>
                              <option value="">— escolha a categoria —</option>
                              {categorias.filter((c) => c.tipo === l.tipo).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                            </select>
                          </label>
                          <div className="flex items-end gap-2">
                            {trocada && <button type="button" className="btn-sec" onClick={() => mudar(l.transacaoId, inicial[l.transacaoId])}>Voltar à sugestão</button>}
                            <button type="button" className="btn-sec" disabled={pendente}
                              onClick={() => { if (window.confirm("Ignorar esta linha do extrato? Ela sai da lista sem baixar nada.")) rodar(() => ignorarLote([l.transacaoId]), l.transacaoId); }}>
                              Ignorar linha
                            </button>
                          </div>
                        </div>
                        <div className="mt-2">
                          {variasAberta !== l.transacaoId ? (
                            <button type="button" className="text-[13px] underline" onClick={() => setVariasAberta(l.transacaoId)}>
                              {e.varias?.length ? `Alterar as ${e.varias.length} contas desta linha` : "Esta linha paga várias contas? Escolher as contas"}
                            </button>
                          ) : (
                            <div className="space-y-2 rounded border border-[#dee2e6] bg-white p-2">
                              <div className="text-[13px] font-semibold">Contas pagas por esta linha ({brl(Math.abs(l.valor))})</div>
                              <BuscaContas tipo={l.tipo} alvo={Math.abs(l.valor)} multiplo escolhidas={e.varias ?? []}
                                iniciais={l.candidatos.map((c) => ({ lancamentoId: c.lancamentoId, descricao: c.descricao, pessoa: c.pessoa, valor: c.valor, vencimento: c.vencimento, centroCustoId: c.centroCustoId }))}
                                onChange={(cs) => mudar(l.transacaoId, cs.length ? { acao: "BAIXAR", varias: cs, lancamentoId: null, aceitarDiferenca: false } : { varias: [], acao: inicial[l.transacaoId].acao, lancamentoId: inicial[l.transacaoId].lancamentoId })} />
                              {!!e.varias?.length && <Somatoria rotuloSoma={`Soma das ${e.varias.length} contas`} soma={somaVarias(e)} rotuloAlvo="Valor do extrato" alvo={Math.abs(l.valor)} falta="o banco mostra mais (vira juros)" sobra="o banco mostra menos (vira desconto)" />}
                              {!!e.varias?.length && Math.abs(Math.abs(l.valor) - somaVarias(e)) >= 0.01 && (
                                <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={!!e.aceitarDiferenca} onChange={(ev) => mudar(l.transacaoId, { aceitarDiferenca: ev.target.checked })} /> Aceitar a diferença como {Math.abs(l.valor) > somaVarias(e) ? "juros" : "desconto"} na primeira conta</label>
                              )}
                              <div className="flex gap-2">
                                <button type="button" className="btn-sec !py-1 text-[13px]" onClick={() => setVariasAberta(null)}>Fechar</button>
                                {!!e.varias?.length && <button type="button" className="text-[13px] underline" onClick={() => mudar(l.transacaoId, { varias: [], acao: inicial[l.transacaoId].acao, lancamentoId: inicial[l.transacaoId].lancamentoId })}>limpar</button>}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
                          <span>Favorecido lido do extrato: <b>{l.favorecido || "—"}</b>{l.documentoFavorecido ? ` · CPF/CNPJ ${l.documentoFavorecido}` : ""}{l.ramo ? ` · ramo ${l.ramo}` : ""}.</span>
                          {l.tipo === "PAGAR" && l.favorecido && (
                            <span className="inline-flex items-center gap-1">
                              <input className="campo w-44 !py-1 text-[13px]" placeholder="CNPJ de quem recebeu" inputMode="numeric"
                                value={cnpjs[l.transacaoId] ?? l.documentoFavorecido ?? ""} onChange={(ev) => setCnpjs((c) => ({ ...c, [l.transacaoId]: ev.target.value }))} />
                              <button type="button" className="btn-sec !py-1 text-[13px]" disabled={pendente}
                                onClick={() => rodar(() => informarCnpjFavorecido(l.favorecido, cnpjs[l.transacaoId] ?? l.documentoFavorecido ?? ""), l.transacaoId)}>
                                Buscar ramo
                              </button>
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[12px] text-slate-500">Diferença de valor na baixa vira juros (a mais) ou desconto (a menos). A lista de contas mostra também as que não conferem com o favorecido (confiança até 30%), só para escolha manual.</p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {linhas.length > limite && (
        <div className="text-center">
          <button type="button" className="btn-sec" onClick={() => setLimite((x) => x + POR_PAGINA)}>Mostrar mais {Math.min(POR_PAGINA, linhas.length - limite)} de {linhas.length - limite}</button>
        </div>
      )}
    </section>
  );
}
