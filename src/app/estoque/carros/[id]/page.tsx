import Link from "next/link";
import { notFound } from "next/navigation";
import { carroDaLoja, GRUPOS_ORIGEM, movimentosDoCarro, origemDoSaldo } from "@/lib/estoque/historicoCarro";
import { saldoDoCarro } from "@/lib/estoque/carro";
import { parseDia } from "@/lib/datas";
import { brl, dataHora, qtd } from "@/lib/ui/format";
import { Bloco, Pagina } from "@/components/ui/Pagina";
import Resumo from "@/components/ui/Resumo";
import Icone from "@/components/Icone";
import BotaoImprimir from "@/app/os/[id]/separacao/BotaoImprimir";

export const dynamic = "force-dynamic";
export const metadata = { title: "Estoque do carro" };

type Sp = { produto?: string; de?: string; ate?: string };

const TIPO: Record<string, string> = { OS: "OS", VENDA: "Venda", COMPRA: "Compra", AJUSTE: "Ajuste", TRANSFERENCIA: "Transferência", DEVOLUCAO: "Devolução", IMPLANTACAO: "Implantação" };
const sinal = (v: number) => (v > 0 ? `+${qtd(v)}` : v < 0 ? `−${qtd(-v)}` : "—");
const corSinal = (v: number) => (v > 0 ? "text-emerald-700" : v < 0 ? "text-red-600" : "text-slate-400");
const dia = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

/**
 * Estoque do carro de uma equipe, para o escritório: o que está no carro, de onde veio cada saldo (compra, transferência,
 * OS, ajuste) e as movimentações com o link do documento que gerou cada uma.
 */
