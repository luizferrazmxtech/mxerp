"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import Link from "next/link";
import { useState } from "react";
import type { LiberacaoComissao, PapelUsuario } from "@prisma/client";
import Icone from "@/components/Icone";
import { Bloco, Campo } from "@/components/ui/Pagina";
import { salvarFuncionarioForm, type Resultado } from "@/lib/cadastros/acoes";
import type { DadosFuncionario } from "@/lib/cadastros/funcionarios";
import { CidadeUF, buscarCep } from "./Endereco";
import { Toggle } from "./FormPessoa";

export type InicialFuncionario = DadosFuncionario & { id?: string; temFoto?: boolean; temSenha?: boolean };

export default function FormFuncionario({ inicial, lojas, liberacoes, papeis, admin }: {
  inicial: InicialFuncionario; lojas: { id: string; nome: string; cnpj: string }[];
  liberacoes: { valor: LiberacaoComissao; rotulo: string }[]; papeis: [string, string][]; admin: boolean;
}) {
  const [d, setD] = useState(inicial);
  const [estado, , pendente, formAcao] = useFormAcao<Resultado>(salvarFuncionarioForm, null);
  const [removerFoto, setRemoverFoto] = useState(false);
  const [anexos, setAnexos] = useState(1);
  const set = <K extends keyof InicialFuncionario>(k: K, v: InicialFuncionario[K]) => setD((x) => ({ ...x, [k]: v }));
  const cpf = (v: string) => v.replace(/\D/g, "").slice(0, 11).replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");

  return (
    <form {...formAcao}>
      <input type="hidden" name="dados" value={JSON.stringify(d)} />
      {removerFoto && <input type="hidden" name="removerFoto" value="1" />}

      <Bloco icone="editar" titulo={<>Preencha os <b>dados gerais</b> do funcionário</>} subtitulo="Informações básicas como nome, documentos e acesso ao sistema.">
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo rotulo="Nome" obrigatorio><input className="campo" required value={d.nome} onChange={(e) => set("nome", e.target.value)} autoFocus={!d.id} /></Campo>
          <Campo rotulo="CPF"><input className="campo" value={cpf(d.cpf)} onChange={(e) => set("cpf", e.target.value)} /></Campo>
          <Campo rotulo="RG"><input className="campo" value={d.rg} onChange={(e) => set("rg", e.target.value)} /></Campo>
          <Campo rotulo="Data de nascimento"><input className="campo" type="date" value={d.nascimento} onChange={(e) => set("nascimento", e.target.value)} /></Campo>
          <Campo rotulo="Sexo">
            <select className="campo" value={d.sexo} onChange={(e) => set("sexo", e.target.value)}>
              <option value="">Selecione</option><option value="M">Masculino</option><option value="F">Feminino</option>
            </select>
          </Campo>
          <Campo rotulo="E-mail"><input className="campo" type="email" value={d.email} onChange={(e) => set("email", e.target.value)} /></Campo>
          <Campo rotulo="Situação">
            <select className="campo" value={d.ativo ? "1" : "0"} onChange={(e) => set("ativo", e.target.value === "1")}>
              <option value="1">Ativo</option><option value="0">Inativo</option>
            </select>
          </Campo>
          <div className="flex items-end gap-4 pb-2 text-[13px]">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={d.tecnico} onChange={(e) => set("tecnico", e.target.checked)} /> Técnico</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={d.vendedor} onChange={(e) => set("vendedor", e.target.checked)} /> Vendedor</label>
          </div>
        </div>
        <div className="mt-3 rounded border border-slate-200 p-3">
          <div className="flex items-center gap-3">
            <Icone nome="chave" size={22} className="text-slate-600" />
            <div className="flex-1">
              <div className="text-[13px] font-semibold">Permitir acesso ao sistema</div>
              <div className="text-[11px] text-slate-500">O funcionário faz login com o e-mail acima.{!admin && " Só o administrador pode mudar o acesso."}</div>
            </div>
            {admin ? <Toggle ligado={d.acessoSistema} onChange={(v) => set("acessoSistema", v)} /> : <span className="text-[12px]">{d.acessoSistema ? "Liberado" : "Bloqueado"}</span>}
          </div>
          {admin && d.acessoSistema && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Campo rotulo="Perfil de acesso" className="lg:col-span-2">
                <select className="campo" value={d.papel} onChange={(e) => set("papel", e.target.value as PapelUsuario)}>
                  {papeis.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
              </Campo>
              <Campo rotulo={d.temSenha ? "Nova senha (deixe em branco para manter)" : "Senha inicial"} obrigatorio={!d.temSenha} className="lg:col-span-2">
                <input className="campo" type="password" autoComplete="new-password" minLength={8} value={d.senha} onChange={(e) => set("senha", e.target.value)} />
              </Campo>
            </div>
          )}
        </div>
        <Campo rotulo="Observações" className="mt-3"><textarea rows={4} className="campo" value={d.observacoes} onChange={(e) => set("observacoes", e.target.value)} /></Campo>
      </Bloco>

      <Bloco icone="percentual" titulo={<>Defina o <b>comissionamento</b></>} subtitulo="Percentual de comissão sobre as vendas e regra de liberação.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="rotulo">Comissão</span>
            <div className="flex"><input className="campo rounded-r-none text-right" inputMode="decimal" value={d.comissao} onChange={(e) => set("comissao", e.target.value)} />
              <span className="rounded-r border border-l-0 border-slate-300 bg-slate-50 px-2 py-[7px] text-[13px]">%</span></div>
            <p className="mt-1 text-[11px] text-slate-500">Percentual sobre as vendas do funcionário.</p>
          </div>
          <div className="lg:col-span-2">
            <span className="rotulo">Liberação da comissão</span>
            <select className="campo" value={d.liberacaoComissao} onChange={(e) => set("liberacaoComissao", e.target.value as LiberacaoComissao)}>
              {liberacoes.map((l) => <option key={l.valor} value={l.valor}>{l.rotulo}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">Quando a comissão fica disponível para o vendedor.</p>
          </div>
        </div>
      </Bloco>

      <Bloco icone="foto" titulo={<>Adicione uma <b>foto</b></>} subtitulo="Arquivos JPG ou GIF de até 5 MB.">
        <div className="flex flex-wrap items-center gap-4">
          {d.id && d.temFoto && !removerFoto && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/cadastros/foto/funcionario/${d.id}`} alt="" className="h-20 w-20 rounded object-cover" />
              <button type="button" className="btn-sec" onClick={() => setRemoverFoto(true)}>Remover foto</button>
            </>
          )}
          <label className="btn-sec cursor-pointer"><Icone nome="foto" size={14} /> Selecione uma foto
            <input type="file" name="foto" accept="image/jpeg,image/gif,image/png" className="hidden" />
          </label>
        </div>
      </Bloco>

      <Bloco icone="contatos" titulo={<>Registre os <b>contatos</b></>}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Telefone fixo"><input className="campo" value={d.telefone} onChange={(e) => set("telefone", e.target.value)} /></Campo>
          <Campo rotulo="Celular 1"><input className="campo" value={d.celular} onChange={(e) => set("celular", e.target.value)} /></Campo>
          <Campo rotulo="Celular 2"><input className="campo" value={d.celular2} onChange={(e) => set("celular2", e.target.value)} /></Campo>
        </div>
      </Bloco>

      <Bloco icone="endereco" titulo={<>Cadastre o <b>endereço</b></>}>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-12">
          <Campo rotulo="CEP" className="lg:col-span-2"><input className="campo" value={d.cep} inputMode="numeric"
            onChange={async (e) => { set("cep", e.target.value); const r = await buscarCep(e.target.value); if (r) setD((x) => ({ ...x, logradouro: r.logradouro, bairro: r.bairro, cidade: r.cidade, uf: r.uf, codigoMunicipio: r.codigoMunicipio })); }} /></Campo>
          <Campo rotulo="Logradouro" className="lg:col-span-6"><input className="campo" value={d.logradouro} onChange={(e) => set("logradouro", e.target.value)} /></Campo>
          <Campo rotulo="Número" className="lg:col-span-1"><input className="campo" value={d.numero} onChange={(e) => set("numero", e.target.value)} /></Campo>
          <Campo rotulo="Complemento" className="lg:col-span-3"><input className="campo" value={d.complemento} onChange={(e) => set("complemento", e.target.value)} /></Campo>
          <Campo rotulo="Bairro" className="lg:col-span-4"><input className="campo" value={d.bairro} onChange={(e) => set("bairro", e.target.value)} /></Campo>
          <div className="lg:col-span-4"><span className="rotulo">Cidade/UF</span><CidadeUF cidade={d.cidade} uf={d.uf} onChange={(m) => setD((x) => ({ ...x, ...m }))} /></div>
        </div>
      </Bloco>

      <Bloco icone="lojas" titulo={<>Selecione as <b>lojas de acesso</b></>} subtitulo="Selecione no mínimo uma loja."
        acoes={<span className="text-[12px] text-slate-500">{d.lojas.length} de {lojas.length} lojas selecionadas</span>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lojas.map((l) => {
            const sel = d.lojas.includes(l.id);
            return (
              <button type="button" key={l.id} onClick={() => set("lojas", sel ? d.lojas.filter((x) => x !== l.id) : [...d.lojas, l.id])}
                className={`flex items-center gap-3 rounded border p-3 text-left ${sel ? "border-marca bg-marca/5" : "border-slate-200 hover:bg-slate-50"}`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded border ${sel ? "border-marca bg-marca text-white" : "border-slate-300"}`}>{sel && <Icone nome="ok" size={13} />}</span>
                <span><span className="block text-[13px] font-semibold uppercase">{l.nome}</span><span className="text-[11px] text-slate-500">{l.cnpj}{sel ? " · Com acesso" : ""}</span></span>
              </button>
            );
          })}
        </div>
      </Bloco>

      <Bloco icone="anexos" titulo={<>Adicione <b>anexos</b></>} subtitulo="Tamanho máximo de 5 MB por arquivo.">
        <div className="space-y-2">{Array.from({ length: anexos }, (_, i) => <input key={i} type="file" name="anexos" className="block text-[13px]" />)}</div>
        <button type="button" className="btn-sec mt-2" onClick={() => setAnexos((n) => n + 1)}><Icone nome="mais" size={14} /> Adicionar anexo</button>
      </Bloco>

      <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-2px_6px_rgba(0,0,0,0.04)] md:-mx-5 md:px-5">
        {estado && !estado.ok && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">{estado.mensagem}</div>}
        <div className="flex items-center gap-3">
          <Link href={d.id ? `/funcionarios/${d.id}` : "/funcionarios"} className="btn-sec">Cancelar</Link>
          <button className="btn ml-auto px-5" disabled={pendente}>{pendente ? "Salvando…" : d.id ? "Salvar" : "Cadastrar"}</button>
        </div>
      </div>
    </form>
  );
}
