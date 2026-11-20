"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icone from "@/components/Icone";
import { buscarCep } from "@/components/cadastros/Endereco";
import { Bloco, Campo } from "@/components/ui/Pagina";
import { cnpjValido } from "@/lib/cadastros/documentos";
import type { DadosCnpj } from "@/lib/cadastros/tipos";
import { consultarCnpjEmpresa, salvarEmpresa, testarSefaz, type Res } from "../actions";

type Dados = {
  id: string; razaoSocial: string; nomeFantasia: string | null; cnpj: string; ie: string | null; im: string | null; cnae: string | null;
  regime: string; logradouro: string | null; complemento: string | null; numero: string | null; bairro: string | null; cidade: string | null; codigoMunicipio: string | null;
  uf: string | null; cep: string | null; telefone: string | null; email: string | null; ativa: boolean;
  ambiente: string; ambienteNfse: string; serieNfe: number; serieNfce: number; serieDps: number; regimeEspecialNfse: number;
  cscId: string | null; temCsc: boolean; infCplNfe: string | null; infCplNfse: string | null;
  certificado: { titular: string | null; validade: string } | null;
};

const REG_ESP: [number, string][] = [
  [0, "Nenhum"], [1, "Ato cooperado"], [2, "Estimativa"], [3, "Microempresa municipal"], [4, "Notário ou registrador"],
  [5, "Profissional autônomo"], [6, "Sociedade de profissionais"],
];

