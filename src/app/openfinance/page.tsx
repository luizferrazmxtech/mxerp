import { Fragment } from "react";
import Link from "next/link";
import { exigirArea } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { configOpenFinanceTela, nomeSituacao, situacaoOk } from "@/lib/openfinance/openfinance";
import { atualizarNoBancoAcao, desconectarAcao, sincronizarOpenFinanceAcao } from "@/lib/openfinance/acoes";
import { brl, data, dataHora } from "@/lib/ui/format";
import { Bloco, Pagina, Pilula } from "@/components/ui/Pagina";
import Resumo from "@/components/ui/Resumo";
import BotaoAcao from "@/components/BotaoAcao";
import ConectarBanco from "@/components/openfinance/ConectarBanco";
import FormOpenFinance, { VincularConta } from "@/components/openfinance/FormOpenFinance";

export const dynamic = "force-dynamic";
export const metadata = { title: "Open Finance" };

const VERDE = "border-emerald-300 bg-emerald-50 text-emerald-700", AMARELO = "border-amber-300 bg-amber-50 text-amber-800", VERMELHO = "border-red-300 bg-red-50 text-red-700";
const DIA = 86400_000;

/** Configurações → Integrações → Open Finance: bancos conectados pelo Pluggy e em qual conta do ERP cada extrato entra. */
export default async function OpenFinancePagina() {
  const u = await exigirArea("/openfinance");
  const [c, conexoes, contasErp, pendentes] = await Promise.all([
    configOpenFinanceTela(),
    prisma.conexaoOpenFinance.findMany({ orderBy: { createdAt: "asc" }, include: { contas: { orderBy: { nome: "asc" } } } }),
    prisma.contaBancaria.findMany({ where: { ativa: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.transacaoBancaria.count({ where: { situacao: "PENDENTE", chave: { startsWith: "pluggy:" } } }),
  ]);
  const agora = new Date();
  const ligadas = conexoes.flatMap((x) => x.contas).filter((x) => x.contaBancariaId && x.tipo === "BANK");
  const vencendo = conexoes.filter((x) => x.consentimentoAte && x.consentimentoAte.getTime() - agora.getTime() < 30 * DIA);
  const comProblema = conexoes.filter((x) => !situacaoOk(x.situacao));
  const ultima = conexoes.map((x) => x.ultimaSincEm).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];
  const pronto = c.ativo && !!c.clientId && c.temSecret;

  return (
    <Pagina titulo="Open Finance" icone="conciliacao" trilha={[{ rotulo: "Configurações" }, { rotulo: "Integrações" }, { rotulo: "Open Finance" }]}
      acoes={<Link href="/financeiro/conciliacao" className="btn-sec">Conciliação bancária</Link>}>
      <div className="mb-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] text-sky-900">
        <b>Como funciona:</b> você autoriza cada banco (Itaú, Bradesco, Banco do Brasil, Caixa, Santander, Sicoob, Sicredi, Nubank…) pelo Open Finance, na janela do próprio banco.
        O extrato chega de hora em hora e entra na <Link href="/financeiro/conciliacao" className="underline">conciliação bancária</Link> igual ao do Inter: o que casa sem dúvida é baixado sozinho, o resto fica como sugestão.
        O acesso é só de leitura e o consentimento vale por até 12 meses. O Banco Inter continua pela API própria.
      </div>
      {!pronto && <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">Preencha as credenciais do Pluggy abaixo e marque &quot;Ligar&quot; para conectar os bancos.</p>}

      <Resumo cartoes={[
        { rotulo: "Bancos conectados", valor: String(conexoes.length), legenda: comProblema.length ? `${comProblema.length} precisa(m) de atenção` : "todos atualizados", icone: "conciliacao", cor: comProblema.length ? "vermelho" : conexoes.length ? "verde" : "cinza" },
        { rotulo: "Contas no ERP", valor: String(ligadas.length), legenda: "contas cujo extrato entra na conciliação", icone: "dinheiro", cor: "tinta" },
        { rotulo: "A conciliar", valor: String(pendentes), legenda: "lançamentos do extrato ainda sem par", icone: "hoje", cor: pendentes ? "amarelo" : "verde", href: "/financeiro/conciliacao" },
        { rotulo: "Última sincronização", valor: ultima ? dataHora(ultima).slice(0, 10) : "—", legenda: ultima ? `às ${dataHora(ultima).slice(11)}` : "nenhuma ainda", icone: "relogio", cor: vencendo.length ? "amarelo" : "tinta" },
      ]} />

      {vencendo.map((x) => (
        <p key={x.id} className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          O consentimento do <b>{x.banco}</b> {x.consentimentoAte! < agora ? "venceu" : "vence"} em {data(x.consentimentoAte)}. Clique em &quot;Renovar autorização&quot; para continuar recebendo o extrato.
        </p>
      ))}

      <Bloco icone="conciliacao" titulo={<>Bancos <b>conectados</b></>} corpo="p-0"
        acoes={pronto ? <div className="flex flex-wrap items-start gap-2">{!!conexoes.length && <BotaoAcao acao={sincronizarOpenFinanceAcao} campos={{}} rotulo="Sincronizar agora" secundario />}<ConectarBanco /></div> : undefined}>
        <table className="tabela">
          <thead><tr><th>Banco / conta</th><th>Situação</th><th className="text-right">Saldo</th><th>Entra no ERP como</th><th className="w-64"></th></tr></thead>
          <tbody>
            {conexoes.map((x) => (
              <Fragment key={x.id}>
                <tr className="bg-slate-50">
                  <td><div className="flex items-center gap-2">{x.logo && <span className="h-6 w-6 rounded bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${JSON.stringify(x.logo)})` }} />}<b>{x.banco}</b></div>
                    <div className="text-[11px] text-slate-500">{x.consentimentoAte ? `autorizado até ${data(x.consentimentoAte)}` : "conectado"}{x.ultimaSincEm ? ` · sincronizado ${dataHora(x.ultimaSincEm)}` : ""}</div></td>
                  <td><Pilula rotulo={nomeSituacao(x.situacao)} cor={situacaoOk(x.situacao) ? VERDE : VERMELHO} />
                    {x.ultimaSincMsg && <div className={`mt-0.5 max-w-80 text-[11px] ${x.ultimaSincMsg.startsWith("Erro") ? "text-red-700" : "text-slate-500"}`}>{x.ultimaSincMsg}</div>}</td>
                  <td /><td />
                  <td className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {pronto && <ConectarBanco itemId={x.itemId} rotulo="Renovar autorização" secundario />}
                      {pronto && <BotaoAcao acao={atualizarNoBancoAcao} campos={{ id: x.id }} rotulo="Buscar no banco" secundario />}
                      {u.papel === "ADMIN" && <BotaoAcao acao={desconectarAcao} campos={{ id: x.id }} rotulo="Desconectar" secundario />}
                    </div>
                  </td>
                </tr>
                {x.contas.map((ct) => (
                  <tr key={ct.id}>
                    <td className="pl-10">{ct.nome}<div className="text-[11px] text-slate-500">{ct.tipo === "CREDIT" ? "cartão de crédito" : "conta"}{ct.numero ? ` · ${ct.numero}` : ""}</div></td>
                    <td>{ct.tipo === "CREDIT" ? <Pilula rotulo="Não importa" cor={AMARELO} /> : ct.contaBancariaId ? <Pilula rotulo="Importando" cor={VERDE} /> : <Pilula rotulo="Escolha a conta" cor={AMARELO} />}</td>
                    <td className="text-right">{ct.saldo == null ? "—" : brl(ct.saldo)}</td>
                    <td colSpan={2}>{ct.tipo === "CREDIT"
                      ? <span className="text-[12px] text-slate-500">A fatura do cartão é lançada como conta a pagar.</span>
                      : <VincularConta id={ct.id} contaBancariaId={ct.contaBancariaId} importarDesde={ct.importarDesde ? ct.importarDesde.toISOString().slice(0, 10) : ""} contas={contasErp} />}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {!conexoes.length && <tr><td colSpan={5} className="py-6 text-center text-slate-500">Nenhum banco conectado ainda.</td></tr>}
          </tbody>
        </table>
      </Bloco>

      <FormOpenFinance c={c} admin={u.papel === "ADMIN"} />
    </Pagina>
  );
}
