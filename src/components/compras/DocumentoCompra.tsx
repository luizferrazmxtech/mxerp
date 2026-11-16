import { prisma } from "@/lib/db";
import { configEstoque } from "@/lib/estoque/config";

const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qt = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const dia = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");
const cnpjFmt = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
const docFmt = (d: string | null) => (!d ? "" : d.length === 14 ? cnpjFmt(d) : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"));

/** Pedido de compra impresso / link da compra enviado ao fornecedor (A4, marca MXTECH). */
export default async function DocumentoCompra({ id, token }: { id?: string; token?: string }) {
  const c = await prisma.compra.findFirst({
    where: id ? { id } : { token },
    include: {
      fornecedor: true, transportadora: { select: { nome: true } }, formaPagamento: true, situacaoCfg: true,
      parcelas: { orderBy: { numero: "asc" }, include: { formaPagamento: { select: { nome: true } } } },
      itens: { orderBy: { ordem: "asc" }, include: { produto: { select: { codigo: true, nome: true, unidade: true, ncm: true } } } },
      servicos: { orderBy: { ordem: "asc" }, include: { servico: { select: { codigo: true, nome: true } } } },
    },
  });
  if (!c) return <p className="p-8 text-center">Compra não encontrada.</p>;
  const [empresa, cfg] = await Promise.all([prisma.empresa.findFirst(), configEstoque()]);
  const doc = cfg.documentos;
  const f = c.fornecedor;
  const end = (e: { logradouro: string | null; numero: string | null; bairro: string | null; cidade: string | null; uf: string | null; cep: string | null }) =>
    [e.logradouro && `${e.logradouro}, ${e.numero ?? "s/n"}`, e.bairro, e.cidade && `${e.cidade}/${e.uf ?? ""}`, e.cep && `CEP ${e.cep}`].filter(Boolean).join(" · ");
  return (
    <article className="documento mx-auto max-w-[21cm] bg-white p-[1.2cm] text-[13px] text-[#222]">
      <header className="flex items-start gap-4 border-b-2 border-[#018E83] pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/logo-claro.svg" alt="MXTECH" className="h-12" />
        <div className="flex-1 text-right text-[0.9em] leading-snug">
          <b className="text-[1.1em]">{empresa?.nomeFantasia || empresa?.razaoSocial}</b><br />
          {empresa && <>CNPJ {cnpjFmt(empresa.cnpj)}<br />{end(empresa)}<br />{[empresa.telefone, empresa.email].filter(Boolean).join(" · ")}</>}
        </div>
      </header>
      <div className="mt-4 flex items-end justify-between">
        <h1 className="text-[1.6em] font-semibold">Pedido de compra nº {c.numero}</h1>
        <div className="text-right text-[0.9em]">Emissão: <b>{dia(c.data)}</b><br />Situação: <b>{c.situacaoCfg?.nome}</b>{c.numeroNfe && <><br />NF-e: <b>{c.numeroNfe}</b></>}</div>
      </div>
      <section className="mt-3 rounded border border-slate-300 p-3">
        <b className="text-[0.8em] tracking-wide text-[#018E83] uppercase">Fornecedor</b>
        <div className="font-semibold">{f.nome}{f.fantasia && f.fantasia !== f.nome ? ` (${f.fantasia})` : ""}</div>
        <div className="text-[0.9em]">{[f.documento && `CPF/CNPJ ${docFmt(f.documento)}`, f.inscricaoEstadual && `IE ${f.inscricaoEstadual}`, f.telefone || f.celular, f.email].filter(Boolean).join(" · ")}</div>
        <div className="text-[0.9em]">{end(f)}</div>
      </section>
      {c.itens.length > 0 && (
        <table className="mt-4 w-full border-collapse text-[0.92em]">
          <thead><tr className="border-b-2 border-slate-400 text-left">{doc.numeroItem && <th className="py-1">#</th>}{doc.codigoProduto && <th>Código</th>}<th>Produto</th>{doc.ncm && <th>NCM</th>}<th className="text-right">Qtd.</th>{doc.unidade && <th>Un.</th>}{doc.valorUnitario && <th className="text-right">Custo unit.</th>}{doc.subtotal && <th className="text-right">Total</th>}</tr></thead>
          <tbody>{c.itens.map((i, k) => <tr key={i.id} className="border-b border-slate-200">{doc.numeroItem && <td className="py-1">{k + 1}</td>}{doc.codigoProduto && <td>{i.produto.codigo}</td>}<td>{i.produto.nome}{i.detalhes && <div className="text-[0.85em] text-slate-500">{i.detalhes}</div>}</td>{doc.ncm && <td>{i.produto.ncm}</td>}<td className="text-right">{qt(i.quantidade)}</td>{doc.unidade && <td>{i.unidadeCompra ?? i.produto.unidade}</td>}{doc.valorUnitario && <td className="text-right">{brl(i.custoUnit)}</td>}{doc.subtotal && <td className="text-right">{brl(i.subtotal)}</td>}</tr>)}</tbody>
        </table>
      )}
      {c.servicos.length > 0 && (
        <table className="mt-4 w-full border-collapse text-[0.92em]">
          <thead><tr className="border-b-2 border-slate-400 text-left"><th className="py-1">Serviço</th><th className="text-right">Qtd.</th><th className="text-right">Valor</th><th className="text-right">Total</th></tr></thead>
          <tbody>{c.servicos.map((i) => <tr key={i.id} className="border-b border-slate-200"><td className="py-1">{i.servico.nome}{i.detalhes && <div className="text-[0.85em] text-slate-500">{i.detalhes}</div>}</td><td className="text-right">{qt(i.quantidade)}</td><td className="text-right">{brl(i.valorUnit)}</td><td className="text-right">{brl(i.subtotal)}</td></tr>)}</tbody>
        </table>
      )}
      <div className="mt-3 ml-auto w-72 space-y-0.5 text-[0.95em]">
        {Number(c.totalProdutos) > 0 && <div className="flex"><span>Produtos</span><span className="ml-auto">{brl(c.totalProdutos)}</span></div>}
        {Number(c.totalServicos) > 0 && <div className="flex"><span>Serviços</span><span className="ml-auto">{brl(c.totalServicos)}</span></div>}
        {Number(c.frete) > 0 && <div className="flex"><span>Frete{c.freteNoTotal ? "" : " (fora do total)"}</span><span className="ml-auto">{brl(c.frete)}</span></div>}
        {Number(c.impostos) > 0 && <div className="flex"><span>Impostos{c.impostosNoTotal ? "" : " (fora do total)"}</span><span className="ml-auto">{brl(c.impostos)}</span></div>}
        {Number(c.desconto) > 0 && <div className="flex"><span>Desconto</span><span className="ml-auto">− {brl(c.desconto)}</span></div>}
        <div className="flex border-t-2 border-slate-400 pt-1 text-[1.15em] font-semibold"><span>Total</span><span className="ml-auto">{brl(c.total)}</span></div>
      </div>
      <section className="mt-4">
        <b className="text-[0.8em] tracking-wide text-[#018E83] uppercase">Pagamento</b>
        <div>{c.condicao === "PARCELADO" ? `Parcelado em ${c.parcelas.length}x` : "À vista"}{c.formaPagamento ? ` · ${c.formaPagamento.nome}` : ""}{c.transportadora ? ` · Transportadora: ${c.transportadora.nome}` : ""}</div>
        {c.parcelas.length > 1 && <table className="mt-1 w-full text-[0.9em]"><tbody>{c.parcelas.map((p) => <tr key={p.id}><td>{p.numero}ª</td><td>{dia(p.vencimento)}</td><td>{p.formaPagamento?.nome ?? ""}</td><td className="text-right">{brl(p.valor)}</td></tr>)}</tbody></table>}
      </section>
      {(c.observacoes || cfg.textoCompras) && <section className="mt-4 whitespace-pre-wrap text-[0.92em]"><b className="text-[0.8em] tracking-wide text-[#018E83] uppercase">Observações</b><br />{c.observacoes || cfg.textoCompras}</section>}
    </article>
  );
}
