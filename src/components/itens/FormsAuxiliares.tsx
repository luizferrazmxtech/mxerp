"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import Link from "next/link";
import { useState } from "react";
import Icone from "@/components/Icone";
import { Bloco, Campo } from "@/components/ui/Pagina";
import { salvarEtiquetaAcao, salvarGradeAcao, salvarGrupoAcao, salvarTipoValorAcao, salvarUnidadeAcao, type Resultado } from "@/lib/itens/auxiliares";
import { PADROES_ETIQUETA, PAGINAS, paginaDe, tamanhoPagina, type MedidasEtiqueta } from "@/lib/itens/etiquetas";
import { lerNumero } from "@/lib/itens/tipos";

function Rodape({ r, pendente, voltar, editando }: { r: Resultado; pendente: boolean; voltar: string; editando: boolean }) {
  return (
    <>
      {r && !r.ok && <p className="w-full rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">{r.mensagem}</p>}
      <div className="flex w-full gap-2"><Link href={voltar} className="btn-sec">Cancelar</Link><button className="btn ml-auto px-5" disabled={pendente}>{editando ? "Salvar" : "Cadastrar"}</button></div>
    </>
  );
}

export function FormGrupo({ g, grupos }: { g?: { id: string; nome: string; paiId: string | null }; grupos: { id: string; nome: string }[] }) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(salvarGrupoAcao, null);
  return (
    <form {...formAcao} className="cartao mb-3 flex flex-wrap items-end gap-3 p-4">
      {g && <input type="hidden" name="id" value={g.id} />}
      <label className="min-w-64 flex-1"><span className="rotulo obrig">Nome</span><input name="nome" defaultValue={g?.nome} required autoFocus className="campo" /></label>
      <label className="min-w-64 flex-1"><span className="rotulo">Grupo pai</span>
        <select name="paiId" defaultValue={g?.paiId ?? ""} className="campo"><option value="">Nenhum</option>{grupos.filter((x) => x.id !== g?.id).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
      <p className="w-full text-[12px] text-slate-500">Regras fiscais por grupo entram no módulo Fiscal.</p>
      <Rodape r={r} pendente={pendente} voltar="/grupos-produtos" editando={!!g} />
    </form>
  );
}

export function FormUnidade({ u }: { u?: { id: string; nome: string; sigla: string; padrao: boolean } }) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(salvarUnidadeAcao, null);
  return (
    <form {...formAcao} className="cartao mb-3 flex flex-wrap items-end gap-3 p-4">
      {u && <input type="hidden" name="id" value={u.id} />}
      <label className="min-w-64 flex-1"><span className="rotulo obrig">Nome</span><input name="nome" defaultValue={u?.nome} required autoFocus className="campo" placeholder="Ex.: Metro" /></label>
      <label className="w-32"><span className="rotulo obrig">Sigla</span><input name="sigla" defaultValue={u?.sigla} required maxLength={6} className="campo uppercase" placeholder="MT" /></label>
      <label className="w-32"><span className="rotulo">Padrão</span><select name="padrao" defaultValue={u?.padrao ? "1" : "0"} className="campo"><option value="0">Não</option><option value="1">Sim</option></select></label>
      <Rodape r={r} pendente={pendente} voltar="/unidades" editando={!!u} />
    </form>
  );
}

export function FormTipoValor({ t, lojas }: { t?: { id: string; nome: string; lucro: number; porRegras: boolean; padrao: boolean; lojas: string[] }; lojas: { id: string; nome: string }[] }) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(salvarTipoValorAcao, null);
  const marcadas = t?.lojas.length ? t.lojas : lojas.map((l) => l.id);
  return (
    <form {...formAcao}>
      {t && <input type="hidden" name="id" value={t.id} />}
      <Bloco icone="valor" titulo={<>Informe os <b>dados</b> do valor de venda</>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo rotulo="Nome" obrigatorio className="lg:col-span-2"><input name="nome" defaultValue={t?.nome} required autoFocus className="campo" placeholder="Ex.: Atacado" /></Campo>
          <Campo rotulo="Lucro (%)"><input name="lucro" defaultValue={t ? String(t.lucro).replace(".", ",") : ""} className="campo text-right" /></Campo>
          <Campo rotulo="Forma de utilização">
            <select name="porRegras" defaultValue={t?.porRegras ? "1" : "0"} className="campo"><option value="0">Ilimitada</option><option value="1">Através de regras</option></select>
          </Campo>
          <Campo rotulo="Padrão">
            <select name="padrao" defaultValue={t?.padrao ? "1" : "0"} className="campo"><option value="0">Não</option><option value="1">Sim: é o preço usado nas vendas, OS e PDV</option></select>
          </Campo>
        </div>
      </Bloco>
      <Bloco icone="lojas" titulo={<>Selecione as <b>lojas</b></>} subtitulo="Selecione ao menos uma loja">
        <div className="grid gap-2 sm:grid-cols-3">
          {lojas.map((l) => <label key={l.id} className="flex items-center gap-2 rounded border border-slate-200 p-3 text-[13px] uppercase"><input type="checkbox" name="lojas" value={l.id} defaultChecked={marcadas.includes(l.id)} /> <b>{l.nome}</b></label>)}
        </div>
      </Bloco>
      <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-2 border-t bg-white px-4 py-3 md:-mx-5 md:px-5"><Rodape r={r} pendente={pendente} voltar="/valores-venda" editando={!!t} /></div>
    </form>
  );
}