export default function FormEmpresa({ e, ultimos, certificadoServidor }: {
  e: Dados | null; ultimos: { nfe: number; nfce: number; dps: number }; certificadoServidor: boolean;
}) {
  const [estado, acao, pendente] = useActionState<Res, FormData>(salvarEmpresa, null);
  const [teste, testar, testando] = useActionState<Res, FormData>(testarSefaz, null);
  const router = useRouter();
  useEffect(() => {
    if (estado?.ok && estado.id && !e) router.replace(`/empresas/${estado.id}`);
  }, [estado, e, router]);

  const t = (name: string, rotulo: string, v?: string | number | null, cls = "", extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Campo rotulo={rotulo} className={cls}><input name={name} defaultValue={v ?? ""} className="campo" {...extra} /></Campo>
  );
  const ambiente = (name: string, v: string) => (
    <Campo rotulo="Ambiente">
      <select name={name} defaultValue={v} className="campo">
        <option value="HOMOLOGACAO">Homologação (testes, sem valor fiscal)</option>
        <option value="PRODUCAO">Produção (valor fiscal)</option>
      </select>
    </Campo>
  );
  const venc = e?.certificado ? new Date(e.certificado.validade) : null;

  // busca pelo CNPJ: preenche os campos (o formulário é não controlado, então escreve direto nos inputs)
  const formRef = useRef<HTMLFormElement>(null);
  const ultimoCnpj = useRef(e?.cnpj.replace(/\D/g, "") ?? "");
  const [consulta, setConsulta] = useState<{ carregando: boolean; fontes?: string[]; avisos?: string[]; erro?: string } | null>(null);
  const campo = (nome: string) => formRef.current?.elements.namedItem(nome) as HTMLInputElement | HTMLSelectElement | null;
  const por = (nome: string, v: string | null | undefined, soSeVazio = false) => {
    const el = campo(nome);
    if (el && v && (!soSeVazio || !el.value.trim())) el.value = v;
  };
  function aplicar(r: DadosCnpj) {
    por("razaoSocial", r.razaoSocial);
    por("nomeFantasia", r.nomeFantasia);
    if (r.inscricaoEstadual !== null) { const el = campo("ie"); if (el) el.value = r.inscricaoEstadual; }
    por("cnae", r.cnae);
    // "Simples (excesso de sublimite)" a Receita não informa: não troca quem já escolheu
    if (r.regime && !(r.regime === "SIMPLES_NACIONAL" && campo("regime")?.value === "SIMPLES_EXCESSO_SUBLIMITE")) por("regime", r.regime);
    if (r.endereco) {
      por("logradouro", r.endereco.logradouro);
      { const c = campo("complemento"); if (c) c.value = r.endereco.complemento; }
      por("numero", r.endereco.numero); por("bairro", r.endereco.bairro); por("cidade", r.endereco.cidade);
      por("codigoMunicipio", r.endereco.codigoMunicipio); por("uf", r.endereco.uf); por("cep", r.endereco.cep);
      if (!r.endereco.codigoMunicipio && r.endereco.cep) buscarCep(r.endereco.cep).then((x) => por("codigoMunicipio", x?.codigoMunicipio));
    }
    por("telefone", r.telefone, true);
    por("email", r.email, true);
  }
  async function consultar(valor: string) {
    const cnpj = valor.replace(/\D/g, "");
    if (!cnpjValido(cnpj)) { setConsulta({ carregando: false, erro: "CNPJ inválido: confira os dígitos" }); return; }
    ultimoCnpj.current = cnpj;
    setConsulta({ carregando: true });
    const r = await consultarCnpjEmpresa(cnpj, e?.id);
    if (ultimoCnpj.current !== cnpj) return;
    if (!r.ok) { setConsulta({ carregando: false, erro: r.mensagem }); return; }
    aplicar(r.dados);
    setConsulta({ carregando: false, fontes: r.dados.fontes, avisos: r.dados.avisos });
  }
  function digitar(v: string) {
    const cnpj = v.replace(/\D/g, "");
    if (cnpj.length === 14 && !cnpjValido(cnpj)) setConsulta({ carregando: false, erro: "CNPJ inválido: confira os dígitos" });
    else if (!e && cnpj.length === 14 && cnpj !== ultimoCnpj.current) consultar(cnpj);
    else if (cnpj.length < 14) setConsulta(null);
  }

  return (
    <>
    <form action={acao} ref={formRef}>
      {e && <input type="hidden" name="id" value={e.id} />}
      <input type="hidden" name="ultimaNfeAntes" value={ultimos.nfe} />
      <input type="hidden" name="ultimaNfceAntes" value={ultimos.nfce} />
      <input type="hidden" name="ultimaDpsAntes" value={ultimos.dps} />

      <Bloco icone="lojas" titulo={<>Informe os <b>dados da loja</b></>} subtitulo="Identificação, contato e endereço fiscal (saem nas notas e nos impressos).">
        <div className="grid gap-3 md:grid-cols-4">
          {t("nomeFantasia", "Nome fantasia (nome da loja)", e?.nomeFantasia)}
          {t("razaoSocial", "Razão social", e?.razaoSocial, "md:col-span-2", { required: true })}
          <div>
            <span className="rotulo">CNPJ <span className="text-red-600">*</span></span>
            <div className="flex">
              <input name="cnpj" defaultValue={e?.cnpj ?? ""} required className="campo rounded-r-none" inputMode="numeric"
                placeholder="Digite para buscar os dados" onChange={(x) => digitar(x.target.value)} />
              <button type="button" className="btn-sec whitespace-nowrap rounded-l-none border-l-0 px-2 text-[12px]" disabled={consulta?.carregando}
                title="Busca razão social, endereço e contato na Receita e a inscrição estadual na SEFAZ" onClick={() => consultar(campo("cnpj")?.value ?? "")}>
                <Icone nome={consulta?.carregando ? "atualizar" : "buscar"} size={13} className={consulta?.carregando ? "animate-spin" : ""} /> {consulta?.carregando ? "Buscando…" : "Buscar"}
              </button>
            </div>
            {consulta?.erro && <p className="mt-1 text-[11px] text-red-600">{consulta.erro}</p>}
          </div>
          {t("ie", "Inscrição estadual (ou ISENTO)", e?.ie)}
          {t("im", "Inscrição municipal", e?.im)}
          {t("cnae", "CNAE", e?.cnae)}
          <Campo rotulo="Regime tributário">
            <select name="regime" defaultValue={e?.regime ?? "SIMPLES_NACIONAL"} className="campo">
              <option value="SIMPLES_NACIONAL">Simples Nacional</option>
              <option value="SIMPLES_EXCESSO_SUBLIMITE">Simples (excesso de sublimite)</option>
              <option value="MEI">MEI</option>
              <option value="REGIME_NORMAL">Regime normal</option>
            </select>
          </Campo>
          {t("logradouro", "Logradouro", e?.logradouro, "md:col-span-2")}
          {t("numero", "Número", e?.numero)}
          {t("complemento", "Complemento", e?.complemento)}
          {t("bairro", "Bairro", e?.bairro)}
          {t("cidade", "Cidade", e?.cidade)}
          <input type="hidden" name="codigoMunicipio" defaultValue={e?.codigoMunicipio ?? ""} />
          {t("uf", "UF", e?.uf, "", { maxLength: 2 })}
          {t("cep", "CEP", e?.cep)}
          {!!(consulta?.fontes?.length || consulta?.avisos?.length) && (
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] md:col-span-4">
              {!!consulta.fontes?.length && <div className="flex items-center gap-1 text-emerald-700"><Icone nome="ok" size={13} /> Preenchido com {consulta.fontes.join(" · ")}. Confira antes de salvar.</div>}
              {consulta.avisos?.map((x) => <div key={x} className="mt-0.5 flex items-center gap-1 text-amber-700"><Icone nome="alerta" size={13} /> {x}</div>)}
              {!venc && <div className="mt-0.5 text-slate-600">Ao enviar o certificado A1 abaixo, a inscrição estadual é conferida na SEFAZ.</div>}
            </div>
          )}
          {t("telefone", "Telefone", e?.telefone)}
          {t("email", "E-mail", e?.email, "md:col-span-2")}
          {e && (
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="ativa" defaultChecked={e.ativa} /> Loja ativa</label>
          )}
        </div>
      </Bloco>

      <Bloco icone="senha" titulo={<>Escolha o <b>certificado digital</b> da empresa</>}
        subtitulo="Certificado A1 (.pfx). Ele assina as notas e acessa a SEFAZ e a NFS-e Nacional. Fica guardado cifrado; a senha nunca aparece de novo.">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="text-[13px] md:col-span-4">
            {venc ? (
              <span className={venc < new Date() ? "text-red-700" : "text-emerald-700"}>
                Certificado de {e?.certificado?.titular ?? "—"}, válido até {venc.toLocaleDateString("pt-BR")}.
              </span>
            ) : certificadoServidor ? (
              <span className="text-slate-600">Sem certificado próprio: usa o do servidor (só vale se for deste CNPJ).</span>
            ) : (
              <span className="text-amber-700">Nenhum certificado enviado: esta loja ainda não emite notas.</span>
            )}
          </div>
          <Campo rotulo={venc ? "Trocar certificado (.pfx)" : "Arquivo do certificado (.pfx)"} className="md:col-span-2">
            <input type="file" name="certificado" accept=".pfx,.p12,application/x-pkcs12" className="campo" />
          </Campo>
          <Campo rotulo="Senha do certificado"><input type="password" name="certificadoSenha" autoComplete="new-password" className="campo" /></Campo>
          {venc && <label className="flex items-end gap-2 pb-2 text-[13px]"><input type="checkbox" name="removerCertificado" /> Remover certificado</label>}
        </div>
      </Bloco>

      <Bloco icone="notas" titulo={<>Configure a <b>NF-e e a NFC-e</b> (peças e produtos)</>}
        subtitulo="Só para CNPJ com inscrição estadual. Em “Última emitida”, informe o número da última nota do sistema anterior: a próxima sai com o seguinte.">
        <div className="grid gap-3 md:grid-cols-4">
          {ambiente("ambiente", e?.ambiente ?? "HOMOLOGACAO")}
          {t("serieNfe", "Série da NF-e", e?.serieNfe ?? 1, "", { type: "number", min: 0 })}
          {t("ultimaNfe", "Última NF-e emitida", ultimos.nfe, "", { type: "number", min: 0 })}
          <span />
          <span />
          {t("serieNfce", "Série da NFC-e", e?.serieNfce ?? 1, "", { type: "number", min: 0 })}
          {t("ultimaNfce", "Última NFC-e emitida", ultimos.nfce, "", { type: "number", min: 0 })}
          <span />
          {t("cscId", "ID do CSC (NFC-e)", e?.cscId, "", { placeholder: "000001" })}
          <Campo rotulo={`CSC (NFC-e)${e?.temCsc ? " · já cadastrado, deixe em branco para manter" : ""}`} className="md:col-span-3">
            <input name="cscToken" type="password" autoComplete="off" className="campo" />
          </Campo>
          {t("infCplNfe", "Informações complementares (saem em toda NF-e/NFC-e)", e?.infCplNfe, "md:col-span-4")}
        </div>
      </Bloco>

      <Bloco icone="servicos" titulo={<>Configure a <b>NFS-e</b> (serviços, padrão nacional)</>}
        subtitulo="Emitida na NFS-e Nacional (São Carlos usa o padrão nacional). Precisa da inscrição municipal e do código de tributação nacional em cada serviço.">
        <div className="grid gap-3 md:grid-cols-4">
          {ambiente("ambienteNfse", e?.ambienteNfse ?? "HOMOLOGACAO")}
          {t("serieDps", "Série da DPS (RPS)", e?.serieDps ?? 1, "", { type: "number", min: 1 })}
          {t("ultimaDps", "Último número de DPS (RPS)", ultimos.dps, "", { type: "number", min: 0 })}
          <Campo rotulo="Regime especial de tributação">
            <select name="regimeEspecialNfse" defaultValue={e?.regimeEspecialNfse ?? 0} className="campo">
              {REG_ESP.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </Campo>
          {t("infCplNfse", "Texto acrescentado na descrição de toda NFS-e", e?.infCplNfse, "md:col-span-4")}
        </div>
      </Bloco>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-verde" disabled={pendente}>{pendente ? "Salvando…" : "Salvar"}</button>
        {estado && <span className={`text-sm ${estado.ok ? "text-emerald-700" : "text-red-700"}`}>{estado.mensagem}</span>}
      </div>

    </form>
      {e && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="text-[13px] text-slate-600">Testar certificado e SEFAZ (salve antes):</span>
          {["55", "65"].map((m) => (
            <form key={m} action={testar}>
              <input type="hidden" name="id" value={e.id} />
              <input type="hidden" name="modelo" value={m} />
              <button className="btn-sec" disabled={testando}>{m === "55" ? "NF-e" : "NFC-e"}</button>
            </form>
          ))}
          {teste && <span className={`text-sm ${teste.ok ? "text-emerald-700" : "text-red-700"}`}>{teste.mensagem}</span>}
        </div>
      )}
    </>
  );
}
