"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import Link from "next/link";
import { useState } from "react";
import Icone from "@/components/Icone";
import { Bloco, Campo } from "@/components/ui/Pagina";
import { gerarCodigoServicoAcao, salvarServicoForm, type Resultado } from "@/lib/itens/acoes";
import type { DadosServico } from "@/lib/itens/tipos";
import AbasVerticais, { Ajuda, Fotos, LinhaToggle } from "./AbasVerticais";
import BuscaFornecedor from "./BuscaFornecedor";

export type InicialServico = DadosServico & { id?: string; fotos: string[] };
type Opcoes = { lojas: { id: string; nome: string; cnpj: string }[]; campos: { id: string; nome: string }[] };

const ABAS = [
  { chave: "dados", titulo: "Dados", sub: "Nome, código e valores", icone: "editar" },
  { chave: "detalhes", titulo: "Detalhes", sub: "Campos extras", icone: "detalhes" },
  { chave: "fotos", titulo: "Fotos", sub: "Imagens do serviço", icone: "foto" },
  { chave: "fiscal", titulo: "Fiscal", sub: "Atividade, códigos e alíquotas", icone: "fiscal" },
  { chave: "fornecedores", titulo: "Fornecedores", sub: "Quem presta ou fornece", icone: "fornecedores" },
  { chave: "lojas", titulo: "Lojas", sub: "Onde o serviço fica disponível", icone: "lojas" },
];

