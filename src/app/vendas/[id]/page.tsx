import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SITUACOES_VENDA } from "@/lib/vendas/vendas";
import { garantirPadroes } from "@/lib/financeiro/padroes";
import { brl, data, dataSP, horaSP, num2, qtd } from "@/lib/ui/format";
import { Pagina, Pilula } from "@/components/ui/Pagina";
import Suspenso from "@/components/ui/Suspenso";
import { LinkSuspenso } from "@/components/ui/BarraLista";
import Icone from "@/components/Icone";
import NotasDoDocumento from "@/components/NotasDoDocumento";
import { Concluir, SituacaoVenda } from "./Fechamento";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visualizar venda" };

const ABAS = [
  { id: "cliente", rotulo: "Cliente", icone: "funcionarios" },
  { id: "produtos", rotulo: "Produtos", icone: "produtos" },
  { id: "pagamento", rotulo: "Pagamento", icone: "dinheiro" },
  { id: "notas", rotulo: "Notas fiscais", icone: "notas" },
] as const;
const docFmt = (d: string | null) =>
  !d ? "" : d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");

function Linha({ icone, rotulo, children }: { icone: string; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-t border-slate-100 py-2.5 text-[13px]">
      <Icone nome={icone} size={14} className="text-slate-500" /><span className="text-slate-600">{rotulo}</span>
      <span className="ml-auto text-right font-semibold uppercase">{children}</span>
    </div>
  );
}

