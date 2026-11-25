import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { diaSP } from "@/lib/datas";
import { brl } from "@/lib/ui/format";
import { baseLinks, boletosDisponiveis } from "@/lib/financeiro/boletos";
import { boletoAbrivel, contaAvulsa, iconeForma, origemConta, situacaoConta } from "@/lib/financeiro/lista";
import { ATIVOS } from "@/lib/financeiro/boletos";
import { origemPelaDescricao } from "@/lib/financeiro/origem";
import { baixarContaAcao, desagruparContaAcao, estornarContaAcao, excluirContaAcao } from "../../actions";
import { rotulosDocumentos } from "@/lib/financeiro/agrupar";
import { Bloco, Campo, Pagina } from "@/components/ui/Pagina";
import FormAcao from "@/components/financeiro/FormAcao";
import BoletoParcela from "@/components/BoletoParcela";
import BotaoAcao from "@/components/ui/BotaoAcao";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import Icone from "@/components/Icone";
import ResumoOrigem from "@/components/financeiro/ResumoOrigem";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conta" };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dia = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-2 border-b border-[#eef0f2] py-2 text-[14px] last:border-0">
      <span className="text-[#6c757d]">{rotulo}</span><span>{children}</span>
    </div>
  );
}

/** Visualizar conta a pagar/receber: dados, baixa (pagar/receber), estorno, boleto e excluir. */
export default async function VerConta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await prisma.lancamento.findUnique({
    where: { id },
    include: {
      pessoa: true, categoria: true, centroCusto: true, contaBancaria: true, formaPagamento: true,
      boletos: { orderBy: { createdAt: "desc" } }, transacao: { select: { id: true, data: true, descricao: true } },
      agrupados: { orderBy: [{ vencimento: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!l) notFound();
  const pagar = l.tipo === "PAGAR";
  const titulo = pagar ? "Contas a pagar" : "Contas a receber";
  const hoje = diaSP();
  const s = situacaoConta(l, hoje);
  // conta do Gestão Click sem o documento ligado: acha pelo número da descrição
  const d = (await origemPelaDescricao([l])).get(l.id) ?? l;
  const orig = origemConta({ id: l.id, ...d });
  const pdf = boletoAbrivel(l.boletos.find((b) => ATIVOS.includes(b.situacao)));
  const ic = iconeForma(l.formaPagamento);
  const [contas, interAtivo, base] = await Promise.all([
    prisma.contaBancaria.findMany({ where: { ativa: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    boletosDisponiveis(), baseLinks(),
  ]);
  const lista = `/financeiro?tipo=${l.tipo}`;
  // título agrupado: as contas que ele juntou, com a venda/OS de cada uma
  const rotulos = l.agrupados.length ? await rotulosDocumentos(l.agrupados) : [];
  const podeDesagrupar = l.agrupados.length > 0 && !l.pagoEm && !l.transacaoId && !l.boletos.some((b) => ATIVOS.includes(b.situacao));

  return (
    <Pagina voltar={lista} titulo={titulo} icone={pagar ? "pagar" : "receber"} trilha={[{ rotulo: titulo, href: lista }, { rotulo: "Visualizar" }]}>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        {!l.pagoEm && <Link href={`/financeiro/lancamentos/${l.id}/editar`} className="btn-laranja"><Icone nome="editar" size={14} /> Editar</Link>}
        <Link href={`/financeiro/adicionar?tipo=${l.tipo}&copia=${l.id}`} className="btn-sec"><Icone nome="copiar" size={14} /> Duplicar</Link>
        {orig && <Link href={orig.href} className="btn-sec"><Icone nome={orig.icone} size={14} /> {orig.rotulo}</Link>}
        {!pagar && pdf && <a href={pdf} target="_blank" rel="noreferrer" className="btn-sec"><Icone nome="boleto" size={14} /> Abrir boleto</a>}
        {l.pagoEm && !l.transferenciaId && (
          <BotaoAcao acao={estornarContaAcao.bind(null, l.id)} icone="atualizar" className="btn-sec" confirmar="Estornar esta baixa? A conta volta a ficar em aberto.">Estornar baixa</BotaoAcao>
        )}
        {podeDesagrupar && (
          <BotaoAcao acao={desagruparContaAcao.bind(null, l.id)} icone="atualizar" className="btn-sec" confirmar={`Desagrupar? As ${l.agrupados.length} contas voltam como eram (cada uma ligada à sua venda/OS) e este título sai do financeiro.`}>Desagrupar</BotaoAcao>
        )}
        {!l.pagoEm && contaAvulsa(l) && (
          <span className="ml-auto"><BotaoExcluir acao={excluirContaAcao.bind(null, l.id)} pergunta={`Excluir "${l.descricao}" (${brl(l.valor)})?`} depois={lista} /></span>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
        <div className="min-w-0">
        <Bloco icone="detalhes" titulo={<>Dados {pagar ? "do pagamento" : "do recebimento"}</>} acoes={<span className={`pilula ${s.pilula}`}>{s.rotulo}</span>}>
          <Linha rotulo="Descrição">{l.descricao}</Linha>
          <Linha rotulo={pagar ? "Fornecedor" : "Cliente"}>{l.pessoa ? <Link href={`/${pagar && l.pessoa.fornecedor ? "fornecedores" : "clientes"}/${l.pessoa.id}`} className="sublinhado">{l.pessoa.nome}</Link> : "—"}</Linha>
          <Linha rotulo="Valor"><b>{brl(l.valor)}</b>{l.totalParcelas > 1 && <span className="text-[#6c757d]"> · parcela {l.parcela} de {l.totalParcelas}</span>}</Linha>
          <Linha rotulo="Vencimento"><span className={s.chave === "vencidos" ? "font-semibold text-[#a8323e]" : ""}>{dia(l.vencimento)}</span></Linha>
          <Linha rotulo="Competência (DRE)">{dia(l.competencia)}</Linha>
          <Linha rotulo="Plano de contas">{l.categoria.codigo ? `${l.categoria.codigo} ` : ""}{l.categoria.nome}</Linha>
          {l.centroCusto && <Linha rotulo="Centro de custo">{l.centroCusto.nome}</Linha>}
          <Linha rotulo="Forma de pagamento">{l.formaPagamento ? <span className="inline-flex items-center gap-1.5">{l.formaPagamento.nome}{ic && <Icone nome={ic.nome} size={14} className={ic.cor} />}</span> : "—"}</Linha>
          <Linha rotulo="Conta bancária">{l.contaBancaria?.nome ?? "—"}</Linha>
          {l.observacao && <Linha rotulo="Observações"><span className="whitespace-pre-line">{l.observacao}</span></Linha>}
          <Linha rotulo="Cadastrada em">{l.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</Linha>
        </Bloco>

          {l.agrupados.length > 0 && (
            <Bloco icone="lista" titulo={<>Contas <b>agrupadas</b> neste título</>} subtitulo="Documentos que geraram cada conta (as referências também saem no boleto)">
              <div className="overflow-x-auto">
                <table className="tabela">
                  <thead><tr><th>Referência</th><th>Conta original</th><th className="w-28">Vencimento</th><th className="w-28 text-right">Valor</th></tr></thead>
                  <tbody>
                    {l.agrupados.map((a, i) => {
                      const o = origemConta({ origemTipo: a.origemTipo, origemId: a.origemId });
                      return (
                        <tr key={a.id}>
                          <td>{o ? <Link href={o.href} className="sublinhado">{rotulos[i]}</Link> : rotulos[i]}</td>
                          <td className="text-[12px] text-slate-600">{a.descricao}</td>
                          <td>{dia(a.vencimento)}</td>
                          <td className="text-right">{brl(a.valor)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr><td colSpan={3} className="text-right text-[12px] text-slate-600">Total</td><td className="text-right font-semibold">{brl(l.agrupados.reduce((s, a) => s + Number(a.valor), 0))}</td></tr></tfoot>
                </table>
              </div>
              {!podeDesagrupar && <p className="mt-2 text-[12px] text-slate-500">Para desagrupar, a conta precisa estar em aberto, sem conciliação e sem boleto registrado (cancele o boleto antes).</p>}
            </Bloco>
          )}

          <ResumoOrigem origemTipo={d.origemTipo} origemId={d.origemId} contaId={l.id} />
        </div>

        <div>
          <Bloco icone="confirmado" titulo={l.pagoEm ? <><b>{pagar ? "Pago" : "Recebido"}</b></> : <>Confirmar <b>{pagar ? "pagamento" : "recebimento"}</b></>}>
            {l.pagoEm ? (
              <div id="baixa">
                <Linha rotulo="Data">{dia(l.pagoEm)}</Linha>
                <Linha rotulo="Valor pago"><b className="text-[#1d7a34]">{brl(l.valorPago)}</b></Linha>
                {Number(l.juros) > 0 && <Linha rotulo="Juros / multa">{brl(l.juros)}</Linha>}
                {Number(l.desconto) > 0 && <Linha rotulo="Desconto">{brl(l.desconto)}</Linha>}
                <Linha rotulo="Conta bancária">{l.contaBancaria?.nome ?? "—"}</Linha>
                {l.transacao && <Linha rotulo="Conciliação">baixada pelo extrato ({dia(l.transacao.data)} · {l.transacao.descricao})</Linha>}
                {l.transferenciaId && <Linha rotulo="Origem"><Link href="/financeiro/transferencias" className="sublinhado">Transferência entre contas</Link></Linha>}
              </div>
            ) : (
              <div id="baixa">
                <FormAcao acao={baixarContaAcao} limpar={false} className="grid gap-3 sm:grid-cols-2" botao={pagar ? "Confirmar pagamento" : "Confirmar recebimento"} classeBotao="btn-verde sm:col-span-2">
                  <input type="hidden" name="id" value={l.id} />
                  <Campo rotulo="Data" obrigatorio><input type="date" name="data" defaultValue={iso(hoje)} required className="campo" /></Campo>
                  <Campo rotulo="Conta bancária" obrigatorio>
                    <select name="contaBancariaId" required defaultValue={l.contaBancariaId ?? ""} className="campo"><option value="">Escolha</option>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                  </Campo>
                  <Campo rotulo="Juros / multa"><input name="juros" inputMode="decimal" placeholder="0,00" className="campo" /></Campo>
                  <Campo rotulo="Desconto"><input name="desconto" inputMode="decimal" placeholder="0,00" className="campo" /></Campo>
                  <p className="text-[12px] text-[#6c757d] sm:col-span-2">Valor da conta: <b>{brl(l.valor)}</b>. O valor pago é o valor + juros − desconto.</p>
                </FormAcao>
              </div>
            )}
          </Bloco>

          {!pagar && (
            <Bloco icone="boleto" titulo={<><b>Boleto</b> no Banco Inter</>} subtitulo={interAtivo ? undefined : "A integração com o Inter não está ativa."}>
              <div id="boleto">
                {l.boletos.length || (interAtivo && !l.pagoEm)
                  ? <BoletoParcela parcela={l} cliente={l.pessoa} base={base} interAtivo={interAtivo} />
                  : <p className="text-[13px] text-[#6c757d]">Nenhum boleto para esta conta.</p>}
              </div>
            </Bloco>
          )}
        </div>
      </div>
    </Pagina>
  );
}
