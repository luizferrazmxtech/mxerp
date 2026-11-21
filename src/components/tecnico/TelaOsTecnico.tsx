"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icone from "@/components/Icone";
import { anotarAcao, enviarFotoAcao, excluirFotoAcao, lancarItemAcao, marcarInstaladoAcao, origemItemAcao, removerItemAcao, situacaoTecnicoAcao, type RespostaTecnico } from "@/lib/os/acoesTecnico";

export type FotoTecnico = { id: string; nome: string; minha: boolean };
export type ItemTecnico = {
  id: string; tipo: "produto" | "servico"; nome: string; codigo: string; quantidade: string; detalhes: string;
  onde: string; emFalta: boolean; instalado: boolean; instaladoInfo: string; podeRemover: boolean; fotos: FotoTecnico[];
  /** produto: saiu do carro deste técnico? null = não dá para trocar (OS fechada ou sem estoque próprio) */
  comigo?: boolean | null;
};
type Achado = { id: string; codigo: string; nome: string; unidade?: string; disponivel?: number | null };

/** Reduz a foto do celular (que tem 3–10 MB) para no máximo 1600 px em JPEG, antes de enviar. */
async function comprimir(arquivo: File): Promise<Blob> {
  if (!arquivo.type.startsWith("image/")) throw new Error("Escolha uma foto");
  try {
    const bmp = await createImageBitmap(arquivo, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.8));
    if (blob) return blob;
  } catch { /* navegador sem suporte: manda a original */ }
  return arquivo;
}

