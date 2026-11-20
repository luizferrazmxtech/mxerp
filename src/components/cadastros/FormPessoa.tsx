"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import type { ContribuinteIcms, TipoCampoExtra, TipoPessoa } from "@prisma/client";
import Icone from "@/components/Icone";
import { Bloco, Campo } from "@/components/ui/Pagina";
import { consultarCnpjForm, salvarPessoaForm, type Resultado } from "@/lib/cadastros/acoes";
import { cnpjValido, erroDocumento } from "@/lib/cadastros/documentos";
import { contatoVazio, enderecoVazio, type ContatoForm, type DadosCnpj, type DadosPessoa, type EnderecoForm, type PapelPessoa } from "@/lib/cadastros/tipos";
import { CampoSugestao, CidadeUF, buscarCep } from "./Endereco";

export type CampoExtraForm = { id: string; nome: string; tipo: TipoCampoExtra; opcoes: string[]; obrigatorio: boolean };
export type InicialPessoa = DadosPessoa & { id?: string; temFoto?: boolean };

const ROTULO: Record<PapelPessoa, { de: string; tipo: string; base: string }> = {
  cliente: { de: "do cliente", tipo: "Tipo de cliente", base: "/clientes" },
  fornecedor: { de: "do fornecedor", tipo: "Tipo de fornecedor", base: "/fornecedores" },
  transportadora: { de: "da transportadora", tipo: "Tipo de transportadora", base: "/transportadoras" },
};


const mascaraDoc = (v: string, tipo: TipoPessoa) => {
  const d = v.replace(/\D/g, "");
  if (tipo === "FISICA") return d.slice(0, 11).replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
  if (tipo === "JURIDICA") return d.slice(0, 14).replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
  return v;
};

