import Link from "next/link";
import { usuarioAtual } from "@/lib/auth/atual";
import { podeAcessar } from "@/lib/auth/permissoes";
import { pode } from "@/lib/auth/permissoesAcao";
import { dadosPainel } from "@/lib/inicio/painel";
import { avisosPendentes } from "@/lib/financeiro/avisosBoleto";
import { melhorPior, percentual, saudacao } from "@/lib/inicio/escala";
import { cor } from "@/lib/orcamentos/tipos";
import { brl, data, qtd } from "@/lib/ui/format";
import { diaSP, somarDias } from "@/lib/datas";
import { lojaAtual, nomeLoja } from "@/lib/empresa/atual";
import { Pagina } from "@/components/ui/Pagina";
import Icone from "@/components/Icone";
import { Anel, GraficoColunas } from "@/components/inicio/Graficos";
import { BotaoOlho, ValorOculto } from "@/components/inicio/ValorOculto";

export const dynamic = "force-dynamic";
export const metadata = { title: "Início" };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const C = { verde: "#1fa855", vermelho: "#dc2626", azul: "#2f6fd6", marca: "#018e83", laranja: "#e8730c", cinza: "#475569" };
/** Atalhos de quem não vê os números do Início (atendente, técnico, caixa): o que se faz no dia a dia. */
const ATALHOS = [
  { rotulo: "Nova OS", href: "/os/adicionar", icone: "os" },
  { rotulo: "Novo orçamento", href: "/orcamentos/adicionar", icone: "gerenciar" },
  { rotulo: "Nova venda", href: "/vendas/adicionar", icone: "vendas" },
  { rotulo: "PDV", href: "/pdv", icone: "pdv" },
  { rotulo: "Painel de OS", href: "/os/painel", icone: "painel" },
  { rotulo: "Clientes", href: "/clientes", icone: "clientes" },
];
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

/** Cartão de número (KPI) no padrão do Gestão Click: ícone colorido, título, valor grande e legenda. */
function Kpi({ icone, cor: c, titulo, valor, legenda, href, anel, extra }: {
  icone: string; cor: string; titulo: string; valor: React.ReactNode; legenda: React.ReactNode; href?: string; anel?: number; extra?: React.ReactNode;
}) {
  const corpo = (
    <div className={`cartao flex h-full flex-col p-3.5 ${href ? "hover:border-slate-300" : ""}`}>
      <div className="flex min-h-9 items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded" style={{ background: `${c}1a`, color: c }}><Icone nome={icone} size={15} /></span>
        <span className="text-[13px] font-semibold text-slate-700">{titulo}</span>
        <span className="ml-auto">{anel !== undefined ? <Anel pct={anel} cor={c} /> : extra}</span>
      </div>
      <div className="mt-2 text-[22px] font-semibold text-slate-800">{valor}</div>
      <div className="text-[11px] text-slate-500">{legenda}</div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{corpo}</Link> : corpo;
}

/** Bloco com cabeçalho "Acompanhe o **fluxo de caixa**" + subtítulo, como na tela inicial do Gestão Click. */
function Quadro({ icone, titulo, subtitulo, acoes, children, className = "" }: {
  icone: string; titulo: React.ReactNode; subtitulo: string; acoes?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`cartao flex flex-col ${className}`}>
      <div className="flex items-start gap-2 border-b border-slate-200 bg-[#f7f7f7] px-4 py-3">
        <div className="flex-1">
          <h2 className="flex items-center gap-1.5 text-[17px] font-light text-slate-800 [&_b]:font-semibold"><Icone nome={icone} size={15} /> {titulo}</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">{subtitulo}</p>
        </div>
        {acoes}
      </div>
      <div className="flex-1 p-4">{children}</div>
    </section>
  );
}

