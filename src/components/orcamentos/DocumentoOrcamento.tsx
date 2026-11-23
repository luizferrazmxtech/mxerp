import { prisma } from "@/lib/db";
import { configOrcamento } from "@/lib/orcamentos/config";

const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qt = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const dia = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");
const cnpjFmt = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
const docFmt = (d: string | null) => (!d ? "" : d.length === 14 ? cnpjFmt(d) : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"));

/** A proposta impressa / enviada ao cliente (A4, com a marca MXTECH). */
export default async function DocumentoOrcamento({ id, token }: { id?: string; token?: string }) {
  const o = await prisma.orcamento.findFirst({
    where: id ? { id } : { token },
    include: {
      cliente: true, vendedor: { select: { nome: true, email: true, celular: true } }, transportadora: { select: { nome: true } }, formaPagamento: true,
      parcelas: { orderBy: { numero: "asc" }, include: { formaPagamento: { select: { nome: true } } } },
      produtos: { orderBy: { ordem: "asc" }, include: { produto: { select: { codigo: true, nome: true, unidade: true, ncm: true, descricao: true } } } },
      servicos: { orderBy: { ordem: "asc" }, include: { servico: { select: { codigo: true, nome: true, descricao: true } } } },
    },
  });
  if (!o) return <p className="p-8 text-center">Proposta não encontrada.</p>;
  const [empresa, cfg, entrega] = await Promise.all([
    o.empresaId ? prisma.empresa.findUnique({ where: { id: o.empresaId } }) : prisma.empresa.findFirst(),
    configOrcamento(),
    o.mostrarEntrega && o.enderecoEntregaId ? prisma.pessoaEndereco.findUnique({ where: { id: o.enderecoEntregaId } }) : null,
  ]);
  const doc = cfg.documentos;
  const c = o.cliente;
  const end = (e: { logradouro: string | null; numero: string | null; bairro: string | null; cidade: string | null; uf: string | null; cep: string | null }) =>
    [e.logradouro && `${e.logradouro}, ${e.numero ?? "s/n"}`, e.bairro, e.cidade && `${e.cidade}/${e.uf ?? ""}`, e.cep && `CEP ${e.cep}`].filter(Boolean).join(" · ");

  return (
    <article className="documento mx-auto max-w-[21cm] bg-white p-[1.2cm] text-[#222]" style={{ fontSize: `${cfg.fonteA4 + 1}px` }}>
      <header className="flex items-start gap-4 border-b-2 border-[#018E83] pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/logo-claro.svg" alt="MXTECH" className="h-12" />
        <div className="flex-1 text-right text-[0.9em] leading-snug">
          <b className="text-[1.1em]">{empresa?.nomeFantasia || empresa?.razaoSocial}</b><br />
          {empresa && <>CNPJ {cnpjFmt(empresa.cnpj)}<br />{end(empresa)}<br />{[empresa.telefone, empresa.email].filter(Boolean).join(" · ")}</>}
        </div>
      </header>
      <div className="mt-4 flex items-end justify-between">
        <h1 className="text-[1.6em] font-semibold">Proposta comercial nº {o.numero}</h1>
        <div className="text-right text-[0.9em]">Data: <b>{dia(o.data)}</b>{o.validade && <><br />Validade: <b>{o.validade}</b></>}{o.prazoEntrega && <><br />Previsão de entrega: <b>{dia(o.prazoEntrega)}</b></>}</div>
      </div>
      <section className="mt-3 rounded border border-slate-300 p-3 text-[0.95em] leading-snug">
        <b>Cliente:</b> {c.nome}{c.fantasia && ` (${c.fantasia})`}{c.documento && <> · {c.documento.length === 14 ? "CNPJ" : "CPF"} {docFmt(c.documento)}</>}<br />
        {end(c) && <>{end(c)}<br /></>}
        {[c.telefone, c.celular, c.email].filter(Boolean).join(" · ")}
        {o.aosCuidados && <><br /><b>Aos cuidados de:</b> {o.aosCuidados}</>}
        {o.vendedor && <><br /><b>Vendedor:</b> {o.vendedor.nome}</>}
      </section>
      {o.introducao && <p className="mt-3 whitespace-pre-wrap">{o.introducao}</p>}

      {o.produtos.length > 0 && (
        <table className="mt-4 w-full border-collapse text-[0.92em]">
          <thead><tr className="bg-[#018E83] text-left text-white">
            {doc.numeroItem && <th className="px-2 py-1">#</th>}{doc.codigoProduto && <th className="px-2 py-1">Código</th>}<th className="px-2 py-1">Produto</th>
            {doc.ncm && <th className="px-2 py-1">NCM</th>}{doc.unidade && <th className="px-2 py-1">Un.</th>}<th className="px-2 py-1 text-right">Qtd.</th>
            {doc.valorUnitario && <th className="px-2 py-1 text-right">Valor unit.</th>}{doc.subtotal && <th className="px-2 py-1 text-right">Subtotal</th>}
          </tr></thead>
          <tbody>{o.produtos.map((l, i) => (
            <tr key={l.id} className="border-b border-slate-200 align-top">
              {doc.numeroItem && <td className="px-2 py-1">{i + 1}</td>}{doc.codigoProduto && <td className="px-2 py-1">{l.descricao ? "" : l.produto.codigo}</td>}
              <td className="px-2 py-1">{l.descricao || l.produto.nome}{l.detalhes && <div className="text-[0.85em] text-slate-600">{l.detalhes}</div>}{doc.descricaoProduto && !l.descricao && l.produto.descricao && <div className="text-[0.85em] text-slate-600">{l.produto.descricao}</div>}</td>
              {doc.ncm && <td className="px-2 py-1">{l.produto.ncm}</td>}{doc.unidade && <td className="px-2 py-1">{l.produto.unidade}</td>}
              <td className="px-2 py-1 text-right">{qt(l.quantidade)}</td>
              {doc.valorUnitario && <td className="px-2 py-1 text-right">{brl(l.valorUnit)}</td>}{doc.subtotal && <td className="px-2 py-1 text-right">{brl(l.subtotal)}</td>}
            </tr>))}</tbody>
        </table>
      )}
      {o.servicos.length > 0 && (
        <table className="mt-4 w-full border-collapse text-[0.92em]">
          <thead><tr className="bg-[#018E83] text-left text-white"><th className="px-2 py-1">Serviço</th><th className="px-2 py-1 text-right">Qtd.</th><th className="px-2 py-1 text-right">Valor unit.</th><th className="px-2 py-1 text-right">Subtotal</th></tr></thead>
          <tbody>{o.servicos.map((l) => (
            <tr key={l.id} className="border-b border-slate-200 align-top">
              <td className="px-2 py-1">{l.servico.nome}{l.detalhes && <div className="text-[0.85em] text-slate-600">{l.detalhes}</div>}{doc.descricaoServico && l.servico.descricao && <div className="text-[0.85em] text-slate-600">{l.servico.descricao}</div>}</td>
              <td className="px-2 py-1 text-right">{qt(l.quantidade)}</td><td className="px-2 py-1 text-right">{brl(l.valorUnit)}</td><td className="px-2 py-1 text-right">{brl(l.subtotal)}</td>
            </tr>))}</tbody>
        </table>
      )}

      <div className="mt-4 flex justify-end">
        <table className="text-[0.95em]">
          <tbody>
            {Number(o.totalProdutos) > 0 && <tr><td className="pr-6">Produtos</td><td className="text-right">{brl(o.totalProdutos)}</td></tr>}
            {Number(o.totalServicos) > 0 && <tr><td className="pr-6">Serviços</td><td className="text-right">{brl(o.totalServicos)}</td></tr>}
            {Number(o.frete) > 0 && <tr><td className="pr-6">Frete{o.transportadora ? ` (${o.transportadora.nome})` : ""}</td><td className="text-right">{brl(o.frete)}</td></tr>}
            {Number(o.desconto) > 0 && <tr><td className="pr-6">Desconto</td><td className="text-right">− {brl(o.desconto)}</td></tr>}
            {o.exibirTotal && <tr className="text-[1.2em] font-semibold"><td className="pr-6 pt-1">Total</td><td className="pt-1 text-right">{brl(o.total)}</td></tr>}
          </tbody>
        </table>
      </div>

      {o.gerarCondicoes && o.parcelas.length > 0 && (
        <section className="mt-4 text-[0.95em]">
          <b>Condições de pagamento:</b> {o.condicao === "PARCELADO" ? `${o.parcelas.length} parcelas` : "À vista"}{o.formaPagamento ? ` · ${o.formaPagamento.nome}` : ""}
          {o.condicao === "PARCELADO" && <ul className="mt-1">{o.parcelas.map((p) => <li key={p.id}>{p.numero}ª · {dia(p.vencimento)} · {brl(p.valor)}{p.formaPagamento ? ` · ${p.formaPagamento.nome}` : ""}{p.observacao ? ` · ${p.observacao}` : ""}</li>)}</ul>}
        </section>
      )}
      {entrega && <p className="mt-3 text-[0.95em]"><b>Entrega:</b> {end(entrega)}</p>}
      {o.observacoes && <section className="mt-4 rounded bg-slate-50 p-3 text-[0.95em]"><b>Observações</b><p className="whitespace-pre-wrap">{o.observacoes}</p></section>}
      <footer className="mt-10 grid grid-cols-2 gap-10 text-center text-[0.9em]">
        <div className="border-t border-slate-400 pt-1">{empresa?.nomeFantasia || empresa?.razaoSocial}</div>
        <div className="border-t border-slate-400 pt-1">De acordo: {c.nome}</div>
      </footer>
    </article>
  );
}
