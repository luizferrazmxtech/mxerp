import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { whereLocaisDaLoja } from "@/lib/estoque/locais";
import { disponivelPorLocal, resumoProduto } from "@/lib/estoque/estoque";
import { documentoDe, documentosDosMovimentos } from "@/lib/estoque/origens";
import { brl, dataHora, qtd } from "@/lib/ui/format";
import { Bloco, Campo, Pagina } from "@/components/ui/Pagina";
import Resumo from "@/components/ui/Resumo";
import Icone from "@/components/Icone";
import TabelaReservas from "@/components/estoque/TabelaReservas";
import { reservasDoProduto } from "@/lib/estoque/reservas";
import { darEntrada, darSaida, definirLocalPadrao, fazerTransferencia, salvarFiscalProduto } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Estoque do produto" };

const TIPO_ORIGEM: Record<string, string> = { OS: "OS", VENDA: "Venda", COMPRA: "Compra", AJUSTE: "Ajuste", TRANSFERENCIA: "Transferência", DEVOLUCAO: "Devolução", IMPLANTACAO: "Implantação" };

/** Estoque de um produto: saldos por local, reservas, entrada/saída/transferência, dados fiscais e últimas movimentações. */
export default async function ProdutoEstoque({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const produto = await prisma.produto.findUnique({ where: { id }, include: { localPadrao: true } });
  if (!produto) notFound();

  const [resumo, porLocal, locais, reservas, movimentos] = await Promise.all([
    prisma.$transaction((tx) => resumoProduto(tx, id)),
    prisma.$transaction((tx) => disponivelPorLocal(tx, id, { incluirCarros: true })),
    prisma.local.findMany({ where: { ativo: true, ...(await whereLocaisDaLoja()) }, orderBy: { codigo: "asc" } }),
    reservasDoProduto(id),
    prisma.movimentoEstoque.findMany({ where: { produtoId: id }, include: { local: true, usuario: { select: { nome: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const nomeLocal = new Map(locais.map((l) => [l.id, l.codigo]));
  const docs = await documentosDosMovimentos(movimentos);
  const total = resumo.fisico || 1;
  const comSaldo = porLocal.filter((l) => l.fisico !== 0 || l.reservado !== 0);

  return (
    <Pagina voltar="/estoque" titulo="Estoque do produto" icone="estoque" trilha={[{ rotulo: "Estoque", href: "/estoque" }, { rotulo: "Produto" }]}>
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-[18px]"><Icone nome="produtos" size={18} /> {produto.nome}
            {!produto.ativo && <span className="pilula text-slate-500">Inativo</span>}
            {!produto.controlaEstoque && <span className="pilula text-slate-500">Sem controle de estoque</span>}
          </h2>
          <p className="text-[12px] text-slate-500">Código {produto.codigo}{produto.gtin ? ` · GTIN ${produto.gtin}` : ""} · {brl(produto.precoVenda)} · local padrão: {produto.localPadrao?.codigo ?? "não definido"}</p>
        </div>
        <div className="no-print ml-auto flex gap-2">
          <Link href={`/produtos/${id}?aba=movimentacoes`} className="btn-sec"><Icone nome="atualizar" size={14} /> Kardex completo</Link>
          <Link href={`/produtos/${id}`} className="btn-laranja"><Icone nome="produtos" size={14} /> Ver cadastro</Link>
        </div>
      </div>

      <Resumo cartoes={[
        { rotulo: "Físico", valor: `${qtd(resumo.fisico)} ${produto.unidade}`, legenda: `em ${comSaldo.length} local(is)`, icone: "estoque", cor: "tinta", pct: 100 },
        { rotulo: "Reservado", valor: qtd(resumo.reservado), legenda: "separado para OS e vendas", icone: "hoje", cor: "amarelo", pct: (resumo.reservado / total) * 100 },
        { rotulo: "Disponível", valor: qtd(resumo.disponivel), legenda: resumo.nosCarros ? `livre na loja (+${qtd(resumo.nosCarros)} nos carros)` : "livre para vender", icone: "confirmado", cor: resumo.disponivel > 0 ? "verde" : "vermelho", pct: resumo.fisico > 0 ? (Math.max(0, resumo.disponivel) / total) * 100 : 0 },
        { rotulo: "Em falta", valor: qtd(resumo.falta), legenda: "pedidos aguardando estoque", icone: "alerta", cor: resumo.falta ? "vermelho" : "cinza" },
      ]} />

      <div className="grid gap-3 lg:grid-cols-2">
        <Bloco icone="locais" titulo={<>Onde <b>está</b></>} corpo="p-0">
          <table className="tabela">
            <thead><tr><th>Local</th><th className="text-right">Físico</th><th className="text-right">Reservado</th><th className="text-right">Livre</th></tr></thead>
            <tbody>
              {comSaldo.map((l) => (
                <tr key={l.localId}>
                  <td>{nomeLocal.get(l.localId)}{l.localId === produto.localPadraoId && <span className="etiqueta ml-2 text-slate-500">padrão</span>}</td>
                  <td className="text-right">{qtd(l.fisico)}</td>
                  <td className="text-right text-amber-700">{l.reservado ? qtd(l.reservado) : "—"}</td>
                  <td className={`text-right font-semibold ${l.disponivel > 0 ? "text-emerald-700" : "text-red-600"}`}>{qtd(l.disponivel)}</td>
                </tr>
              ))}
              {!comSaldo.length && <tr><td colSpan={4} className="py-6 text-center text-slate-500">Sem saldo em nenhum local.</td></tr>}
            </tbody>
          </table>
        </Bloco>

        <Bloco icone="hoje" titulo={<>Reservado <b>para</b></>} corpo="overflow-x-auto p-0">
          <TabelaReservas docs={reservas} unidade={produto.unidade} />
        </Bloco>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Bloco icone="mais" titulo={<>Dar <b>entrada</b></>}>
          <form id="entrada" action={darEntrada} className="space-y-2.5">
            <input type="hidden" name="produtoId" value={id} />
            <Campo rotulo="Local" obrigatorio><SelectLocal name="localId" locais={locais} padrao={produto.localPadraoId} /></Campo>
            <div className="grid grid-cols-2 gap-2">
              <Campo rotulo="Quantidade" obrigatorio><input name="quantidade" inputMode="decimal" className="campo" required /></Campo>
              <Campo rotulo="Custo unitário"><input name="custoUnit" inputMode="decimal" className="campo" placeholder="opcional" /></Campo>
            </div>
            <Campo rotulo="Observação"><input name="observacao" className="campo" /></Campo>
            <button className="btn-verde w-full">Dar entrada</button>
          </form>
        </Bloco>
        <Bloco icone="transferir" titulo={<>Mudar de <b>prateleira</b></>}>
          <form id="transferir" action={fazerTransferencia} className="space-y-2.5">
            <input type="hidden" name="produtoId" value={id} />
            <Campo rotulo="De" obrigatorio><SelectLocal name="deLocalId" locais={locais} /></Campo>
            <Campo rotulo="Para" obrigatorio><SelectLocal name="paraLocalId" locais={locais} /></Campo>
            <Campo rotulo="Quantidade" obrigatorio><input name="quantidade" inputMode="decimal" className="campo" required /></Campo>
            <button className="btn w-full">Transferir</button>
          </form>
        </Bloco>
        <div>
          <Bloco icone="fechar" titulo={<>Dar <b>saída</b> <span className="text-[13px]">(perda / uso interno)</span></>}>
            <form action={darSaida} className="space-y-2.5">
              <input type="hidden" name="produtoId" value={id} />
              <Campo rotulo="Local" obrigatorio><SelectLocal name="localId" locais={locais} padrao={produto.localPadraoId} /></Campo>
              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="Quantidade" obrigatorio><input name="quantidade" inputMode="decimal" className="campo" required /></Campo>
                <Campo rotulo="Motivo"><input name="observacao" className="campo" /></Campo>
              </div>
              <button className="btn-sec w-full">Dar saída</button>
            </form>
          </Bloco>
          <Bloco icone="locais" titulo={<>Local <b>padrão</b></>}>
            <form action={definirLocalPadrao} className="flex gap-2">
              <input type="hidden" name="produtoId" value={id} />
              <SelectLocal name="localId" locais={locais} padrao={produto.localPadraoId} vazio />
              <button className="btn-sec">Salvar</button>
            </form>
          </Bloco>
        </div>
      </div>

      <Bloco icone="fiscal" titulo={<>Dados <b>fiscais</b></>}>
        <form action={salvarFiscalProduto} className="grid gap-2 sm:grid-cols-4 lg:grid-cols-8">
          <input type="hidden" name="produtoId" value={id} />
          {[["ncm", "NCM", produto.ncm], ["cest", "CEST", produto.cest], ["gtin", "Código de barras (GTIN)", produto.gtin],
            ["cfopInterno", "CFOP dentro de SP", produto.cfopInterno ?? "5102"], ["cfopExterno", "CFOP fora de SP", produto.cfopExterno ?? "6102"],
            ["csosn", "CSOSN", produto.csosn ?? "102"], ["origem", "Origem", String(produto.origem)]].map(([n, r, v]) => (
            <Campo key={n} rotulo={r!}><input name={n!} defaultValue={v ?? ""} className="campo" /></Campo>
          ))}
          <div className="flex items-end"><button className="btn w-full">Salvar</button></div>
        </form>
      </Bloco>

      <Bloco icone="atualizar" titulo={<>Últimas <b>movimentações</b></>} corpo="p-0"
        acoes={<Link href={`/produtos/${id}?aba=movimentacoes`} className="btn-sec py-1 text-[13px]">Ver kardex completo</Link>}>
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Data</th><th>Tipo</th><th>Origem / destino</th><th>Local</th><th className="text-right">Qtd</th><th>Usuário</th><th>Observação</th></tr></thead>
            <tbody>
              {movimentos.map((m) => {
                const d = documentoDe(docs, m);
                const sai = m.tipo !== "ENTRADA";
                return (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap">{dataHora(m.createdAt)}</td>
                    <td><span className={`pilula ${sai ? "text-red-700" : "text-emerald-700"}`}>{sai ? "Saída" : "Entrada"}</span></td>
                    <td>
                      {d ? <Link href={d.href} className="font-medium text-marca hover:underline">{d.rotulo}</Link> : TIPO_ORIGEM[m.origemTipo] ?? m.origemTipo}
                      {d?.pessoa && <div className="max-w-[16rem] truncate text-[12px] text-slate-500">{d.pessoa}</div>}
                    </td>
                    <td>{m.local.codigo}</td>
                    <td className={`text-right ${sai ? "text-red-600" : "text-emerald-700"}`}>{sai ? "−" : "+"}{qtd(m.quantidade)}</td>
                    <td>{m.usuario?.nome ?? ""}</td>
                    <td className="text-[12px] text-slate-500">{m.observacao}</td>
                  </tr>
                );
              })}
              {!movimentos.length && <tr><td colSpan={7} className="py-6 text-center text-slate-500">Nenhuma movimentação.</td></tr>}
            </tbody>
          </table>
        </div>
      </Bloco>
    </Pagina>
  );
}

function SelectLocal({ name, locais, padrao, vazio }: {
  name: string; locais: { id: string; codigo: string }[]; padrao?: string | null; vazio?: boolean;
}) {
  return (
    <select name={name} defaultValue={padrao ?? ""} className="campo" required={!vazio} aria-label="Local">
      <option value="">{vazio ? "Nenhum" : "Escolha"}</option>
      {locais.map((l) => <option key={l.id} value={l.id}>{l.codigo}</option>)}
    </select>
  );
}
