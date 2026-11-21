import Link from "next/link";
import type { Fatura } from "@prisma/client";
import { dataBR, diaSP, moeda } from "@/lib/datas";
import { acaoFatura } from "@/app/acoes";
import { Pilula } from "./ui";

type Linha = Fatura & { cliente: { id: string; nome: string } };

export default function TabelaFaturas({ faturas, volta, semCliente }: { faturas: Linha[]; volta: string; semCliente?: boolean }) {
  const hoje = diaSP();
  const botao = (f: Linha, acao: string, rotulo: string) => (
    <form action={acaoFatura} className="inline">
      <input type="hidden" name="id" value={f.id} /><input type="hidden" name="acao" value={acao} /><input type="hidden" name="volta" value={volta} />
      <button className="mr-1 mb-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[12px] hover:bg-slate-50">{rotulo}</button>
    </form>
  );
  return (
    <div className="overflow-x-auto">
      <table className="tabela">
        <thead><tr>{!semCliente && <th>Cliente</th>}<th>Mês</th><th>Vencimento</th><th className="text-right">Valor</th><th>Situação</th><th>Boleto</th><th>Ações</th></tr></thead>
        <tbody>
          {faturas.length === 0 && <tr><td colSpan={7} className="text-slate-500">Nenhuma mensalidade.</td></tr>}
          {faturas.map((f) => {
            const vencida = f.situacao === "ABERTA" && f.vencimento < hoje;
            return (
              <tr key={f.id}>
                {!semCliente && <td><Link className="sublinhado" href={`/clientes/${f.cliente.id}?aba=faturas`}>{f.cliente.nome}</Link></td>}
                <td>{f.competencia.slice(5)}/{f.competencia.slice(0, 4)}</td>
                <td className={vencida ? "font-semibold text-red-700" : ""}>{dataBR(f.vencimento)}</td>
                <td className="text-right">{moeda(f.valor as unknown as number)}</td>
                <td><Pilula valor={f.situacao} />{f.pagaEm && <div className="text-[12px] text-slate-500">{dataBR(f.pagaEm)} · {f.formaPagamento?.toLowerCase()}</div>}</td>
                <td className="text-[12px]">
                  {f.boletoSituacao ? <span>{f.boletoSituacao.replaceAll("_", " ").toLowerCase()}</span> : "—"}
                  {f.boletoErro && <div className="max-w-xs text-red-700">{f.boletoErro}</div>}
                  {f.emailEnviadoEm && <div className="text-slate-500">e-mail enviado</div>}
                </td>
                <td className="whitespace-nowrap">
                  {f.situacao === "ABERTA" && (!f.codigoSolicitacao || ["ERRO", "CANCELADO", "EXPIRADO"].includes(f.boletoSituacao ?? "")) && botao(f, "emitir", "Emitir boleto")}
                  {f.situacao === "ABERTA" && f.codigoSolicitacao && botao(f, "consultar", "Consultar")}
                  {f.situacao === "ABERTA" && botao(f, "pagar", "Recebi por fora")}
                  {f.situacao === "ABERTA" && botao(f, "cancelar", "Cancelar")}
                  {f.situacao !== "ABERTA" && f.formaPagamento !== "BOLETO" && f.formaPagamento !== "PIX" && botao(f, "reabrir", "Reabrir")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
