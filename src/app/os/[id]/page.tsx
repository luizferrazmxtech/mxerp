import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { estadoEstoque, PRIORIDADES_OS, SITUACOES_OS } from "@/lib/os/os";
import { brl, data, dataSP, horaSP, num2, qtd } from "@/lib/ui/format";
import { garantirPadroes } from "@/lib/financeiro/padroes";
import { Pagina, Pilula } from "@/components/ui/Pagina";
import Suspenso from "@/components/ui/Suspenso";
import { LinkSuspenso } from "@/components/ui/BarraLista";
import Icone from "@/components/Icone";
import NotasDoDocumento from "@/components/NotasDoDocumento";
import MudarSituacao from "./MudarSituacao";
import Faturar from "./Faturar";
import { copiarOs } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visualizar OS" };

const ABAS = [
  { id: "cliente", rotulo: "Cliente", icone: "funcionarios" },
  { id: "produtos", rotulo: "Produtos/Peças", icone: "produtos" },
  { id: "servicos", rotulo: "Serviços", icone: "servicos" },
  { id: "equipamentos", rotulo: "Equipamentos", icone: "ajustes" },
  { id: "pagamento", rotulo: "Pagamento", icone: "dinheiro" },
  { id: "notas", rotulo: "Notas fiscais", icone: "notas" },
  { id: "historico", rotulo: "Histórico", icone: "relogio" },
] as const;