export default async function CarroHistorico({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Sp> }) {
  const { id } = await params;
  const sp = await searchParams;
  const carro = await carroDaLoja(id);
  if (!carro) notFound();
  const de = dia(sp.de), ate = dia(sp.ate);
  const [linhas, origens, movs] = await Promise.all([
    saldoDoCarro(carro.equipeId!),
    origemDoSaldo(carro.id),
    movimentosDoCarro(carro.id, {
      produtoId: sp.produto || undefined,
      de: de ? new Date(parseDia(de).getTime() + 3 * 3600e3) : undefined,
      ate: ate ? new Date(parseDia(ate).getTime() + 27 * 3600e3) : undefined,
    }),
  ]);
  const base = `/estoque/carros/${carro.id}`;
  const custo = linhas.reduce((s, l) => s + Math.max(0, l.fisico) * l.custo, 0);
  const negativos = linhas.filter((l) => l.fisico < 0);
  const porCompra = linhas.filter((l) => (origens.get(l.produtoId)?.grupos.COMPRA ?? 0) > 0);
  const produtoFiltro = sp.produto ? (linhas.find((l) => l.produtoId === sp.produto) ?? movs.linhas.find((m) => m.produtoId === sp.produto)) : undefined;
  const nomeFiltro = produtoFiltro ? ("nome" in produtoFiltro ? produtoFiltro.nome : produtoFiltro.produto) : undefined;
  const filtro = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...extra }).filter(([, v]) => v) as [string, string][]);
    return `${base}${p.size ? `?${p}` : ""}#movimentos`;
  };

  return (
    <Pagina voltar="/estoque/locais" titulo={`Estoque do carro · ${carro.nome}`} icone="frete"
      trilha={[{ rotulo: "Estoque", href: "/estoque" }, { rotulo: "Locais", href: "/estoque/locais" }, { rotulo: carro.nome }]}>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <Link href={`/estoque/transferencias/adicionar?destino=${carro.id}`} className="btn"><Icone nome="mais" size={14} /> Abastecer</Link>
        <Link href={`/estoque/transferencias/adicionar?origem=${carro.id}`} className="btn-sec">Devolver à loja</Link>
        <Link href={`/estoque/transferencias/relatorio?carro=${carro.id}&periodo=todos`} className="btn-sec"><Icone nome="transferir" size={14} /> Transferências deste carro</Link>
        <Link href={`/tecnico/estoque?equipe=${carro.equipeId}`} className="btn-sec"><Icone nome="ver" size={14} /> Visão do técnico</Link>
        <div className="ml-auto"><BotaoImprimir /></div>
      </div>

      <Resumo cartoes={[
        { rotulo: "Produtos no carro", valor: String(linhas.length), legenda: `equipe ${carro.equipe?.nome ?? ""}`, icone: "produtos", cor: "tinta" },
        { rotulo: "Custo no carro", valor: brl(custo), legenda: "pelo custo atual de cada produto", icone: "dinheiro", cor: "verde" },
        { rotulo: "Entraram por compra", valor: String(porCompra.length), legenda: porCompra.length ? "compra lançada direto no carro: confira" : "nenhum", icone: "alerta", cor: porCompra.length ? "amarelo" : "cinza" },
        { rotulo: "Saldo negativo", valor: String(negativos.length), legenda: negativos.length ? "a OS baixou mais do que tinha" : "nenhum", icone: "alerta", cor: negativos.length ? "vermelho" : "cinza" },
      ]} />

      {(porCompra.length > 0 || negativos.length > 0) && (
        <div className="no-print mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900">
          <b>Como acertar:</b>
          <ul className="ml-4 mt-1 list-disc space-y-0.5">
            {porCompra.length > 0 && <li><b>Entrou por compra e devia ir para a loja:</b> abra a compra (link no histórico abaixo), clique em Editar e troque o <b>Estoque de entrada</b> para a loja. O sistema tira do carro e põe na loja, sem mexer no financeiro.</li>}
            {porCompra.length > 0 && <li><b>A peça foi mesmo para o carro:</b> não precisa fazer nada; ela só aparece aqui como compra em vez de transferência.</li>}
            {negativos.length > 0 && <li><b>Saldo negativo:</b> a OS usou uma peça que não tinha sido transferida para o carro. Faça um <b>Abastecer</b> com a quantidade que falta (a loja perde, o carro volta a zero). Se a peça não saiu da loja de verdade, faça um ajuste de entrada no carro.</li>}
          </ul>
        </div>
      )}

      <Bloco icone="frete" titulo={<>O que está no carro e <b>de onde veio</b></>} subtitulo="Cada coluna soma as entradas menos as saídas daquele tipo de documento. Clique em Histórico para ver documento por documento." corpo="overflow-x-auto p-0">
        <table className="tabela">
          <thead><tr>
            <th className="w-28">Código</th><th>Produto</th><th className="text-right">No carro</th><th className="text-right">Separado</th><th className="text-right">Livre</th>
            {GRUPOS_ORIGEM.map((g) => <th key={g.chave} className="text-right">{g.rotulo}</th>)}
            <th className="no-print w-24 text-right">Ações</th>
          </tr></thead>
          <tbody>
            {linhas.map((l) => {
              const o = origens.get(l.produtoId)?.grupos ?? {};
              return (
                <tr key={l.produtoId} className={sp.produto === l.produtoId ? "bg-amber-50" : undefined}>
                  <td>{l.codigo}</td>
                  <td><Link href={`/estoque/produto/${l.produtoId}`} className="hover:underline">{l.nome}</Link></td>
                  <td className={`text-right font-semibold ${l.fisico < 0 ? "text-red-600" : ""}`}>{qtd(l.fisico)} {l.unidade}</td>
                  <td className="text-right text-amber-700">{l.reservado ? qtd(l.reservado) : "—"}</td>
                  <td className={`text-right font-semibold ${l.livre > 0 ? "text-emerald-700" : "text-red-600"}`}>{qtd(l.livre)}</td>
                  {GRUPOS_ORIGEM.map((g) => <td key={g.chave} className={`text-right ${corSinal(o[g.chave] ?? 0)}`}>{sinal(o[g.chave] ?? 0)}</td>)}
                  <td className="no-print text-right"><Link href={filtro({ produto: l.produtoId })} className="btn-sec py-1 text-[12px]">Histórico</Link></td>
                </tr>
              );
            })}
            {!linhas.length && <tr><td colSpan={6 + GRUPOS_ORIGEM.length} className="py-8 text-center text-slate-500">Nada no carro agora.</td></tr>}
          </tbody>
        </table>
      </Bloco>

      <div id="movimentos" />
      <Bloco icone="atualizar" titulo={<>Movimentações do <b>carro</b>{nomeFiltro && <span className="ml-2 text-[13px] font-normal text-slate-600">· {nomeFiltro}</span>}</>}
        subtitulo="Tudo o que entrou e saiu do carro, com o documento que gerou cada movimento." corpo="p-0">
        <form action={base} className="no-print flex flex-wrap items-end gap-2 border-b p-3">
          {sp.produto && <input type="hidden" name="produto" value={sp.produto} />}
          <label><span className="rotulo">De</span><input type="date" name="de" defaultValue={de} className="campo" /></label>
          <label><span className="rotulo">Até</span><input type="date" name="ate" defaultValue={ate} className="campo" /></label>
          <button className="btn"><Icone nome="buscar" size={14} /> Filtrar</button>
          {(sp.produto || de || ate) && <Link href={`${base}#movimentos`} className="btn-sec">Limpar filtros</Link>}
          <span className="ml-auto text-[13px] text-slate-500">{movs.total > movs.linhas.length ? `mostrando os ${movs.linhas.length} mais recentes de ${movs.total}` : `${movs.total} movimento(s)`}</span>
        </form>
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead><tr>
              <th className="w-36">Data</th><th className="w-20">Tipo</th><th>Documento</th>{!sp.produto && <th>Produto</th>}
              <th className="text-right">Quantidade</th>{movs.linhas[0]?.saldoDepois !== undefined && <th className="text-right">Saldo no carro</th>}
              <th>Usuário</th><th>Observação</th>
            </tr></thead>
            <tbody>
              {movs.linhas.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">{dataHora(m.data)}</td>
                  <td><span className={`pilula ${m.entrada ? "text-emerald-700" : "text-red-700"}`}>{m.entrada ? "Entrada" : "Saída"}</span></td>
                  <td>
                    {m.doc ? <Link href={m.doc.href} className="font-medium text-marca hover:underline">{m.doc.rotulo}</Link> : <span>{TIPO[m.origemTipo] ?? m.origemTipo}</span>}
                    {m.doc?.pessoa && <div className="max-w-[16rem] truncate text-[12px] text-slate-500">{m.doc.pessoa}</div>}
                  </td>
                  {!sp.produto && <td><Link href={filtro({ produto: m.produtoId })} className="hover:underline">{m.codigo} · {m.produto}</Link></td>}
                  <td className={`whitespace-nowrap text-right ${m.entrada ? "text-emerald-700" : "text-red-600"}`}>{m.entrada ? "+" : "−"}{qtd(m.quantidade)} {m.unidade}</td>
                  {m.saldoDepois !== undefined && <td className={`text-right font-semibold ${m.saldoDepois < 0 ? "text-red-600" : ""}`}>{qtd(m.saldoDepois)}</td>}
                  <td>{m.usuario}</td>
                  <td className="text-[12px] text-slate-500">{m.observacao}</td>
                </tr>
              ))}
              {!movs.linhas.length && <tr><td colSpan={8} className="py-8 text-center text-slate-500">Nenhuma movimentação no carro{de || ate ? " no período" : ""}.</td></tr>}
            </tbody>
          </table>
        </div>
      </Bloco>
    </Pagina>
  );
}
