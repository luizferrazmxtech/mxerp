"use client";

import { useActionState } from "react";
import type { Empresa } from "@prisma/client";
import { salvarEmpresa, type Res } from "./actions";

export default function ConfigEmpresa({ e }: { e: Empresa | null }) {
  const [estado, acao, pendente] = useActionState<Res, FormData>(salvarEmpresa, null);
  const c = (name: string, ph: string, v?: string | number | null, cls = "") => (
    <label className={`text-xs text-slate-500 ${cls}`}>{ph}
      <input name={name} defaultValue={v ?? ""} className="campo mt-1" />
    </label>
  );
  return (
    <form action={acao} className="cartao grid gap-3 p-4 md:grid-cols-4">
      <h2 className="font-semibold md:col-span-4">Dados da empresa (emitente)</h2>
      {c("razaoSocial", "Razão social", e?.razaoSocial, "md:col-span-2")}
      {c("nomeFantasia", "Nome fantasia", e?.nomeFantasia)}
      {c("cnpj", "CNPJ", e?.cnpj)}
      {c("ie", "Inscrição estadual", e?.inscricaoEstadual)}
      {c("im", "Inscrição municipal", e?.inscricaoMunicipal)}
      {c("cnae", "CNAE", e?.cnae)}
      <label className="text-xs text-slate-500">Regime
        <select name="regime" defaultValue={e?.regimeTributario ?? "SIMPLES_NACIONAL"} className="campo mt-1">
          <option value="SIMPLES_NACIONAL">Simples Nacional</option>
          <option value="SIMPLES_EXCESSO_SUBLIMITE">Simples (excesso de sublimite)</option>
          <option value="REGIME_NORMAL">Regime normal</option>
          <option value="MEI">MEI</option>
        </select>
      </label>
      {c("logradouro", "Logradouro", e?.logradouro, "md:col-span-2")}
      {c("numero", "Número", e?.numero)}
      {c("bairro", "Bairro", e?.bairro)}
      {c("cidade", "Cidade", e?.cidade)}
      {c("codigoMunicipio", "Código IBGE do município", e?.codigoMunicipio)}
      {c("uf", "UF", e?.uf)}
      {c("cep", "CEP", e?.cep)}
      {c("telefone", "Telefone", e?.telefone)}
      {c("email", "E-mail", e?.email)}
      <h2 className="mt-2 font-semibold md:col-span-4">Emissão</h2>
      <label className="text-xs text-slate-500">Ambiente
        <select name="ambiente" defaultValue={e?.ambienteFiscal ?? "HOMOLOGACAO"} className="campo mt-1">
          <option value="HOMOLOGACAO">Homologação (testes, sem valor fiscal)</option>
          <option value="PRODUCAO">Produção</option>
        </select>
      </label>
      {c("serieNfe", "Série NF-e", e?.serieNfe ?? 1)}
      {c("serieNfce", "Série NFC-e", e?.serieNfce ?? 1)}
      <span />
      {c("cscId", "ID do CSC (NFC-e)", e?.cscId)}
      <label className="text-xs text-slate-500 md:col-span-2">CSC (NFC-e){e?.cscToken ? " · já cadastrado, deixe em branco para manter" : ""}
        <input name="cscToken" type="password" autoComplete="off" className="campo mt-1" />
      </label>
      <div className="flex items-end gap-3 md:col-span-4">
        <button className="btn" disabled={pendente}>Salvar</button>
        {estado && <span className={`text-sm ${estado.ok ? "text-emerald-700" : "text-red-700"}`}>{estado.mensagem}</span>}
      </div>
    </form>
  );
}