function Resumo({ itens }: { itens: [string, React.ReactNode][] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-x-8 gap-y-2">
      {itens.map(([r, v]) => <div key={r}><div className="text-[12px] text-slate-500">{r}</div><div className="text-[14px] font-semibold text-slate-800">{v}</div></div>)}
    </div>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-[13px] text-slate-500">{children}</p>;
}

export default async function Inicio({ searchParams }: { searchParams: Promise<{ negado?: string }> }) {
  const sp = await searchParams;
  const u = await usuarioAtual();
  const papel = u?.papel ?? "OPERADOR";
  // números (saldo, financeiro, vendas, valores e gráficos) só para quem tem "inicio.indicadores" (padrão: administrador)
  const numeros = await pode(papel, "inicio.indicadores");
  const verFin = numeros && podeAcessar(papel, "/financeiro");
  const verVendas = numeros && podeAcessar(papel, "/vendas");
  const d = await dadosPainel({ financeiro: verFin, vendas: verVendas });
  const rotulos = d.meses.map((m) => m.rotulo);
  const mesAtual = MESES[Number(d.meses[d.meses.length - 1].chave.slice(5)) - 1];
  const primeiroNome = (u?.nome ?? "").split(" ")[0].toUpperCase();
  const fin = d.financeiro;
  const [avisosBoleto, empresa] = await Promise.all([fin ? avisosPendentes() : 0, lojaAtual()]);
  const hojeExtenso = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const dia = (n: number) => somarDias(diaSP(), n).toISOString().slice(0, 10);
  const [hoje, amanha, em7] = [dia(0), dia(1), dia(7)];
  const ven = d.vendas;

  return (
    <Pagina titulo="Início" icone="inicio" trilha={[]}>
      <div className="cartao relative mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 overflow-hidden px-5 py-4">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rotate-12 rounded-[36px] border-[18px] border-marca/10" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/logo-claro.svg" alt="MXTECH" className="h-16 w-auto" />
        <div className="hidden h-12 w-px bg-slate-200 sm:block" />
        <div className="relative">
          <div className="text-[22px] font-light text-slate-800">{saudacao()}{primeiroNome ? <>, <b className="font-semibold">{primeiroNome}</b></> : ""}</div>
          <div className="text-[13px] text-slate-500 first-letter:uppercase">{hojeExtenso}{empresa ? ` · ${nomeLoja(empresa)}` : ""}</div>
        </div>
      </div>
      {sp.negado && (
        <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">Você não tem permissão para abrir aquela tela. Fale com o administrador.</div>
      )}

      {avisosBoleto > 0 && (
        <Link href="/financeiro/avisos-boletos" className="mb-3 block rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800 hover:bg-amber-100">
          <b>{avisosBoleto} boleto(s) pago(s) no Inter sem conta no sistema.</b> Clique para lançar ou baixar a conta certa.
        </Link>
      )}

      {fin && (
        <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi icone="dinheiro" cor={C.cinza} titulo="Saldo disponível hoje" href="/financeiro/contas"
            valor={<span className="flex items-center gap-2"><ValorOculto valor={brl(fin.saldoTotal)} /></span>}
            legenda={plural(fin.contas.length, "conta bancária", "contas bancárias")}
            extra={<BotaoOlho className="btn-icone" />} />
          <Kpi icone="receber" cor={C.verde} titulo="A receber hoje" valor={brl(fin.receber.hoje)} href="/financeiro?tipo=RECEBER&periodo=hoje"
            legenda={fin.receber.nHoje ? `${plural(fin.receber.nHoje, "título vence", "títulos vencem")} hoje` : "nada vence hoje"} />
          <Kpi icone="pagar" cor={C.vermelho} titulo="A pagar hoje" valor={brl(fin.pagar.hoje)} href="/financeiro?tipo=PAGAR&periodo=hoje"
            legenda={fin.pagar.nHoje ? `${plural(fin.pagar.nHoje, "título vence", "títulos vencem")} hoje` : "nada vence hoje"} />
          <Kpi icone="mais" cor={C.verde} titulo={`Recebido em ${mesAtual}`} valor={brl(fin.receber.mes.feito)} anel={percentual(fin.receber.mes.feito, fin.receber.mes.previsto)}
            legenda={`de ${brl(fin.receber.mes.previsto)} previstos`} />
          <Kpi icone="pagar" cor={C.vermelho} titulo={`Pago em ${mesAtual}`} valor={brl(fin.pagar.mes.feito)} anel={percentual(fin.pagar.mes.feito, fin.pagar.mes.previsto)}
            legenda={`de ${brl(fin.pagar.mes.previsto)} previstos`} />
        </div>
      )}

      {/* o que precisa de atenção (melhoria sobre o Gestão Click) */}
      {!numeros && (
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {ATALHOS.filter((a) => podeAcessar(papel, a.href.split("?")[0])).map((a) => (
            <Link key={a.href} href={a.href} className="cartao flex items-center gap-2 p-3 text-[13px] font-semibold text-slate-700 hover:border-slate-300">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-marca/10 text-marca"><Icone nome={a.icone} size={15} /></span>
              {a.rotulo}
            </Link>
          ))}
        </div>
      )}

      <div className={`mb-4 grid gap-3 sm:grid-cols-2 ${fin ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <Kpi icone="os" cor={C.marca} titulo="OS em aberto" valor={d.os.abertas.toLocaleString("pt-BR")} href="/os?s=abertas"
          legenda={numeros ? `${brl(d.os.valorAbertas)} a faturar` : "ainda não concluídas"} />
        <Kpi icone="relogio" cor={d.os.atrasadas ? C.laranja : C.cinza} titulo="OS atrasadas" valor={d.os.atrasadas.toLocaleString("pt-BR")} href="/os/painel"
          legenda="a saída prevista já passou" />
        <Kpi icone="alerta" cor={d.os.comFalta ? C.vermelho : C.cinza} titulo="OS com peça em falta" valor={d.os.comFalta.toLocaleString("pt-BR")} href="/os?periodo=todos&falta=1"
          legenda={`${plural(d.estoque.falta.length, "produto para comprar", "produtos para comprar")}`} />
        <Kpi icone="gerenciar" cor={C.azul} titulo="Orçamentos em aberto" valor={d.orcamentos.n30.toLocaleString("pt-BR")} href="/orcamentos"
          legenda={numeros ? `${brl(d.orcamentos.total30)} nos últimos 30 dias` : "dos últimos 30 dias"} />
        {fin && (
          <Kpi icone="prazo" cor={fin.receber.vencido ? C.vermelho : C.cinza} titulo="Contas vencidas" href="/financeiro?tipo=RECEBER&periodo=todos&f=vencidos"
            valor={brl(fin.receber.vencido)} legenda={`a receber · a pagar vencido: ${brl(fin.pagar.vencido)}`} />
        )}
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {fin && (() => {
          const mp = melhorPior(fin.fluxo, (m) => m.saldo);
          return (
            <Quadro icone="conciliacao" titulo={<>Acompanhe o <b>fluxo de caixa</b></>} subtitulo="Recebimentos e pagamentos de cada mês (pela data da baixa), com o saldo do período.">
              <Resumo itens={[
                ["Saldo do período", brl(fin.fluxo.reduce((s, m) => s + m.saldo, 0))],
                ["Melhor mês", mp ? `${mp.melhor.rotulo} · ${brl(mp.melhor.saldo)}` : "—"],
                ["Pior mês", mp ? `${mp.pior.rotulo} · ${brl(mp.pior.saldo)}` : "—"],
              ]} />
              {fin.fluxo.every((m) => !m.recebimentos && !m.pagamentos) ? (
                <Vazio>Nenhum recebimento ou pagamento baixado nos últimos 6 meses. O gráfico enche conforme as contas forem baixadas no MXERP (pela tela do financeiro ou pela conciliação do extrato).</Vazio>
              ) : <GraficoColunas titulo="Fluxo de caixa dos últimos 6 meses" rotulos={rotulos} formatar={brl} series={[
                { nome: "Recebimentos", cor: C.verde, valores: fin.fluxo.map((m) => m.recebimentos) },
                { nome: "Pagamentos", cor: C.vermelho, valores: fin.fluxo.map((m) => -m.pagamentos) },
                { nome: "Saldo", cor: C.cinza, valores: fin.fluxo.map((m) => m.saldo), tipo: "linha" },
              ]} />}
            </Quadro>
          );
        })()}
        {ven && (() => {
          const tot = ven.map((m) => m.vendas + m.os);
          const soma = tot.reduce((s, v) => s + v, 0);
          const fechados = tot.slice(0, -1);
          const media = fechados.length ? fechados.reduce((s, v) => s + v, 0) / fechados.length : 0;
          return (
            <Quadro icone="vendas" titulo={<>Veja suas <b>vendas</b></>} subtitulo="Vendas concretizadas (pedidos e balcão) e OS concluídas por mês, nos últimos seis meses.">
              <Resumo itens={[
                ["Vendas no período", brl(soma)],
                ["Média mensal", brl(media)],
                [`${d.meses[d.meses.length - 1].rotulo} até hoje`, brl(tot[tot.length - 1])],
              ]} />
              <GraficoColunas titulo="Vendas e OS dos últimos 6 meses" rotulos={rotulos} formatar={brl} empilhar series={[
                { nome: "Vendas", cor: C.azul, valores: ven.map((m) => m.vendas) },
                { nome: "Ordens de serviço", cor: C.marca, valores: ven.map((m) => m.os) },
                { nome: "Média dos meses fechados", cor: C.cinza, valores: ven.map(() => media), tipo: "linha", tracejada: true },
              ]} />
            </Quadro>
          );
        })()}

        {numeros && <Quadro icone="os" titulo={<>Movimento das <b>ordens de serviço</b></>} subtitulo="Quantas OS entraram e quantas foram concluídas em cada mês."
          acoes={<Link href="/os/painel" className="btn-sec !py-1 text-[12px]"><Icone nome="painel" size={13} /> Painel de OS</Link>}>
          <Resumo itens={[
            ["Entradas no período", d.os.porMes.reduce((s, m) => s + m.entradas, 0).toLocaleString("pt-BR")],
            ["Concluídas no período", d.os.porMes.reduce((s, m) => s + m.concluidas, 0).toLocaleString("pt-BR")],
            [`${d.meses[d.meses.length - 1].rotulo} até hoje`, `${d.os.porMes[d.os.porMes.length - 1].entradas} entradas`],
          ]} />
          <GraficoColunas titulo="OS que entraram e foram concluídas por mês" rotulos={rotulos} formatar={(v) => plural(v, "OS", "OS")} series={[
            { nome: "Entradas", cor: C.azul, valores: d.os.porMes.map((m) => m.entradas) },
            { nome: "Concluídas", cor: C.marca, valores: d.os.porMes.map((m) => m.concluidas) },
          ]} />
        </Quadro>}

        <Quadro icone="gerenciar" titulo={<>OS por <b>situação</b></>} subtitulo="Ordens de serviço que ainda não foram faturadas nem canceladas. Clique para ver a lista.">
          {d.os.situacoes.length ? (() => {
            const max = Math.max(...d.os.situacoes.map((s) => s.n), 1);
            return (
              <div className="space-y-2.5">
                {d.os.situacoes.map((s) => {
                  const c = cor(s.cor);
                  return (
                    <Link key={s.id ?? s.nome} href={s.id ? `/os?periodo=todos&s=${s.id}` : "/os?s=abertas"} className="grid grid-cols-[150px_1fr] items-center gap-3 rounded px-1 py-0.5 text-[12px] hover:bg-slate-50">
                      <span className={`pilula ${c.pilula} justify-self-start`}>{s.nome}</span>
                      <span className="flex items-center gap-2">
                        <span className={`h-4 rounded-sm ${c.ponto}`} style={{ width: `${Math.max((s.n / max) * 70, 1.5)}%` }} />
                        <span className="whitespace-nowrap text-slate-700"><b>{s.n}</b>{numeros && <> · {brl(s.total)}</>}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            );
          })() : <Vazio>Nenhuma OS em andamento.</Vazio>}
        </Quadro>

        <Quadro icone="estoque" titulo={<>Peças para <b>comprar</b></>} subtitulo="Pedidas em OS ou vendas sem estoque, e produtos abaixo do estoque mínimo."
          acoes={<Link href="/estoque" className="btn-sec !py-1 text-[12px]"><Icone nome="estoque" size={13} /> Estoque</Link>}>
          {d.estoque.falta.length || d.estoque.baixo.length ? (
            <table className="tabela -mx-4 -mt-4 w-[calc(100%+2rem)]">
              <thead><tr><th>Produto</th><th className="text-right">Falta</th><th>Motivo</th></tr></thead>
              <tbody>
                {d.estoque.falta.slice(0, 8).map((p) => (
                  <tr key={`f${p.id}`}>
                    <td><Link href={`/estoque/produto/${p.id}`} className="text-marca hover:underline">{p.codigo} · {p.nome}</Link></td>
                    <td className="whitespace-nowrap text-right">{qtd(p.falta)} {p.unidade}</td>
                    <td><span className="pilula border-red-300 bg-red-50 text-red-700">{plural(p.docs, "documento esperando", "documentos esperando")}</span></td>
                  </tr>
                ))}
                {d.estoque.baixo.slice(0, Math.max(3, 8 - d.estoque.falta.length)).map((p) => (
                  <tr key={`b${p.id}`}>
                    <td><Link href={`/estoque/produto/${p.id}`} className="text-marca hover:underline">{p.codigo} · {p.nome}</Link></td>
                    <td className="whitespace-nowrap text-right">{qtd(p.minimo - p.saldo)} {p.unidade}</td>
                    <td><span className="pilula border-amber-300 bg-amber-50 text-amber-800">abaixo do mínimo ({qtd(p.saldo)}/{qtd(p.minimo)})</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Vazio>Nenhuma peça em falta e nenhum produto abaixo do mínimo.</Vazio>}
          {(d.estoque.falta.length > 8 || d.estoque.baixo.length > 0) && (
            <p className="mt-3 text-[12px] text-slate-500">
              {d.estoque.falta.length > 8 && <>Mais {d.estoque.falta.length - 8} produtos em falta. </>}
              {d.estoque.baixo.length > 0 && <>{plural(d.estoque.baixo.length, "produto abaixo", "produtos abaixo")} do estoque mínimo.</>}
            </p>
          )}
          {!d.estoque.baixo.length && <p className="mt-3 text-[11px] text-slate-400">Dica: preencha o estoque mínimo no cadastro do produto para ele aparecer aqui quando estiver acabando.</p>}
        </Quadro>

        <Quadro icone="gerenciar" titulo={<>Orçamentos em <b>aberto</b></>} subtitulo="Os mais recentes que ainda não viraram venda nem OS."
          acoes={<Link href="/orcamentos" className="btn-sec !py-1 text-[12px]"><Icone nome="lista" size={13} /> Ver todos</Link>}>
          {d.orcamentos.ultimos.length ? (
            <>
              <table className="tabela -mx-4 -mt-4 w-[calc(100%+2rem)]">
                <thead><tr><th>Nº</th><th>Cliente</th><th>Data</th>{numeros && <th className="text-right">Valor</th>}</tr></thead>
                <tbody>
                  {d.orcamentos.ultimos.map((o) => (
                    <tr key={o.id}>
                      <td><Link href={`/orcamentos/${o.id}`} className="text-marca hover:underline">{o.numero}</Link></td>
                      <td className="max-w-56 truncate">{o.cliente.fantasia || o.cliente.nome}</td>
                      <td>{data(o.data)}</td>
                      {numeros && <td className="whitespace-nowrap text-right">{brl(o.total)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-[12px] text-slate-500">{plural(d.orcamentos.n, "orçamento em aberto", "orçamentos em aberto")} no total{numeros ? `, somando ${brl(d.orcamentos.total)}` : ""}.</p>
            </>
          ) : <Vazio>Nenhum orçamento em aberto.</Vazio>}
        </Quadro>

        {fin && (
          <Quadro icone="financeiro" titulo={<>Saldo das <b>contas bancárias</b></>} subtitulo="Saldo atual de cada conta e o total disponível." acoes={<BotaoOlho className="btn-icone" />}>
            <ul className="-mx-4 -mt-4 divide-y divide-slate-100">
              {fin.contas.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-slate-100 text-slate-600"><Icone nome="financeiro" size={15} /></span>
                  <span className="flex-1 text-[13px] font-semibold uppercase text-slate-700">{c.nome}</span>
                  <ValorOculto valor={brl(c.saldo)} className={`text-[13px] ${c.saldo < 0 ? "text-red-600" : "text-slate-700"}`} />
                </li>
              ))}
              {!fin.contas.length && <li className="px-4 py-6 text-center text-[13px] text-slate-500">Nenhuma conta bancária cadastrada.</li>}
            </ul>
          </Quadro>
        )}

        {fin && (
          <Quadro icone="prazo" titulo={<>Próximos <b>vencimentos</b></>} subtitulo="Contas em aberto: vencidas, de hoje e dos próximos 7 dias.">
            <table className="tabela -mx-4 -mt-4 w-[calc(100%+2rem)]">
              <thead><tr><th></th><th className="text-right">A receber</th><th className="text-right">A pagar</th></tr></thead>
              <tbody>
                {([["Vencidas", "vencido", "periodo=todos&f=vencidos"], ["Hoje", "hoje", `f=abertos&de=${hoje}&ate=${hoje}`], ["Próximos 7 dias", "semana", `f=abertos&de=${amanha}&ate=${em7}`]] as const).map(([r, k, f]) => (
                  <tr key={r}>
                    <td>{r}</td>
                    <td className="text-right"><Link href={`/financeiro?tipo=RECEBER&${f}`} className="hover:underline">{brl(fin.receber[k])}</Link></td>
                    <td className="text-right"><Link href={`/financeiro?tipo=PAGAR&${f}`} className={`hover:underline ${k === "vencido" && fin.pagar[k] ? "text-red-600" : ""}`}>{brl(fin.pagar[k])}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[12px] text-slate-500">{plural(fin.receber.nVencido, "título a receber vencido", "títulos a receber vencidos")} e {plural(fin.pagar.nVencido, "a pagar", "a pagar")}.</p>
          </Quadro>
        )}
      </div>
    </Pagina>
  );
}
