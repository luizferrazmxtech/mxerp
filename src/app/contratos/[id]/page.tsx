import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ROTULO_BOLETO } from "@/lib/financeiro/boletos";
import { excluirContratoAcao, gerarCobrancaAgoraAcao, reenviarAcao, situacaoContratoAcao, tentarDeNovoAcao } from "@/lib/contratos/acoes";
import { rotuloPeriodicidade, situacaoContrato, type PeriodicidadeContrato } from "@/lib/contratos/tipos";
import { cor } from "@/lib/orcamentos/tipos";
import { Bloco, Pagina } from "@/components/ui/Pagina";
import { LinkSuspenso } from "@/components/ui/BarraLista";
import Suspenso from "@/components/ui/Suspenso";
import BotaoAcao from "@/components/ui/BotaoAcao";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import BotaoResultado from "@/components/contratos/BotaoResultado";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visualizar contrato" };

const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataUtc = (d: Date | null | undefined) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const dataHora = (d: Date | null | undefined) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "");

export default async function VerContrato({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.contrato.findUnique({
    where: { id },
    include: {
      cliente: true, vendedor: { select: { nome: true } }, formaPagamento: { select: { nome: true, boletoInter: true } },
      servicos: { orderBy: { ordem: "asc" }, include: { servico: { select: { nome: true, codigo: true } } } },
      cobrancas: { orderBy: { vencimento: "desc" } }, historico: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!c) notFound();
  const vendaIds = c.cobrancas.map((x) => x.vendaId).filter((x): x is string => !!x);
  const [vendas, lancs] = await Promise.all([
    prisma.venda.findMany({ where: { id: { in: vendaIds } }, select: { id: true, numero: true } }),
    prisma.lancamento.findMany({ where: { origemTipo: "VENDA", origemId: { in: vendaIds } }, select: { origemId: true, pagoEm: true, boletos: { orderBy: { createdAt: "desc" }, take: 1, select: { situacao: true, erro: true } } } }),
  ]);
  const venda = new Map(vendas.map((v) => [v.id, v.numero]));
  const lanc = new Map(lancs.map((l) => [l.origemId!, l]));
  const s = situacaoContrato(c.situacao); const k = cor(s.cor);
  const base = `/contratos/${id}`;
  const termino = c.termino === "DATA" ? `até ${dataUtc(c.dataFim)}` : c.termino === "VEZES" ? `${c.cobrancasGeradas} de ${c.totalCobrancas} cobranças` : "sem término";
  const emailPara = c.emailCobranca ?? c.cliente.email;

  return (
    <Pagina titulo="Visualizar contrato" icone="contratos" trilha={[{ rotulo: "Contratos", href: "/contratos" }, { rotulo: "Visualizar" }]}>
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[18px]"><Icone nome="contratos" size={18} /> Contrato #{c.numero}
            <span className={`pilula ${k.pilula}`}>{s.rotulo}</span></h2>
          <p className="text-[12px] text-slate-500">Desde {dataUtc(c.dataInicio)} · {rotuloPeriodicidade(c.periodicidade as PeriodicidadeContrato)}, todo dia {c.diaVencimento} · {termino}</p>
        </div>
        <div className="no-print ml-auto flex flex-wrap items-start gap-2">
          {c.situacao === "ATIVO" && <BotaoResultado acao={gerarCobrancaAgoraAcao.bind(null, id)} icone="dinheiro" confirmar={`Gerar agora a cobrança de ${dataUtc(c.proximoVencimento)} (venda${c.formaPagamento?.boletoInter ? ", boleto" : ""}${c.enviarBoleto ? " e e-mail" : ""})?`}>Gerar cobrança agora</BotaoResultado>}
          <Suspenso direita classe="btn-laranja" botao={<><Icone nome="editar" size={15} /> Editar <Icone nome="abaixo" size={13} /></>}>
            <LinkSuspenso href={`${base}/editar`} icone="editar">Editar contrato</LinkSuspenso>
            {c.situacao !== "ATIVO" && <BotaoAcao acao={situacaoContratoAcao.bind(null, id, "ATIVO")} icone="ok">Ativar</BotaoAcao>}
            {c.situacao === "ATIVO" && <BotaoAcao acao={situacaoContratoAcao.bind(null, id, "PAUSADO")} icone="relogio">Pausar</BotaoAcao>}
            {c.situacao !== "FINALIZADO" && <BotaoAcao acao={situacaoContratoAcao.bind(null, id, "FINALIZADO")} icone="ok" confirmar="Finalizar o contrato? Ele para de gerar cobranças.">Finalizar</BotaoAcao>}
            {c.situacao !== "CANCELADO" && <BotaoAcao acao={situacaoContratoAcao.bind(null, id, "CANCELADO")} icone="fechar" confirmar="Cancelar o contrato? Ele para de gerar cobranças (as vendas já geradas continuam).">Cancelar contrato</BotaoAcao>}
            <LinkSuspenso href={`/financeiro?tipo=RECEBER&q=${encodeURIComponent(c.cliente.nome)}`} icone="financeiro">Ver no financeiro</LinkSuspenso>
            <BotaoExcluir acao={excluirContratoAcao.bind(null, id)} pergunta={`Excluir o contrato nº ${c.numero}?`} rotulo="Excluir contrato" depois="/contratos" />
          </Suspenso>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-3">
          <div className="cartao p-4 text-[13px]">
            <div className="text-slate-500">Valor de cada cobrança</div>
            <div className="my-1 text-[26px] font-semibold text-marca">{brl(c.total)}</div>
            <dl className="space-y-1 border-t pt-2">
              <div><b>Cliente:</b> <Link href={`/clientes/${c.clienteId}`} className="text-marca hover:underline">{c.cliente.nome}</Link></div>
              <div><b>Próximo vencimento:</b> {["ATIVO", "EM_ABERTO", "PAUSADO"].includes(c.situacao) ? dataUtc(c.proximoVencimento) : "—"}</div>
              <div><b>Forma:</b> {c.formaPagamento?.nome ?? "—"}{c.formaPagamento?.boletoInter ? " (boleto Inter)" : ""}</div>
              <div><b>Vendedor:</b> {c.vendedor?.nome ?? "—"}</div>
              <div><b>Canal:</b> {c.canal}</div>
              {c.centroCusto && <div><b>Centro de custo:</b> {c.centroCusto}</div>}
            </dl>
          </div>
          <div className="cartao p-4 text-[13px]">
            <h3 className="mb-1 font-semibold">Cobrança automática</h3>
            <ul className="space-y-1 text-slate-700">
              <li>Gera a venda {c.diasAntecedencia} dias antes do vencimento</li>
              <li>{c.enviarBoleto ? `Envia a cobrança por e-mail para ${emailPara ?? "— (sem e-mail!)"}` : "Não envia a cobrança por e-mail"}</li>
              <li>{c.diasLembrete != null ? `Lembrete ${c.diasLembrete} dias antes, se não pago` : "Sem lembrete de pagamento"}</li>
              <li>{c.emitirNota ? "Emite a NFS-e automaticamente" : "NFS-e manual (na venda)"}</li>
            </ul>
          </div>
          {(c.observacoes || c.observacaoInterna) && (
            <div className="cartao space-y-2 p-4 text-[13px]">
              {c.observacoes && <div><b>Observações:</b><p className="whitespace-pre-wrap">{c.observacoes}</p></div>}
              {c.observacaoInterna && <div><b>Internas:</b><p className="whitespace-pre-wrap">{c.observacaoInterna}</p></div>}
            </div>
          )}
        </aside>

        <div>
          <Bloco icone="servicos" titulo={<>Serviços</>} corpo="p-0">
            <table className="tabela">
              <thead><tr><th>Serviço</th><th>Detalhes</th><th className="text-right">Quant.</th><th className="text-right">Valor</th><th className="text-right">Subtotal</th></tr></thead>
              <tbody>
                {c.servicos.map((l) => (
                  <tr key={l.id}><td><span className="font-mono text-[11px] text-slate-500">{l.servico.codigo}</span> {l.servico.nome}</td><td>{l.detalhes}</td>
                    <td className="text-right">{Number(l.quantidade).toLocaleString("pt-BR")}</td><td className="text-right">{brl(l.valorUnit)}</td><td className="text-right">{brl(l.subtotal)}</td></tr>
                ))}
                {Number(c.desconto) > 0 && <tr><td colSpan={4} className="text-right">Desconto</td><td className="text-right">− {brl(c.desconto)}</td></tr>}
                <tr><td colSpan={4} className="text-right font-semibold">Total de cada cobrança</td><td className="text-right font-semibold">{brl(c.total)}</td></tr>
              </tbody>
            </table>
          </Bloco>

          <Bloco icone="dinheiro" titulo={<>Cobranças geradas</>} subtitulo="Cada vencimento vira uma venda de serviços com a conta a receber." corpo="p-0">
            <div className="overflow-x-auto">
              <table className="tabela">
                <thead><tr><th>Nº</th><th>Referência</th><th>Vencimento</th><th>Venda</th><th>Pagamento</th><th>E-mails</th><th className="whitespace-nowrap">NFS-e</th><th></th></tr></thead>
                <tbody>
                  {c.cobrancas.map((x) => {
                    const l = x.vendaId ? lanc.get(x.vendaId) : undefined;
                    const b = l?.boletos[0];
                    return (
                      <tr key={x.id} className="align-top">
                        <td>{x.numero}</td>
                        <td>{x.referencia}</td>
                        <td>{dataUtc(x.vencimento)}</td>
                        <td>
                          {x.vendaId ? <Link href={`/vendas/${x.vendaId}`} className="text-marca hover:underline">nº {venda.get(x.vendaId)}</Link>
                            : x.situacao === "ERRO" ? <span className="text-red-700">Erro: {x.erro}</span> : <span className="text-slate-500">{x.situacao === "GERANDO" ? "gerando…" : "pendente"}</span>}
                        </td>
                        <td className="text-[12px]">
                          {l?.pagoEm ? <span className="text-emerald-700">Pago em {dataUtc(l.pagoEm)}</span> : l ? "Em aberto" : "—"}
                          {b && <span className={`block ${b.situacao === "ERRO" ? "text-red-700" : "text-slate-500"}`}>Boleto: {ROTULO_BOLETO[b.situacao] ?? b.situacao}{b.erro ? ` (${b.erro})` : ""}</span>}
                        </td>
                        <td className="text-[12px]">
                          {x.boletoEnviadoEm && <span className="block">Cobrança: {dataHora(x.boletoEnviadoEm)}</span>}
                          {x.lembreteEnviadoEm && <span className="block">Lembrete: {dataHora(x.lembreteEnviadoEm)}</span>}
                          {x.envioErro && <span className="block text-red-700">{x.envioErro}</span>}
                          {!x.boletoEnviadoEm && !x.lembreteEnviadoEm && !x.envioErro && <span className="text-slate-500">—</span>}
                        </td>
                        <td className="text-[12px]">{x.notaMsg ?? (c.emitirNota && x.vendaId ? "aguardando" : "—")}</td>
                        <td className="whitespace-nowrap text-[12px]">
                          {!x.vendaId && x.situacao === "ERRO" && <BotaoResultado acao={tentarDeNovoAcao.bind(null, x.id)} className="btn-sec !py-1 text-[12px]">Tentar de novo</BotaoResultado>}
                          {x.vendaId && !l?.pagoEm && <BotaoResultado acao={reenviarAcao.bind(null, x.id, x.boletoEnviadoEm ? "LEMBRETE" : "BOLETO")} icone="email" className="btn-sec !py-1 text-[12px]">{x.boletoEnviadoEm ? "Mandar lembrete" : "Enviar cobrança"}</BotaoResultado>}
                        </td>
                      </tr>
                    );
                  })}
                  {!c.cobrancas.length && <tr><td colSpan={8} className="py-6 text-center text-slate-500">Nenhuma cobrança ainda. A primeira sai em {dataUtc(new Date(c.proximoVencimento.getTime() - c.diasAntecedencia * 86400000))} (vencimento {dataUtc(c.proximoVencimento)}).</td></tr>}
                </tbody>
              </table>
            </div>
          </Bloco>

          <Bloco icone="relogio" titulo={<>Histórico</>} corpo="p-0">
            <ul className="divide-y text-[13px]">
              {c.historico.map((h) => <li key={h.id} className="px-4 py-2"><span className="text-slate-500">{dataHora(h.createdAt)}</span> · {h.descricao}{h.usuarioNome ? <span className="text-slate-500"> ({h.usuarioNome})</span> : null}</li>)}
            </ul>
          </Bloco>
        </div>
      </div>
    </Pagina>
  );
}
