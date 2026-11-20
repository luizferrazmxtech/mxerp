import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { XMLParser } from "fast-xml-parser";
import { prisma } from "@/lib/db";
import { brl, dataHora } from "@/lib/ui/format";
import BotaoAcao from "@/components/BotaoAcao";
import { cancelar, cancelarServico, cartaCorrecaoAcao, consultarNotaAcao } from "../actions";
import { URL_DANFSE } from "@/lib/fiscal/nfse";

export const dynamic = "force-dynamic";

type Det = { prod: { cProd: string; xProd: string; qCom: string; uCom: string; vUnCom: string; vProd: string } };

export default async function Nota({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = await prisma.notaFiscal.findUnique({ where: { id }, include: { eventos: { orderBy: [{ createdAt: "asc" }] } } });
  if (!n) notFound();
  const doc = n.xml ? new XMLParser({ ignoreAttributes: true, parseTagValue: false }).parse(n.xml) : null;
  const inf = doc?.nfeProc?.NFe?.infNFe ?? doc?.NFe?.infNFe;
  const dets: Det[] = inf ? [inf.det].flat() : [];
  const qr = doc?.nfeProc?.NFe?.infNFeSupl?.qrCode ?? doc?.NFe?.infNFeSupl?.qrCode;
  const qrImg = qr ? await QRCode.toDataURL(String(qr), { margin: 0, width: 180 }) : null;
  const chaveFmt = n.chave?.replace(/(\d{4})/g, "$1 ").trim();
  const cancelavel = n.status === "AUTORIZADA" && n.modelo !== "NFSE";
  const origem = n.origemTipo === "VENDA" && n.origemId
    ? await prisma.venda.findUnique({ where: { id: n.origemId }, select: { id: true, numero: true } }).then((v) => v && { rotulo: `venda #${v.numero}`, href: `/vendas/${v.id}` })
    : n.origemTipo === "OS" && n.origemId
      ? await prisma.ordemServico.findUnique({ where: { id: n.origemId }, select: { id: true, numero: true } }).then((o) => o && { rotulo: `OS #${o.numero}`, href: `/os/${o.id}` })
      : null;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Link href={`/fiscal?modelo=${n.modelo}`} className="text-sm text-slate-500 hover:underline">← Notas fiscais</Link>
          {origem && <Link href={origem.href} className="text-sm text-marca hover:underline">Gerada pela {origem.rotulo}</Link>}
        </div>
        <div className="flex gap-2">
          {n.xml && <a href={`/api/notas/${n.id}/xml`} className="btn-sec">Baixar XML</a>}
          {n.modelo === "NFSE" && n.chave && <a href={`${URL_DANFSE[n.ambiente === "PRODUCAO" ? 1 : 2]}/${n.chave}`} target="_blank" rel="noreferrer" className="btn-sec">DANFSe (PDF oficial)</a>}
          {n.modelo !== "NFSE" && n.xml && <Link href={`/fiscal/${n.id}/imprimir${n.modelo === "NFE" ? "?formato=a4" : ""}`} className="btn">{n.modelo === "NFE" ? "Imprimir DANFE (A4)" : "Imprimir DANFCE"}</Link>}
          {n.modelo === "NFE" && n.xml && <Link href={`/fiscal/${n.id}/imprimir?formato=simplificado`} className="btn-sec">DANFE simplificado</Link>}
        </div>
      </div>

      {n.modelo === "NFSE" && (
        <div className="cartao mx-auto max-w-md space-y-1 p-4 text-sm">
          <h1 className="font-semibold">NFS-e · DPS {n.serie}/{n.numero}</h1>
          <p>Situação: {n.status.toLowerCase()} {n.motivo && <span className="text-slate-500">({n.motivo})</span>}</p>
          <p>Valor dos serviços: {brl(n.valorTotal)}</p>
          {n.chave && <p className="break-all font-mono text-xs">Chave {n.chave}</p>}
          {n.ambiente === "HOMOLOGACAO" && <p className="text-xs font-bold text-red-700">PRODUÇÃO RESTRITA · SEM VALOR FISCAL</p>}
        </div>
      )}
      {n.modelo !== "NFSE" && (
      /* DANFE simplificado / DANFCE: largura de bobina 80mm na impressão */
      <div className="cartao mx-auto max-w-md space-y-3 p-4 text-sm print:max-w-[76mm] print:border-0 print:p-0 print:shadow-none">
        <div className="text-center">
          <div className="font-semibold">{inf?.emit?.xNome}</div>
          <div className="text-xs">CNPJ {inf?.emit?.CNPJ} · IE {inf?.emit?.IE}</div>
          <div className="text-xs">{inf?.emit?.enderEmit?.xLgr}, {inf?.emit?.enderEmit?.nro} · {inf?.emit?.enderEmit?.xMun}/{inf?.emit?.enderEmit?.UF}</div>
          <div className="mt-2 text-xs font-semibold">
            {n.modelo === "NFCE" ? "DANFE NFC-e · Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica" : "DANFE simplificado · NF-e"}
          </div>
          {n.ambiente === "HOMOLOGACAO" && <div className="text-xs font-bold text-red-700">EMITIDA EM HOMOLOGAÇÃO · SEM VALOR FISCAL</div>}
          {n.status !== "AUTORIZADA" && <div className="text-xs font-bold text-red-700">{n.status} · {n.motivo}</div>}
        </div>
        <table className="w-full text-xs">
          <thead><tr className="border-b"><th className="text-left">Item</th><th className="text-right">Qtd</th><th className="text-right">Unit.</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {dets.map((d, i) => (
              <tr key={i}><td>{d.prod.cProd} {d.prod.xProd}</td><td className="text-right">{Number(d.prod.qCom)} {d.prod.uCom}</td><td className="text-right">{Number(d.prod.vUnCom).toFixed(2)}</td><td className="text-right">{d.prod.vProd}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-0.5 border-t pt-2 text-xs">
          <div className="flex justify-between"><span>Qtd. de itens</span><span>{dets.length}</span></div>
          {Number(inf?.total?.ICMSTot?.vDesc ?? 0) > 0 && <div className="flex justify-between"><span>Descontos</span><span>{brl(inf.total.ICMSTot.vDesc)}</span></div>}
          <div className="flex justify-between text-sm font-semibold"><span>Valor a pagar</span><span>{brl(inf?.total?.ICMSTot?.vNF ?? n.valorTotal)}</span></div>
        </div>
        <div className="text-center text-xs">
          <div>Nº {n.numero} · Série {n.serie} · {dataHora(n.emitidaEm ?? n.createdAt)}</div>
          {n.protocolo && <div>Protocolo de autorização {n.protocolo}</div>}
          {n.modelo === "NFCE" && <div>Consulte pela chave de acesso em {doc?.nfeProc?.NFe?.infNFeSupl?.urlChave}</div>}
          <div className="font-mono">{chaveFmt}</div>
          <div className="mt-1">{inf?.dest ? `Consumidor: ${inf.dest.CNPJ ?? inf.dest.CPF} ${inf.dest.xNome ?? ""}` : "Consumidor não identificado"}</div>
          {qrImg && n.status === "AUTORIZADA" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrImg} alt="QR Code da NFC-e" className="mx-auto mt-2 h-36 w-36" />
          )}
          {inf?.infAdic?.infCpl && <div className="mt-1">{inf.infAdic.infCpl}</div>}
        </div>
      </div>

      )}

      {n.modelo === "NFSE" && n.status === "AUTORIZADA" && (
        <div id="cancelar" className="no-print cartao mx-auto max-w-md scroll-mt-20 p-4">
          <h2 className="mb-2 font-semibold">Cancelar NFS-e</h2>
          <BotaoAcao acao={cancelarServico} campos={{ notaId: n.id }} rotulo="Cancelar NFS-e" secundario>
            <select name="cMotivo" className="campo" defaultValue="1">
              <option value="1">Erro na emissão</option>
              <option value="2">Serviço não prestado</option>
              <option value="9">Outros</option>
            </select>
            <textarea name="justificativa" minLength={15} required rows={2} className="campo" placeholder="Motivo (mínimo 15 caracteres)" />
          </BotaoAcao>
        </div>
      )}

      {n.chave && n.modelo !== "NFSE" && (
        <div id="consultar" className="no-print cartao mx-auto max-w-md scroll-mt-20 p-4">
          <h2 className="mb-2 font-semibold">{n.status === "ENVIADA" ? "Aguardando a SEFAZ" : "Situação na SEFAZ"}</h2>
          <p className="mb-2 text-xs text-slate-500">{n.status === "ENVIADA"
            ? "A nota foi enviada e a SEFAZ não devolveu o resultado. Consulte antes de emitir outra, para não duplicar a venda."
            : "Confere na SEFAZ se a nota continua autorizada (ou se foi cancelada) e atualiza aqui."}</p>
          <BotaoAcao acao={consultarNotaAcao} campos={{ notaId: n.id }} rotulo="Consultar na SEFAZ" secundario={n.status !== "ENVIADA"} />
        </div>
      )}

      {n.modelo === "NFE" && n.status === "AUTORIZADA" && (
        <div id="cce" className="no-print cartao mx-auto max-w-md scroll-mt-20 p-4">
          <h2 className="mb-2 font-semibold">Carta de correção</h2>
          <p className="mb-2 text-xs text-slate-500">
            Corrige dados que não mudam imposto, valor, quantidade, remetente/destinatário nem a data. Cada nova carta substitui a anterior:
            escreva todas as correções de novo.
          </p>
          <BotaoAcao acao={cartaCorrecaoAcao} campos={{ notaId: n.id }} rotulo="Enviar carta de correção" secundario>
            <textarea name="correcao" minLength={15} maxLength={1000} required rows={3} className="campo"
              defaultValue={n.eventos.filter((x) => x.tipo === "110110").at(-1)?.texto ?? ""} placeholder="ex.: Onde se lê endereço de entrega Rua A, 10, leia-se Rua B, 20" />
          </BotaoAcao>
        </div>
      )}

      {n.eventos.length > 0 && (
        <div className="no-print cartao mx-auto max-w-md p-4 text-sm">
          <h2 className="mb-2 font-semibold">Eventos da nota</h2>
          {n.eventos.map((ev) => (
            <div key={ev.id} className="mb-2 border-b pb-2 last:border-0">
              <div className="flex justify-between"><b>{ev.tipo === "110110" ? `Carta de correção ${ev.sequencia}` : ev.tipo === "110111" ? "Cancelamento" : ev.tipo}</b><span className="text-xs text-slate-500">{dataHora(ev.createdAt)}</span></div>
              {ev.texto && <p className="text-xs text-slate-600">{ev.texto}</p>}
              <div className="flex gap-3 text-xs">
                <span className="text-slate-500">Protocolo {ev.protocolo}</span>
                {ev.xml && <a className="text-marca hover:underline" href={`/api/notas/eventos/${ev.id}`}>XML</a>}
                {ev.tipo === "110110" && <Link className="text-marca hover:underline" href={`/fiscal/${n.id}/cce/${ev.id}`}>Imprimir</Link>}
              </div>
            </div>
          ))}
        </div>
      )}

      {cancelavel && (
        <div id="cancelar" className="no-print cartao mx-auto max-w-md scroll-mt-20 p-4">
          <h2 className="mb-2 font-semibold">Cancelar nota</h2>
          <p className="mb-2 text-xs text-slate-500">Prazo: NFC-e até 30 minutos, NF-e até 24 horas após a autorização.</p>
          <BotaoAcao acao={cancelar} campos={{ notaId: n.id }} rotulo="Cancelar na SEFAZ" secundario>
            <textarea name="justificativa" minLength={15} required rows={2} className="campo" placeholder="Justificativa (mínimo 15 caracteres)" />
          </BotaoAcao>
        </div>
      )}
    </div>
  );
}
