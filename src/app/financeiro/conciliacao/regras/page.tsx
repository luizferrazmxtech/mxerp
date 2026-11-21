import Link from "next/link";
import { Bloco, Pagina } from "@/components/ui/Pagina";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import FormAcao from "@/components/financeiro/FormAcao";
import Icone from "@/components/Icone";
import { exigirUsuario } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { configAviso } from "@/lib/financeiro/avisoConciliacao";
import { whatsappAtivo, foneBonito } from "@/lib/whatsapp/mxchat";
import { alternarRegraAcao, excluirRegraAcao, salvarAvisoAcao, salvarRegraAcao, testarAvisoAcao } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Regras da conciliação" };

export default async function Regras({ searchParams }: { searchParams: Promise<{ novo?: string; editar?: string; q?: string }> }) {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  const sp = await searchParams;
  const [regras, categorias, centros, aviso, zap, envios] = await Promise.all([
    prisma.regraConciliacao.findMany({ include: { categoria: true, centroCusto: true }, orderBy: [{ ativa: "desc" }, { vezes: "desc" }, { texto: "asc" }] }),
    prisma.categoriaFinanceira.findMany({ where: { ativa: true }, orderBy: [{ tipo: "asc" }, { codigo: "asc" }, { nome: "asc" }], select: { id: true, nome: true, codigo: true, tipo: true } }),
    prisma.centroCusto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    configAviso(),
    whatsappAtivo(),
    prisma.mensagemWhatsapp.findMany({ where: { entidade: "CONCILIACAO" }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const editando = sp.editar ? regras.find((r) => r.id === sp.editar) : undefined;
  const q = (sp.q ?? "").trim().toLowerCase();
  const lista = q ? regras.filter((r) => r.texto.includes(q) || r.categoria.nome.toLowerCase().includes(q)) : regras;
  const nomeCat = (c: { codigo: string | null; nome: string }) => (c.codigo ? `${c.codigo} ${c.nome}` : c.nome);

  return (
    <Pagina titulo="Regras da conciliação" icone="conciliacao" trilha={[{ rotulo: "Financeiro", href: "/financeiro" }, { rotulo: "Conciliação bancária", href: "/financeiro/conciliacao" }, { rotulo: "Regras e aviso diário" }]}>
      <div className="space-y-4">
        <FormAcao acao={salvarAvisoAcao} limpar={false}>
          <Bloco icone="whatsapp" titulo={<>Aviso <b>diário no WhatsApp</b></>} subtitulo="Uma vez por dia, a partir da hora escolhida: linhas pendentes, urgentes pelo prazo, sugestões prontas, as mais urgentes e a diferença de saldo, se houver. Não manda nada quando está tudo conciliado.">
            {!zap && <p className="mb-2 rounded bg-amber-50 px-3 py-2 text-[13px] text-amber-900">O WhatsApp (MXChat) ainda não está ligado. <Link href="/whatsapp" className="underline">Configure aqui</Link>.</p>}
            <div className="grid gap-3 md:grid-cols-[160px_1fr_140px]">
              <label><span className="rotulo">Situação</span><select name="ativo" defaultValue={aviso.ativo ? "1" : "0"} className="campo"><option value="1">Ligado</option><option value="0">Desligado</option></select></label>
              <label><span className="rotulo">Números (um por linha)</span><textarea name="numeros" rows={2} className="campo" defaultValue={aviso.numeros.map((n) => foneBonito(n)).join("\n")} placeholder="(11) 98765-4321" /></label>
              <label><span className="rotulo">A partir das</span><select name="hora" defaultValue={String(aviso.hora)} className="campo">{Array.from({ length: 13 }, (_, i) => i + 8).map((h) => <option key={h} value={h}>{h}h</option>)}</select></label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className="btn">Salvar aviso</button>
              {aviso.ultimoEnvio && <span className="text-[12px] text-slate-500">Último aviso automático: {aviso.ultimoEnvio.split("-").reverse().join("/")}</span>}
            </div>
          </Bloco>
        </FormAcao>
        <div className="-mt-2 flex flex-wrap items-start gap-3">
          <FormAcao acao={testarAvisoAcao} limpar={false} botao="Mandar o aviso agora (teste)" classeBotao="btn-sec" pendenteRotulo="Enviando…" className="flex flex-col gap-2"><input type="hidden" name="teste" value="1" /></FormAcao>
          {envios.length > 0 && (
            <div className="text-[12px] text-slate-600">
              {envios.map((e) => <div key={e.id}>{e.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })} · {foneBonito(e.numero)} · {e.situacao === "ENVIADA" ? "enviada" : `erro: ${e.erro}`}</div>)}
            </div>
          )}
        </div>

        {sp.novo || editando ? (
          <FormAcao acao={salvarRegraAcao} limpar={false}>
            {editando && <input type="hidden" name="id" value={editando.id} />}
            <Bloco icone="editar" titulo={<>{editando ? "Altere a" : "Cadastre uma"} <b>regra</b></>} subtitulo="A regra manda a linha do extrato direto para a categoria (e o centro de custo) escolhidos, com confiança alta. Regra cadastrada ou alterada aqui não é trocada pelo aprendizado.">
              <div className="grid gap-3 md:grid-cols-[180px_1fr]">
                <label><span className="rotulo">Quando</span><select name="modo" defaultValue={editando?.modo ?? "CONTEM"} className="campo"><option value="IGUAL">O favorecido for</option><option value="CONTEM">A descrição contiver</option></select></label>
                <label><span className="rotulo obrig">Nome ou trecho</span><input name="texto" required defaultValue={editando?.texto} className="campo" placeholder="ex.: cef matriz, tarifa pix, enel" /></label>
                <label><span className="rotulo obrig">Categoria</span>
                  <select name="categoriaId" required defaultValue={editando?.categoriaId ?? ""} className="campo">
                    <option value="" disabled>Escolha…</option>
                    <optgroup label="Despesas (saídas)">{categorias.filter((c) => c.tipo === "PAGAR").map((c) => <option key={c.id} value={c.id}>{nomeCat(c)}</option>)}</optgroup>
                    <optgroup label="Receitas (entradas)">{categorias.filter((c) => c.tipo === "RECEBER").map((c) => <option key={c.id} value={c.id}>{nomeCat(c)}</option>)}</optgroup>
                  </select>
                </label>
                <label><span className="rotulo">Centro de custo</span>
                  <select name="centroCustoId" defaultValue={editando?.centroCustoId ?? ""} className="campo"><option value="">— sem centro —</option>{centros.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                </label>
                <label className="md:col-span-2"><span className="rotulo">Descrição do lançamento (opcional)</span><input name="descricao" defaultValue={editando?.descricao ?? ""} className="campo" placeholder="vazio = a descrição do extrato" /></label>
                <label><span className="rotulo">Situação</span><select name="ativa" defaultValue={editando?.ativa === false ? "0" : "1"} className="campo"><option value="1">Ativa</option><option value="0">Desligada</option></select></label>
              </div>
            </Bloco>
            <div className="mb-3 flex gap-2"><Link href="/financeiro/conciliacao/regras" className="btn-sec">Cancelar</Link><button className="btn ml-auto px-5">{editando ? "Salvar" : "Cadastrar"}</button></div>
          </FormAcao>
        ) : (
          <form className="flex flex-wrap gap-2" action="/financeiro/conciliacao/regras">
            <Link href="/financeiro/conciliacao/regras?novo=1" className="btn"><Icone nome="mais" size={15} /> Nova regra</Link>
            <input name="q" defaultValue={sp.q} className="campo w-72 max-w-full" placeholder="Buscar regra por favorecido ou categoria" />
            <button className="btn-sec">Buscar</button>
          </form>
        )}

        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Quando</th><th>Lança em</th><th>Centro de custo</th><th>Origem</th><th className="text-right">Usada</th><th className="w-32 text-right">Ações</th></tr></thead>
            <tbody>
              {lista.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-500">{q ? "Nenhuma regra com essa busca." : "Nenhuma regra ainda. Elas são criadas sozinhas quando você confirma um lançamento avulso na conciliação (o favorecido passa a ir direto para a mesma categoria), ou cadastre uma aqui."}</td></tr>}
              {lista.map((r) => (
                <tr key={r.id} className={r.ativa ? "" : "opacity-50"}>
                  <td><span className="text-[12px] text-slate-500">{r.modo === "CONTEM" ? "descrição contém" : "favorecido é"}</span> <b>{r.texto}</b>{r.descricao && <div className="text-[12px] text-slate-500">lança como “{r.descricao}”</div>}</td>
                  <td>{nomeCat(r.categoria)} <span className={`etiqueta ml-1 ${r.tipo === "PAGAR" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{r.tipo === "PAGAR" ? "despesa" : "receita"}</span></td>
                  <td className="text-slate-600">{r.centroCusto?.nome ?? "—"}</td>
                  <td>{r.origem === "MANUAL" ? <span className="pilula border-sky-300 bg-sky-50 text-sky-700">cadastrada</span> : <span className="pilula border-violet-300 bg-violet-50 text-violet-700">aprendida</span>}{!r.ativa && <span className="ml-1 text-[11px] text-slate-500">(desligada)</span>}</td>
                  <td className="whitespace-nowrap text-right">{r.vezes}×{r.ultimaEm && <div className="text-[11px] text-slate-500">{r.ultimaEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</div>}</td>
                  <td className="text-right"><span className="inline-flex items-center gap-1">
                    <form action={alternarRegraAcao.bind(null, r.id)}><button className="text-[12px] underline">{r.ativa ? "desligar" : "ligar"}</button></form>
                    <Link href={`/financeiro/conciliacao/regras?editar=${r.id}`} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Editar"><Icone nome="editar" size={15} /></Link>
                    <BotaoExcluir acao={excluirRegraAcao.bind(null, r.id)} pergunta={`Excluir a regra "${r.texto}"?`} />
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Pagina>
  );
}
