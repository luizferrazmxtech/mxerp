import { prisma } from "@/lib/db";
import { configVenda } from "@/lib/vendas/config";
import { configOrcamento } from "@/lib/orcamentos/config";

const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qt = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const dia = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");
const diaSP = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const cnpjFmt = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
const docFmt = (d: string | null) => (!d ? "" : d.length === 14 ? cnpjFmt(d) : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"));

/** Pedido de venda impresso / link de cobrança (A4, com a marca MXTECH). */
export default async function DocumentoVenda({ id, token, cobranca }: { id?: string; token?: string; cobranca?: boolean }) {
  const v = await prisma.venda.findFirst({
    where: id ? { id } : { token },
    include: {
      cliente: true, vendedor: { select: { nome: true } }, transportadora: { select: { nome: true } }, formaPagamento: true, situacaoCfg: true,
      parcelas: { orderBy: { numero: "asc" }, include: { formaPagamento: { select: { nome: true } } } },
      itens: { orderBy: { ordem: "asc" }, include: { produto: { select: { codigo: true, nome: true, unidade: true, ncm: true, descricao: true } } } },
      servicos: { orderBy: { ordem: "asc" }, include: { servico: { select: { codigo: true, nome: true, descricao: true } } } },
      pagamentos: { include: { formaPagamento: true } },
    },
  });
  if (!v || (cobranca && v.situacaoCfg?.exibirCobranca === false)) return <p className="p-8 text-center">Pedido não encontrado.</p>;
  const [empresa, cfg, cfgImp, entrega, lanc] = await Promise.all([
    prisma.empresa.findFirst(), configVenda(), configOrcamento(),
    v.mostrarEntrega && v.enderecoEntregaId ? prisma.pessoaEndereco.findUnique({ where: { id: v.enderecoEntregaId } }) : null,
    prisma.lancamento.findMany({ where: { origemTipo: "VENDA", origemId: v.id }, orderBy: [{ vencimento: "asc" }, { parcela: "asc" }], include: { formaPagamento: true } }),
  ]);
  const doc = cfg.documentos;
  const c = v.cliente;
  const end = (e: { logradouro: string | null; numero: string | null; bairro: string | null; cidade: string | null; uf: string | null; cep: string | null }) =>
    [e.logradouro && `${e.logradouro}, ${e.numero ?? "s/n"}`, e.bairro, e.cidade && `${e.cidade}/${e.uf ?? ""}`, e.cep && `CEP ${e.cep}`].filter(Boolean).join(" · ");
  const parcelas = lanc.length
    ? lanc.map((l) => ({ id: l.id, n: l.parcela, venc: l.vencimento, valor: l.valor, forma: l.formaPagamento?.nome, pago: !!l.pagoEm }))
    : v.parcelas.map((p) => ({ id: p.id, n: p.numero, venc: p.vencimento, valor: p.valor, forma: p.formaPagamento?.nome ?? v.formaPagamento?.nome, pago: false }));

  return (
    <article className="documento mx-auto max-w-[21cm] bg-white p-[1.2cm] text-[#222]" style={{ fontSize: `${cfgImp.fonteA4 + 1}px` }}>
      <header className="flex items-start gap-4 border-b-2 border-[#018E83] pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/logo-claro.svg" alt="MXTECH" className="h-12" />
        <div className="flex-1 text-right text-[0.9em] leading-snug">
          <b className="text-[1.1em]">{empresa?.nomeFantasia || empresa?.razaoSocial}</b><br />
          {empresa && <>CNPJ {cnpjFmt(empresa.cnpj)}<br />{end(empresa)}<br />{[empresa.telefone, empresa.email].filter(Boolean).join(" · ")}</>}
        </div>
      </header>
      <div className="mt-4 flex items-end justify-between">
        <h1 className="text-[1.6em] font-semibold">Pedido de venda nº {v.numero}</h1>
        <div className="text-right text-[0.9em]">Data: <b>{diaSP(v.data)}</b>{v.prazoEntrega && <><br />Previsão de entrega: <b>{dia(v.prazoEntrega)}</b></>}<br />Situação: <b>{v.situacaoCfg?.nome}</b></div>
      </div>
      <section className="mt-3 rounded border border-slate-300 p-3 text-[0.95em] leading-snug">
        {c ? <><b>Cliente:</b> {c.nome}{c.fantasia && ` (${c.fantasia})`}{c.documento && <> · {c.documento.length === 14 ? "CNPJ" : "CPF"} {docFmt(c.documento)}</>}<br />
          {end(c) && <>{end(c)}<br /></>}{[c.telefone, c.celular, c.email].filter(Boolean).join(" · ")}</> : <b>Consumidor</b>}
        {v.vendedor && <><br /><b>Vendedor:</b> {v.vendedor.nome}</>}
      </section>

      {v.itens.length > 0 && (
        <table className="mt-4 w-full border-collapse text-[0.92em]">
          <thead><tr className="bg-[#018E83] text-left text-white">
            {doc.numeroItem && <th className="px-2 py-1">#</th>}{doc.codigoProduto && <th className="px-2 py-1">Código</th>}<th className="px-2 py-1">Produto</th>
            {doc.ncm && <th className="px-2 py-1">NCM</th>}{doc.unidade && <th className="px-2 py-1">Un.</th>}<th className="px-2 py-1 text-right">Qtd.</th>
            {doc.valorUnitario && <th className="px-2 py-1 text-right">Valor unit.</th>}{doc.subtotal && <th className="px-2 py-1 text-right">Subtotal</th>}
          </tr></thead>
          <tbody>{v.itens.map((l, i) => (
            <tr key={l.id} className="border-b border-slate-200 align-top">
              {doc.numeroItem && <td className="px-2 py-1">{i + 1}</td>}{doc.codigoProduto && <td className="px-2 py-1">{l.produto.codigo}</td>}
              <td className="px-2 py-1">{l.produto.nome}{l.detalhes && <div className="text-[0.85em] text-slate-600">{l.detalhes}</div>}{doc.descricaoProduto && l.produto.descricao && <div className="text-[0.85em] text-slate-600">{l.produto.descricao}</div>}</td>
              {doc.ncm && <td className="px-2 py-1">{l.produto.ncm}</td>}{doc.unidade && <td className="px-2 py-1">{l.produto.unidade}</td>}
              <td className="px-2 py-1 text-right">{qt(l.quantidade)}</td>
              {doc.valorUnitario && <td className="px-2 py-1 text-right">{brl(l.valorUnit)}</td>}{doc.subtotal && <td className="px-2 py-1 text-right">{brl(l.subtotal)}</td>}
            </tr>))}</tbody>
        </table>
      )}
      {v.servicos.length > 0 && (
        <table className="mt-4 w-full border-collapse text-[0.92em]">
          <thead><tr className="bg-[#018E83] text-left text-white"><th className="px-2 py-1">Serviço</th><th className="px-2 py-1 text-right">Qtd.</th><th className="px-2 py-1 text-right">Valor unit.</th><th className="px-2 py-1 text-right">Subtotal</th></tr></thead>
          <tbody>{v.servicos.map((l) => (
            <tr key={l.id} className="border-b border-slate-200 align-top">
              <td className="px-2 py-1">{l.servico.nome}{l.detalhes && <div className="text-[0.85em] text-slate-600">{l.detalhes}</div>}{doc.descricaoServico && l.servico.descricao && <div className="text-[0.85em] text-slate-600">{l.servico.descricao}</div>}</td>
              <td className="px-2 py-1 text-right">{qt(l.quantidade)}</td><td className="px-2 py-1 text-right">{brl(l.valorUnit)}</td><td className="px-2 py-1 text-right">{brl(l.subtotal)}</td>
            </tr>))}</tbody>
        </table>
      )}

      <div className="mt-4 flex justify-end">
        <table className="text-[0.95em]">
          <tbody>
            {Number(v.totalProdutos) > 0 && <tr><td className="pr-6">Produtos</td><td className="text-right">{brl(v.totalProdutos)}</td></tr>}
            {Number(v.totalServicos) > 0 && <tr><td className="pr-6">Serviços</td><td className="text-right">{brl(v.totalServicos)}</td></tr>}
            {Number(v.frete) > 0 && <tr><td className="pr-6">Frete{v.transportadora ? ` (${v.transportadora.nome})` : ""}</td><td className="text-right">{brl(v.frete)}</td></tr>}
            {Number(v.desconto) > 0 && <tr><td className="pr-6">Desconto</td><td className="text-right">− {brl(v.desconto)}</td></tr>}
            <tr className="text-[1.2em] font-semibold"><td className="pr-6 pt-1">Total</td><td className="pt-1 text-right">{brl(v.total)}</td></tr>
          </tbody>
        </table>
      </div>

      {v.pagamentos.length > 0 ? (
        <p className="mt-4 text-[0.95em]"><b>Pagamento:</b> {v.pagamentos.map((p) => `${p.formaPagamento.nome} ${brl(p.valor)}${p.parcelas > 1 ? ` em ${p.parcelas}x` : ""}`).join(" + ")}</p>
      ) : parcelas.length > 0 && (
        <section className="mt-4 text-[0.95em]">
          <b>{cobranca ? "Parcelas" : "Condições de pagamento"}:</b> {v.condicao === "PARCELADO" ? `${parcelas.length} parcelas` : "À vista"}{v.formaPagamento ? ` · ${v.formaPagamento.nome}` : ""}
          <table className="mt-1 w-full max-w-md text-[0.95em]"><tbody>{parcelas.map((p) => (
            <tr key={p.id} className="border-b border-slate-200"><td className="py-0.5">{p.n}ª</td><td>{dia(p.venc)}</td><td>{p.forma ?? ""}</td><td className="text-right">{brl(p.valor)}</td>
              {cobranca && <td className="pl-3 text-right">{p.pago ? <span className="text-emerald-700">Recebida</span> : <span className="text-orange-700">A pagar</span>}</td>}</tr>))}</tbody></table>
        </section>
      )}
      {entrega && <p className="mt-3 text-[0.95em]"><b>Entrega:</b> {end(entrega)}</p>}
      {v.observacoes && <section className="mt-4 rounded bg-slate-50 p-3 text-[0.95em]"><b>Observações</b><p className="whitespace-pre-wrap">{v.observacoes}</p></section>}
      {cobranca && empresa && <p className="mt-6 rounded border border-[#018E83]/40 bg-[#018E83]/5 p-3 text-[0.95em]">Para pagar, fale com {empresa.nomeFantasia || empresa.razaoSocial}{empresa.telefone ? ` pelo ${empresa.telefone}` : ""}{empresa.email ? ` ou ${empresa.email}` : ""}. Informe o nº do pedido: <b>{v.numero}</b>.</p>}
      {!cobranca && (
        <footer className="mt-10 grid grid-cols-2 gap-10 text-center text-[0.9em]">
          <div className="border-t border-slate-400 pt-1">{empresa?.nomeFantasia || empresa?.razaoSocial}</div>
          <div className="border-t border-slate-400 pt-1">Recebi os itens acima: {c?.nome ?? ""}</div>
        </footer>
      )}
    </article>
  );
}
