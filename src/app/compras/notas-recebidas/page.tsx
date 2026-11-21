import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { exigirArea } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { temCertificadoServidor } from "@/lib/fiscal/certificado";
import { lojaAtual } from "@/lib/empresa/atual";
import { aguardandoXml, diasParaManifestar, estadoDfe, MANIFESTACOES, MAX_TENTATIVAS_XML, PRAZO_MANIFESTACAO_DIAS, semConclusiva, type TipoManifestacao } from "@/lib/fiscal/dfe";
import { baixarXmlAcao, baixarXmlsPendentesAcao, cienciaEmLoteAcao, manifestarAcao, sincronizarDfeAcao } from "@/lib/fiscal/acoesDfe";
import { configContador } from "@/lib/contador/contador";
import { brl, data, dataHora } from "@/lib/ui/format";
import { Bloco, Pagina, Pilula, RodapeLista } from "@/components/ui/Pagina";
import Resumo from "@/components/ui/Resumo";
import BotaoAcao from "@/components/BotaoAcao";
import { cadaPalavra, contem } from "@/lib/busca/palavras";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notas recebidas (SEFAZ)" };

const FILTROS = [
  ["pendentes", "Sem manifestação conclusiva"], ["prazo", "Prazo vencendo"], ["sem-xml", "Aguardando XML"],
  ["sem-compra", "Sem compra lançada"], ["canceladas", "Canceladas pelo fornecedor"], ["todas", "Todas"],
] as const;
type Filtro = (typeof FILTROS)[number][0];
const ALERTA_DIAS = 15;
const DIA = 86400_000;
const doc = (d: string) => (d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d);
const VERDE = "border-emerald-300 bg-emerald-50 text-emerald-700", AMARELO = "border-amber-300 bg-amber-50 text-amber-800";
const VERMELHO = "border-red-300 bg-red-50 text-red-700", CINZA = "border-slate-300 bg-slate-50 text-slate-600", AZUL = "border-sky-300 bg-sky-50 text-sky-700";
const COR_MANIF: Record<string, string> = { CIENCIA: AZUL, CONFIRMADA: VERDE, DESCONHECIDA: VERMELHO, NAO_REALIZADA: VERMELHO };
const recusada = (m: string | null) => m === "DESCONHECIDA" || m === "NAO_REALIZADA";