export default function FormServico({ inicial, op }: { inicial: InicialServico; op: Opcoes }) {
  const [d, setD] = useState(inicial);
  const [aba, setAba] = useState("dados");
  const [estado, , pendente, formAcao] = useFormAcao<Resultado>(salvarServicoForm, null);
  const [removidas, setRemovidas] = useState<string[]>([]);
  const set = <K extends keyof InicialServico>(k: K, v: InicialServico[K]) => setD((x) => ({ ...x, [k]: v }));
  const txt = (k: keyof DadosServico, extra = "") => ({ className: `campo ${extra}`, value: String(d[k] ?? ""), onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value as never) });

  return (
    <form {...formAcao}>
      <input type="hidden" name="dados" value={JSON.stringify(d)} />
      <input type="hidden" name="ordemFotos" value={d.fotos.join(",")} />
      {removidas.map((r) => <input key={r} type="hidden" name="removerFoto" value={r} />)}
      <div className="grid gap-4 lg:grid-cols-[230px_1fr]">
        <div><AbasVerticais abas={ABAS} ativa={aba} onTrocar={setAba} /></div>
        <div>
          <div hidden={aba !== "dados"}>
            <Bloco icone="editar" titulo={<>Informe os <b>dados principais</b> do serviço</>}>
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="lg:col-span-2">
                  <span className="rotulo obrig">Nome <Ajuda texto="Como o serviço aparece para o cliente." /></span>
                  <input {...txt("nome")} required autoFocus={!d.id} />
                </div>
                <div>
                  <span className="rotulo">Código interno</span>
                  <div className="flex"><input className="campo rounded-r-none" value={d.codigo} onChange={(e) => set("codigo", e.target.value)} />
                    <button type="button" className="btn-sec rounded-l-none border-l-0 px-2 text-[12px]" onClick={async () => set("codigo", await gerarCodigoServicoAcao())}><Icone nome="atualizar" size={13} /> Gerar</button></div>
                </div>
                <Campo rotulo="Comissão (%)"><input {...txt("comissao", "text-right")} /></Campo>
              </div>
              <div className="mt-3 max-w-xs"><LinhaToggle titulo="Serviço ativo" ligado={d.ativo} onChange={(v) => set("ativo", v)} /></div>
            </Bloco>
            <Bloco icone="dinheiro" titulo={<>Defina os <b>valores</b> do serviço</>}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Campo rotulo="Valor de custo (R$)"><input {...txt("custo", "text-right")} /></Campo>
                <div><span className="rotulo">Valor de venda (R$) <Ajuda texto="Por unidade: hora, visita, impressão…" /></span><input {...txt("preco", "text-right font-semibold")} /></div>
              </div>
            </Bloco>
            <Bloco icone="notas" titulo={<>Escreva a <b>descrição</b> do serviço</>} subtitulo="Sai nos orçamentos, ordens de serviço e notas.">
              <textarea rows={4} className="campo" value={d.descricao} onChange={(e) => set("descricao", e.target.value)} />
            </Bloco>
          </div>

          <div hidden={aba !== "detalhes"}>
            <Bloco icone="auxiliares" titulo={<>Adicione <b>campos extras</b> ao serviço</>} subtitulo="Os campos extras valem para produtos e serviços.">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {op.campos.map((c) => <Campo key={c.id} rotulo={c.nome}><input className="campo" value={d.camposExtras[c.id] ?? ""} onChange={(e) => set("camposExtras", { ...d.camposExtras, [c.id]: e.target.value })} /></Campo>)}
              </div>
              {!op.campos.length && <p className="text-[13px] text-slate-500">Nenhum campo extra cadastrado.</p>}
              <Link href="/campos-extras?entidade=PRODUTO" className="btn-sec mt-3"><Icone nome="mais" size={14} /> Adicionar campo extra</Link>
            </Bloco>
          </div>

          <div hidden={aba !== "fotos"}>
            <Bloco icone="foto" titulo={<>Adicione as <b>fotos</b> do serviço</>}>
              <Fotos existentes={d.fotos} url={(id) => `/api/cadastros/anexo/${id}`} onOrdem={(ids) => set("fotos", ids)}
                onRemover={(id) => { set("fotos", d.fotos.filter((x) => x !== id)); setRemovidas((r) => [...r, id]); }} />
            </Bloco>
          </div>

          <div hidden={aba !== "fiscal"}>
            <Bloco icone="fiscal" titulo={<>Informe os <b>dados fiscais</b> do serviço</>} subtitulo="Usados na emissão da NFS-e.">
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                <Campo rotulo="Atividade de serviço" className="lg:col-span-3"><input {...txt("atividade")} placeholder="Ex.: 14.01 Lubrificação, limpeza, revisão e conserto de máquinas e equipamentos" /></Campo>
                <Campo rotulo="Código do serviço (LC 116)"><input {...txt("codigoLc116")} placeholder="14.01" /></Campo>
                <div><span className="rotulo">Código de tributação nacional <Ajuda texto="6 dígitos (item, subitem e desdobramento da LC 116). Ex.: 14.01.01 → 140101. Obrigatório na NFS-e nacional." /></span><input {...txt("codigoTributacaoNacional")} /></div>
                <Campo rotulo="Código de tributação (municipal)"><input {...txt("codigoTributacaoMunicipal")} /></Campo>
                <Campo rotulo="Código NBS"><input {...txt("codigoNbs")} /></Campo>
                <Campo rotulo="CNAE"><input {...txt("cnae")} /></Campo>
                <Campo rotulo="Descrição da atividade"><input {...txt("descricaoAtividade")} /></Campo>
              </div>
            </Bloco>
            <Bloco icone="percentual" titulo={<>Defina as <b>alíquotas</b> dos tributos</>}>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {([["aliquotaIss", "ISS"], ["aliquotaCofins", "COFINS"], ["aliquotaPis", "PIS"], ["aliquotaCsll", "CSLL"], ["aliquotaIr", "IR"], ["aliquotaInss", "INSS"]] as const).map(([k, r]) => (
                  <Campo key={k} rotulo={`${r} (%)`}><input {...txt(k, "text-right")} /></Campo>
                ))}
              </div>
            </Bloco>
            <Bloco icone="ajustes" titulo={<>Ajuste as <b>opções de cálculo</b></>}>
              <div className="grid gap-3 lg:grid-cols-2">
                <LinhaToggle titulo="Descontar impostos do valor total" ligado={d.descontarImpostos} onChange={(v) => set("descontarImpostos", v)} />
                <LinhaToggle titulo="Descontar deduções no valor total" ligado={d.descontarDeducoes} onChange={(v) => set("descontarDeducoes", v)} />
                <LinhaToggle titulo="Serviço de construção civil" texto="Exige código da obra e ART na nota." ligado={d.construcaoCivil} onChange={(v) => set("construcaoCivil", v)} />
                <LinhaToggle titulo="Reter ISS" texto="O tomador recolhe o ISS." ligado={d.reterIss} onChange={(v) => set("reterIss", v)} />
              </div>
            </Bloco>
          </div>

          <div hidden={aba !== "fornecedores"}>
            <Bloco icone="fornecedores" titulo={<>Vincule os <b>fornecedores</b> do serviço</>} subtitulo="Quem presta ou fornece este serviço.">
              {d.fornecedores.map((f, i) => (
                <div key={i} className="mb-2 flex items-center gap-2 text-[13px]">
                  <span className="flex-1">{f.nome}</span>
                  <input className="campo w-48" placeholder="Código no fornecedor" value={f.codigo} onChange={(e) => set("fornecedores", d.fornecedores.map((x, j) => (j === i ? { ...x, codigo: e.target.value } : x)))} />
                  <button type="button" className="btn-icone text-red-600" onClick={() => set("fornecedores", d.fornecedores.filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button>
                </div>
              ))}
              {!d.fornecedores.length && <p className="mb-2 text-[13px] text-slate-500">Nenhum fornecedor vinculado.</p>}
              <div className="max-w-md"><BuscaFornecedor key={d.fornecedores.length} onEscolher={(p) => p && !d.fornecedores.some((x) => x.fornecedorId === p.id) && set("fornecedores", [...d.fornecedores, { fornecedorId: p.id, nome: p.nome, codigo: "" }])} /></div>
            </Bloco>
          </div>

          <div hidden={aba !== "lojas"}>
            <Bloco icone="lojas" titulo={<>Selecione as <b>lojas</b></>} subtitulo="Selecione ao menos uma loja" acoes={<span className="text-[12px] text-slate-500">{d.lojas.length} de {op.lojas.length} lojas selecionadas</span>}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {op.lojas.map((l) => {
                  const sel = d.lojas.includes(l.id);
                  return (
                    <button type="button" key={l.id} onClick={() => set("lojas", sel ? d.lojas.filter((x) => x !== l.id) : [...d.lojas, l.id])}
                      className={`flex items-center gap-3 rounded border p-3 text-left ${sel ? "border-marca bg-marca/5" : "border-slate-200"}`}>
                      <span className={`flex h-5 w-5 items-center justify-center rounded border ${sel ? "border-marca bg-marca text-white" : "border-slate-300"}`}>{sel && <Icone nome="ok" size={13} />}</span>
                      <span><b className="block text-[13px] uppercase">{l.nome}</b><span className="text-[11px] text-slate-500">{l.cnpj}{sel ? " · Disponível nesta loja" : ""}</span></span>
                    </button>
                  );
                })}
              </div>
            </Bloco>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-2px_6px_rgba(0,0,0,0.04)] md:-mx-5 md:px-5">
        {estado && !estado.ok && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">{estado.mensagem}</div>}
        <div className="flex items-center gap-3">
          <Link href={d.id ? `/servicos/${d.id}` : "/servicos"} className="btn-sec">Cancelar</Link>
          <button className="btn ml-auto px-5" disabled={pendente}>{pendente ? "Salvando…" : d.id ? "Salvar" : "Cadastrar"}</button>
        </div>
      </div>
    </form>
  );
}
