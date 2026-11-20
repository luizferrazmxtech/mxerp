import { prisma } from "@/lib/db";
import { empresaDoDocumento } from "@/lib/empresa/atual";
import { brl, dataSP, horaSP, qtd } from "@/lib/ui/format";

const docFmt = (d: string | null | undefined) =>
  !d ? "" : d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");

/** OS impressa / link de cobrança da OS (A4, com a marca MXTECH). */
export default async function DocumentoOs({ id, token, cobranca }: { id?: string; token?: string; cobranca?: boolean }) {
  const [os] = await Promise.all([
    prisma.ordemServico.findFirst({
      where: id ? { id } : { token },
      include: {
        cliente: true, tecnico: { select: { nome: true } }, vendedor: { select: { nome: true } }, situacaoCfg: true, formaPagamento: true,
        parcelas: { orderBy: { numero: "asc" }, include: { formaPagamento: { select: { nome: true } } } },
        equipamentos: { orderBy: { ordem: "asc" } },
        produtos: { include: { produto: true }, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }] },
        servicos: { include: { servico: true }, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }] },
      },
    }),
  ]);
  const emp = os ? await empresaDoDocumento(os.empresaId) : null;
  if (!os || (cobranca && os.situacaoCfg?.exibirCobranca === false)) return <p className="p-8 text-center">Ordem de serviço não encontrada.</p>;
  const [lanc, tecs] = await Promise.all([
    prisma.lancamento.findMany({ where: { origemTipo: "OS", origemId: os.id }, orderBy: [{ vencimento: "asc" }, { parcela: "asc" }], include: { formaPagamento: true } }),
    prisma.usuario.findMany({ where: { id: { in: os.tecnicoIds } }, select: { nome: true } }),
  ]);
  const tecnicos = (tecs.length ? tecs.map((t) => t.nome) : [os.tecnico?.nome]).filter(Boolean).join(", ");
  const c = os.cliente;
  const parcelas = lanc.length
    ? lanc.map((l) => ({ id: l.id, n: l.parcela, venc: l.vencimento, valor: l.valor, forma: l.formaPagamento?.nome, pago: !!l.pagoEm }))
    : os.parcelas.map((p) => ({ id: p.id, n: p.numero, venc: p.vencimento, valor: p.valor, forma: p.formaPagamento?.nome ?? os.formaPagamento?.nome, pago: false }));
  return (
    <div className="mx-auto max-w-[820px] bg-white p-6 text-[12px] text-black print:p-0">
      <header className="flex items-center gap-4 border-b-2 border-marca pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/logo-claro.svg" alt="MXTECH" className="h-16 w-auto" />
        <div className="ml-auto text-right text-[11px] leading-4">
          <div className="text-[13px] font-semibold">{emp?.razaoSocial ?? "MXTECH"}</div>
          {emp && <div>CNPJ {docFmt(emp.cnpj)}</div>}
          {emp && <div>{[[emp.logradouro, emp.numero, emp.bairro].filter(Boolean).join(", "), [emp.cidade, emp.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ")}</div>}
          {emp && <div>{[emp.telefone, emp.email].filter(Boolean).join(" · ")}</div>}
        </div>
      </header>

      <div className="mt-3 flex items-end justify-between">
        <h1 className="text-[18px] font-semibold">Ordem de serviço nº {os.numero}</h1>
        <div className="text-right">Situação: <b>{os.situacaoCfg?.nome ?? os.situacao}</b><br />Entrada: {dataSP(os.entrada)} {horaSP(os.entrada)}{os.saida && <> · Saída: {dataSP(os.saida)}</>}</div>
      </div>

      <section className="mt-3 rounded border border-slate-300 p-2.5">
        <div className="mb-1 text-[10px] font-semibold uppercase text-slate-500">Cliente</div>
        <div className="font-semibold uppercase">{c.nome}{c.fantasia && c.fantasia !== c.nome ? ` (${c.fantasia})` : ""}</div>
        <div>{[docFmt(c.documento), c.telefone, c.celular, c.email].filter(Boolean).join(" · ")}</div>
        <div>{[c.logradouro, c.numero, c.complemento, c.bairro, [c.cidade, c.uf].filter(Boolean).join("/"), c.cep && `CEP ${c.cep}`].filter(Boolean).join(", ")}</div>
      </section>

      {os.equipamentos.map((e) => (
        <section key={e.id} className="mt-2 rounded border border-slate-300 p-2.5">
          <div className="mb-1 text-[10px] font-semibold uppercase text-slate-500">Equipamento</div>
          <div className="font-semibold uppercase">{[e.equipamento, e.marca, e.modelo].filter(Boolean).join(" · ")}{e.serie && ` · Série ${e.serie}`}</div>
          {([["Condições", e.condicoes], ["Defeitos", e.defeitos], ["Acessórios", e.acessorios], ["Solução", e.solucao], ["Laudo técnico", e.laudo], ["Garantia", e.garantia]] as const)
            .filter(([, v]) => v).map(([r, v]) => <div key={r} className="whitespace-pre-line"><b>{r}:</b> {v}</div>)}
        </section>
      ))}

      {os.produtos.length > 0 && (
        <table className="mt-3 w-full border-collapse">
          <thead><tr className="border-b border-slate-400 text-left"><th className="py-1">Produtos / peças</th><th className="w-16 text-right">Qtd</th><th className="w-24 text-right">Valor</th><th className="w-24 text-right">Subtotal</th></tr></thead>
          <tbody>{os.produtos.map((p) => <tr key={p.id} className="border-b border-slate-200"><td className="py-1">{p.produto.codigo} · {p.produto.nome}</td><td className="text-right">{qtd(p.quantidade)}</td><td className="text-right">{brl(p.valorUnit)}</td><td className="text-right">{brl(p.subtotal)}</td></tr>)}</tbody>
        </table>
      )}
      {os.servicos.length > 0 && (
        <table className="mt-3 w-full border-collapse">
          <thead><tr className="border-b border-slate-400 text-left"><th className="py-1">Serviços</th><th className="w-16 text-right">Qtd</th><th className="w-24 text-right">Valor</th><th className="w-24 text-right">Subtotal</th></tr></thead>
          <tbody>{os.servicos.map((s) => <tr key={s.id} className="border-b border-slate-200"><td className="py-1">{s.servico.nome}</td><td className="text-right">{qtd(s.quantidade)}</td><td className="text-right">{brl(s.valorUnit)}</td><td className="text-right">{brl(s.subtotal)}</td></tr>)}</tbody>
        </table>
      )}

      <div className="mt-3 ml-auto w-64 space-y-0.5">
        <div className="flex justify-between"><span>Peças</span><span>{brl(os.totalProdutos)}</span></div>
        <div className="flex justify-between"><span>Mão de obra</span><span>{brl(os.totalServicos)}</span></div>
        {Number(os.frete) > 0 && <div className="flex justify-between"><span>Frete</span><span>{brl(os.frete)}</span></div>}
        {Number(os.outros) > 0 && <div className="flex justify-between"><span>Outros</span><span>{brl(os.outros)}</span></div>}
        {Number(os.desconto) > 0 && <div className="flex justify-between"><span>Desconto</span><span>− {brl(os.desconto)}</span></div>}
        {os.exibirTotal && <div className="flex justify-between border-t border-slate-400 pt-1 text-[14px] font-semibold"><span>Total</span><span>{brl(os.total)}</span></div>}
      </div>

      {parcelas.length > 0 && (
        <table className="mt-3 w-full border-collapse">
          <thead><tr className="border-b border-slate-400 text-left"><th className="py-1">Pagamento</th><th className="w-28">Vencimento</th><th className="w-40">Forma</th><th className="w-24 text-right">Valor</th></tr></thead>
          <tbody>{parcelas.map((p) => <tr key={p.id} className="border-b border-slate-200"><td className="py-1">Parcela {p.n}/{parcelas.length}{p.pago ? " · paga" : ""}</td><td>{p.venc.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td><td>{p.forma ?? "A combinar"}</td><td className="text-right">{brl(p.valor)}</td></tr>)}</tbody>
        </table>
      )}

      {os.observacoes && <section className="mt-3 whitespace-pre-line"><b>Observações:</b> {os.observacoes}</section>}
      <div className="mt-2 text-[11px]">Técnico: {tecnicos || "—"} · Vendedor: {os.vendedor?.nome ?? "—"}</div>

      <div className="mt-14 grid grid-cols-2 gap-10 text-center text-[11px]">
        <div className="border-t border-black pt-1">{emp?.nomeFantasia || "MXTECH"}</div>
        <div className="border-t border-black pt-1">{c.nome}</div>
      </div>
    </div>
  );
}
