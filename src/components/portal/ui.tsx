import Link from "next/link";
import Icone from "@/components/Icone";
import { cor } from "@/lib/orcamentos/tipos";
import { brl, data, dataSP } from "@/lib/ui/format";
import type { ContaPortal, NotaPortal } from "@/lib/portal/dados";
import { MODELO_NOTA } from "./formato";
import BotaoCopiar from "./BotaoCopiar";

/** Título das telas da Área do Cliente, com "Voltar" opcional. */
export function Titulo({ titulo, subtitulo, voltar, acoes }: { titulo: React.ReactNode; subtitulo?: React.ReactNode; voltar?: string; acoes?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {voltar && <Link href={voltar} className="btn-sec h-9 w-9 px-0" aria-label="Voltar"><Icone nome="direita" size={16} className="rotate-180" /></Link>}
      <div className="min-w-0 flex-1">
        <h1 className="flex flex-wrap items-center gap-2 text-[22px] font-medium leading-tight text-[#212529] md:text-[24px]">{titulo}</h1>
        {subtitulo && <div className="mt-0.5 text-[13px] text-slate-500">{subtitulo}</div>}
      </div>
      {acoes && <div className="flex w-full flex-wrap gap-2 sm:w-auto">{acoes}</div>}
    </div>
  );
}

/** Situação em pílula com as cores configuradas no ERP. */
export function Situacao({ nome, cor: c }: { nome: string; cor: string }) {
  return <span className={`pilula ${cor(c).pilula}`}>{nome}</span>;
}

export function Vazio({ icone, texto }: { icone: string; texto: string }) {
  return (
    <div className="cartao flex flex-col items-center gap-2 px-4 py-10 text-center text-[14px] text-slate-500">
      <Icone nome={icone} size={30} className="text-slate-300" /> {texto}
    </div>
  );
}

/** Seção de detalhe: cabeçalho cinza (padrão Gestão Click) e corpo. */
export function Secao({ titulo, icone, children, corpo = "p-4" }: { titulo: React.ReactNode; icone?: string; children: React.ReactNode; corpo?: string }) {
  return (
    <section className="cartao mb-3">
      <h2 className="flex items-center gap-1.5 rounded-t-md border-b border-slate-200 bg-[#f7f7f7] px-4 py-2.5 text-[15px] font-semibold text-slate-800">
        {icone && <Icone nome={icone} size={15} />} {titulo}
      </h2>
      <div className={corpo}>{children}</div>
    </section>
  );
}

const loja = (l: { nome: string } | null) => l ? <span className="text-[11px] uppercase text-slate-500">{l.nome}</span> : null;

/** Notas fiscais com os botões de PDF (DANFE) e XML. */
export function ListaNotas({ notas, semOrigem }: { notas: NotaPortal[]; semOrigem?: boolean }) {
  if (!notas.length) return <p className="px-4 py-6 text-center text-[13px] text-slate-500">Nenhuma nota fiscal emitida.</p>;
  const botoes = (x: NotaPortal) => (
    <div className="flex flex-wrap gap-1.5">
      {x.modelo !== "NFSE" && <a href={`/area-cliente/arquivos/nota/${x.id}/pdf`} target="_blank" rel="noreferrer" className="btn-sec px-2.5"><Icone nome="imprimir" size={14} /> PDF</a>}
      {x.danfse && <a href={x.danfse} target="_blank" rel="noreferrer" className="btn-sec px-2.5"><Icone nome="imprimir" size={14} /> PDF</a>}
      <a href={`/area-cliente/arquivos/nota/${x.id}/xml`} className="btn-sec px-2.5"><Icone nome="exportar" size={14} /> XML</a>
    </div>
  );
  const nome = (x: NotaPortal) => <>{MODELO_NOTA[x.modelo] ?? x.modelo} nº {x.numero}<span className="text-[11px] font-normal text-slate-500"> série {x.serie}</span></>;
  const etiquetas = (x: NotaPortal) => <>
    {x.cancelada && <Situacao nome="Cancelada" cor="vermelho" />}
    {x.homologacao && <Situacao nome="Teste (sem valor fiscal)" cor="amarelo" />}
  </>;
  return (
    <>
      <ul className="divide-y divide-slate-100 md:hidden">
        {notas.map((x) => (
          <li key={x.id} className="space-y-2 px-4 py-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{nome(x)}</div>
                <div className="text-[12px] text-slate-500">{dataSP(x.data)}{!semOrigem && x.origem && <> · <Link href={x.origem.href} className="text-marca">{x.origem.rotulo}</Link></>}</div>
                {loja(x.loja)}
              </div>
              <div className="text-right font-semibold">{brl(x.valor)}</div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">{etiquetas(x)}</div>
            {botoes(x)}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="tabela">
          <thead><tr><th>Nota</th><th>Data</th>{!semOrigem && <th>Referente a</th>}<th>Emitente</th><th className="text-right">Valor</th><th className="w-1">Baixar</th></tr></thead>
          <tbody>
            {notas.map((x) => (
              <tr key={x.id}>
                <td><div className="font-semibold">{nome(x)}</div><div className="flex flex-wrap gap-1">{etiquetas(x)}</div></td>
                <td>{dataSP(x.data)}</td>
                {!semOrigem && <td>{x.origem ? <Link href={x.origem.href} className="text-marca hover:underline">{x.origem.rotulo}</Link> : "—"}</td>}
                <td className="max-w-56 text-[12px] uppercase">{x.loja?.nome ?? "—"}</td>
                <td className="text-right">{brl(x.valor)}</td>
                <td><div className="whitespace-nowrap [&>div]:flex-nowrap">{botoes(x)}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SituacaoConta({ c }: { c: ContaPortal }) {
  if (c.pagoEm) return <Situacao nome={`Pago em ${data(c.pagoEm)}`} cor="verde" />;
  if (c.vencida) return <Situacao nome="Vencido" cor="vermelho" />;
  return <Situacao nome="Em aberto" cor="amarelo" />;
}

/** Parcelas a pagar e pagas, com o boleto (PDF), a linha digitável e o PIX copia-e-cola. */
export function ListaContas({ contas, vazio = "Nenhuma parcela." }: { contas: ContaPortal[]; vazio?: string }) {
  if (!contas.length) return <p className="px-4 py-6 text-center text-[13px] text-slate-500">{vazio}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {contas.map((c) => (
        <li key={c.id} className="space-y-2 px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{c.descricao}{c.parcela && <span className="font-normal text-slate-500"> · parcela {c.parcela}</span>}</div>
              <div className="text-[12px] text-slate-500">
                Vencimento {data(c.vencimento)}{c.forma && <> · {c.forma}</>}
                {c.origem && <> · <Link href={c.origem} className="text-marca hover:underline">ver detalhes</Link></>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="whitespace-nowrap text-[16px] font-semibold">{brl(c.pagoEm ? c.valorPago ?? c.valor : c.valor)}</span>
              <SituacaoConta c={c} />
            </div>
          </div>
          {c.boleto && (
            <div className="flex flex-wrap gap-1.5">
              <a href={c.boleto.link} target="_blank" rel="noreferrer" className="btn-marca"><Icone nome="boleto" size={15} /> Boleto</a>
              {c.boleto.pix && <BotaoCopiar texto={c.boleto.pix} rotulo="PIX copia e cola" />}
              {c.boleto.linhaDigitavel && <BotaoCopiar texto={c.boleto.linhaDigitavel} rotulo="Linha digitável" />}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
