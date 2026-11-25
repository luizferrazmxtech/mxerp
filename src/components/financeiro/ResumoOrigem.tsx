import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cor } from "@/lib/orcamentos/tipos";
import { brl, dataSP, num2, qtd } from "@/lib/ui/format";
import { Bloco } from "@/components/ui/Pagina";
import Icone from "@/components/Icone";

const docFmt = (c: string) => (c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"));

type Num = number | Prisma.Decimal;
type Pessoa = { id: string; nome: string; fantasia: string | null; documento: string | null; telefone: string | null; celular: string | null; email: string | null; cidade: string | null; uf: string | null };
type Item = { id: string; codigo: string; nome: string; detalhes: string | null; quantidade: Num; unidade: string; valorUnit: Num; subtotal: Num };
type Resumo = {
  rotulo: string; href: string; icone: string; data: Date; situacao: string; corSituacao: string;
  pessoa: Pessoa | null; papel: "Cliente" | "Fornecedor"; hrefPessoa: string | null; responsavel?: string | null;
  itens: Item[]; produtos: number; servicos: number; desconto: number; frete: number; total: number; observacoes?: string | null;
};

const pessoaSel = { select: { id: true, nome: true, fantasia: true, documento: true, telefone: true, celular: true, email: true, cidade: true, uf: true } } as const;

async function carregar(origemTipo: string | null, origemId: string | null, contaId: string): Promise<Resumo | null> {
  if (!origemId) return null;
  const conta = `?conta=${contaId}`;
  if (origemTipo === "VENDA") {
    const v = await prisma.venda.findUnique({
      where: { id: origemId },
      include: {
        cliente: pessoaSel, vendedor: { select: { nome: true } }, situacaoCfg: { select: { nome: true, cor: true } },
        itens: { orderBy: { ordem: "asc" }, include: { produto: { select: { codigo: true, nome: true, unidade: true } } } },
        servicos: { orderBy: { ordem: "asc" }, include: { servico: { select: { codigo: true, nome: true } } } },
      },
    });
    if (!v) return null;
    return {
      rotulo: `Venda #${v.numero}`, href: `/vendas/${v.id}${conta}`, icone: "carrinho", data: v.data, situacao: v.situacaoCfg?.nome ?? v.situacao, corSituacao: v.situacaoCfg?.cor ?? "cinza",
      pessoa: v.cliente, papel: "Cliente", hrefPessoa: v.cliente ? `/clientes/${v.cliente.id}` : null, responsavel: v.vendedor?.nome,
      itens: [
        ...v.itens.map((i) => ({ id: i.id, codigo: i.descricao ? "" : i.produto.codigo, nome: i.descricao || i.produto.nome, detalhes: i.detalhes, quantidade: i.quantidade, unidade: i.produto.unidade, valorUnit: i.valorUnit, subtotal: i.subtotal })),
        ...v.servicos.map((i) => ({ id: i.id, codigo: i.servico.codigo, nome: i.servico.nome, detalhes: i.detalhes, quantidade: i.quantidade, unidade: "SV", valorUnit: i.valorUnit, subtotal: i.subtotal })),
      ],
      produtos: Number(v.totalProdutos), servicos: Number(v.totalServicos), desconto: Number(v.desconto), frete: Number(v.frete), total: Number(v.total), observacoes: v.observacoes,
    };
  }
  if (origemTipo === "OS") {
    const o = await prisma.ordemServico.findUnique({
      where: { id: origemId },
      include: {
        cliente: pessoaSel, tecnico: { select: { nome: true } }, situacaoCfg: { select: { nome: true, cor: true } },
        produtos: { orderBy: { ordem: "asc" }, include: { produto: { select: { codigo: true, nome: true, unidade: true } } } },
        servicos: { orderBy: { ordem: "asc" }, include: { servico: { select: { codigo: true, nome: true } } } },
      },
    });
    if (!o) return null;
    return {
      rotulo: `OS #${o.numero}`, href: `/os/${o.id}${conta}`, icone: "os", data: o.entrada, situacao: o.situacaoCfg?.nome ?? o.situacao, corSituacao: o.situacaoCfg?.cor ?? "cinza",
      pessoa: o.cliente, papel: "Cliente", hrefPessoa: `/clientes/${o.cliente.id}`, responsavel: o.tecnico?.nome,
      itens: [
        ...o.servicos.map((i) => ({ id: i.id, codigo: i.servico.codigo, nome: i.servico.nome, detalhes: i.detalhes, quantidade: i.quantidade, unidade: "SV", valorUnit: i.valorUnit, subtotal: i.subtotal })),
        ...o.produtos.map((i) => ({ id: i.id, codigo: i.descricao ? "" : i.produto.codigo, nome: i.descricao || i.produto.nome, detalhes: i.detalhes, quantidade: i.quantidade, unidade: i.produto.unidade, valorUnit: i.valorUnit, subtotal: i.subtotal })),
      ],
      produtos: Number(o.totalProdutos), servicos: Number(o.totalServicos), desconto: Number(o.desconto), frete: Number(o.frete) + Number(o.outros), total: Number(o.total), observacoes: o.observacoes,
    };
  }
  if (origemTipo === "COMPRA") {
    const c = await prisma.compra.findUnique({
      where: { id: origemId },
      include: {
        fornecedor: pessoaSel, situacaoCfg: { select: { nome: true, cor: true } },
        itens: { orderBy: { ordem: "asc" }, include: { produto: { select: { codigo: true, nome: true, unidade: true } } } },
      },
    });
    if (!c) return null;
    return {
      rotulo: `Compra #${c.numero}${c.numeroNfe ? ` · NF ${c.numeroNfe}` : ""}`, href: `/compras/${c.id}${conta}`, icone: "carrinho", data: c.data,
      situacao: c.situacaoCfg?.nome ?? (c.recebida ? "Recebida" : "Em aberto"), corSituacao: c.situacaoCfg?.cor ?? "cinza",
      pessoa: c.fornecedor, papel: "Fornecedor", hrefPessoa: `/fornecedores/${c.fornecedor.id}`,
      itens: c.itens.map((i) => ({ id: i.id, codigo: i.produto.codigo, nome: i.produto.nome, detalhes: i.detalhes, quantidade: i.quantidade, unidade: i.unidadeCompra ?? i.produto.unidade, valorUnit: i.custoUnit, subtotal: i.subtotal })),
      produtos: Number(c.totalProdutos), servicos: Number(c.totalServicos), desconto: Number(c.desconto), frete: Number(c.frete), total: Number(c.total), observacoes: c.observacoes,
    };
  }
  return null;
}

/**
 * Resumo do documento de origem (venda, OS ou compra) na tela da conta a receber/pagar:
 * quem é o cliente, com contato, situação, totais e os itens, sem precisar abrir a venda.
 */
export default async function ResumoOrigem({ origemTipo, origemId, contaId }: { origemTipo: string | null; origemId: string | null; contaId: string }) {
  const r = await carregar(origemTipo, origemId, contaId);
  if (!r) return null;
  const c = cor(r.corSituacao);
  const p = r.pessoa;
  const fone = p?.celular || p?.telefone;
  return (
    <Bloco icone={r.icone} titulo={<>Resumo da <b>{r.rotulo}</b></>} corpo="p-0"
      acoes={<div className="flex items-center gap-2"><span className={`pilula ${c.pilula}`}>{r.situacao}</span><Link href={r.href} className="btn-sec py-1 text-[13px]"><Icone nome="ver" size={13} /> Abrir</Link></div>}>
      <div className="grid gap-x-6 gap-y-3 border-b border-[#eef0f2] p-4 text-[14px] md:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="text-[12px] uppercase tracking-wide text-[#6c757d]">{r.papel}</div>
          {p ? (
            <>
              {r.hrefPessoa ? <Link href={r.hrefPessoa} className="text-[16px] font-semibold text-marca hover:underline">{p.nome}</Link> : <b className="text-[16px]">{p.nome}</b>}
              {p.fantasia && p.fantasia !== p.nome && <div className="text-[12px] text-[#6c757d]">{p.fantasia}</div>}
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] text-slate-600">
                {p.documento && <span>{p.documento.length === 14 ? "CNPJ" : "CPF"} {docFmt(p.documento)}</span>}
                {fone && <span className="inline-flex items-center gap-1"><Icone nome="telefone" size={12} />{fone}</span>}
                {p.email && <span className="inline-flex items-center gap-1"><Icone nome="email" size={12} />{p.email}</span>}
                {p.cidade && <span>{p.cidade}{p.uf ? `/${p.uf}` : ""}</span>}
              </div>
            </>
          ) : <b>Consumidor</b>}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
          <span className="text-[#6c757d]">Data</span><span>{dataSP(r.data)}</span>
          {r.responsavel && <><span className="text-[#6c757d]">{r.icone === "os" ? "Técnico" : "Vendedor"}</span><span>{r.responsavel}</span></>}
          <span className="text-[#6c757d]">Itens</span><span>{r.itens.length}</span>
          <span className="text-[#6c757d]">Total</span><b className="text-[15px]">{brl(r.total)}</b>
        </div>
      </div>
      {r.itens.length > 0 && (
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Item</th><th className="w-24 text-right">Qtd</th><th className="w-28 text-right">Unitário</th><th className="w-28 text-right">Subtotal</th></tr></thead>
            <tbody>
              {r.itens.map((i) => (
                <tr key={i.id}>
                  <td><span className="text-[12px] text-slate-500">{i.codigo}</span> {i.nome}{i.detalhes && <div className="text-[11px] text-slate-500">{i.detalhes}</div>}</td>
                  <td className="text-right">{qtd(i.quantidade)} {i.unidade}</td>
                  <td className="text-right">{num2(i.valorUnit)}</td>
                  <td className="text-right">{num2(i.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap justify-end gap-x-5 gap-y-1 border-t border-[#eef0f2] px-4 py-2.5 text-[13px] text-slate-600">
            {r.produtos > 0 && <span>Produtos <b className="text-slate-800">{brl(r.produtos)}</b></span>}
            {r.servicos > 0 && <span>Serviços <b className="text-slate-800">{brl(r.servicos)}</b></span>}
            {r.frete > 0 && <span>Frete/outros <b className="text-slate-800">{brl(r.frete)}</b></span>}
            {r.desconto > 0 && <span>Desconto <b className="text-slate-800">−{brl(r.desconto)}</b></span>}
            <span>Total <b className="text-[15px] text-slate-900">{brl(r.total)}</b></span>
          </div>
        </div>
      )}
      {r.observacoes && <p className="border-t border-[#eef0f2] px-4 py-2.5 text-[13px] text-slate-600 whitespace-pre-line"><b>Observações:</b> {r.observacoes}</p>}
    </Bloco>
  );
}
