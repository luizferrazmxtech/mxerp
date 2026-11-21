"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Icone from "@/components/Icone";
import type { LinhaAnalise, Nivel, Urgencia } from "@/lib/financeiro/conciliacao";
import { buscarRamosAcao, confirmarLote, ignorarLote, informarCnpjFavorecido, type ItemLote } from "./actions";

type Cat = { id: string; nome: string; tipo: "PAGAR" | "RECEBER" };
type Escolha = { acao: "BAIXAR" | "LANCAR" | "REVISAR"; lancamentoId: string | null; categoriaId: string | null; centroCustoId: string | null };

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

  const esc = (id: string) => escolhas[id] ?? inicial[id];
  const mudar = (id: string, m: Partial<Escolha>) => setEscolhas((e) => ({ ...e, [id]: { ...(e[id] ?? inicial[id]), ...m } }));
  const pronta = (id: string) => { const e = esc(id); return (e.acao === "BAIXAR" && !!e.lancamentoId) || (e.acao === "LANCAR" && !!e.categoriaId); };
  const item = (id: string): ItemLote => { const e = esc(id); return { transacaoId: id, acao: e.acao as "BAIXAR" | "LANCAR", lancamentoId: e.lancamentoId, categoriaId: e.categoriaId, centroCustoId: e.centroCustoId }; };
  const visiveis = linhas.slice(0, limite);
  const marcar = (id: string, v: boolean) => setMarcadas((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });
  const prontasMarcadas = [...marcadas].filter(pronta);

  function rodar(fn: () => Promise<{ ok: boolean; mensagem: string } | null>, linha?: string) {
    setLinhaPendente(linha ?? null);
    start(async () => {
      const r = await fn();
      setMsg(r);
      setMarcadas(new Set());
      setLinhaPendente(null);
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
              const trocada = e.acao !== l.acao || e.lancamentoId !== l.lancamentoId || (e.acao === "LANCAR" && e.categoriaId !== l.categoriaId);
              const pilulaConf = e.acao === "REVISAR" ? null : trocada && !conf
                ? <span className="pilula border-sky-300 bg-sky-50 text-sky-700">sua escolha</span>
                : <span className={`pilula ${NIVEL[nivelDe(conf)][0]}`} title="Confiança da sugestão">{conf}% {NIVEL[nivelDe(conf)][1]}</span>;
              return (
                <Fragment key={l.transacaoId}>
                  <tr className={l.urgencia === "urgente" ? "[&>td]:!bg-red-50/40" : undefined}>
                    <td><input type="checkbox" aria-label="Marcar linha" disabled={!pronta(l.transacaoId)} checked={marcadas.has(l.transacaoId)} onChange={(ev) => marcar(l.transacaoId, ev.target.checked)} /></td>
                    <td className="whitespace-nowrap">{dataBr(l.data)}{l.hora && <span className="ml-1 text-[12px] text-slate-500">{l.hora}</span>}<div className="text-[11px] text-slate-500">{l.conta}</div></td>
                    <td className="min-w-48 max-w-80 break-words">{l.descricao}</td>
                    <td className={`whitespace-nowrap text-right font-semibold ${l.valor < 0 ? "text-red-600" : "text-emerald-700"}`}>{brl(l.valor)}</td>
                    <td>
                      {e.acao === "BAIXAR" && cand ? (
                        <div>
                          <span className="etiqueta mr-1 border-emerald-300 bg-emerald-50 text-emerald-700">Baixar {l.tipo === "PAGAR" ? "conta a pagar" : "conta a receber"}</span>{pilulaConf}
                          <div className="mt-0.5 font-medium">{cand.descricao}</div>
                          <div className="text-[12px] text-slate-600">{cand.pessoa ? `${cand.pessoa} · ` : ""}venc. {dataBr(cand.vencimento)} · {brl(cand.valor)}</div>
                        </div>
                      ) : e.acao === "LANCAR" && cat ? (
                        <div>
                          <span className="etiqueta mr-1 border-sky-300 bg-sky-50 text-sky-700">Lançar {l.tipo === "PAGAR" ? "despesa" : "receita"}</span>{pilulaConf}
                          <div className="mt-0.5 font-medium">{cat.nome}</div>
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
                                mudar(l.transacaoId, ev.target.value ? { acao: "BAIXAR", lancamentoId: ev.target.value, centroCustoId: c?.centroCustoId ?? e.centroCustoId } : { acao: e.categoriaId ? "LANCAR" : "REVISAR", lancamentoId: null });
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
                              onChange={(ev) => mudar(l.transacaoId, ev.target.value ? { acao: "LANCAR", categoriaId: ev.target.value, lancamentoId: null } : { acao: l.lancamentoId ? "BAIXAR" : "REVISAR", lancamentoId: l.lancamentoId })}>
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