export default function TelaOsTecnico(props: {
  osId: string; numero: number; itens: ItemTecnico[]; fotosGerais: FotoTecnico[];
  editavel: boolean; motivoBloqueio: string; podeItens: boolean; podeFotos: boolean;
  situacao: { atual: string; opcoes: { id: string; nome: string }[] } | null;
  anotacoes: { id: string; texto: string; autor: string; quando: string }[];
  /** estoque do próprio técnico (carro): livre por produto; null = não tem estoque próprio */
  meuEstoque: Record<string, number> | null;
}) {
  const { osId, itens, editavel, podeItens, podeFotos } = props;
  const router = useRouter();
  const [aviso, setAviso] = useState<RespostaTecnico | null>(null);
  const [ocupado, iniciar] = useTransition();
  const [adicionando, setAdicionando] = useState(false);
  const [foto, setFoto] = useState<string | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [sit, setSit] = useState(props.situacao?.atual ?? "");

  const rodar = (f: () => Promise<RespostaTecnico>, depois?: () => void) =>
    iniciar(async () => {
      const r = await f();
      setAviso(r);
      if (r.ok) { depois?.(); router.refresh(); }
    });

  useEffect(() => {
    if (!aviso?.ok) return;
    const t = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  async function enviarFoto(arquivo: File | undefined, itemId: string | null) {
    if (!arquivo) return;
    setEnviandoFoto(itemId ?? "geral");
    try {
      const blob = await comprimir(arquivo);
      const fd = new FormData();
      fd.set("osId", osId);
      if (itemId) fd.set("itemId", itemId);
      fd.set("foto", new File([blob], arquivo.name.replace(/\.\w+$/, "") + ".jpg", { type: blob.type || "image/jpeg" }));
      const r = await enviarFotoAcao(fd);
      setAviso(r);
      if (r.ok) router.refresh();
    } catch (e) {
      setAviso({ ok: false, mensagem: e instanceof Error ? e.message : String(e) });
    } finally {
      setEnviandoFoto(null);
    }
  }

  const total = itens.length, feitos = itens.filter((i) => i.instalado).length;

  return (
    <>
      {aviso && (
        <div role="status" className={`fixed inset-x-3 top-[58px] z-50 mx-auto max-w-3xl rounded-lg px-4 py-3 text-[14px] shadow-lg ${aviso.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`} onClick={() => setAviso(null)}>
          {aviso.mensagem}
        </div>
      )}

      {props.situacao && (
        <section className="mb-3 flex gap-2 rounded-lg border bg-white p-3">
          <select className="campo h-11 flex-1 text-[15px]" value={sit} onChange={(e) => setSit(e.target.value)} aria-label="Situação da OS">
            {props.situacao.opcoes.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <button className="btn h-11 px-4" disabled={ocupado || sit === props.situacao.atual} onClick={() => rodar(() => situacaoTecnicoAcao(osId, sit))}>Mudar situação</button>
        </section>
      )}

      <section className="mb-3">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-[15px] font-semibold">Itens da OS</h2>
          {total > 0 && <span className="text-[13px] text-slate-500">{feitos} de {total} instalados</span>}
        </div>
        {!editavel && <p className="mb-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">{props.motivoBloqueio}</p>}
        <ul className="space-y-2">
          {itens.map((i) => (
            <li key={i.id} className={`rounded-lg border bg-white p-3 ${i.instalado ? "border-emerald-300" : ""}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-medium leading-tight">{i.nome}</div>
                  <div className="text-[12px] text-slate-500">{i.tipo === "servico" ? "Serviço" : i.codigo} · Qtd {i.quantidade}</div>
                  {i.detalhes && <div className="text-[13px] text-slate-700">{i.detalhes}</div>}
                  {i.onde && <div className={`mt-1 text-[13px] ${i.emFalta ? "font-semibold text-red-600" : "text-slate-700"}`}><Icone nome="locais" size={13} className="mr-1 inline" />{i.onde}</div>}
                  {i.comigo != null && (
                    <button className={`mt-1 rounded-full border px-3 py-1 text-[12px] ${i.comigo ? "border-marca bg-teal-50 font-semibold text-marca-escura" : "border-slate-300 text-slate-600"}`} disabled={ocupado}
                      onClick={() => rodar(() => origemItemAcao(osId, i.id, !i.comigo))}>
                      {i.comigo ? "Saiu do meu carro ✓" : "Saiu do meu carro?"}
                    </button>
                  )}
                </div>
                {i.podeRemover && (
                  <button className="btn-icone h-9 w-9 text-red-600" aria-label={`Tirar ${i.nome}`} disabled={ocupado}
                    onClick={() => { if (confirm(`Tirar ${i.nome} da OS?`)) rodar(() => removerItemAcao(osId, i.tipo, i.id)); }}>
                    <Icone nome="excluir" size={16} />
                  </button>
                )}
              </div>

              {i.fotos.length > 0 && <Miniaturas fotos={i.fotos} abrir={setFoto} excluir={podeFotos ? (f) => rodar(() => excluirFotoAcao(osId, f)) : undefined} />}

              <div className="mt-2 flex gap-2">
                <button
                  className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-md border text-[14px] font-semibold ${i.instalado ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-slate-700"}`}
                  disabled={ocupado || !podeItens}
                  onClick={() => rodar(() => marcarInstaladoAcao(osId, i.tipo, i.id, !i.instalado))}>
                  <Icone nome={i.instalado ? "confirmado" : "ok"} size={18} />
                  {i.instalado ? (i.tipo === "produto" ? "Instalado" : "Feito") : (i.tipo === "produto" ? "Marcar instalado" : "Marcar feito")}
                </button>
                {podeFotos && (
                  <label className={`flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-[14px] text-slate-700 ${enviandoFoto ? "opacity-50" : ""}`}>
                    <Icone nome="foto" size={18} /> {enviandoFoto === i.id ? "Enviando…" : "Foto"}
                    <input type="file" accept="image/*" capture="environment" className="hidden" disabled={!!enviandoFoto}
                      onChange={(e) => { void enviarFoto(e.target.files?.[0], i.id); e.target.value = ""; }} />
                  </label>
                )}
              </div>
              {i.instaladoInfo && <div className="mt-1 text-[11px] text-emerald-700">{i.instaladoInfo}</div>}
            </li>
          ))}
          {!itens.length && <li className="rounded-lg border border-dashed bg-white p-5 text-center text-[14px] text-slate-500">Nenhum item lançado ainda.</li>}
        </ul>
      </section>

      <section className="mb-3 rounded-lg border bg-white p-3">
        <h2 className="mb-2 text-[15px] font-semibold">Fotos da instalação</h2>
        {props.fotosGerais.length ? <Miniaturas fotos={props.fotosGerais} abrir={setFoto} excluir={podeFotos ? (f) => rodar(() => excluirFotoAcao(osId, f)) : undefined} />
          : <p className="text-[13px] text-slate-500">Fotos gerais do serviço (sem item específico) aparecem aqui.</p>}
      </section>

      <section className="mb-3 rounded-lg border bg-white p-3">
        <h2 className="mb-2 text-[15px] font-semibold">Anotações</h2>
        <textarea className="campo min-h-20 text-[15px]" placeholder="O que foi feito, pendências, recado para o escritório…" value={nota} onChange={(e) => setNota(e.target.value)} />
        <button className="btn mt-2 h-10 w-full" disabled={ocupado || !nota.trim()} onClick={() => rodar(() => anotarAcao(osId, nota), () => setNota(""))}>Salvar anotação</button>
        {props.anotacoes.length > 0 && (
          <ul className="mt-3 space-y-2">
            {props.anotacoes.map((a) => (
              <li key={a.id} className="rounded border-l-4 border-slate-300 bg-slate-50 px-3 py-2 text-[13px]">
                <div className="whitespace-pre-line">{a.texto}</div>
                <div className="mt-1 text-[11px] text-slate-500">{[a.autor, a.quando].filter(Boolean).join(" · ")}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* barra fixa embaixo: o que o técnico mais usa fica ao alcance do polegar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 px-3 py-2 backdrop-blur" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-3xl gap-2">
          {editavel && podeItens && (
            <button className="btn-laranja flex h-12 flex-1 items-center justify-center gap-2 text-[15px]" onClick={() => setAdicionando(true)}>
              <Icone nome="mais" size={18} /> Adicionar item
            </button>
          )}
          {podeFotos && (
            <label className={`flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-topo text-[15px] font-semibold text-white ${enviandoFoto ? "opacity-50" : ""}`}>
              <Icone nome="foto" size={18} /> {enviandoFoto === "geral" ? "Enviando…" : "Foto geral"}
              <input type="file" accept="image/*" capture="environment" className="hidden" disabled={!!enviandoFoto}
                onChange={(e) => { void enviarFoto(e.target.files?.[0], null); e.target.value = ""; }} />
            </label>
          )}
        </div>
      </div>

      {adicionando && (
        <AdicionarItem
          fechar={() => setAdicionando(false)}
          lancar={(item) => rodar(() => lancarItemAcao(osId, item), () => setAdicionando(false))}
          ocupado={ocupado} meuEstoque={props.meuEstoque}
        />
      )}

      {foto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2" onClick={() => setFoto(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/cadastros/anexo/${foto}`} alt="Foto da instalação" className="max-h-full max-w-full object-contain" />
          <button className="absolute right-3 top-3 rounded-full bg-white/20 p-2 text-white" aria-label="Fechar"><Icone nome="fechar" size={22} /></button>
        </div>
      )}
    </>
  );
}

function Miniaturas({ fotos, abrir, excluir }: { fotos: FotoTecnico[]; abrir: (id: string) => void; excluir?: (id: string) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {fotos.map((f) => (
        <div key={f.id} className="relative">
          <button onClick={() => abrir(f.id)} className="block h-20 w-20 overflow-hidden rounded border bg-slate-100" aria-label={`Ver ${f.nome}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/cadastros/anexo/${f.id}`} alt={f.nome} loading="lazy" className="h-full w-full object-cover" />
          </button>
          {f.minha && excluir && (
            <button className="absolute -right-2 -top-2 rounded-full bg-red-600 p-1 text-white shadow" aria-label="Apagar foto"
              onClick={() => { if (confirm("Apagar esta foto?")) excluir(f.id); }}>
              <Icone nome="fechar" size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Painel de baixo para cima: busca o produto/serviço, escolhe a quantidade e lança (já instalado, se quiser). */
function AdicionarItem({ fechar, lancar, ocupado, meuEstoque }: {
  fechar: () => void; ocupado: boolean; meuEstoque: Record<string, number> | null;
  lancar: (item: { tipo: "produto" | "servico"; id: string; quantidade: number; detalhes?: string; instalado?: boolean; doMeuEstoque?: boolean }) => void;
}) {
  const [tipo, setTipo] = useState<"produto" | "servico">("produto");
  const [q, setQ] = useState("");
  const [achados, setAchados] = useState<Achado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [escolhido, setEscolhido] = useState<Achado | null>(null);
  const [qtd, setQtd] = useState("1");
  const [detalhes, setDetalhes] = useState("");
  const [doCarro, setDoCarro] = useState(false);
  const noCarro = (id: string) => meuEstoque?.[id] ?? 0;
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => { campo.current?.focus(); }, [tipo]);
  useEffect(() => {
    if (q.trim().length < 2) { setAchados([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetch(`/api/itens/busca?q=${encodeURIComponent(q)}${tipo === "servico" ? "&tipo=servico" : ""}`, { signal: ctl.signal });
        if (r.ok) setAchados(await r.json());
      } catch { /* digitando: busca anterior cancelada */ } finally { setBuscando(false); }
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, tipo]);

  const quantidade = Number(qtd.replace(",", "."));
  const mudar = (d: number) => setQtd(String(Math.max(1, (Number.isFinite(quantidade) ? quantidade : 1) + d)).replace(".", ","));
  const enviar = (instalado: boolean) => escolhido && quantidade > 0 && lancar({ tipo, id: escolhido.id, quantidade, detalhes, instalado, doMeuEstoque: tipo === "produto" && doCarro });

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black/40" onClick={fechar}>
      <div className="mt-auto flex max-h-[92vh] flex-col rounded-t-2xl bg-white" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex items-center gap-2 border-b p-3">
          <h2 className="text-[17px] font-semibold">Adicionar item</h2>
          <button className="ml-auto rounded p-2 text-slate-500" onClick={fechar} aria-label="Fechar"><Icone nome="fechar" size={20} /></button>
        </div>

        {!escolhido ? (
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <div className="mb-2 flex overflow-hidden rounded-md border text-[14px]">
              {(["produto", "servico"] as const).map((t) => (
                <button key={t} className={`flex-1 py-2 ${tipo === t ? "bg-topo text-white" : ""}`} onClick={() => { setTipo(t); setAchados([]); }}>{t === "produto" ? "Produto / peça" : "Serviço"}</button>
              ))}
            </div>
            <input ref={campo} value={q} onChange={(e) => setQ(e.target.value)} className="campo h-12 text-[16px]" placeholder={tipo === "produto" ? "Nome, código ou código de barras" : "Nome ou código do serviço"} inputMode="search" />
            <ul className="mt-2 min-h-0 flex-1 overflow-y-auto">
              {achados.map((a) => (
                <li key={a.id}>
                  <button className="flex w-full items-center gap-2 border-b px-1 py-3 text-left active:bg-slate-50" onClick={() => { setEscolhido(a); setQtd("1"); setDoCarro(tipo === "produto" && noCarro(a.id) > 0); }}>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] leading-tight">{a.nome}</div>
                      <div className="text-[12px] text-slate-500">{a.codigo}</div>
                    </div>
                    {tipo === "produto" && noCarro(a.id) > 0 && <span className="whitespace-nowrap rounded bg-teal-50 px-1 text-[12px] font-semibold text-marca-escura">{noCarro(a.id).toLocaleString("pt-BR")} no carro</span>}
                    {tipo === "produto" && a.disponivel != null && (
                      <span className={`whitespace-nowrap text-[12px] font-semibold ${a.disponivel > 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {a.disponivel > 0 ? `${a.disponivel.toLocaleString("pt-BR")} ${a.unidade ?? ""} disp.` : "Sem estoque"}
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {q.trim().length >= 2 && !buscando && !achados.length && <li className="py-6 text-center text-[14px] text-slate-500">Nada encontrado.</li>}
              {q.trim().length < 2 && <li className="py-6 text-center text-[13px] text-slate-400">Digite ao menos 2 letras. Todas as palavras valem, em qualquer ordem.</li>}
            </ul>
          </div>
        ) : (
          <div className="p-3">
            <div className="mb-3 rounded border bg-slate-50 p-3">
              <div className="text-[15px] font-medium">{escolhido.nome}</div>
              <div className="text-[12px] text-slate-500">{escolhido.codigo}{tipo === "produto" && escolhido.disponivel != null ? ` · ${escolhido.disponivel.toLocaleString("pt-BR")} disponível` : ""}</div>
              <button className="mt-1 text-[13px] text-sky-700 underline" onClick={() => setEscolhido(null)}>Trocar item</button>
            </div>
            <span className="rotulo">Quantidade</span>
            <div className="mb-3 flex items-center gap-2">
              <button className="btn-sec h-12 w-12 text-[20px]" onClick={() => mudar(-1)} aria-label="Menos">−</button>
              <input className="campo h-12 flex-1 text-center text-[18px]" inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} />
              <button className="btn-sec h-12 w-12 text-[20px]" onClick={() => mudar(1)} aria-label="Mais">+</button>
            </div>
            <span className="rotulo">Detalhes (opcional)</span>
            <input className="campo mb-3 h-11 text-[15px]" value={detalhes} onChange={(e) => setDetalhes(e.target.value)} placeholder="Ex.: instalado no rack da sala 2" />
            {tipo === "produto" && meuEstoque && (
              <label className="mb-3 flex items-center gap-3 rounded border px-3 py-3 text-[15px]">
                <input type="checkbox" className="h-5 w-5" checked={doCarro} onChange={(e) => setDoCarro(e.target.checked)} />
                <span>Saiu do meu carro <span className="block text-[12px] text-slate-500">{noCarro(escolhido.id).toLocaleString("pt-BR")} livre no seu estoque</span></span>
              </label>
            )}
            {tipo === "produto" && doCarro && quantidade > noCarro(escolhido.id) && (
              <p className="mb-2 rounded bg-amber-50 px-3 py-2 text-[13px] text-amber-900">O sistema mostra menos no seu carro: lança assim mesmo e o escritório acerta o seu estoque.</p>
            )}
            {tipo === "produto" && !doCarro && escolhido.disponivel != null && quantidade > escolhido.disponivel && (
              <p className="mb-2 rounded bg-amber-50 px-3 py-2 text-[13px] text-amber-900">Estoque não cobre tudo: o que faltar fica reservado como EM FALTA para o escritório comprar.</p>
            )}
            <div className="flex gap-2">
              <button className="btn-sec h-12 flex-1 text-[15px]" disabled={ocupado || !(quantidade > 0)} onClick={() => enviar(false)}>Lançar</button>
              <button className="btn h-12 flex-1 bg-emerald-600 text-[15px] hover:bg-emerald-700" disabled={ocupado || !(quantidade > 0)} onClick={() => enviar(true)}>Lançar já instalado</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
