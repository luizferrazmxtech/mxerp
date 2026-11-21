import { redirect } from "next/navigation";
import { licencaAtual } from "@/lib/licenca/licenca";
import { usuarioAtual } from "@/lib/auth/atual";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mensalidade" };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ROTULO = { EM_DIA: "Em dia", AVISO: "Mensalidade em atraso", SO_LEITURA: "Sistema só para consulta", BLOQUEADO: "Sistema bloqueado" } as const;

/** Situação da mensalidade do sistema (clientes da revenda) e como pagar. Aberta mesmo com o sistema bloqueado. */
export default async function LicencaPagina() {
  if (!(await usuarioAtual())) redirect("/login");
  const l = await licencaAtual({ forcar: true });
  if (!l) redirect("/");
  const f = l.fatura;
  return (
    <div className="mx-auto max-w-xl py-8">
      <div className="cartao p-6">
        <h1 className="mb-1 text-[22px] font-semibold">{ROTULO[l.situacao]}</h1>
        {l.mensagem && <p className="mb-4 text-slate-700">{l.mensagem}</p>}
        {f ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-[14px]">
              <div><div className="rotulo">Mensalidade</div>{f.competencia.slice(5)}/{f.competencia.slice(0, 4)}</div>
              <div><div className="rotulo">Valor</div><b>{brl(f.valor)}</b></div>
              <div><div className="rotulo">Vencimento</div>{new Date(`${f.vencimento}T12:00:00Z`).toLocaleDateString("pt-BR")}</div>
              <div><div className="rotulo">Plano</div>{l.plano}</div>
            </div>
            {f.link && <a className="btn-marca" href={f.link} target="_blank" rel="noreferrer">Abrir o boleto (PDF)</a>}
            {f.linhaDigitavel && <div><div className="rotulo">Linha digitável</div><input readOnly className="campo font-mono text-[13px]" value={f.linhaDigitavel} /></div>}
            {f.pixCopiaECola && <div><div className="rotulo">Pix copia e cola</div><textarea readOnly rows={4} className="campo font-mono text-[12px]" value={f.pixCopiaECola} /></div>}
            <p className="text-[13px] text-slate-500">Depois do pagamento o sistema libera sozinho em alguns minutos. Dúvidas: fale com a MXTECH.</p>
          </div>
        ) : <p className="text-slate-600">Nenhuma mensalidade em aberto.</p>}
      </div>
    </div>
  );
}
