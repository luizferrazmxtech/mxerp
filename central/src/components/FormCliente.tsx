import type { Cliente, Plano } from "@prisma/client";
import { Campo } from "./ui";

/** Campos do cadastro do cliente (novo e edição). O endereço é o do pagador do boleto. */
export default function FormCliente({ c, planos }: { c?: Cliente | null; planos: Plano[] }) {
  const v = (x: unknown) => (x == null ? "" : String(x));
  return (
    <div className="grid gap-3 md:grid-cols-6">
      <Campo rotulo="Nome / razão social" obrig className="md:col-span-3"><input name="nome" className="campo" defaultValue={v(c?.nome)} required /></Campo>
      <Campo rotulo="CPF/CNPJ (pagador)" obrig className="md:col-span-1"><input name="documento" className="campo" defaultValue={v(c?.documento)} required /></Campo>
      <Campo rotulo="E-mail (recebe as mensalidades)" obrig className="md:col-span-2"><input name="email" type="email" className="campo" defaultValue={v(c?.email)} required /></Campo>
      <Campo rotulo="Telefone" className="md:col-span-1"><input name="telefone" className="campo" defaultValue={v(c?.telefone)} /></Campo>
      <Campo rotulo="CEP" className="md:col-span-1"><input name="cep" className="campo" defaultValue={v(c?.cep)} /></Campo>
      <Campo rotulo="Endereço" className="md:col-span-3"><input name="logradouro" className="campo" defaultValue={v(c?.logradouro)} /></Campo>
      <Campo rotulo="Número" className="md:col-span-1"><input name="numero" className="campo" defaultValue={v(c?.numero)} /></Campo>
      <Campo rotulo="Complemento" className="md:col-span-2"><input name="complemento" className="campo" defaultValue={v(c?.complemento)} /></Campo>
      <Campo rotulo="Bairro" className="md:col-span-2"><input name="bairro" className="campo" defaultValue={v(c?.bairro)} /></Campo>
      <Campo rotulo="Cidade" className="md:col-span-1"><input name="cidade" className="campo" defaultValue={v(c?.cidade)} /></Campo>
      <Campo rotulo="UF" className="md:col-span-1"><input name="uf" maxLength={2} className="campo uppercase" defaultValue={v(c?.uf)} /></Campo>

      <Campo rotulo="Plano" obrig className="md:col-span-2">
        <select name="planoId" className="campo" defaultValue={c?.planoId ?? planos[0]?.id} required>
          {planos.map((p) => <option key={p.id} value={p.id}>{p.nome} · R$ {Number(p.valorMensal).toFixed(2).replace(".", ",")} · {p.maxEmpresas} CNPJ(s) · {p.maxUsuarios} usuário(s)</option>)}
        </select>
      </Campo>
      <Campo rotulo="Valor combinado (vazio = do plano)" className="md:col-span-1"><input name="valorMensal" className="campo" defaultValue={c?.valorMensal != null ? Number(c.valorMensal).toFixed(2).replace(".", ",") : ""} /></Campo>
      <Campo rotulo="Máx. CNPJs (vazio = plano)" className="md:col-span-1"><input name="maxEmpresas" type="number" min={1} className="campo" defaultValue={v(c?.maxEmpresas)} /></Campo>
      <Campo rotulo="Máx. usuários (vazio = plano)" className="md:col-span-1"><input name="maxUsuarios" type="number" min={1} className="campo" defaultValue={v(c?.maxUsuarios)} /></Campo>
      <Campo rotulo="Dia do vencimento" className="md:col-span-1"><input name="diaVencimento" type="number" min={1} max={28} className="campo" defaultValue={c?.diaVencimento ?? 10} /></Campo>
      <Campo rotulo="Cobrar a partir de" className="md:col-span-2"><input name="inicioCobranca" type="date" className="campo" defaultValue={c ? c.inicioCobranca.toISOString().slice(0, 10) : ""} /></Campo>
      <Campo rotulo="Observações" className="md:col-span-4"><input name="observacoes" className="campo" defaultValue={v(c?.observacoes)} /></Campo>
    </div>
  );
}
