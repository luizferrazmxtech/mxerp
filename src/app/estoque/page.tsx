import Link from "next/link";
import { Pagina } from "@/components/ui/Pagina";
import { buscarEstoque, type LinhaEstoque } from "@/lib/estoque/consultas";
import { ROTULO_ESTOQUE } from "@/lib/itens/estoqueSituacao";
import { brl, qtd } from "@/lib/ui/format";
import BarraCadastro from "@/components/ui/BarraCadastro";
import { LinkSuspenso, urlCom } from "@/components/ui/BarraLista";
import Paginacao, { lerPagina } from "@/components/ui/Paginacao";
import Resumo from "@/components/ui/Resumo";
import Suspenso from "@/components/ui/Suspenso";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Estoque" };

type Params = { q?: string; f?: string; p?: string; pp?: string };

/** Filtros dos cartões do topo. */
const FILTROS: Record<string, (l: LinhaEstoque) => boolean> = {
  falta: (l) => l.situacao === "FALTA",
  abaixo: (l) => l.situacao === "ABAIXO",
  reservado: (l) => l.reservado > 0,
  pendente: (l) => l.falta > 0,
};

/** Consulta de estoque (Estoque › Consultar) no layout padrão das listas: cartões de resumo, barra de busca e tabela. */
export default async function EstoquePage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const base = "/estoque";
  const todas = await buscarEstoque(sp.q ?? "", 100000);
  const controladas = todas.filter((l) => l.situacao !== "SEM_CONTROLE");
  const filtro = sp.f && FILTROS[sp.f];
  const linhas = filtro ? todas.filter(filtro) : todas;
  const { pagina, porPagina, skip, take } = lerPagina(sp);
  const pagina_ = linhas.slice(skip, skip + take);
  const conta = (f: (l: LinhaEstoque) => boolean) => controladas.filter(f).length;
  const pct = (n: number) => (controladas.length ? (n / controladas.length) * 100 : 0);
  const nFalta = conta(FILTROS.falta), nAbaixo = conta(FILTROS.abaixo), nRes = conta(FILTROS.reservado), nPend = conta(FILTROS.pendente);
  const cartao = (f: string) => ({ href: urlCom(base, sp, { f: sp.f === f ? undefined : f, p: undefined }), ativo: sp.f === f });

  return (
    <Pagina titulo="Estoque" icone="estoque" trilha={[{ rotulo: "Estoque", href: base }, { rotulo: "Consultar" }]}>
      <BarraCadastro base={base} params={sp} avancada={false} placeholder="Código, nome ou código de barras"
        maisAcoes={<>
          <LinkSuspenso href="/estoque/ajustes" icone="ajustes">Ajustes de estoque</LinkSuspenso>
          <LinkSuspenso href="/estoque/transferencias" icone="transferir">Transferências</LinkSuspenso>
          <LinkSuspenso href="/estoque/inventarios" icone="lista">Inventários</LinkSuspenso>
          <LinkSuspenso href="/estoque/movimentacoes" icone="atualizar">Movimentações</LinkSuspenso>
          <LinkSuspenso href="/estoque/custos" icone="valor">Custos e margens</LinkSuspenso>
          <LinkSuspenso href="/estoque/locais" icone="locais">Locais de estoque</LinkSuspenso>
        </>} />

      <Resumo cartoes={[
        { rotulo: "Produtos", valor: String(todas.length), legenda: `${controladas.length} com controle de estoque`, icone: "produtos", cor: "tinta", pct: 100, href: urlCom(base, sp, { f: undefined, p: undefined }), ativo: !sp.f },
        { rotulo: "Em falta", valor: String(nFalta), legenda: "disponível zerado ou negativo", icone: "alerta", cor: "vermelho", pct: pct(nFalta), ...cartao("falta") },
        { rotulo: "Abaixo do mínimo", valor: String(nAbaixo), legenda: "repor em breve", icone: "atrasado", cor: "amarelo", pct: pct(nAbaixo), ...cartao("abaixo") },
        { rotulo: "Com reserva", valor: String(nRes), legenda: "separados para OS e vendas", icone: "hoje", cor: "azul", pct: pct(nRes), ...cartao("reservado") },
        { rotulo: "Pedidos sem estoque", valor: String(nPend), legenda: "reservas aguardando compra", icone: "carrinho", cor: "roxo", pct: pct(nPend), ...cartao("pendente") },
      ]} />

      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th className="w-36">Código</th>
              <th>Produto</th>
              <th>Onde está</th>
              <th className="w-24 text-right">Físico</th>
              <th className="w-24 text-right">Reservado</th>
              <th className="w-28 text-right">Disponível</th>
              <th className="w-36 text-center">Situação</th>
              <th className="w-28 text-right">Preço</th>
              <th className="w-24 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {pagina_.map((l) => {
              const s = ROTULO_ESTOQUE[l.situacao];
              return (
                <tr key={l.id}>
                  <td>{l.codigo}</td>
                  <td>
                    <Link href={`/produtos/${l.id}`} className="hover:underline">{l.nome}</Link>
                    {l.falta > 0 && <span className="etiqueta ml-2 text-red-700">faltam {qtd(l.falta)} p/ pedidos</span>}
                  </td>
                  <td className="text-[12px] text-slate-600">{l.locais ?? "—"}</td>
                  <td className="text-right">{qtd(l.fisico)} <span className="text-[11px] text-slate-500">{l.unidade}</span></td>
                  <td className="text-right text-amber-700">{l.reservado ? qtd(l.reservado) : <span className="text-slate-400">—</span>}</td>
                  <td className={`text-right font-semibold ${l.situacao === "SEM_CONTROLE" ? "text-slate-500" : l.disponivel <= 0 ? "text-red-600" : "text-emerald-700"}`}>{qtd(l.disponivel)}{l.nosCarros > 0 && <span className="block text-[11px] font-normal text-slate-500" title="Livre nos carros das equipes (fora do disponível da loja)">+{qtd(l.nosCarros)} nos carros</span>}</td>
                  <td className="text-center"><span className={`pilula ${s.cor}`}>{s.rotulo}</span></td>
                  <td className="text-right">{brl(l.precoVenda)}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Link href={`/estoque/produto/${l.id}`} className="btn-icone" title="Estoque do produto"><Icone nome="ver" size={13} /></Link>
                      <Suspenso direita classe="btn-icone" botao={<Icone nome="opcoes" size={13} />}>
                        <LinkSuspenso href={`/produtos/${l.id}?aba=movimentacoes`} icone="atualizar">Movimentações (kardex)</LinkSuspenso>
                        <LinkSuspenso href={`/estoque/produto/${l.id}#entrada`} icone="mais">Dar entrada / saída</LinkSuspenso>
                        <LinkSuspenso href={`/estoque/produto/${l.id}#transferir`} icone="transferir">Mudar de prateleira</LinkSuspenso>
                        <LinkSuspenso href={`/produtos/${l.id}`} icone="produtos">Ver cadastro</LinkSuspenso>
                      </Suspenso>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!pagina_.length && <tr><td colSpan={9} className="py-10 text-center text-slate-500">Nenhum produto encontrado.</td></tr>}
          </tbody>
        </table>
        <Paginacao base={base} params={sp} total={linhas.length} pagina={pagina} porPagina={porPagina} />
      </div>
    </Pagina>
  );
}
