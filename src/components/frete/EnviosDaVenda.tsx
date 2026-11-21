import Link from "next/link";
import { prisma } from "@/lib/db";
import { freteAtivo } from "@/lib/frete/melhorEnvio";
import { atualizarRastreioAcao, cancelarEnvioAcao, tentarDeNovoAcao } from "@/lib/frete/acoes";
import { SITUACOES_ENVIO, linkRastreio } from "@/lib/frete/tipos";
import { brl, dataHora } from "@/lib/ui/format";
import BotaoAcao from "@/components/ui/BotaoAcao";
import Icone from "@/components/Icone";
import ComprarEtiqueta from "./ComprarEtiqueta";

/** Bloco do Melhor Envio na aba Entrega da venda: etiquetas compradas, rastreio e compra de uma nova. */
export default async function EnviosDaVenda({ vendaId, temProdutos, escolhido, freteNome }: { vendaId: string; temProdutos: boolean; escolhido: number | null; freteNome: string | null }) {
  const [ativo, envios] = await Promise.all([freteAtivo(), prisma.envioFrete.findMany({ where: { vendaId }, orderBy: { createdAt: "desc" } })]);
  if (!ativo && !envios.length) return null;
  const aberto = envios.find((e) => e.situacao !== "CANCELADA");
  const btn = "btn-sec py-1 text-[12px]";
  return (
    <div className="cartao mt-3 p-4 text-[13px]">
      <div className="mb-2 flex items-center gap-2"><Icone nome="frete" size={15} /><b className="text-[15px]">Etiqueta e rastreio (Melhor Envio)</b>
        {freteNome && <span className="ml-auto text-[12px] text-slate-500">Frete escolhido no pedido: <b>{freteNome}</b></span>}</div>
      {envios.map((e) => {
        const s = SITUACOES_ENVIO[e.situacao] ?? SITUACOES_ENVIO.ERRO;
        const link = linkRastreio(e);
        const pendente = !e.geradaEm && e.situacao !== "CANCELADA";
        return (
          <div key={e.id} className="mb-2 rounded border border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`pilula ${s.cor}`}>{s.rotulo}</span>
              <b>{e.transportadora} {e.servicoNome}</b><span className="text-slate-500">· {brl(e.valor)}{e.prazoDias ? ` · ${e.prazoDias} dias úteis` : ""}</span>
              <span className="ml-auto text-[11px] text-slate-500">{e.usuarioNome ? `${e.usuarioNome} · ` : ""}{dataHora(e.createdAt)}</span>
            </div>
            {(e.rastreio || e.protocolo) && (
              <div className="mt-1">
                {e.rastreio && <>Rastreio: <b className="font-mono">{e.rastreio}</b> </>}
                {link && <a href={link} target="_blank" rel="noreferrer" className="text-marca hover:underline">acompanhar</a>}
                {e.protocolo && <span className="ml-2 text-[11px] text-slate-500">Protocolo {e.protocolo}</span>}
              </div>
            )}
            <div className="mt-1 text-[11px] text-slate-500">
              {[e.pagaEm && `paga ${dataHora(e.pagaEm)}`, e.postadaEm && `postada ${dataHora(e.postadaEm)}`, e.entregueEm && `entregue ${dataHora(e.entregueEm)}`, e.canceladaEm && `cancelada ${dataHora(e.canceladaEm)}`].filter(Boolean).join(" · ")}
            </div>
            {e.erro && <p className="mt-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-[12px] text-red-800">{e.erro}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {e.geradaEm && e.situacao !== "CANCELADA" && <a href={`/api/frete/etiqueta/${e.id}`} target="_blank" className={btn}><Icone nome="imprimir" size={13} /> Imprimir etiqueta</a>}
              {pendente && <BotaoAcao acao={tentarDeNovoAcao.bind(null, e.id)} icone="atualizar" className={btn}>Tentar de novo</BotaoAcao>}
              {e.meId && e.situacao !== "CANCELADA" && <BotaoAcao acao={atualizarRastreioAcao.bind(null, e.id)} icone="atualizar" className={btn}>Atualizar rastreio</BotaoAcao>}
              {["CARRINHO", "PAGA", "GERADA", "ERRO"].includes(e.situacao) && <BotaoAcao acao={cancelarEnvioAcao.bind(null, e.id)} icone="excluir" className={btn} confirmar="Cancelar esta etiqueta? O valor volta para a carteira do Melhor Envio.">Cancelar etiqueta</BotaoAcao>}
            </div>
          </div>
        );
      })}
      {ativo && !aberto && (temProdutos ? <ComprarEtiqueta vendaId={vendaId} escolhido={escolhido} /> : <p className="text-slate-500">A venda não tem produtos para enviar.</p>)}
      {!ativo && <p className="text-[12px] text-slate-500">O frete pelo Melhor Envio está desligado (<Link href="/frete" className="underline">Configurações › Integrações › Melhor Envio</Link>).</p>}
    </div>
  );
}
