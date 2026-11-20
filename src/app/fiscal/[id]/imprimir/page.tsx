import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { lerDanfe, MOD_FRETE, type Danfe } from "@/lib/fiscal/danfe";
import CodigoBarras from "./CodigoBarras";
import BotaoImprimirDanfe from "./BotaoImprimirDanfe";

export const dynamic = "force-dynamic";
export const metadata = { title: "DANFE" };

const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtd = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const doc = (d: string) => d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : d;
const cep = (c: string) => c.replace(/^(\d{5})(\d{3})$/, "$1-$2");
const data = (s: string) => (s ? new Date(s).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
const hora = (s: string) => (s ? new Date(s).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
const chaveFmt = (c: string) => c.replace(/(\d{4})/g, "$1 ").trim();

/** Caixa com rótulo pequeno em cima (padrão do DANFE). */
function C({ r, v, className = "", alinhar = "" }: { r: string; v: React.ReactNode; className?: string; alinhar?: string }) {
  return (
    <div className={`border border-black px-1 py-[1px] ${className}`}>
      <div className="text-[6.5px] uppercase leading-tight">{r}</div>
      <div className={`min-h-[11px] text-[9px] font-semibold leading-tight ${alinhar}`}>{v}</div>
    </div>
  );
}

/**
 * Impressão da nota: DANFE A4 (padrão da NF-e) ou simplificado/DANFCE (bobina 80 mm, padrão da NFC-e).
 * Página própria, sem o menu do sistema, para a impressão não sair em branco. "Salvar como PDF" no diálogo gera o PDF.
 */
export default async function ImprimirNota({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ formato?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const n = await prisma.notaFiscal.findUnique({ where: { id } });
  if (!n || !n.xml || n.modelo === "NFSE") notFound();
  const d = lerDanfe(n.xml);
  const simplificado = sp.formato ? sp.formato === "simplificado" : n.modelo === "NFCE";
  const aviso = n.ambiente === "HOMOLOGACAO" ? "EMITIDA EM HOMOLOGAÇÃO · SEM VALOR FISCAL"
    : n.status === "CANCELADA" ? "NOTA CANCELADA" : n.status !== "AUTORIZADA" ? `NOTA ${n.status} · SEM VALOR FISCAL` : null;

  return (
    <div className="bg-white">
      <style>{simplificado
        ? "@media print { @page { size: 80mm auto; margin: 2mm } }"
        : "@media print { @page { size: A4 portrait; margin: 7mm } }"}</style>
      <div className="no-print mx-auto mb-3 flex max-w-[800px] flex-wrap items-center gap-2 p-4 pb-0">
        <Link href={`/fiscal/${n.id}`} className="btn-sec">Voltar</Link>
        <BotaoImprimirDanfe />
        {n.modelo === "NFE" && (simplificado
          ? <Link href={`/fiscal/${n.id}/imprimir?formato=a4`} className="btn-sec">DANFE A4</Link>
          : <Link href={`/fiscal/${n.id}/imprimir?formato=simplificado`} className="btn-sec">DANFE simplificado</Link>)}
        <span className="text-[12px] text-slate-500">Para PDF, escolha “Salvar como PDF” na impressora.</span>
      </div>
      {simplificado ? <Simplificado d={d} aviso={aviso} /> : <A4 d={d} aviso={aviso} />}
    </div>
  );
}

function A4({ d, aviso }: { d: Danfe; aviso: string | null }) {
  const e = d.emitente, de = d.destinatario;
  return (
    <div className="relative mx-auto w-[196mm] bg-white p-0 text-black print:w-full">
      {aviso && <div className="pointer-events-none absolute inset-x-0 top-[120mm] text-center text-[34px] font-bold text-red-600/25 rotate-[-20deg]">{aviso}</div>}
      {/* canhoto */}
      <div className="mb-1 grid grid-cols-[1fr_38mm] border border-black">
        <div className="border-r border-black p-1 text-[7px]">RECEBEMOS DE {e.nome} OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO
          <div className="mt-3 grid grid-cols-[30mm_1fr] gap-2"><div className="border-t border-black pt-[1px]">DATA DE RECEBIMENTO</div><div className="border-t border-black pt-[1px]">IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</div></div>
        </div>
        <div className="p-1 text-center text-[9px] font-bold">NF-e<br />Nº {d.numero.padStart(9, "0").replace(/(\d{3})(?=\d)/g, "$1.")}<br />SÉRIE {d.serie}</div>
      </div>
      <div className="border-b border-dashed border-black" />
      {/* cabeçalho */}
      <div className="mt-1 grid grid-cols-[1fr_32mm_1fr]">
        <div className="border border-black p-1.5">
          <div className="text-[11px] font-bold leading-tight">{e.nome}</div>
          <div className="mt-1 text-[8px] leading-tight">
            {e.endereco.logradouro}, {e.endereco.numero}{e.endereco.complemento ? ` ${e.endereco.complemento}` : ""}<br />
            {e.endereco.bairro} · {e.endereco.municipio}/{e.endereco.uf} · CEP {cep(e.endereco.cep)}<br />
            {e.endereco.fone && <>Fone {e.endereco.fone}</>}
          </div>
        </div>
        <div className="border-y border-black p-1 text-center">
          <div className="text-[12px] font-bold">DANFE</div>
          <div className="text-[7px] leading-tight">Documento Auxiliar da Nota Fiscal Eletrônica</div>
          <div className="mt-1 grid grid-cols-[1fr_auto] items-center text-left text-[7.5px]">
            <div>0 - ENTRADA<br />1 - SAÍDA</div><div className="border border-black px-1.5 text-[11px] font-bold">{d.tpNF}</div>
          </div>
          <div className="mt-1 text-[9px] font-bold">Nº {d.numero.padStart(9, "0").replace(/(\d{3})(?=\d)/g, "$1.")}<br />SÉRIE {d.serie}</div>
          <div className="text-[7.5px]">FOLHA 1/1</div>
        </div>
        <div className="border border-black p-1">
          <CodigoBarras valor={d.chave} />
          <div className="mt-1 text-[6.5px] uppercase">Chave de acesso</div>
          <div className="text-[8.5px] font-semibold">{chaveFmt(d.chave)}</div>
          <div className="mt-1 text-[7.5px] leading-tight">Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da SEFAZ autorizadora</div>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_1fr]">
        <C r="Natureza da operação" v={d.natOp} />
        <C r="Protocolo de autorização de uso" v={d.protocolo ? `${d.protocolo} · ${data(d.dataProtocolo)} ${hora(d.dataProtocolo)}` : "—"} />
      </div>
      <div className="grid grid-cols-3">
        <C r="Inscrição estadual" v={e.ie} /><C r="Inscrição municipal" v={e.im} /><C r="CNPJ" v={doc(e.cnpj)} />
      </div>

      <Titulo t="Destinatário / remetente" />
      <div className="grid grid-cols-[1fr_44mm_26mm]">
        <C r="Nome / razão social" v={de?.nome ?? "CONSUMIDOR NÃO IDENTIFICADO"} /><C r="CNPJ / CPF" v={de ? doc(de.documento) : ""} /><C r="Data da emissão" v={data(d.emissao)} />
      </div>
      <div className="grid grid-cols-[1fr_40mm_22mm_26mm]">
        <C r="Endereço" v={de ? `${de.endereco.logradouro}, ${de.endereco.numero}${de.endereco.complemento ? ` ${de.endereco.complemento}` : ""}` : ""} />
        <C r="Bairro / distrito" v={de?.endereco.bairro} /><C r="CEP" v={de ? cep(de.endereco.cep) : ""} /><C r="Data da saída" v={data(d.saida || d.emissao)} />
      </div>
      <div className="grid grid-cols-[1fr_32mm_10mm_34mm_26mm]">
        <C r="Município" v={de?.endereco.municipio} /><C r="Fone / fax" v={de?.endereco.fone} /><C r="UF" v={de?.endereco.uf} /><C r="Inscrição estadual" v={de?.ie} /><C r="Hora da saída" v={hora(d.saida || d.emissao)} />
      </div>

      {d.duplicatas.length > 0 && (<>
        <Titulo t="Fatura / duplicatas" />
        <div className="grid grid-cols-4">{d.duplicatas.map((x) => <C key={x.numero} r={`Nº ${x.numero} · venc. ${data(x.vencimento + "T12:00:00")}`} v={`R$ ${brl(x.valor)}`} />)}</div>
      </>)}

      <Titulo t="Cálculo do imposto" />
      <div className="grid grid-cols-6">
        <C r="Base de cálc. do ICMS" v={brl(d.totais.bcIcms)} alinhar="text-right" /><C r="Valor do ICMS" v={brl(d.totais.vIcms)} alinhar="text-right" />
        <C r="Base cálc. ICMS ST" v={brl(d.totais.bcSt)} alinhar="text-right" /><C r="Valor do ICMS ST" v={brl(d.totais.vSt)} alinhar="text-right" />
        <C r="Valor aprox. tributos" v={brl(d.totais.vTotTrib)} alinhar="text-right" /><C r="Valor total dos produtos" v={brl(d.totais.vProd)} alinhar="text-right" />
      </div>
      <div className="grid grid-cols-6">
        <C r="Valor do frete" v={brl(d.totais.vFrete)} alinhar="text-right" /><C r="Valor do seguro" v={brl(d.totais.vSeg)} alinhar="text-right" />
        <C r="Desconto" v={brl(d.totais.vDesc)} alinhar="text-right" /><C r="Outras despesas" v={brl(d.totais.vOutro)} alinhar="text-right" />
        <C r="Valor do IPI" v={brl(d.totais.vIpi)} alinhar="text-right" /><C r="Valor total da nota" v={brl(d.totais.vNF)} alinhar="text-right" />
      </div>

      <Titulo t="Transportador / volumes transportados" />
      <div className="grid grid-cols-[1fr_50mm]"><C r="Razão social" v="" /><C r="Frete por conta" v={MOD_FRETE[d.modFrete] ?? d.modFrete} /></div>

      <Titulo t="Dados dos produtos / serviços" />
      <table className="w-full border-collapse text-[7.5px]">
        <thead>
          <tr className="[&>th]:border [&>th]:border-black [&>th]:px-[2px] [&>th]:font-semibold">
            <th>CÓDIGO</th><th className="w-[60mm]">DESCRIÇÃO</th><th>NCM/SH</th><th>CST/CSOSN</th><th>CFOP</th><th>UN</th>
            <th>QUANT.</th><th>V. UNIT.</th><th>V. DESC.</th><th>V. TOTAL</th><th>BC ICMS</th><th>V. ICMS</th><th>ALÍQ.</th>
          </tr>
        </thead>
        <tbody>
          {d.itens.map((i, k) => (
            <tr key={k} className="align-top [&>td]:border-x [&>td]:border-black [&>td]:px-[2px]">
              <td>{i.codigo}</td><td>{i.descricao}</td><td>{i.ncm}</td><td className="text-center">{i.cst}</td><td className="text-center">{i.cfop}</td><td>{i.unidade}</td>
              <td className="text-right">{qtd(i.quantidade)}</td><td className="text-right">{brl(i.valorUnit)}</td><td className="text-right">{brl(i.desconto)}</td><td className="text-right">{brl(i.valorTotal)}</td>
              <td className="text-right">{brl(i.bcIcms)}</td><td className="text-right">{brl(i.vIcms)}</td><td className="text-right">{i.aliqIcms ? brl(i.aliqIcms) : "0,00"}</td>
            </tr>
          ))}
          <tr><td colSpan={13} className="border-t border-black" /></tr>
        </tbody>
      </table>

      <Titulo t="Dados adicionais" />
      <div className="grid grid-cols-[1fr_55mm]">
        <C r="Informações complementares" v={<span className="whitespace-pre-wrap font-normal">{d.infCpl}</span>} className="min-h-[28mm]" />
        <C r="Reservado ao fisco" v="" className="min-h-[28mm]" />
      </div>
    </div>
  );
}

const Titulo = ({ t }: { t: string }) => <div className="mt-1.5 text-[8px] font-bold uppercase">{t}</div>;

async function Simplificado({ d, aviso }: { d: Danfe; aviso: string | null }) {
  const qr = d.qrCode ? await QRCode.toDataURL(d.qrCode, { margin: 0, width: 180 }) : null;
  const nfce = d.modelo === "65";
  return (
    <div className="mx-auto w-[76mm] space-y-2 bg-white p-1 text-[11px] text-black">
      <div className="text-center">
        <div className="font-semibold">{d.emitente.nome}</div>
        <div className="text-[10px]">CNPJ {doc(d.emitente.cnpj)} · IE {d.emitente.ie}</div>
        <div className="text-[10px]">{d.emitente.endereco.logradouro}, {d.emitente.endereco.numero} · {d.emitente.endereco.municipio}/{d.emitente.endereco.uf}</div>
        <div className="mt-1 text-[10px] font-semibold">{nfce ? "DANFE NFC-e · Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica" : "DANFE simplificado · NF-e"}</div>
        {aviso && <div className="text-[10px] font-bold">{aviso}</div>}
      </div>
      <table className="w-full text-[10px]">
        <thead><tr className="border-b border-black"><th className="text-left">Item</th><th className="text-right">Qtd</th><th className="text-right">Unit.</th><th className="text-right">Total</th></tr></thead>
        <tbody>{d.itens.map((i, k) => <tr key={k}><td>{i.codigo} {i.descricao}</td><td className="text-right">{qtd(i.quantidade)} {i.unidade}</td><td className="text-right">{brl(i.valorUnit)}</td><td className="text-right">{brl(i.valorTotal)}</td></tr>)}</tbody>
      </table>
      <div className="space-y-0.5 border-t border-black pt-1 text-[10px]">
        <div className="flex justify-between"><span>Qtd. de itens</span><span>{d.itens.length}</span></div>
        {d.totais.vDesc > 0 && <div className="flex justify-between"><span>Descontos</span><span>{brl(d.totais.vDesc)}</span></div>}
        <div className="flex justify-between text-[12px] font-semibold"><span>Valor a pagar R$</span><span>{brl(d.totais.vNF)}</span></div>
        {d.totais.vTotTrib > 0 && <div className="flex justify-between"><span>Tributos aproximados</span><span>{brl(d.totais.vTotTrib)}</span></div>}
      </div>
      <div className="text-center text-[10px]">
        <div>Nº {d.numero} · Série {d.serie} · {data(d.emissao)} {hora(d.emissao)}</div>
        {d.protocolo && <div>Protocolo de autorização {d.protocolo}</div>}
        {nfce && d.urlChave && <div>Consulte pela chave de acesso em {d.urlChave}</div>}
        <div className="font-mono">{chaveFmt(d.chave)}</div>
        <div className="mt-1">{d.destinatario ? `${nfce ? "Consumidor" : "Destinatário"}: ${doc(d.destinatario.documento)} ${d.destinatario.nome}` : "Consumidor não identificado"}</div>
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="QR Code da NFC-e" className="mx-auto mt-2 h-32 w-32" />
        )}
        {d.infCpl && <div className="mt-1">{d.infCpl}</div>}
      </div>
    </div>
  );
}
