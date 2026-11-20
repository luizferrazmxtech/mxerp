import Link from "next/link";
import { exigirArea } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { temCertificadoServidor } from "@/lib/fiscal/certificado";
import { lojaAtual } from "@/lib/empresa/atual";
import { estadoDfe, MANIFESTACOES, type TipoManifestacao } from "@/lib/fiscal/dfe";
import { baixarXmlAcao, manifestarAcao, sincronizarDfeAcao } from "@/lib/fiscal/acoesDfe";
import { brl, data, dataHora } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import BotaoAcao from "@/components/BotaoAcao";
import { cadaPalavra, contem } from "@/lib/busca/palavras";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notas recebidas (SEFAZ)" };

const FILTROS = [["pendentes", "Sem manifestação conclusiva"], ["sem-compra", "Sem compra lançada"], ["todas", "Todas"]] as const;
const doc = (d: string) => (d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d);

export default async function NotasRecebidas({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  await exigirArea("/compras/notas-recebidas");
  const sp = await searchParams;
  const f = FILTROS.some(([k]) => k === sp.f) ? sp.f! : "pendentes";
  const loja = await lojaAtual();
  const [notas, est, temEmpresa] = await Promise.all([
    prisma.notaRecebida.findMany({
      where: {
        ...(f === "pendentes" ? { OR: [{ manifestacao: null }, { manifestacao: "CIENCIA" }] } : {}),
        AND: cadaPalavra(sp.q, (p) => { const d = p.replace(/\D/g, "") || "-"; return [{ emitenteNome: contem(p) }, { chave: { contains: d } }, { emitenteDocumento: { contains: d } }]; }),
      },
      orderBy: { emissao: "desc" }, take: 300,
    }),
    estadoDfe(loja?.id),
    prisma.empresa.count(),
  ]);
  const compras = await prisma.compra.findMany({ where: { chaveNfe: { in: notas.map((n) => n.chave) } }, select: { id: true, numero: true, chaveNfe: true } });
  const compraDe = new Map(compras.map((c) => [c.chaveNfe!, c]));
  const lista = f === "sem-compra" ? notas.filter((n) => !compraDe.has(n.chave) && n.situacao === "AUTORIZADA" && n.manifestacao !== "DESCONHECIDA" && n.manifestacao !== "NAO_REALIZADA") : notas;
  const certOk = !!loja?.certificadoValidade || temCertificadoServidor();

  return (
    <Pagina titulo="Notas recebidas (SEFAZ)" icone="importar" trilha={[{ rotulo: "Compras", href: "/compras" }, { rotulo: "Notas recebidas" }]}>
      <div className="mb-3 grid gap-3 md:grid-cols-[2fr_1fr]">
        <div className="cartao p-4 text-[13px] text-slate-600">
          <p>As NF-e que os fornecedores emitem contra o CNPJ da empresa chegam aqui direto da SEFAZ (de hora em hora, pelo agendador, ou no botão ao lado).
            Primeiro vem o resumo; ao dar <b>ciência</b>, o XML completo fica disponível para lançar a compra com estoque e contas a pagar.</p>
          <p className="mt-1">Prazos: ciência ou confirmação em até 180 dias da emissão; desconhecimento ou operação não realizada também. Manifestação conclusiva não pode ser desfeita.</p>
          {!certOk && <p className="mt-1 text-red-700">Certificado A1 não configurado no servidor: a consulta só funciona com ele.</p>}
          {!temEmpresa && <p className="mt-1 text-red-700">Cadastre os dados da empresa em Notas fiscais.</p>}
        </div>
        <div className="cartao space-y-1 p-4 text-[12px]">
          <BotaoAcao acao={sincronizarDfeAcao} campos={{}} rotulo="Buscar notas na SEFAZ agora" />
          <div className="text-slate-500">Último NSU: {est.ultNSU}{est.maxNSU ? ` de ${est.maxNSU}` : ""}</div>
          {est.ultimaConsulta && <div className="text-slate-500">Última consulta: {dataHora(est.ultimaConsulta)} · {est.ultimoRetorno}</div>}
          {est.proximaConsulta && new Date(est.proximaConsulta) > new Date() && <div className="text-amber-700">Próxima consulta liberada às {dataHora(est.proximaConsulta)}</div>}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTROS.map(([k, r]) => <Link key={k} href={`/compras/notas-recebidas?f=${k}`} className={`rounded px-2 py-1 text-sm ${k === f ? "bg-slate-200 font-medium" : "text-slate-600 hover:bg-slate-100"}`}>{r}</Link>)}
        <form className="ml-auto flex gap-2"><input type="hidden" name="f" value={f} /><input name="q" defaultValue={sp.q} placeholder="Fornecedor, CNPJ ou chave" className="campo w-60" /><button className="btn-sec">Buscar</button></form>
      </div>

      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Emissão</th><th>Fornecedor</th><th className="text-right">Valor</th><th>Situação</th><th>Manifestação</th><th>Compra</th><th className="min-w-72">Ações</th></tr></thead>
          <tbody>
            {lista.map((n) => {
              const compra = compraDe.get(n.chave);
              const conclusiva = n.manifestacao && n.manifestacao !== "CIENCIA";
              return (
                <tr key={n.id}>
                  <td>{data(n.emissao)}</td>
                  <td>{n.emitenteNome}<div className="text-[11px] text-slate-500">{doc(n.emitenteDocumento)} · <span className="font-mono">{n.chave.slice(25, 34).replace(/^0+/, "")}</span></div></td>
                  <td className="text-right">{brl(n.valor)}</td>
                  <td className={n.situacao === "AUTORIZADA" ? "" : "font-semibold text-red-600"}>{n.situacao.toLowerCase()}</td>
                  <td className="text-[12px]">{n.manifestacao ? MANIFESTACOES[n.manifestacao as TipoManifestacao]?.rotulo : <span className="text-amber-700">pendente</span>}{n.manifestadaEm && <div className="text-slate-500">{data(n.manifestadaEm)}</div>}</td>
                  <td className="text-[12px]">
                    {compra ? <Link className="text-marca hover:underline" href={`/compras/${compra.id}`}>nº {compra.numero}</Link>
                      : n.xml ? <Link className="btn-sec px-2 py-1 text-[12px]" href={`/compras/importar-xml?recebida=${n.id}`}>Lançar compra</Link> : "—"}
                  </td>
                  <td className="text-[12px]">
                    <div className="flex flex-wrap gap-2">
                      {n.xml ? <a className="text-marca hover:underline" href={`/api/notas-recebidas/${n.id}`}>XML</a>
                        : n.manifestacao ? <BotaoAcao acao={baixarXmlAcao} campos={{ id: n.id }} rotulo="Baixar XML" secundario /> : null}
                    </div>
                    {!conclusiva && n.situacao === "AUTORIZADA" && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-marca">Manifestar</summary>
                        <div className="mt-1 space-y-1">
                          {!n.manifestacao && <BotaoAcao acao={manifestarAcao} campos={{ id: n.id, tipo: "CIENCIA" }} rotulo="Ciência da operação" secundario />}
                          <BotaoAcao acao={manifestarAcao} campos={{ id: n.id, tipo: "CONFIRMADA" }} rotulo="Confirmar (recebi a mercadoria)" secundario />
                          <BotaoAcao acao={manifestarAcao} campos={{ id: n.id, tipo: "DESCONHECIDA" }} rotulo="Desconheço esta nota" secundario />
                          <BotaoAcao acao={manifestarAcao} campos={{ id: n.id, tipo: "NAO_REALIZADA" }} rotulo="Operação não realizada" secundario>
                            <input name="justificativa" required minLength={15} className="campo" placeholder="Motivo (15+ caracteres)" />
                          </BotaoAcao>
                        </div>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
            {!lista.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">Nenhuma nota aqui.</td></tr>}
          </tbody>
        </table>
      </div>
    </Pagina>
  );
}