function Toggle({ ligado, onChange }: { ligado: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} onClick={() => onChange(!ligado)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${ligado ? "bg-marca" : "bg-slate-300"}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${ligado ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}
export { Toggle };

export default function FormPessoa({ papel, inicial, vendedores, tiposEndereco, tiposContato, camposExtras }: {
  papel: PapelPessoa; inicial: InicialPessoa; vendedores: { id: string; nome: string }[];
  tiposEndereco: string[]; tiposContato: string[]; camposExtras: CampoExtraForm[];
}) {
  const [d, setD] = useState(inicial);
  const [estado, acao, pendente] = useActionState<Resultado, FormData>(salvarPessoaForm, null);
  const [removerFoto, setRemoverFoto] = useState(false);
  const [anexos, setAnexos] = useState(1);
  const set = <K extends keyof InicialPessoa>(k: K, v: InicialPessoa[K]) => setD((x) => ({ ...x, [k]: v }));
  const setEnd = (i: number, m: Partial<EnderecoForm>) => setD((x) => ({ ...x, enderecos: x.enderecos.map((e, j) => (j === i ? { ...e, ...m } : e)) }));
  const setCon = (i: number, m: Partial<ContatoForm>) => setD((x) => ({ ...x, contatos: x.contatos.map((e, j) => (j === i ? { ...e, ...m } : e)) }));
  const r = ROTULO[papel];
  const tipos: { v: TipoPessoa; r: string }[] = [{ v: "FISICA", r: "Pessoa física" }, { v: "JURIDICA", r: "Pessoa jurídica" }, ...(papel !== "transportadora" ? [{ v: "ESTRANGEIRO" as TipoPessoa, r: "Estrangeiro" }] : [])];
  const cliente = papel === "cliente";

  // consulta do CNPJ: preenche nome, endereço, contato e inscrição estadual
  const [consulta, setConsulta] = useState<{ carregando: boolean; fontes?: string[]; avisos?: string[]; erro?: string } | null>(null);
  const ultimoCnpj = useRef(inicial.tipoPessoa === "JURIDICA" ? inicial.documento.replace(/\D/g, "") : "");
  const erroDoc = d.tipoPessoa && d.documento.replace(/\D/g, "").length >= (d.tipoPessoa === "FISICA" ? 11 : 14) ? erroDocumento(d.documento, d.tipoPessoa) : null;

  function aplicarCnpj(r: DadosCnpj) {
    setD((x) => {
      const atual = x.enderecos[0] ?? enderecoVazio();
      const enderecos = r.endereco ? [{ ...atual, ...r.endereco, tipo: atual.tipo || "Comercial" }, ...x.enderecos.slice(1)] : x.enderecos;
      return {
        ...x,
        nome: r.nomeFantasia || r.razaoSocial || x.nome,
        razaoSocial: r.razaoSocial || x.razaoSocial,
        email: x.email || r.email,
        telefone: x.telefone || r.telefone,
        inscricaoEstadual: r.inscricaoEstadual ?? x.inscricaoEstadual,
        ieIsento: r.inscricaoEstadual !== null ? false : x.ieIsento,
        contribuinteIcms: r.contribuinteIcms ?? x.contribuinteIcms,
        enderecos,
      };
    });
    // a ReceitaWS não traz o código IBGE do município (usado nas notas): completa pelo CEP
    if (r.endereco && !r.endereco.codigoMunicipio && r.endereco.cep) {
      buscarCep(r.endereco.cep).then((e) => { if (e?.codigoMunicipio) setEnd(0, { codigoMunicipio: e.codigoMunicipio, ...(r.endereco!.cidade ? {} : { cidade: e.cidade, uf: e.uf }) }); });
    }
  }

  async function consultarCnpj(valor: string) {
    const cnpj = valor.replace(/\D/g, "");
    if (!cnpjValido(cnpj)) { setConsulta({ carregando: false, erro: "CNPJ inválido: confira os dígitos" }); return; }
    ultimoCnpj.current = cnpj;
    setConsulta({ carregando: true });
    const r = await consultarCnpjForm(cnpj);
    if (ultimoCnpj.current !== cnpj) return; // o usuário já digitou outro
    if (!r.ok) { setConsulta({ carregando: false, erro: r.mensagem }); return; }
    aplicarCnpj(r.dados);
    setConsulta({ carregando: false, fontes: r.dados.fontes, avisos: r.dados.avisos });
  }

  function digitarCnpj(v: string) {
    set("documento", v);
    const cnpj = v.replace(/\D/g, "");
    // no cadastro novo, busca sozinho ao completar um CNPJ válido; na edição, só pelo botão
    if (!d.id && cnpj.length === 14 && cnpjValido(cnpj) && cnpj !== ultimoCnpj.current) consultarCnpj(cnpj);
    else if (cnpj.length < 14) setConsulta(null);
  }

  async function cep(i: number, v: string) {
    setEnd(i, { cep: v });
    const e = await buscarCep(v);
    if (e) setEnd(i, { logradouro: e.logradouro, bairro: e.bairro, cidade: e.cidade, uf: e.uf, codigoMunicipio: e.codigoMunicipio, ...(e.complemento ? { complemento: e.complemento } : {}) });
  }

  return (
    <form action={acao}>
      <input type="hidden" name="papel" value={papel} />
      <input type="hidden" name="dados" value={JSON.stringify(d)} />
      {removerFoto && <input type="hidden" name="removerFoto" value="1" />}

      <Bloco icone="editar" titulo={<>Preencha os <b>dados gerais</b> {r.de}</>} subtitulo="Informações básicas como tipo de pessoa, nome, documentos e contatos.">
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo rotulo={r.tipo} obrigatorio>
            <select className="campo" value={d.tipoPessoa ?? ""} onChange={(e) => set("tipoPessoa", e.target.value as TipoPessoa)} required>
              <option value="">Selecione</option>
              {tipos.map((t) => <option key={t.v} value={t.v}>{t.r}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Situação">
            <select className="campo" value={d.ativo ? "1" : "0"} onChange={(e) => set("ativo", e.target.value === "1")}>
              <option value="1">Ativo</option><option value="0">Inativo</option>
            </select>
          </Campo>
          <Campo rotulo="Nome" obrigatorio><input className="campo" required value={d.nome} onChange={(e) => set("nome", e.target.value)} autoFocus={!d.id} /></Campo>
          <Campo rotulo="E-mail"><input className="campo" type="email" value={d.email} onChange={(e) => set("email", e.target.value)} /></Campo>

          {d.tipoPessoa === "FISICA" && (
            <>
              <div>
                <span className="rotulo">CPF</span>
                <div className="flex">
                  <input className={`campo rounded-r-none ${erroDoc ? "border-red-400" : ""}`} value={mascaraDoc(d.documento, "FISICA")} onChange={(e) => set("documento", e.target.value)} />
                  <button type="button" className="btn-sec whitespace-nowrap rounded-l-none border-l-0 px-2 text-[12px]" disabled title="Consulta SERASA: integração ainda não contratada">Consulta SERASA</button>
                </div>
                {erroDoc && <p className="mt-1 text-[11px] text-red-600">{erroDoc}</p>}
              </div>
              <Campo rotulo="Nome social"><input className="campo" value={d.nomeSocial} onChange={(e) => set("nomeSocial", e.target.value)} /></Campo>
              <Campo rotulo="RG"><input className="campo" value={d.rg} onChange={(e) => set("rg", e.target.value)} /></Campo>
              <Campo rotulo="Nascimento"><input className="campo" type="date" value={d.nascimento} onChange={(e) => set("nascimento", e.target.value)} /></Campo>
            </>
          )}
          {d.tipoPessoa === "JURIDICA" && (
            <>
              <div>
                <span className="rotulo">CNPJ</span>
                <div className="flex">
                  <input className={`campo rounded-r-none ${erroDoc ? "border-red-400" : ""}`} value={mascaraDoc(d.documento, "JURIDICA")} onChange={(e) => digitarCnpj(e.target.value)} placeholder="Digite para buscar os dados" inputMode="numeric" />
                  <button type="button" className="btn-sec whitespace-nowrap rounded-l-none border-l-0 px-2 text-[12px]" disabled={consulta?.carregando}
                    title="Busca razão social, endereço e contato na Receita e a inscrição estadual na SEFAZ" onClick={() => consultarCnpj(d.documento)}>
                    <Icone nome={consulta?.carregando ? "atualizar" : "buscar"} size={13} className={consulta?.carregando ? "animate-spin" : ""} /> {consulta?.carregando ? "Buscando…" : "Buscar"}
                  </button>
                </div>
                {erroDoc ? <p className="mt-1 text-[11px] text-red-600">{erroDoc}</p>
                  : consulta?.erro ? <p className="mt-1 text-[11px] text-red-600">{consulta.erro}</p> : null}
              </div>
              <Campo rotulo="Razão social"><input className="campo" value={d.razaoSocial} onChange={(e) => set("razaoSocial", e.target.value)} /></Campo>
              <div>
                <span className="rotulo">Inscrição estadual</span>
                <div className="flex items-center gap-2">
                  <input className="campo" value={d.ieIsento ? "ISENTO" : d.inscricaoEstadual} disabled={d.ieIsento} onChange={(e) => set("inscricaoEstadual", e.target.value)} />
                  <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" checked={d.ieIsento} onChange={(e) => setD((x) => ({ ...x, ieIsento: e.target.checked, contribuinteIcms: e.target.checked ? "ISENTO" : x.contribuinteIcms }))} /> ISENTO</label>
                </div>
              </div>
              <Campo rotulo="Inscrição municipal"><input className="campo" value={d.inscricaoMunicipal} onChange={(e) => set("inscricaoMunicipal", e.target.value)} /></Campo>
              <Campo rotulo="Inscrição SUFRAMA"><input className="campo" value={d.suframa} onChange={(e) => set("suframa", e.target.value)} /></Campo>
              <Campo rotulo="Responsável"><input className="campo" value={d.responsavel} onChange={(e) => set("responsavel", e.target.value)} /></Campo>
              {!erroDoc && !!(consulta?.fontes?.length || consulta?.avisos?.length) && (
                <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] sm:col-span-2 lg:col-span-4">
                  {!!consulta.fontes?.length && <div className="flex items-center gap-1 text-emerald-700"><Icone nome="ok" size={13} /> Preenchido com {consulta.fontes.join(" · ")}. Confira antes de salvar.</div>}
                  {consulta.avisos?.map((x) => <div key={x} className="mt-0.5 flex items-center gap-1 text-amber-700"><Icone nome="alerta" size={13} /> {x}</div>)}
                </div>
              )}
            </>
          )}
          {d.tipoPessoa === "ESTRANGEIRO" && (
            <>
              <Campo rotulo="Documento"><input className="campo" value={d.documento} onChange={(e) => set("documento", e.target.value)} placeholder="Passaporte ou ID estrangeiro" /></Campo>
              <Campo rotulo="País"><input className="campo" value={d.pais} onChange={(e) => set("pais", e.target.value)} /></Campo>
            </>
          )}
          {d.tipoPessoa && d.tipoPessoa !== "ESTRANGEIRO" && (
            <Campo rotulo="Tipo de contribuinte">
              <select className="campo" value={d.contribuinteIcms ?? ""} onChange={(e) => set("contribuinteIcms", e.target.value as ContribuinteIcms)}>
                <option value="CONTRIBUINTE">Contribuinte ICMS</option>
                <option value="ISENTO">Contribuinte ISENTO</option>
                <option value="NAO_CONTRIBUINTE">Não contribuinte</option>
              </select>
            </Campo>
          )}

          <Campo rotulo={cliente ? "Telefone comercial" : "Telefone"}><input className="campo" value={d.telefone} onChange={(e) => set("telefone", e.target.value)} /></Campo>
          <Campo rotulo={cliente ? "Telefone celular" : "Celular"}><input className="campo" value={d.celular} onChange={(e) => set("celular", e.target.value)} /></Campo>
          {cliente && (
            <>
              <Campo rotulo="FAX"><input className="campo" value={d.fax} onChange={(e) => set("fax", e.target.value)} /></Campo>
              <Campo rotulo="Site"><input className="campo" value={d.site} onChange={(e) => set("site", e.target.value)} /></Campo>
              <div>
                <span className="rotulo">Vendedor / Responsável</span>
                <div className="flex items-center gap-1">
                  <select className="campo" value={d.vendedorId} onChange={(e) => set("vendedorId", e.target.value)}>
                    <option value="">—</option>
                    {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                  </select>
                  <button type="button" className="btn-icone" title="Limpar" onClick={() => set("vendedorId", "")}><Icone nome="excluir" size={13} /></button>
                </div>
              </div>
            </>
          )}
        </div>
      </Bloco>

      <Bloco icone="endereco" titulo={<>Cadastre os <b>endereços</b></>} subtitulo={`Adicione os endereços ${r.de}. É possível cadastrar mais de um endereço.`}>
        {d.enderecos.map((e, i) => (
          <div key={i} className={`grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-12 ${i ? "mt-4 border-t border-dashed border-slate-200 pt-4" : ""}`}>
            <Campo rotulo="Tipo" className="lg:col-span-2"><CampoSugestao valor={e.tipo} opcoes={tiposEndereco} onChange={(v) => setEnd(i, { tipo: v })} /></Campo>
            <Campo rotulo="CEP" className="lg:col-span-3"><input className="campo" value={e.cep} onChange={(x) => cep(i, x.target.value)} inputMode="numeric" /></Campo>
            <Campo rotulo="Logradouro" className="lg:col-span-5"><input className="campo" value={e.logradouro} onChange={(x) => setEnd(i, { logradouro: x.target.value })} /></Campo>
            <Campo rotulo="Número" className="lg:col-span-2"><input className="campo" value={e.numero} onChange={(x) => setEnd(i, { numero: x.target.value })} /></Campo>
            <Campo rotulo="Complemento" className="lg:col-span-4"><input className="campo" value={e.complemento} onChange={(x) => setEnd(i, { complemento: x.target.value })} /></Campo>
            <Campo rotulo="Bairro" className="lg:col-span-4"><input className="campo" value={e.bairro} onChange={(x) => setEnd(i, { bairro: x.target.value })} /></Campo>
            <div className="lg:col-span-4">
              <span className="rotulo">Cidade/UF</span>
              <div className="flex items-center gap-1">
                <div className="flex-1"><CidadeUF cidade={e.cidade} uf={e.uf} onChange={(m) => setEnd(i, m)} /></div>
                {d.enderecos.length > 1 && <button type="button" className="btn-icone text-red-600" title="Remover endereço" onClick={() => set("enderecos", d.enderecos.filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button>}
              </div>
            </div>
          </div>
        ))}
        <button type="button" className="btn-sec mt-3" onClick={() => set("enderecos", [...d.enderecos, enderecoVazio()])}><Icone nome="mais" size={14} /> Adicionar endereço</button>
      </Bloco>

      <Bloco icone="auxiliares" titulo={<>Registre os <b>contatos</b></>} subtitulo={`Adicione contatos adicionais vinculados a ${papel === "transportadora" ? "esta transportadora" : `este ${papel}`}.`}>
        {d.contatos.map((c, i) => (
          <div key={i} className="mb-3 grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-12">
            <Campo rotulo="Tipo" className="lg:col-span-2">
              <select className="campo" value={c.tipo} onChange={(x) => setCon(i, { tipo: x.target.value })}>
                <option value="">Selecione</option>
                {tiposContato.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Nome" className="lg:col-span-3"><input className="campo" value={c.nome} onChange={(x) => setCon(i, { nome: x.target.value })} /></Campo>
            <Campo rotulo="Contato" className="lg:col-span-3"><input className="campo" value={c.contato} onChange={(x) => setCon(i, { contato: x.target.value })} /></Campo>
            <Campo rotulo="Cargo" className="lg:col-span-2"><input className="campo" value={c.cargo} onChange={(x) => setCon(i, { cargo: x.target.value })} /></Campo>
            <div className="lg:col-span-2">
              <span className="rotulo">Observação</span>
              <div className="flex items-center gap-1">
                <input className="campo" value={c.observacao} onChange={(x) => setCon(i, { observacao: x.target.value })} />
                <button type="button" className="btn-icone text-red-600" title="Remover contato" onClick={() => set("contatos", d.contatos.filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button>
              </div>
            </div>
          </div>
        ))}
        <button type="button" className="btn-sec" onClick={() => set("contatos", [...d.contatos, contatoVazio()])}><Icone nome="mais" size={14} /> Adicionar contato</button>
      </Bloco>

      {cliente && (
        <Bloco icone="valor" titulo={<>Defina o <b>limite de crédito</b> do cliente</>} subtitulo="Para não limitar o crédito do cliente, deixe o campo em branco.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="Limite de crédito (R$)"><input className="campo text-right" inputMode="decimal" value={d.limiteCredito} onChange={(e) => set("limiteCredito", e.target.value)} /></Campo>
            <div className="flex items-center gap-3 rounded border border-slate-200 px-3 py-2 lg:col-span-2">
              <div className="flex-1"><div className="text-[13px] font-semibold">Permitir exceder o limite</div><div className="text-[11px] text-slate-500">A venda passa mesmo quando o cliente já estourou o crédito.</div></div>
              <Toggle ligado={d.excederLimite} onChange={(v) => set("excederLimite", v)} />
            </div>
          </div>
        </Bloco>
      )}

      {cliente && (
        <Bloco icone="foto" titulo={<>Adicione uma <b>foto</b></>} subtitulo="Arquivos JPG ou GIF de até 5 MB.">
          <div className="flex flex-wrap items-center gap-4">
            {d.id && d.temFoto && !removerFoto && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/cadastros/foto/pessoa/${d.id}`} alt="" className="h-20 w-20 rounded object-cover" />
                <button type="button" className="btn-sec" onClick={() => setRemoverFoto(true)}>Remover foto</button>
              </>
            )}
            <label className="btn-sec cursor-pointer"><Icone nome="foto" size={14} /> Selecione uma foto
              <input type="file" name="foto" accept="image/jpeg,image/gif,image/png" className="hidden" onChange={(e) => { if (e.target.files?.length) setRemoverFoto(false); }} />
            </label>
          </div>
        </Bloco>
      )}

      {papel !== "transportadora" && (
        <Bloco icone="anexos" titulo={<>Adicione <b>anexos</b></>} subtitulo="Tamanho máximo de 5 MB por arquivo.">
          <div className="space-y-2">
            {Array.from({ length: anexos }, (_, i) => <input key={i} type="file" name="anexos" className="block text-[13px]" />)}
          </div>
          <button type="button" className="btn-sec mt-2" onClick={() => setAnexos((n) => n + 1)}><Icone nome="mais" size={14} /> Adicionar anexo</button>
          {d.id && <p className="mt-2 text-[11px] text-slate-500">Os anexos já enviados ficam na aba Anexos da visualização.</p>}
        </Bloco>
      )}

      <Bloco icone="notas" titulo={<>Adicione <b>observações</b></>}>
        <textarea rows={3} className="campo" value={d.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
      </Bloco>

      {cliente && camposExtras.length > 0 && (
        <Bloco icone="ajustes" titulo={<>Preencha os <b>campos extras</b></>}>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {camposExtras.map((c) => {
              const v = d.camposExtras[c.id];
              const setV = (x: string | string[]) => set("camposExtras", { ...d.camposExtras, [c.id]: x });
              return (
                <Campo key={c.id} rotulo={c.nome} obrigatorio={c.obrigatorio}>
                  {c.tipo === "SELECAO_UNICA" ? (
                    <select className="campo" value={String(v ?? "")} onChange={(e) => setV(e.target.value)}>
                      <option value="">Selecione</option>{c.opcoes.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  ) : c.tipo === "MULTIPLA_SELECAO" ? (
                    <span className="flex flex-wrap gap-x-3 gap-y-1 rounded border border-slate-300 px-2 py-1.5 text-[13px]">
                      {c.opcoes.map((o) => {
                        const arr = Array.isArray(v) ? v : [];
                        return <label key={o} className="flex items-center gap-1"><input type="checkbox" checked={arr.includes(o)} onChange={(e) => setV(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))} /> {o}</label>;
                      })}
                    </span>
                  ) : (
                    <input className="campo" type={c.tipo === "DATA" ? "date" : "text"} inputMode={c.tipo === "TEXTO" ? undefined : "numeric"} value={String(v ?? "")}
                      onChange={(e) => setV(c.tipo === "CPF" ? mascaraDoc(e.target.value, "FISICA") : c.tipo === "CNPJ" ? mascaraDoc(e.target.value, "JURIDICA") : c.tipo === "NUMEROS" ? e.target.value.replace(/[^\d,.-]/g, "") : e.target.value)} />
                  )}
                </Campo>
              );
            })}
          </div>
        </Bloco>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-2px_6px_rgba(0,0,0,0.04)] md:-mx-5 md:px-5">
        {estado && !estado.ok && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">{estado.mensagem}</div>}
        <div className="flex items-center gap-3">
          <Link href={d.id ? `${r.base}/${d.id}` : r.base} className="btn-sec">Cancelar</Link>
          <button className="btn ml-auto px-5" disabled={pendente}>{pendente ? "Salvando…" : d.id ? "Salvar" : "Cadastrar"}</button>
        </div>
      </div>
    </form>
  );
}
