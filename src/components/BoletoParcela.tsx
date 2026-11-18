import Icone from "@/components/Icone";
import BotaoAcao from "@/components/ui/BotaoAcao";
import CopiarTexto from "@/components/CopiarTexto";
import { ATIVOS, ROTULO_BOLETO } from "@/lib/financeiro/boletos";
import { atualizarBoletoAcao, cancelarBoletoAcao, emitirBoletoAcao } from "@/lib/financeiro/acoesBoleto";
import { brl } from "@/lib/ui/format";

type Boleto = {
  id: string; token: string; seuNumero: string; situacao: string; nossoNumero: string | null; linhaDigitavel: string | null; pixCopiaECola: string | null;
  erro: string | null; pagoEm: Date | null; valorRecebido: unknown; origemRecebimento: string | null; vencimento: Date;
};
type Parcela = { id: string; descricao: string; pagoEm: Date | null; formaPagamento: { boletoInter: boolean } | null; boletos: Boleto[] };
type Cliente = { nome: string; email: string | null; celular: string | null; telefone: string | null } | null;

const dia = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
const COR: Record<string, string> = {
  RECEBIDO: "text-emerald-700", A_RECEBER: "text-sky-700", ATRASADO: "text-red-700", ERRO: "text-red-700", FALHA_EMISSAO: "text-red-700",
};

/**
 * Boleto do Inter de uma parcela a receber: situação, linha digitável, imprimir, mandar por WhatsApp/e-mail,
 * emitir de novo e cancelar. `base` é o endereço público do ERP (link do PDF para o cliente), se houver.
 */
export default function BoletoParcela({ parcela, cliente, base, interAtivo, compacto }: { parcela: Parcela; cliente: Cliente; base: string | null; interAtivo: boolean; compacto?: boolean }) {
  const b = parcela.boletos.find((x) => ATIVOS.includes(x.situacao)) ?? parcela.boletos.find((x) => x.situacao === "RECEBIDO") ?? parcela.boletos[0];
  const podeEmitir = interAtivo && !parcela.pagoEm && (!b || !ATIVOS.includes(b.situacao)) && b?.situacao !== "RECEBIDO";
  if (!b && !(podeEmitir && parcela.formaPagamento?.boletoInter)) {
    return podeEmitir && !compacto ? <BotaoAcao acao={emitirBoletoAcao.bind(null, parcela.id)} icone="dinheiro" className="mt-1 text-[12px] text-marca hover:underline">Emitir boleto no Inter</BotaoAcao> : null;
  }
  const link = b && base ? `${base}/cobranca/boleto/${b.token}` : "";
  const ativo = !!b && ATIVOS.includes(b.situacao);
  const fone = (cliente?.celular || cliente?.telefone || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  const texto = b ? `Olá ${cliente?.nome ?? ""}, segue o boleto de ${parcela.descricao}, vencimento ${dia(b.vencimento)}${link ? `:\n${link}` : "."}${b.linhaDigitavel ? `\n\nLinha digitável: ${b.linhaDigitavel}` : ""}${b.pixCopiaECola ? `\n\nOu pague com Pix copia e cola:\n${b.pixCopiaECola}` : ""}` : "";
  const item = "flex items-center gap-1 rounded border border-slate-200 px-2 py-[3px] text-[12px] hover:bg-slate-100";

  return (
    <div className="mt-2 space-y-1 rounded border border-slate-200 bg-slate-50 p-2 text-[12px]">
      {b && (
        <div className="flex flex-wrap items-center gap-x-2">
          <Icone nome="dinheiro" size={13} />
          <b className={COR[b.situacao] ?? "text-slate-700"}>{ROTULO_BOLETO[b.situacao] ?? b.situacao}</b>
          {b.nossoNumero && <span className="text-slate-500">nosso nº {b.nossoNumero}</span>}
          {b.situacao === "RECEBIDO" && b.pagoEm && <span className="text-slate-600">em {dia(b.pagoEm)}{b.valorRecebido != null ? ` · ${brl(Number(b.valorRecebido))}` : ""}{b.origemRecebimento ? ` · ${b.origemRecebimento === "PIX" ? "Pix" : "boleto"}` : ""}</span>}
        </div>
      )}
      {b?.erro && <p className="text-red-700">{b.erro}</p>}
      {ativo && b.linhaDigitavel && !compacto && <p className="break-all font-mono text-[11px] text-slate-700">{b.linhaDigitavel}</p>}
      <div className="flex flex-wrap gap-1">
        {ativo && b.situacao !== "EMITINDO" && (
          <>
            <a href={`/api/boletos/${b.id}/pdf`} target="_blank" className={item}><Icone nome="imprimir" size={13} /> Imprimir</a>
            {b.linhaDigitavel && <CopiarTexto texto={b.linhaDigitavel} rotulo="Linha digitável" className={item} />}
            {b.pixCopiaECola && <CopiarTexto texto={b.pixCopiaECola} rotulo="Pix" className={item} />}
            <a href={`https://wa.me/${fone.length >= 10 ? "55" + fone : ""}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer" className={item}><Icone nome="whatsapp" size={13} /> WhatsApp</a>
            <a href={`mailto:${cliente?.email ?? ""}?subject=${encodeURIComponent(`Boleto - ${parcela.descricao}`)}&body=${encodeURIComponent(texto)}`} className={item}><Icone nome="email" size={13} /> E-mail</a>
          </>
        )}
        {b && b.situacao !== "ERRO" && b.situacao !== "CANCELADO" && !compacto && <BotaoAcao acao={atualizarBoletoAcao.bind(null, b.id)} icone="atualizar" className={item}>Consultar</BotaoAcao>}
        {podeEmitir && <BotaoAcao acao={emitirBoletoAcao.bind(null, parcela.id)} icone="dinheiro" className={item}>{b ? "Emitir de novo" : "Emitir boleto"}</BotaoAcao>}
        {ativo && !compacto && <BotaoAcao acao={cancelarBoletoAcao.bind(null, b.id)} icone="fechar" className={`${item} text-red-700`} confirmar="Cancelar este boleto no Banco Inter? O cliente não conseguirá mais pagá-lo.">Cancelar</BotaoAcao>}
      </div>
    </div>
  );
}
