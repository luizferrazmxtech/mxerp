import { prisma } from "@/lib/db";
import { empresaDosServicos } from "@/lib/os/faturamento";
import { empresaDoDocumento } from "@/lib/empresa/atual";
import { brl, dataSP, horaSP, qtd } from "@/lib/ui/format";
import { duracao, resumoTrabalho } from "@/lib/os/trabalho";
import { fotosDoHistorico } from "@/lib/os/historicoFotos";
import { rotuloPrioridade } from "@/lib/os/tipos";

/** simples = a OS de sempre; completa = todas as abas; historico = completa + histórico datado com as fotos. */
export type ModoImpressao = "simples" | "completa" | "historico";
const quando = (d: Date | string | null | undefined) => (d ? `${dataSP(d)} ${horaSP(d)}` : "—");
const titulo = "mb-1 mt-4 border-b border-slate-400 pb-0.5 text-[11px] font-semibold uppercase text-slate-600";

const docFmt = (d: string | null | undefined) =>
  !d ? "" : d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");

/** OS impressa / link de cobrança da OS (A4, com a marca MXTECH). */
export default async function DocumentoOs({ id, token, cobranca, modo = "simples" }: { id?: string; token?: string; cobranca?: boolean; modo?: ModoImpressao }) {
  const [os] = await Promise.all([
    prisma.ordemServico.findFirst({
      where: id ? { id } : { token },
      include: {
        cliente: true, tecnico: { select: { nome: true } }, vendedor: { select: { nome: true } }, situacaoCfg: true, formaPagamento: true,
        equipe: { select: { nome: true } }, transportadora: { select: { nome: true } },
        historico: { orderBy: { createdAt: "asc" } },
        parcelas: { orderBy: { numero: "asc" }, include: { formaPagamento: { select: { nome: true } } } },
        equipamentos: { orderBy: { ordem: "asc" } },
        produtos: { include: { produto: true, localOrigem: { select: { codigo: true } } }, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }] },
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
  const completa = modo !== "simples";
  const [trabalho, fotos, notas, anotacoes, campos, instaladores] = completa ? await Promise.all([
    resumoTrabalho(os.id),
    prisma.anexo.findMany({ where: { entidade: "OS_FOTO", entidadeId: os.id }, select: { id: true, nome: true, createdAt: true, referencia: true }, orderBy: { createdAt: "asc" } }),
    prisma.notaFiscal.findMany({ where: { origemTipo: "OS", origemId: os.id }, orderBy: { createdAt: "asc" } }),
    prisma.anotacao.findMany({ where: { entidade: "OS", entidadeId: os.id }, orderBy: { createdAt: "asc" } }),
    prisma.campoExtra.findMany({ where: { entidade: "OS" }, orderBy: [{ ordem: "asc" }, { nome: "asc" }] }),
    prisma.usuario.findMany({ where: { id: { in: [...os.produtos, ...os.servicos].map((i) => i.instaladoPorId).filter((x): x is string => !!x) } }, select: { id: true, nome: true } }),
  ]) : [null, [], [], [], [], []] as const;
  const nomeUsu = new Map(instaladores.map((u) => [u.id, u.nome]));
  const autoresAnot = completa ? new Map((await prisma.usuario.findMany({ where: { id: { in: anotacoes.map((a) => a.usuarioId).filter((x): x is string => !!x) } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome])) : new Map<string, string>();
  const tecnicos = (tecs.length ? tecs.map((t) => t.nome) : [os.tecnico?.nome]).filter(Boolean).join(", ")
    || (trabalho ? [...new Set(trabalho.trechos.map((t) => t.iniciadoPor))].join(", ") : "");
  const fotosItem = (itemId: string) => fotos.filter((f) => f.referencia === itemId);
  const fotoDaLinha = modo === "historico" ? fotosDoHistorico(os.historico, fotos) : new Map<string, string>();
  const totalTrabalho = trabalho ? trabalho.fechadoMs + (trabalho.abertoDesde ? Date.now() - new Date(trabalho.abertoDesde).getTime() : 0) : 0;
  const ce = (os.camposExtras ?? {}) as Record<string, string>;
  const statusItem = (i: { instalado: boolean; instaladoEm: Date | null; instaladoPorId: string | null }, servico?: boolean) =>
    i.instalado ? `${servico ? "Feito" : "Instalado"}${i.instaladoEm ? ` ${quando(i.instaladoEm)}` : ""}${i.instaladoPorId && nomeUsu.get(i.instaladoPorId) ? ` · ${nomeUsu.get(i.instaladoPorId)}` : ""}` : "Pendente";
  const c = os.cliente;
  // serviços faturados por outra empresa (ex.: VFX): cada parcela diz quem cobra (peças e serviços em boletos separados)
  const fora = empresaDosServicos(os);
  const empresasCobranca = fora ? new Map((await prisma.empresa.findMany({ where: { id: { in: [...new Set(lanc.map((l) => l.empresaId).filter((x): x is string => !!x))] } }, select: { id: true, nomeFantasia: true, razaoSocial: true } })).map((e) => [e.id, e.nomeFantasia || e.razaoSocial])) : new Map<string, string>();
  const parcelas = lanc.length
    ? lanc.map((l) => ({ id: l.id, n: l.parcela, de: l.totalParcelas, venc: l.vencimento, valor: l.valor, forma: l.formaPagamento?.nome, pago: !!l.pagoEm,
      quem: fora ? `${l.empresaId === fora ? "Serviços" : "Peças"} · ${empresasCobranca.get(l.empresaId ?? "") ?? emp?.nomeFantasia ?? emp?.razaoSocial ?? ""}` : "" }))
    : os.parcelas.map((p) => ({ id: p.id, n: p.numero, de: os.parcelas.length, venc: p.vencimento, valor: p.valor, forma: p.formaPagamento?.nome ?? os.formaPagamento?.nome, pago: false, quem: "" }));
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
        <h1 className="text-[18px] font-semibold">Ordem de serviço nº {os.numero}{modo === "completa" && <span className="ml-2 text-[12px] font-normal text-slate-500">(completa)</span>}{modo === "historico" && <span className="ml-2 text-[12px] font-normal text-slate-500">(completa com histórico)</span>}</h1>
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

      {completa && (
        <section className="mt-2 grid grid-cols-3 gap-x-4 gap-y-0.5 rounded border border-slate-300 p-2.5">
          <div><b>Técnico:</b> {tecnicos || "—"}</div>
          <div><b>Equipe:</b> {os.equipe?.nome ?? "—"}</div>
          <div><b>Vendedor:</b> {os.vendedor?.nome ?? "—"}</div>
          <div><b>Prioridade:</b> {os.prioridade ? rotuloPrioridade(os.prioridade) : "—"}</div>
          <div><b>Canal:</b> {os.canal}</div>
          <div><b>Agendada:</b> {quando(os.agendaInicio)}</div>
          {os.transportadora && <div className="col-span-3"><b>Transportadora:</b> {os.transportadora.nome}</div>}
        </section>
      )}

      {completa && os.produtos.length > 0 && (
        <>
          <div className={titulo}>Produtos / peças</div>
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-slate-300 text-left text-[11px]"><th className="py-1">Item</th><th className="w-12 text-right">Qtd</th><th className="w-20 text-right">Valor</th><th className="w-20 text-right">Subtotal</th><th className="w-44 pl-2">Situação</th></tr></thead>
            <tbody>{os.produtos.map((p) => (
              <tr key={p.id} className="border-b border-slate-200 align-top">
                <td className="py-1">{p.produto.codigo} · {p.produto.nome}{p.detalhes && <div className="text-[10px] text-slate-500">{p.detalhes}</div>}{p.localOrigem && <div className="text-[10px] text-slate-500">Sai de: {p.localOrigem.codigo}</div>}</td>
                <td className="text-right">{qtd(p.quantidade)}</td><td className="text-right">{brl(p.valorUnit)}</td><td className="text-right">{brl(p.subtotal)}</td>
                <td className={`pl-2 text-[11px] ${p.instalado ? "text-emerald-700" : "text-slate-500"}`}>{statusItem(p)}{fotosItem(p.id).length > 0 && <div className="text-slate-500">{fotosItem(p.id).length} foto(s)</div>}</td>
              </tr>))}</tbody>
          </table>
        </>
      )}
      {completa && os.servicos.length > 0 && (
        <>
          <div className={titulo}>Serviços</div>
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-slate-300 text-left text-[11px]"><th className="py-1">Serviço</th><th className="w-12 text-right">Qtd</th><th className="w-20 text-right">Valor</th><th className="w-20 text-right">Subtotal</th><th className="w-44 pl-2">Situação</th></tr></thead>
            <tbody>{os.servicos.map((s) => (
              <tr key={s.id} className="border-b border-slate-200 align-top">
                <td className="py-1">{s.servico.nome}{s.detalhes && <div className="text-[10px] text-slate-500">{s.detalhes}</div>}</td>
                <td className="text-right">{qtd(s.quantidade)}</td><td className="text-right">{brl(s.valorUnit)}</td><td className="text-right">{brl(s.subtotal)}</td>
                <td className={`pl-2 text-[11px] ${s.instalado ? "text-emerald-700" : "text-slate-500"}`}>{statusItem(s, true)}</td>
              </tr>))}</tbody>
          </table>
        </>
      )}

      {!completa && os.produtos.length > 0 && (
        <table className="mt-3 w-full border-collapse">
          <thead><tr className="border-b border-slate-400 text-left"><th className="py-1">Produtos / peças</th><th className="w-16 text-right">Qtd</th><th className="w-24 text-right">Valor</th><th className="w-24 text-right">Subtotal</th></tr></thead>
          <tbody>{os.produtos.map((p) => <tr key={p.id} className="border-b border-slate-200"><td className="py-1">{p.produto.codigo} · {p.produto.nome}</td><td className="text-right">{qtd(p.quantidade)}</td><td className="text-right">{brl(p.valorUnit)}</td><td className="text-right">{brl(p.subtotal)}</td></tr>)}</tbody>
        </table>
      )}
      {!completa && os.servicos.length > 0 && (
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
          <tbody>{parcelas.map((p) => <tr key={p.id} className="border-b border-slate-200"><td className="py-1">Parcela {p.n}/{p.de}{p.quem ? ` · ${p.quem}` : ""}{p.pago ? " · paga" : ""}</td><td>{p.venc.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td><td>{p.forma ?? "A combinar"}</td><td className="text-right">{brl(p.valor)}</td></tr>)}</tbody>
        </table>
      )}

      {os.observacoes && <section className="mt-3 whitespace-pre-line"><b>Observações:</b> {os.observacoes}</section>}
      {!completa && <div className="mt-2 text-[11px]">Técnico: {tecnicos || "—"} · Vendedor: {os.vendedor?.nome ?? "—"}</div>}

      {completa && os.observacaoInterna && <section className="mt-2 whitespace-pre-line"><b>Observação interna:</b> {os.observacaoInterna}</section>}

      {completa && trabalho && trabalho.estado !== "NAO_INICIADO" && (
        <>
          <div className={titulo}>Mão de obra · {duracao(totalTrabalho)}{{ TRABALHANDO: " · trabalhando agora", PAUSADO: " · pausado", FINALIZADO: " · finalizado", NAO_INICIADO: "" }[trabalho.estado]}</div>
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-slate-300 text-left text-[11px]"><th className="py-1">Início</th><th>Fim</th><th>Quem</th><th>Motivo da parada</th><th className="w-20 text-right">Tempo</th></tr></thead>
            <tbody>{trabalho.trechos.map((t, i) => (
              <tr key={i} className="border-b border-slate-200">
                <td className="py-1">{quando(t.inicio)}</td><td>{t.fim ? quando(t.fim) : "em andamento"}</td>
                <td>{t.iniciadoPor}{t.encerradoPor && t.encerradoPor !== t.iniciadoPor ? ` / ${t.encerradoPor}` : ""}</td><td>{t.motivo ?? "—"}</td>
                <td className="text-right">{duracao((t.fim ? new Date(t.fim).getTime() : Date.now()) - new Date(t.inicio).getTime())}</td>
              </tr>))}</tbody>
          </table>
        </>
      )}

      {completa && campos.some((x) => ce[x.id]) && (
        <>
          <div className={titulo}>Campos extras</div>
          <div className="grid grid-cols-2 gap-x-4">{campos.filter((x) => ce[x.id]).map((x) => <div key={x.id}><b>{x.nome}:</b> {ce[x.id]}</div>)}</div>
        </>
      )}

      {completa && notas.length > 0 && (
        <>
          <div className={titulo}>Notas fiscais</div>
          {notas.map((n) => <div key={n.id}>{n.modelo === "NFSE" ? "NFS-e" : n.modelo === "NFCE" ? "NFC-e" : "NF-e"} nº {n.numero} · {n.status.toLowerCase()} · {brl(n.valorTotal)}{n.emitidaEm ? ` · ${quando(n.emitidaEm)}` : ""}</div>)}
        </>
      )}

      {completa && anotacoes.length > 0 && (
        <>
          <div className={titulo}>Anotações</div>
          {anotacoes.map((a) => <div key={a.id} className="mb-1 whitespace-pre-line"><span className="text-[10px] text-slate-500">{quando(a.createdAt)}{a.usuarioId && autoresAnot.get(a.usuarioId) ? ` · ${autoresAnot.get(a.usuarioId)}` : ""}</span><br />{a.texto}</div>)}
        </>
      )}

      {modo === "historico" && (
        <>
          <div className={titulo}>Histórico</div>
          <table className="w-full border-collapse">
            <tbody>{os.historico.map((h) => {
              const foto = fotoDaLinha.get(h.id);
              return (
                <tr key={h.id} className="border-b border-slate-200 align-top" style={{ breakInside: "avoid" }}>
                  <td className="w-28 py-1 text-[11px] whitespace-nowrap">{quando(h.createdAt)}</td>
                  <td className="py-1">{h.descricao}{h.situacao && <span className="text-slate-500"> · {h.situacao}</span>}
                    {foto && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <div className="mt-1"><img src={`/api/cadastros/anexo/${foto}`} alt="Foto da instalação" className="h-40 w-auto max-w-[260px] rounded border object-contain" /></div>
                    )}
                  </td>
                  <td className="w-32 py-1 text-right text-[11px] text-slate-600">{h.usuarioNome ?? ""}</td>
                </tr>
              );
            })}</tbody>
          </table>
          {fotos.filter((f) => ![...fotoDaLinha.values()].includes(f.id)).length > 0 && (
            <>
              <div className={titulo}>Outras fotos da instalação</div>
              <div className="flex flex-wrap gap-2">{fotos.filter((f) => ![...fotoDaLinha.values()].includes(f.id)).map((f) => (
                // eslint-disable-next-line @next/next/no-img-element
                <figure key={f.id} style={{ breakInside: "avoid" }}><img src={`/api/cadastros/anexo/${f.id}`} alt={f.nome} className="h-40 w-auto max-w-[260px] rounded border object-contain" /><figcaption className="text-[10px] text-slate-500">{quando(f.createdAt)}</figcaption></figure>
              ))}</div>
            </>
          )}
        </>
      )}

      <div className="mt-14 grid grid-cols-2 gap-10 text-center text-[11px]">
        <div className="border-t border-black pt-1">{emp?.nomeFantasia || "MXTECH"}</div>
        <div className="border-t border-black pt-1">{c.nome}</div>
      </div>
    </div>
  );
}