/** Compras → Notas recebidas: NF-e emitidas contra o CNPJ de cada loja, baixadas da SEFAZ (distribuição DF-e). */
export default async function NotasRecebidas({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  await exigirArea("/compras/notas-recebidas");
  const sp = await searchParams;
  const f: Filtro = FILTROS.some(([k]) => k === sp.f) ? (sp.f as Filtro) : "pendentes";
  const agora = new Date();
  const limitePrazo = new Date(agora.getTime() - (PRAZO_MANIFESTACAO_DIAS - ALERTA_DIAS) * DIA);
  const dentroDoPrazo = new Date(agora.getTime() - PRAZO_MANIFESTACAO_DIAS * DIA);
  const loja = await lojaAtual();

  const chavesCompra = new Set((await prisma.compra.findMany({ where: { chaveNfe: { not: null } }, select: { chaveNfe: true } })).map((c) => c.chaveNfe!));
  const filtro: Record<Filtro, Prisma.NotaRecebidaWhereInput> = {
    pendentes: semConclusiva,
    prazo: { ...semConclusiva, emissao: { lte: limitePrazo, gte: dentroDoPrazo } },
    "sem-xml": aguardandoXml,
    "sem-compra": { xml: { not: null }, situacao: "AUTORIZADA", chave: { notIn: [...chavesCompra] }, NOT: { manifestacao: { in: ["DESCONHECIDA", "NAO_REALIZADA"] } } },
    canceladas: { situacao: "CANCELADA" },
    todas: {},
  };
  const busca: Prisma.NotaRecebidaWhereInput = { AND: cadaPalavra(sp.q, (p) => { const d = p.replace(/\D/g, "") || "-"; return [{ emitenteNome: contem(p) }, { chave: { contains: d } }, { emitenteDocumento: { contains: d } }]; }) };

  const [notas, total, nPend, nPrazo, nXml, nSemCompra, canceladasComCompra, semManif, empresas, contador] = await Promise.all([
    prisma.notaRecebida.findMany({ where: { ...filtro[f], ...busca }, orderBy: { emissao: "desc" }, take: 300 }),
    prisma.notaRecebida.count({ where: { ...filtro[f], ...busca } }),
    prisma.notaRecebida.count({ where: filtro.pendentes }),
    prisma.notaRecebida.count({ where: filtro.prazo }),
    prisma.notaRecebida.count({ where: filtro["sem-xml"] }),
    prisma.notaRecebida.count({ where: filtro["sem-compra"] }),
    prisma.notaRecebida.findMany({ where: { situacao: "CANCELADA", chave: { in: [...chavesCompra] } }, select: { chave: true, emitenteNome: true } }),
    prisma.notaRecebida.count({ where: { manifestacao: null, situacao: "AUTORIZADA", emissao: { gt: dentroDoPrazo } } }),
    prisma.empresa.findMany({ where: { ativa: true }, orderBy: { createdAt: "asc" }, select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true, certificadoValidade: true, certificadoPfx: true } }),
    configContador(),
  ]);
  const estados = await Promise.all(empresas.map((e) => estadoDfe(e.id)));
  const compras = await prisma.compra.findMany({ where: { chaveNfe: { in: notas.map((n) => n.chave) } }, select: { id: true, numero: true, chaveNfe: true } });
  const compraDe = new Map(compras.map((c) => [c.chaveNfe!, c]));
  const servidor = temCertificadoServidor();
  const certDe = (e: (typeof empresas)[number], i: number) =>
    e.certificadoPfx ? (e.certificadoValidade && e.certificadoValidade < agora ? { ok: false, txt: `vencido em ${data(e.certificadoValidade)}` } : { ok: true, txt: e.certificadoValidade ? `válido até ${data(e.certificadoValidade)}` : "configurado" })
      : i === 0 && servidor ? { ok: true, txt: "do servidor" } : { ok: false, txt: "sem certificado A1" };
  const link = (k: string) => `/compras/notas-recebidas?${new URLSearchParams({ f: k, ...(sp.q ? { q: sp.q } : {}) })}`;
  const cartao = (k: Filtro) => ({ href: f === k ? link("todas") : link(k), ativo: f === k });

  return (
    <Pagina titulo="Notas recebidas (SEFAZ)" icone="importar" trilha={[{ rotulo: "Compras", href: "/compras" }, { rotulo: "Notas recebidas" }]}
      acoes={<Link href="/contador" className="btn-sec">Automação</Link>}>
      {!empresas.length && <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">Cadastre a empresa em Configurações › Empresas (lojas) para buscar as notas na SEFAZ.</p>}
      {!!semManif && <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
        {semManif === 1 ? "Uma nota recebida ainda não tem" : `${semManif} notas recebidas ainda não têm`} manifestação nenhuma. A SEFAZ manda só o resumo dessas notas: o XML completo, que é usado para lançar a compra, só vem depois da ciência.
        {!contador.cienciaAutomatica && <> Para a ciência ser feita sozinha, ligue em <Link href="/contador" className="underline">Integrações › Contador</Link>.</>}
      </p>}
      {semManif === 0 && !!nXml && <p className="mb-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] text-sky-900">{nXml} nota(s) já têm ciência e esperam a SEFAZ liberar o XML completo. O sistema pede de novo de hora em hora, sem você precisar fazer nada.</p>}
      {/* nota cancelada pelo fornecedor depois de virar compra: estoque e contas a pagar precisam ser revistos */}
      {canceladasComCompra.length > 0 && <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-800">
        <b>Atenção:</b> {canceladasComCompra.length === 1 ? "uma nota que já virou compra foi cancelada" : `${canceladasComCompra.length} notas que já viraram compra foram canceladas`} pelo fornecedor ({canceladasComCompra.slice(0, 3).map((n) => n.emitenteNome).join(", ")}{canceladasComCompra.length > 3 ? "…" : ""}). Confira o estoque e as contas a pagar dessas compras.
        <Link href={link("canceladas")} className="ml-1 underline">Ver</Link>
      </div>}

      <Resumo cartoes={[
        { rotulo: "Sem manifestação conclusiva", valor: String(nPend), legenda: `confirmar, desconhecer ou recusar em até ${PRAZO_MANIFESTACAO_DIAS} dias`, icone: "hoje", cor: nPend ? "amarelo" : "verde", ...cartao("pendentes") },
        { rotulo: "Prazo vencendo", valor: String(nPrazo), legenda: `menos de ${ALERTA_DIAS} dias para manifestar`, icone: "atrasado", cor: nPrazo ? "vermelho" : "verde", ...cartao("prazo") },
        { rotulo: "Aguardando XML", valor: String(nXml), legenda: "com ciência; o sistema pede de hora em hora", icone: "relogio", cor: nXml ? "azul" : "verde", ...cartao("sem-xml") },
        { rotulo: "Sem compra lançada", valor: String(nSemCompra), legenda: "XML completo pronto para virar compra", icone: "carrinho", cor: nSemCompra ? "tinta" : "verde", ...cartao("sem-compra") },
      ]} />

      <Bloco icone="atualizar" titulo={<>Busca automática <b>por CNPJ</b></>} corpo="p-0"
        subtitulo="De hora em hora o agendador consulta a SEFAZ para cada loja com certificado A1, dá a ciência (se ligada) e pede os XMLs que faltam."
        acoes={<div className="flex flex-wrap gap-2">
          {!!semManif && <BotaoAcao acao={cienciaEmLoteAcao} campos={{}} rotulo={`Dar ciência em ${Math.min(semManif, 20)} nota(s)`} secundario />}
          {!!nXml && <BotaoAcao acao={baixarXmlsPendentesAcao} campos={{}} rotulo="Pedir XMLs agora" secundario />}
        </div>}>
        <table className="tabela">
          <thead><tr><th>Loja</th><th>Certificado</th><th>Última consulta</th><th>Retorno da SEFAZ</th><th>NSU</th><th className="w-48"></th></tr></thead>
          <tbody>
            {empresas.map((e, i) => {
              const est = estados[i], cert = certDe(e, i);
              const espera = est.proximaConsulta && new Date(est.proximaConsulta) > agora;
              return (
                <tr key={e.id} className={loja?.id === e.id ? "bg-slate-50" : ""}>
                  <td><span className="font-semibold">{e.nomeFantasia || e.razaoSocial}</span><div className="font-mono text-[11px] text-slate-500">{doc(e.cnpj)}</div></td>
                  <td><Pilula rotulo={cert.txt} cor={cert.ok ? VERDE : VERMELHO} /></td>
                  <td className="text-[12px]">{est.ultimaConsulta ? dataHora(est.ultimaConsulta) : <span className="text-slate-400">nunca</span>}
                    {espera && <div className="text-amber-700">próxima liberada às {new Date(est.proximaConsulta!).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}</div>}</td>
                  <td className="max-w-72 text-[12px] text-slate-600">{est.ultimoRetorno ?? "—"}</td>
                  <td className="font-mono text-[12px]">{Number(est.ultNSU)}{est.maxNSU ? ` / ${Number(est.maxNSU)}` : ""}</td>
                  <td className="text-right">{cert.ok && <BotaoAcao acao={sincronizarDfeAcao} campos={{ empresaId: e.id }} rotulo="Buscar agora" secundario />}</td>
                </tr>
              );
            })}
            {!empresas.length && <tr><td colSpan={6} className="py-6 text-center text-slate-500">Nenhuma loja cadastrada.</td></tr>}
          </tbody>
        </table>
      </Bloco>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTROS.map(([k, r]) => <Link key={k} href={link(k)} className={`rounded px-2 py-1 text-sm ${k === f ? "bg-slate-200 font-medium" : "text-slate-600 hover:bg-slate-100"}`}>{r}</Link>)}
        <form className="ml-auto flex gap-2"><input type="hidden" name="f" value={f} /><input name="q" defaultValue={sp.q} placeholder="Fornecedor, CNPJ ou chave" className="campo h-8 w-60 text-[12px]" /><button className="btn-sec h-8 text-[12px]">Buscar</button></form>
      </div>

      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Emissão</th><th>Fornecedor</th><th>Nº</th><th className="text-right">Valor</th><th>Situação</th><th>Manifestação</th><th>Prazo</th><th>Compra</th><th className="min-w-64">Ações</th></tr></thead>
          <tbody>
            {notas.map((n) => {
              const compra = compraDe.get(n.chave);
              const conclusiva = !!n.manifestacao && n.manifestacao !== "CIENCIA";
              const dias = diasParaManifestar(n.emissao, agora);
              const aguardaXml = !n.xml && n.situacao === "AUTORIZADA" && (n.manifestacao === "CIENCIA" || n.manifestacao === "CONFIRMADA");
              return (
                <tr key={n.id}>
                  <td>{data(n.emissao)}</td>
                  <td>{n.emitenteNome}<div className="text-[11px] text-slate-500">{doc(n.emitenteDocumento)}</div></td>
                  <td className="font-mono text-[12px]">{Number(n.chave.slice(25, 34))}<div className="font-sans text-[11px] text-slate-500">série {Number(n.chave.slice(22, 25))}</div></td>
                  <td className="text-right">{brl(n.valor)}</td>
                  <td><Pilula rotulo={n.situacao === "AUTORIZADA" ? "Autorizada" : n.situacao === "CANCELADA" ? "Cancelada" : "Denegada"} cor={n.situacao === "AUTORIZADA" ? VERDE : VERMELHO} />
                    {n.situacao === "CANCELADA" && compra && <div className="mt-0.5 text-[11px] font-semibold text-red-700">já virou compra</div>}</td>
                  <td className="text-[12px]">{n.manifestacao ? <Pilula rotulo={MANIFESTACOES[n.manifestacao as TipoManifestacao]?.rotulo ?? n.manifestacao} cor={COR_MANIF[n.manifestacao] ?? CINZA} /> : <Pilula rotulo="Pendente" cor={AMARELO} />}
                    {n.manifestadaEm && <div className="text-[11px] text-slate-500">{data(n.manifestadaEm)}</div>}</td>
                  <td className="text-[12px]">{conclusiva || n.situacao !== "AUTORIZADA" ? <span className="text-slate-400">—</span>
                    : dias < 0 ? <span className="font-semibold text-red-700">vencido</span>
                      : <span className={dias <= ALERTA_DIAS ? "font-semibold text-red-700" : dias <= 45 ? "text-amber-700" : "text-slate-600"}>{dias} dia{dias === 1 ? "" : "s"}</span>}</td>
                  <td className="text-[12px]">
                    {compra ? <Link className="text-marca hover:underline" href={`/compras/${compra.id}`}>nº {compra.numero}</Link>
                      : n.xml && n.situacao === "AUTORIZADA" && !recusada(n.manifestacao) ? <Link className="btn-sec px-2 py-1 text-[12px]" href={`/compras/importar-xml?recebida=${n.id}`}>Lançar compra</Link>
                        : aguardaXml ? <span className="text-slate-500" title={`Pedido ${n.xmlTentativas} vez(es)${n.xmlTentadoEm ? `, a última em ${dataHora(n.xmlTentadoEm)}` : ""}`}>aguardando XML</span> : "—"}
                  </td>
                  <td className="text-[12px]">
                    <div className="flex flex-wrap items-center gap-2">
                      {n.xml ? <a className="text-marca hover:underline" href={`/api/notas-recebidas/${n.id}`}>XML</a>
                        : n.manifestacao ? <BotaoAcao acao={baixarXmlAcao} campos={{ id: n.id }} rotulo="Baixar XML" secundario /> : null}
                      {aguardaXml && n.xmlTentativas >= MAX_TENTATIVAS_XML && <span className="text-[11px] text-red-700">a SEFAZ não liberou depois de {MAX_TENTATIVAS_XML} pedidos</span>}
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
            {!notas.length && <tr><td colSpan={9} className="py-8 text-center text-slate-500">Nenhuma nota aqui.</td></tr>}
          </tbody>
        </table>
      </div>
      <RodapeLista total={total} mostrando={notas.length} />
      <p className="mt-2 text-[12px] text-slate-500">Ciência ou confirmação em até {PRAZO_MANIFESTACAO_DIAS} dias da emissão; desconhecimento e operação não realizada também. Manifestação conclusiva não pode ser desfeita. As notas mostradas são da loja atual{loja ? ` (${loja.nomeFantasia || loja.razaoSocial})` : ""}.</p>
    </Pagina>
  );
}