export default async function VisualizarVenda({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; acao?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const v = await prisma.venda.findUnique({
    where: { id },
    include: { cliente: true, vendedor: { select: { nome: true } }, itens: { include: { produto: true } }, pagamentos: { include: { formaPagamento: true } } },
  });
  if (!v) notFound();
  await prisma.$transaction((tx) => garantirPadroes(tx));
  const [reservas, formas, lancamentos] = await Promise.all([
    prisma.reserva.findMany({ where: { origemTipo: "VENDA", origemId: id, status: { in: ["ATIVA", "BAIXADA"] } }, include: { local: true } }),
    prisma.formaPagamento.findMany({ where: { ativa: true }, orderBy: { nome: "asc" } }),
    prisma.lancamento.findMany({ where: { origemTipo: "VENDA", origemId: id }, include: { formaPagamento: true }, orderBy: [{ vencimento: "asc" }] }),
  ]);
  const aba = ABAS.some((a) => a.id === sp.aba) ? sp.aba! : v.cliente ? "cliente" : "produtos";
  const porItem = new Map<string, typeof reservas>();
  for (const r of reservas) porItem.set(r.origemItemId, [...(porItem.get(r.origemItemId) ?? []), r]);
  const sit = SITUACOES_VENDA.find((s) => s.valor === v.situacao)!;
  const totalProdutos = v.itens.reduce((s, i) => s + Number(i.subtotal), 0);
  const balcao = v.tipo === "BALCAO";
  const lista = balcao ? { rotulo: "Vendas balcão", href: "/vendas/balcao" } : { rotulo: "Vendas de produtos", href: "/vendas" };
  const fone = (v.cliente?.celular || v.cliente?.telefone || "").replace(/\D/g, "");
  const texto = encodeURIComponent(`Olá! Segue a venda nº ${v.numero} da MXTECH. Valor: ${brl(v.total)}.`);

  return (
    <Pagina titulo="Visualizar venda" trilha={[lista, { rotulo: "Visualizar" }]}>
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[20px]"><Icone nome={balcao ? "balcao" : "carrinho"} size={18} /> Venda #{v.numero} <Pilula rotulo={sit.rotulo} cor={sit.cor} /></h2>
          <p className="text-[12px] text-slate-500">{balcao ? "Venda balcão (PDV)" : "Pedido"} · {dataSP(v.data)} {horaSP(v.createdAt)}</p>
        </div>
        <div className="no-print ml-auto flex gap-2">
          <div className="flex">
            <Link href={`/vendas/${id}/editar`} className="btn-laranja rounded-r-none"><Icone nome="editar" size={14} /> Editar</Link>
            <Suspenso direita classe="btn-laranja rounded-l-none border-l border-white/30 px-2" botao={<Icone nome="abaixo" size={14} />} titulo="Mais opções">
              <LinkSuspenso href={`/vendas/${id}/editar`} icone="editar">Editar</LinkSuspenso>
              <LinkSuspenso href={`/vendas/${id}?aba=${aba}&acao=situacao`} icone="atualizar">Alterar situação</LinkSuspenso>
              {v.situacao !== "CONCLUIDA" && v.situacao !== "CANCELADA" && <LinkSuspenso href={`/vendas/${id}?aba=pagamento`} icone="dinheiro">Concretizar (pagamento)</LinkSuspenso>}
              <LinkSuspenso href={`/vendas/${id}?aba=notas`} icone="notas">Emitir NF-e / NFC-e</LinkSuspenso>
            </Suspenso>
          </div>
          {(fone || v.cliente?.email) && (
            <Suspenso direita classe="btn-verde" botao={<><Icone nome="compartilhar" size={14} /> Compartilhar <Icone nome="abaixo" size={13} /></>}>
              {fone && <a href={`https://wa.me/55${fone.replace(/^55/, "")}?text=${texto}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="compartilhar" size={15} /> Enviar por WhatsApp</a>}
              {v.cliente?.email && <a href={`mailto:${v.cliente.email}?subject=${encodeURIComponent(`Venda ${v.numero} - MXTECH`)}`} className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="compartilhar" size={15} /> Enviar por e-mail</a>}
            </Suspenso>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <section className="cartao h-fit p-4">
          <div className="flex items-start gap-4 pb-3">
            <div><div className="text-[11px] text-slate-500">Venda</div><div className="text-[13px] font-semibold">Nº {v.numero}</div></div>
            <div><div className="text-[11px] text-slate-500">Data</div><div className="text-[13px]">{dataSP(v.data)}</div></div>
            <div className="ml-auto text-right"><span className="align-top text-[13px]">R$</span><span className="text-[28px] font-semibold leading-none">{num2(v.total)}</span></div>
          </div>
          <div className="space-y-1.5 border-t border-slate-100 py-3 text-[13px]">
            <div className="flex justify-between"><span className="text-slate-600">Produtos</span><span>{brl(totalProdutos)}</span></div>
            {Number(v.frete) > 0 && <div className="flex justify-between"><span className="text-slate-600">Frete</span><span>{brl(v.frete)}</span></div>}
            {Number(v.desconto) > 0 && <div className="flex justify-between"><span className="text-slate-600">Desconto</span><span>− {brl(v.desconto)}</span></div>}
          </div>
          <Linha icone="etiqueta" rotulo="Situação"><span className="normal-case"><Pilula rotulo={sit.rotulo} cor={sit.cor} /></span></Linha>
          <Linha icone="funcionarios" rotulo="Cliente">{v.cliente?.nome ?? "Consumidor"}</Linha>
          <Linha icone="carrinho" rotulo="Vendedor">{v.vendedor?.nome ?? "—"}</Linha>
          <Linha icone="balcao" rotulo="Tipo">{balcao ? "Balcão" : "Pedido"}</Linha>
          {v.observacoes && <div className="border-t border-slate-100 pt-2 text-[12px] text-slate-600"><b>Observações:</b> {v.observacoes}</div>}
        </section>

        <div>
          <nav className="no-print mb-3 flex flex-wrap gap-1">
            {ABAS.map((a) => (
              <Link key={a.id} href={`/vendas/${id}?aba=${a.id}`} scroll={false} className={`aba ${aba === a.id ? "aba-ativa" : ""}`}><Icone nome={a.icone} size={14} /> {a.rotulo}</Link>
            ))}
          </nav>

          {aba === "cliente" && (
            <section className="cartao p-5">
              {v.cliente ? (
                <div className="flex flex-wrap gap-6">
                  <div className="w-40 text-center">
                    <div className="flex h-32 items-center justify-center rounded bg-slate-100 text-[22px] text-slate-500">{v.cliente.nome.split(/\s+/).slice(0, 2).map((p) => p[0]).join("")}</div>
                    <div className="mt-2 text-[13px] font-semibold uppercase">{v.cliente.nome}</div>
                    <div className="text-[12px] text-slate-500">{docFmt(v.cliente.documento)}</div>
                  </div>
                  <dl className="flex-1 space-y-1 text-[13px]">
                    <div><b>Tipo de cliente:</b> {v.cliente.tipoPessoa === "FISICA" ? "Pessoa física" : "Pessoa jurídica"}</div>
                    {v.cliente.fantasia && <div><b>Nome fantasia:</b> <span className="uppercase">{v.cliente.fantasia}</span></div>}
                    {v.cliente.telefone && <div><b>Telefone:</b> {v.cliente.telefone}</div>}
                    {v.cliente.celular && <div><b>Celular:</b> {v.cliente.celular}</div>}
                    {v.cliente.email && <div><b>E-mail:</b> {v.cliente.email}</div>}
                    <div><b>Endereço:</b> <span className="uppercase">{[v.cliente.logradouro, v.cliente.numero, v.cliente.bairro, [v.cliente.cidade, v.cliente.uf].filter(Boolean).join("/")].filter(Boolean).join(", ") || "—"}</span></div>
                  </dl>
                </div>
              ) : <p className="text-[13px] text-slate-500">Venda para consumidor, sem cliente identificado.</p>}
            </section>
          )}

          {aba === "produtos" && (
            <div className="space-y-2">
              {v.itens.map((i) => (
                <div key={i.id} className="cartao flex gap-4 p-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100"><Icone nome="produtos" size={18} /></span>
                  <div className="flex-1">
                    <div className="text-[14px] font-semibold uppercase">{i.produto.nome}</div>
                    <div className="mt-1 flex flex-wrap gap-x-5 text-[12px] text-slate-600">
                      <span>{i.produto.codigo}</span><span>Valor: <b>{brl(i.valorUnit)}</b></span><span>Quantidade: <b>{qtd(i.quantidade)} {i.produto.unidade}</b></span>
                      <span className="font-semibold text-slate-800">Subtotal: {brl(i.subtotal)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
                      {(porItem.get(i.id) ?? []).map((r) => (
                        <span key={r.id} className={`rounded border px-1.5 py-0.5 ${!r.local ? "border-red-300 bg-red-50 font-semibold text-red-700" : r.status === "BAIXADA" ? "border-slate-200 text-slate-500" : "border-marca/40 bg-marca/5 text-marca-escura"}`}>
                          <Icone nome="locais" size={11} className="mr-1 inline" />{r.local?.codigo ?? "EM FALTA"} · {qtd(r.quantidade)}{r.status === "BAIXADA" ? " · baixado" : r.local ? " · reservado" : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              {!v.itens.length && <div className="cartao p-6 text-center text-[13px] text-slate-500">Nenhum produto.</div>}
              {v.itens.length > 0 && <div className="pt-1 text-right"><div className="text-[11px] text-slate-500">Total dos produtos</div><div className="text-[18px] font-semibold">{brl(totalProdutos)}</div></div>}
            </div>
          )}

          {aba === "pagamento" && (
            <section className="cartao p-4">
              {lancamentos.length > 0 ? (
                <table className="tabela">
                  <thead><tr><th>Parcela</th><th>Forma</th><th>Vencimento</th><th className="text-right">Valor</th><th>Situação</th></tr></thead>
                  <tbody>
                    {lancamentos.map((l) => (
                      <tr key={l.id}>
                        <td>{l.parcela}/{l.totalParcelas}</td><td>{l.formaPagamento?.nome ?? "—"}</td><td>{data(l.vencimento)}</td><td className="text-right">{brl(l.valor)}</td>
                        <td>{l.pagoEm ? <Pilula rotulo={`Recebido em ${data(l.pagoEm)}`} cor="border-green-400 bg-green-50 text-green-700" /> : <Pilula rotulo="A receber" cor="border-slate-300 text-slate-600" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : v.situacao === "CANCELADA" ? <p className="text-[13px] text-slate-500">Venda cancelada.</p> : (
                <>
                  <p className="mb-3 text-[13px] text-slate-600">Informe como o cliente vai pagar. Concretizar baixa os produtos do estoque e gera o contas a receber.</p>
                  <Concluir vendaId={id} total={Number(v.total)} formas={formas.map((f) => ({ id: f.id, nome: f.nome, diasPrazo: f.diasPrazo }))} />
                </>
              )}
            </section>
          )}

          {aba === "notas" && <NotasDoDocumento origemTipo="VENDA" origemId={id} podeEmitir={v.situacao === "CONCLUIDA"} />}
        </div>
      </div>

      {sp.acao === "situacao" && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24">
          <div className="cartao w-full max-w-md shadow-xl">
            <div className="flex items-center border-b px-4 py-3">
              <h3 className="text-[16px]">Alterar <b>situação</b> da venda #{v.numero}</h3>
              <Link href={`/vendas/${id}?aba=${aba}`} className="ml-auto text-slate-500 hover:text-black" aria-label="Fechar"><Icone nome="fechar" /></Link>
            </div>
            <div className="p-4">
              <SituacaoVenda vendaId={id} situacao={v.situacao} />
              <p className="mt-3 text-[12px] text-slate-500">Em aberto reserva os produtos; orçamento e cancelada liberam. Para concretizar, use a aba Pagamento.</p>
            </div>
          </div>
        </div>
      )}
    </Pagina>
  );
}