export function FormGrade({ g }: { g?: { id: string; nome: string; variacoes: string[] } }) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(salvarGradeAcao, null);
  const [vs, setVs] = useState(g?.variacoes.length ? g.variacoes : [""]);
  return (
    <form {...formAcao}>
      {g && <input type="hidden" name="id" value={g.id} />}
      <Bloco icone="editar" titulo={<>Informe o <b>nome</b> da grade</>}>
        <input name="nome" defaultValue={g?.nome} required autoFocus className="campo max-w-md" placeholder="Ex.: Tamanho" />
      </Bloco>
      <Bloco icone="lista" titulo={<>Cadastre as <b>variações</b> da grade</>}>
        {vs.map((v, i) => (
          <div key={i} className="mb-2 flex max-w-md items-center gap-2">
            <input name="variacao" value={v} onChange={(e) => setVs(vs.map((x, j) => (j === i ? e.target.value : x)))} className="campo" placeholder={`Variação ${i + 1}`} />
            <button type="button" className="btn-icone text-red-600" disabled={vs.length === 1} onClick={() => setVs(vs.filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button>
          </div>
        ))}
        <button type="button" className="btn-sec" onClick={() => setVs([...vs, ""])}><Icone nome="mais" size={14} /> Adicionar variação</button>
      </Bloco>
      <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-2 border-t bg-white px-4 py-3 md:-mx-5 md:px-5"><Rodape r={r} pendente={pendente} voltar="/grades" editando={!!g} /></div>
    </form>
  );
}

type Etiqueta = MedidasEtiqueta & { id?: string; nome: string; padrao: string; mostrarNome: boolean; mostrarPreco: boolean; mostrarCodigo: boolean; mostrarBarras: boolean };
const fmt = (v: number) => String(v).replace(".", ",");

/** Miniatura da folha com as etiquetas posicionadas (escala em px por cm). */
export function PreviaFolha({ m, escala = 12 }: { m: MedidasEtiqueta; escala?: number }) {
  const { largura: larg, altura: alt } = tamanhoPagina(m);
  const cabe = m.margemLateral + m.colunas * m.largura + (m.colunas - 1) * m.distHorizontal <= larg + 0.01 && m.margemSuperior + m.linhas * m.altura + (m.linhas - 1) * m.distVertical <= alt + 0.01;
  return (
    <div>
      <div className="relative mx-auto border border-slate-300 bg-white shadow" style={{ width: larg * escala, height: alt * escala }}>
        {Array.from({ length: Math.min(m.linhas, 60) }).flatMap((_, l) => Array.from({ length: Math.min(m.colunas, 20) }).map((__, c) => (
          <div key={`${l}-${c}`} className="absolute rounded-[2px] border border-marca/60 bg-marca/10"
            style={{ left: (m.margemLateral + c * (m.largura + m.distHorizontal)) * escala, top: (m.margemSuperior + l * (m.altura + m.distVertical)) * escala, width: m.largura * escala, height: m.altura * escala }} />
        )))}
      </div>
      <p className={`mt-2 text-center text-[12px] ${cabe ? "text-slate-500" : "font-semibold text-red-600"}`}>
        {cabe ? `${m.colunas * m.linhas} etiquetas por folha · ${fmt(m.largura)} × ${fmt(m.altura)} cm` : "As etiquetas não cabem na página: revise as medidas"}
      </p>
    </div>
  );
}

export function FormEtiqueta({ e }: { e?: Etiqueta }) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(salvarEtiquetaAcao, null);
  const [d, setD] = useState<Etiqueta>(e ? { ...e, pagina: paginaDe(e.pagina).chave } : { nome: "", padrao: "Personalizado", ...PADROES_ETIQUETA[0].medidas, mostrarNome: true, mostrarPreco: true, mostrarCodigo: true, mostrarBarras: true });
  const [txt, setTxt] = useState<Record<string, string>>(() => Object.fromEntries((["altura", "largura", "colunas", "linhas", "margemSuperior", "margemLateral", "distVertical", "distHorizontal"] as const).map((k) => [k, fmt(d[k])])));
  const med = (k: keyof MedidasEtiqueta) => ({
    name: k, className: "campo text-right", value: txt[k], required: true,
    onChange: (ev: React.ChangeEvent<HTMLInputElement>) => { setTxt({ ...txt, [k]: ev.target.value }); const n = lerNumero(ev.target.value); if (n != null) setD({ ...d, [k]: n }); },
  });
  const aplicarPadrao = (nome: string) => {
    const p = PADROES_ETIQUETA.find((x) => x.nome === nome);
    if (!p) { setD({ ...d, padrao: "Personalizado" }); return; }
    setD({ ...d, ...p.medidas, padrao: p.nome, nome: d.nome || p.nome });
    setTxt(Object.fromEntries(Object.entries(p.medidas).filter(([k]) => k !== "pagina").map(([k, v]) => [k, fmt(v as number)])));
  };
  const chk = (k: "mostrarNome" | "mostrarPreco" | "mostrarCodigo" | "mostrarBarras", rot: string) => (
    <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={d[k]} onChange={(ev) => setD({ ...d, [k]: ev.target.checked })} /> {rot}<input type="hidden" name={k} value={d[k] ? "1" : "0"} /></label>
  );
  return (
    <form {...formAcao}>
      {e?.id && <input type="hidden" name="id" value={e.id} />}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          <Bloco icone="etiqueta" titulo={<>Informe o <b>modelo</b> da etiqueta</>}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Padrão da etiqueta">
                <select name="padrao" className="campo" value={d.padrao} onChange={(ev) => aplicarPadrao(ev.target.value)}>
                  <option>Personalizado</option>{PADROES_ETIQUETA.map((p) => <option key={p.nome}>{p.nome}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Nome da etiqueta" obrigatorio><input name="nome" className="campo" required value={d.nome} onChange={(ev) => setD({ ...d, nome: ev.target.value })} /></Campo>
            </div>
          </Bloco>
          <Bloco icone="ajustes" titulo={<>Defina as <b>dimensões</b> da etiqueta e da página</>}>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Campo rotulo="Altura (cm)" obrigatorio><input {...med("altura")} /></Campo>
              <Campo rotulo="Largura (cm)" obrigatorio><input {...med("largura")} /></Campo>
              <Campo rotulo="Tamanho da página">
                <select name="pagina" className="campo" value={d.pagina} onChange={(ev) => setD({ ...d, pagina: ev.target.value })}>{PAGINAS.map((p) => <option key={p.chave} value={p.chave}>{p.rotulo}</option>)}</select>
              </Campo>
              <Campo rotulo="Colunas na página" obrigatorio><input {...med("colunas")} /></Campo>
              <Campo rotulo="Linhas na página" obrigatorio><input {...med("linhas")} /></Campo>
            </div>
          </Bloco>
          <Bloco icone="filtro" titulo={<>Ajuste as <b>margens e o espaçamento</b></>} subtitulo="Medidas em centímetros. A distância é o espaço entre uma etiqueta e a próxima.">
            <div className="grid gap-3 sm:grid-cols-4">
              <Campo rotulo="Margem superior" obrigatorio><input {...med("margemSuperior")} /></Campo>
              <Campo rotulo="Margem lateral" obrigatorio><input {...med("margemLateral")} /></Campo>
              <Campo rotulo="Distância vertical" obrigatorio><input {...med("distVertical")} /></Campo>
              <Campo rotulo="Distância horizontal" obrigatorio><input {...med("distHorizontal")} /></Campo>
            </div>
          </Bloco>
          <Bloco icone="imprimir" titulo={<>Configure a <b>impressão</b></>} subtitulo="O que aparece em cada etiqueta.">
            <div className="flex flex-wrap gap-5">{chk("mostrarNome", "Nome do produto")}{chk("mostrarPreco", "Valor de venda")}{chk("mostrarCodigo", "Código interno")}{chk("mostrarBarras", "Código de barras")}</div>
          </Bloco>
        </div>
        <div className="lg:sticky lg:top-16 lg:h-fit">
          <Bloco icone="olho" titulo={<><b>Pré-visualização</b> da folha</>}><PreviaFolha m={d} /></Bloco>
        </div>
      </div>
      <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-2 border-t bg-white px-4 py-3 md:-mx-5 md:px-5"><Rodape r={r} pendente={pendente} voltar="/etiquetas" editando={!!e?.id} /></div>
    </form>
  );
}