const CONTRIB: Record<string, string> = { CONTRIBUINTE: "Contribuinte ICMS", ISENTO: "Contribuinte ISENTO", NAO_CONTRIBUINTE: "Não contribuinte" };
const docFmt = (d: string | null) =>
  !d ? "" : d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const porExtenso = (d: Date) => {
  const [a, m, dia] = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).split("-").map(Number);
  return `${dia} de ${MESES[m - 1]} de ${a}`;
};
function haQuanto(d: Date) {
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 2) return "agora";
  if (min < 60) return `há ${min} minutos`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} hora${h > 1 ? "s" : ""}`;
  const dias = Math.round(h / 24);
  return dias === 1 ? "há um dia" : `há ${dias} dias`;
}

function LinhaResumo({ icone, rotulo, children }: { icone: string; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-t border-slate-100 py-2.5 text-[13px]">
      <Icone nome={icone} size={14} className="text-slate-500" />
      <span className="text-slate-600">{rotulo}</span>
      <span className="ml-auto text-right font-semibold uppercase">{children}</span>
    </div>
  );
}

export default async function VisualizarOs({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string; acao?: string }>;
}) {
  const { id } = await params;
  const { aba: abaParam, acao } = await searchParams;
  const aba = ABAS.some((a) => a.id === abaParam) ? abaParam! : "cliente";
  const os = await prisma.ordemServico.findUnique({
    where: { id },
    include: {
      cliente: true,
      tecnico: { select: { nome: true } },
      vendedor: { select: { nome: true } },
      equipamentos: { orderBy: { ordem: "asc" } },
      produtos: { include: { produto: true }, orderBy: { createdAt: "asc" } },
      servicos: { include: { servico: true }, orderBy: { createdAt: "asc" } },
      historico: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!os) notFound();

  await prisma.$transaction((tx) => garantirPadroes(tx));
  const [reservas, formas, lancamentos, autores] = await Promise.all([
    prisma.reserva.findMany({ where: { origemTipo: "OS", origemId: id, status: { in: ["ATIVA", "BAIXADA"] } }, include: { local: true } }),
    prisma.formaPagamento.findMany({ where: { ativa: true }, orderBy: { nome: "asc" } }),
    prisma.lancamento.findMany({ where: { origemTipo: "OS", origemId: id }, include: { formaPagamento: true }, orderBy: { vencimento: "asc" } }),
    prisma.usuario.findMany({ where: { id: { in: os.historico.map((h) => h.usuarioId).filter((x): x is string => !!x) } }, select: { id: true, nome: true } }),
  ]);
  const nomeUsuario = new Map(autores.map((a) => [a.id, a.nome]));
  const porItem = new Map<string, typeof reservas>();
  for (const r of reservas) porItem.set(r.origemItemId, [...(porItem.get(r.origemItemId) ?? []), r]);
  const sit = SITUACOES_OS.find((s) => s.valor === os.situacao)!;
  const criacao = [...os.historico].reverse().find((h) => h.usuarioId);
  const emFalta = reservas.filter((r) => r.status === "ATIVA" && !r.localId);
  const ativas = reservas.filter((r) => r.status === "ATIVA" && r.localId);
  const separadas = ativas.filter((r) => r.separado);
  const unidades = os.produtos.reduce((s, p) => s + Number(p.quantidade), 0);
  const fone = (os.cliente.celular || os.cliente.telefone || "").replace(/\D/g, "");
  const textoWhats = encodeURIComponent(`Olá! Sua ordem de serviço nº ${os.numero} na MXTECH está: ${sit.rotulo}. Valor: ${brl(os.total)}.`);
  const podeFaturar = !["FATURADA", "CANCELADA", "DEVOLVIDA_SEM_REPARO"].includes(os.situacao);
  const fechar = `/os/${id}?aba=${aba}`;

  return (
    <Pagina titulo="Visualizar OS" trilha={[{ rotulo: "Ordens de serviços", href: "/os" }, { rotulo: "Visualizar" }]}>
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[20px]">
            <Icone nome="os" size={18} /> OS #{os.numero} <Pilula rotulo={sit.rotulo} cor={sit.cor} />
            {emFalta.length > 0 && <Pilula rotulo="Peça em falta" cor="border-red-300 bg-red-50 text-red-700" />}
          </h2>
          <p className="text-[12px] text-slate-500">
            Criado em {porExtenso(os.idLegado ? os.entrada : os.createdAt)}{criacao?.usuarioId && nomeUsuario.get(criacao.usuarioId) ? ` por ${nomeUsuario.get(criacao.usuarioId)!.toUpperCase()}` : ""}
          </p>
        </div>
        <div className="no-print ml-auto flex gap-2">
          <div className="flex">
            <Link href={`/os/${id}/editar`} className="btn-laranja rounded-r-none"><Icone nome="editar" size={14} /> Editar</Link>
            <Suspenso direita classe="btn-laranja rounded-l-none border-l border-white/30 px-2" botao={<Icone nome="abaixo" size={14} />} titulo="Mais opções">
              <LinkSuspenso href={`/os/${id}/editar`} icone="editar">Editar</LinkSuspenso>
              <LinkSuspenso href={`/os/${id}?aba=${aba}&acao=situacao`} icone="atualizar">Alterar situação</LinkSuspenso>
              {podeFaturar && <LinkSuspenso href={`/os/${id}?aba=pagamento`} icone="dinheiro">Faturar</LinkSuspenso>}
              <LinkSuspenso href={`/os/${id}/separacao`} icone="locais">Lista de separação</LinkSuspenso>
              <form action={copiarOs}>
                <input type="hidden" name="osId" value={id} />
                <button className="flex w-full items-center gap-2 px-3 py-[7px] text-left hover:bg-slate-100"><Icone nome="copiar" size={15} /> Gerar cópia</button>
              </form>
              <LinkSuspenso href={`/os/${id}?aba=notas`} icone="notas">Emitir NFS-e / NF-e</LinkSuspenso>
            </Suspenso>
          </div>
          <div className="flex">
            <Link href={`/os/${id}/imprimir`} className="btn-verde rounded-r-none"><Icone nome="compartilhar" size={14} /> Compartilhar</Link>
            <Suspenso direita classe="btn-verde rounded-l-none border-l border-white/30 px-2" botao={<Icone nome="abaixo" size={14} />} titulo="Compartilhar">
              <LinkSuspenso href={`/os/${id}/imprimir`} icone="imprimir">Imprimir</LinkSuspenso>
              {fone && (
                <a href={`https://wa.me/55${fone.replace(/^55/, "")}?text=${textoWhats}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="compartilhar" size={15} /> Enviar por WhatsApp</a>
              )}
              {os.cliente.email && (
                <a href={`mailto:${os.cliente.email}?subject=${encodeURIComponent(`Ordem de serviço ${os.numero} - MXTECH`)}`}
                  className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="compartilhar" size={15} /> Enviar por e-mail</a>
              )}
            </Suspenso>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <section className="cartao p-4">
            <div className="flex items-start gap-4 pb-3">
              <div><div className="text-[11px] text-slate-500">OS</div><div className="text-[13px] font-semibold">Nº {os.numero}</div></div>
              <div><div className="text-[11px] text-slate-500">Entrada</div><div className="text-[13px]">{dataSP(os.entrada)} {horaSP(os.entrada)}</div></div>
              <div className="ml-auto text-right"><span className="align-top text-[13px]">R$</span><span className="text-[28px] font-semibold leading-none">{num2(os.total)}</span></div>
            </div>
            <div className="space-y-1.5 border-t border-slate-100 py-3 text-[13px]">
              <div className="flex justify-between"><span className="text-slate-600">Produtos/Peças</span><span>{brl(os.totalProdutos)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Serviços</span><span>{brl(os.totalServicos)}</span></div>
              {Number(os.frete) > 0 && <div className="flex justify-between"><span className="text-slate-600">Frete</span><span>{brl(os.frete)}</span></div>}
              {Number(os.outros) > 0 && <div className="flex justify-between"><span className="text-slate-600">Outros</span><span>{brl(os.outros)}</span></div>}
              {Number(os.desconto) > 0 && <div className="flex justify-between"><span className="text-slate-600">Desconto</span><span>− {brl(os.desconto)}</span></div>}
            </div>
            <LinhaResumo icone="etiqueta" rotulo="Situação"><span className="normal-case"><Pilula rotulo={sit.rotulo} cor={sit.cor} /></span></LinhaResumo>
            <LinhaResumo icone="funcionarios" rotulo="Cliente">{os.cliente.nome}</LinhaResumo>
            <LinhaResumo icone="carrinho" rotulo="Vendedor">{os.vendedor?.nome ?? "—"}</LinhaResumo>
            <LinhaResumo icone="servicos" rotulo="Técnico">{os.tecnico?.nome ?? "—"}</LinhaResumo>
            <LinhaResumo icone="balcao" rotulo="Canal de venda">{os.canal}</LinhaResumo>
            {os.prioridade && <LinhaResumo icone="urgente" rotulo="Prioridade">{PRIORIDADES_OS.find((p) => p.valor === os.prioridade)?.rotulo}</LinhaResumo>}
            {os.previsao && <LinhaResumo icone="prazo" rotulo="Previsão de entrega">{dataSP(os.previsao)}</LinhaResumo>}
            {os.saida && <LinhaResumo icone="calendario" rotulo="Saída">{dataSP(os.saida)} {horaSP(os.saida)}</LinhaResumo>}
            <div className="border-t border-slate-100 pt-3 text-[12px] text-slate-500"><Icone nome="relogio" size={12} className="mr-1 inline" />Atualizado <b>{haQuanto(os.updatedAt)}</b></div>
          </section>

          {/* melhoria sobre o Gestão Click: onde estão as peças desta OS */}
          {os.produtos.length > 0 && (
            <section className="cartao p-4 text-[13px]">
              <div className="mb-2 flex items-center gap-1.5 font-semibold"><Icone nome="locais" size={14} /> Peças no estoque</div>
              {estadoEstoque(os.situacao) === "BAIXADO" ? (
                <p className="text-slate-600">Peças já baixadas do estoque.</p>
              ) : estadoEstoque(os.situacao) === "LIVRE" ? (
                <p className="text-slate-600">Reservas liberadas (OS {sit.rotulo.toLowerCase()}).</p>
              ) : (
                <>
                  <p className="text-slate-600">{ativas.length} reserva{ativas.length === 1 ? "" : "s"} em prateleira · {separadas.length} separada{separadas.length === 1 ? "" : "s"}</p>
                  {emFalta.length > 0 && <p className="mt-1 font-semibold text-red-600">{emFalta.length} item(ns) em falta: precisa comprar</p>}
                  <Link href={`/os/${id}/separacao`} className="btn-sec mt-3 w-full"><Icone nome="locais" size={14} /> Lista de separação</Link>
                </>
              )}
            </section>
          )}
        </div>

        <div>
          <nav className="no-print mb-3 flex flex-wrap gap-1">
            {ABAS.slice(0, 5).map((a) => (
              <Link key={a.id} href={`/os/${id}?aba=${a.id}`} className={`aba ${aba === a.id ? "aba-ativa" : ""}`} scroll={false}>
                <Icone nome={a.icone} size={14} /> {a.rotulo}
              </Link>
            ))}
            <Suspenso direita classe={`aba ${ABAS.slice(5).some((a) => a.id === aba) ? "aba-ativa" : ""}`}
              botao={<>{ABAS.slice(5).find((a) => a.id === aba)?.rotulo ?? "Mais"} <Icone nome="abaixo" size={13} /></>}>
              {ABAS.slice(5).map((a) => <LinkSuspenso key={a.id} href={`/os/${id}?aba=${a.id}`} icone={a.icone}>{a.rotulo}</LinkSuspenso>)}
            </Suspenso>
          </nav>

          {aba === "cliente" && (
            <div className="space-y-4">
              <section className="cartao flex flex-wrap gap-6 p-5">
                <div className="w-44 text-center">
                  <div className="flex h-36 items-center justify-center rounded bg-slate-100 text-[22px] text-slate-500">
                    {os.cliente.nome.split(/\s+/).slice(0, 2).map((p) => p[0]).join("")}
                  </div>
                  <div className="mt-2 text-[13px] font-semibold uppercase">{os.cliente.nome}</div>
                  <div className="text-[12px] text-slate-500">{docFmt(os.cliente.documento)}</div>
                </div>
                <dl className="min-w-60 flex-1 space-y-1 text-[13px]">
                  <div><dt className="inline font-semibold">Tipo de cliente: </dt><dd className="inline">{os.cliente.tipoPessoa === "FISICA" ? "Pessoa física" : "Pessoa jurídica"}</dd></div>
                  <div><dt className="inline font-semibold">Situação: </dt><dd className="inline"><span className="rounded border border-green-400 px-1 text-[11px] text-green-700">{os.cliente.ativo ? "Ativo" : "Inativo"}</span></dd></div>
                  {os.cliente.fantasia && <div><dt className="inline font-semibold">Nome fantasia: </dt><dd className="inline uppercase">{os.cliente.fantasia}</dd></div>}
                  <div><dt className="inline font-semibold">{os.cliente.tipoPessoa === "FISICA" ? "Nome" : "Razão social"}: </dt><dd className="inline uppercase">{os.cliente.nome}</dd></div>
                  <div><dt className="inline font-semibold">Tipo de contribuinte: </dt><dd className="inline">{CONTRIB[os.cliente.contribuinteIcms]}</dd></div>
                  {os.cliente.telefone && <div><dt className="inline font-semibold">Telefone: </dt><dd className="inline">{os.cliente.telefone}</dd></div>}
                  {os.cliente.celular && <div><dt className="inline font-semibold">Celular: </dt><dd className="inline">{os.cliente.celular}</dd></div>}
                  {os.cliente.email && <div><dt className="inline font-semibold">E-mail: </dt><dd className="inline">{os.cliente.email}</dd></div>}
                  <div><dt className="inline font-semibold">Vendedor: </dt><dd className="inline uppercase">{os.vendedor?.nome ?? "—"}</dd></div>
                </dl>
                <div className="no-print"><Link href={`/clientes?q=${encodeURIComponent(os.cliente.nome)}`} className="btn"><Icone nome="buscar" size={14} /> Visualizar cliente</Link></div>
              </section>
              <section className="cartao p-5">
                <h3 className="mb-3 flex items-center gap-1.5 text-[17px]"><Icone nome="locais" size={16} /> Endereço</h3>
                {os.cliente.logradouro || os.cliente.cidade ? (
                  <div className="flex gap-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100"><Icone nome="inicio" size={16} /></span>
                    <div className="text-[12px] uppercase text-slate-600">
                      <div className="mb-1 text-[13px] font-semibold normal-case text-slate-800">Endereço principal</div>
                      <div>{[os.cliente.logradouro, os.cliente.numero, os.cliente.complemento].filter(Boolean).join(", ")}</div>
                      <div>{[os.cliente.bairro, [os.cliente.cidade, os.cliente.uf].filter(Boolean).join("/")].filter(Boolean).join(" - ")}</div>
                      {os.cliente.cep && <div>CEP: {os.cliente.cep}</div>}
                    </div>
                  </div>
                ) : <p className="text-[13px] text-slate-500">Cliente sem endereço cadastrado.</p>}
              </section>
            </div>
          )}

          {aba === "produtos" && (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-[17px]"><Icone nome="produtos" size={16} /> Produtos/Peças da OS</h3>
              <div className="space-y-2">
                {os.produtos.map((i) => {
                  const rs = porItem.get(i.id) ?? [];
                  return (
                    <div key={i.id} className="cartao flex gap-4 p-4">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100"><Icone nome="produtos" size={18} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-semibold uppercase">{i.produto.nome}</div>
                        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-slate-600">
                          <span>{i.produto.codigo}</span>
                          <span>Valor: <b>{brl(i.valorUnit)}</b></span>
                          <span>Quantidade: <b>{qtd(i.quantidade)} {i.produto.unidade}</b></span>
                          <span>Custo: {brl(i.custoUnit)} (total {brl(Number(i.custoUnit) * Number(i.quantidade))})</span>
                          <span className="font-semibold text-slate-800">Subtotal: {brl(i.subtotal)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
                          {rs.map((r) => (
                            <span key={r.id} className={`rounded border px-1.5 py-0.5 ${!r.local ? "border-red-300 bg-red-50 font-semibold text-red-700" : r.status === "BAIXADA" ? "border-slate-200 text-slate-500" : "border-marca/40 bg-marca/5 text-marca-escura"}`}>
                              <Icone nome="locais" size={11} className="mr-1 inline" />
                              {r.local ? r.local.codigo : "EM FALTA"} · {qtd(r.quantidade)}
                              {r.status === "BAIXADA" ? " · baixado" : r.separado ? " · separado ✓" : r.local ? " · reservado" : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!os.produtos.length && <div className="cartao p-6 text-center text-[13px] text-slate-500">Nenhum produto nesta OS. <Link href={`/os/${id}/editar`} className="text-marca underline">Adicionar</Link></div>}
              </div>
              {os.produtos.length > 0 && (
                <div className="mt-3 text-right">
                  <div className="text-[11px] text-slate-500">Total dos produtos · {qtd(unidades)} unidades</div>
                  <div className="text-[18px] font-semibold">{brl(os.totalProdutos)}</div>
                </div>
              )}
            </div>
          )}

          {aba === "servicos" && (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-[17px]"><Icone nome="servicos" size={16} /> Serviços da OS</h3>
              <div className="space-y-2">
                {os.servicos.map((s) => (
                  <div key={s.id} className="cartao flex gap-4 p-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100"><Icone nome="servicos" size={18} /></span>
                    <div className="flex-1">
                      <div className="text-[14px] font-semibold uppercase">{s.servico.nome}</div>
                      <div className="mt-1 flex flex-wrap gap-x-5 text-[12px] text-slate-600">
                        <span>Valor: <b>{brl(s.valorUnit)}</b></span><span>Quantidade: <b>{qtd(s.quantidade)}</b></span>
                        <span className="font-semibold text-slate-800">Subtotal: {brl(s.subtotal)}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {!os.servicos.length && <div className="cartao p-6 text-center text-[13px] text-slate-500">Nenhum serviço nesta OS.</div>}
              </div>
              {os.servicos.length > 0 && <div className="mt-3 text-right"><div className="text-[11px] text-slate-500">Total dos serviços</div><div className="text-[18px] font-semibold">{brl(os.totalServicos)}</div></div>}
            </div>
          )}

          {aba === "equipamentos" && (
            <div className="space-y-3">
              {os.equipamentos.map((e) => (
                <section key={e.id} className="cartao p-4">
                  <div className="mb-2 text-[14px] font-semibold uppercase">{e.equipamento}</div>
                  <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
                    {([["Marca", e.marca], ["Modelo", e.modelo], ["Série", e.serie]] as const).map(([r, v]) => (
                      <div key={r}><dt className="text-[11px] text-slate-500">{r}</dt><dd>{v || "—"}</dd></div>
                    ))}
                  </dl>
                  <dl className="mt-3 grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
                    {([["Condições", e.condicoes], ["Defeitos", e.defeitos], ["Acessórios", e.acessorios], ["Solução", e.solucao], ["Laudo técnico", e.laudo], ["Termos de garantia", e.garantia]] as const)
                      .filter(([, v]) => v).map(([r, v]) => (
                        <div key={r}><dt className="text-[11px] text-slate-500">{r}</dt><dd className="whitespace-pre-line">{v}</dd></div>
                      ))}
                  </dl>
                </section>
              ))}
              {!os.equipamentos.length && <div className="cartao p-6 text-center text-[13px] text-slate-500">Nenhum equipamento informado.</div>}
              {(os.observacoes || os.observacaoInterna) && (
                <section className="cartao grid gap-4 p-4 text-[13px] sm:grid-cols-2">
                  {os.observacoes && <div><div className="text-[11px] text-slate-500">Observações</div><div className="whitespace-pre-line">{os.observacoes}</div></div>}
                  {os.observacaoInterna && <div><div className="text-[11px] text-slate-500">Observações internas</div><div className="whitespace-pre-line">{os.observacaoInterna}</div></div>}
                </section>
              )}
            </div>
          )}

          {aba === "pagamento" && (
            <section className="cartao p-4">
              {lancamentos.length > 0 ? (
                <table className="tabela">
                  <thead><tr><th>Parcela</th><th>Forma</th><th>Vencimento</th><th className="text-right">Valor</th><th>Situação</th></tr></thead>
                  <tbody>
                    {lancamentos.map((l) => (
                      <tr key={l.id}>
                        <td>{l.parcela}/{l.totalParcelas}</td><td>{l.formaPagamento?.nome ?? "—"}</td><td>{data(l.vencimento)}</td>
                        <td className="text-right">{brl(l.valor)}</td>
                        <td>{l.pagoEm ? <Pilula rotulo={`Recebido em ${data(l.pagoEm)}`} cor="border-green-400 bg-green-50 text-green-700" /> : <Pilula rotulo="A receber" cor="border-slate-300 text-slate-600" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : podeFaturar ? (
                <div className="max-w-xl">
                  <p className="mb-3 text-[13px] text-slate-600">Informe como o cliente vai pagar. Faturar baixa as peças do estoque e gera o contas a receber.</p>
                  <Faturar osId={id} total={Number(os.total)} formas={formas.map((f) => ({ id: f.id, nome: f.nome, diasPrazo: f.diasPrazo }))} />
                </div>
              ) : <p className="text-[13px] text-slate-500">OS sem faturamento.</p>}
            </section>
          )}

          {aba === "notas" && (
            <NotasDoDocumento origemTipo="OS" origemId={id} podeEmitir={os.situacao === "CONCLUIDA" || os.situacao === "FATURADA"}
              temProdutos={os.produtos.length > 0} temServicos={os.servicos.length > 0} />
          )}

          {aba === "historico" && (
            <section className="cartao p-4">
              <ul className="space-y-2 text-[13px]">
                {os.historico.map((h) => (
                  <li key={h.id} className="flex gap-3">
                    <span className="w-32 shrink-0 text-slate-500">{dataSP(h.createdAt)} {horaSP(h.createdAt)}</span>
                    <span>{h.descricao}{h.usuarioId && nomeUsuario.get(h.usuarioId) && <span className="text-slate-500"> · {nomeUsuario.get(h.usuarioId)}</span>}</span>
                  </li>
                ))}
                {!os.historico.length && <li className="text-slate-500">Sem alterações ainda.</li>}
              </ul>
            </section>
          )}
        </div>
      </div>

      {acao === "situacao" && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24">
          <div className="cartao w-full max-w-md shadow-xl">
            <div className="flex items-center border-b px-4 py-3">
              <h3 className="text-[16px]">Alterar <b>situação</b> da OS #{os.numero}</h3>
              <Link href={fechar} className="ml-auto text-slate-500 hover:text-black" aria-label="Fechar"><Icone nome="fechar" /></Link>
            </div>
            <div className="p-4">
              <MudarSituacao osId={id} atual={os.situacao} opcoes={SITUACOES_OS} />
              <p className="mt-3 text-[12px] text-slate-500">
                Concluída baixa as peças do estoque. Cancelada e Devolvida sem reparo liberam as reservas. As demais mantêm as peças reservadas.
                Para faturar, use a aba Pagamento.
              </p>
            </div>
          </div>
        </div>
      )}
    </Pagina>
  );
}
