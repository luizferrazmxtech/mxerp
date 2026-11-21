import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { diaSP } from "@/lib/datas";
import { empresaDoDocumento } from "@/lib/empresa/atual";
import { cor, aplicarTags } from "@/lib/orcamentos/tipos";
import { excluirAnotacaoAcao } from "@/lib/orcamentos/acoes";
import { alterarSituacaoOsAcao, anotarOsAcao, clonarOsAcao, emitirNotaOsAcao, excluirOsEVoltarAcao } from "@/lib/os/acoes";
import { avisoSituacaoOs, rotuloPrioridade } from "@/lib/os/tipos";
import { excluirAnexoAcao } from "@/lib/cadastros/acoes";
import { brl, dataSP, horaSP, num2, qtd } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import Suspenso from "@/components/ui/Suspenso";
import { LinkSuspenso } from "@/components/ui/BarraLista";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import BotaoAcao from "@/components/ui/BotaoAcao";
import Icone from "@/components/Icone";
import VoltarConta from "@/components/financeiro/VoltarConta";
import NotasDoDocumento from "@/components/NotasDoDocumento";
import { FormAnexo } from "@/components/cadastros/FormsVer";
import FormSituacao from "@/components/orcamentos/FormSituacao";
import FormItensCarro from "@/components/os/FormItensCarro";
import DicaSaldo from "@/components/estoque/DicaSaldo";
import { carrosDasEquipes, livreNosCarros } from "@/lib/estoque/carro";
import { duracao, resumoTrabalho } from "@/lib/os/trabalho";
import { fotosDoHistorico } from "@/lib/os/historicoFotos";
import CopiarLink from "@/components/orcamentos/CopiarLink";
import FormAnotacaoOrc from "@/components/orcamentos/FormAnotacaoOrc";
import BoletoParcela from "@/components/BoletoParcela";
import { baseLinks, boletosDisponiveis } from "@/lib/financeiro/boletos";
import { foneBonito, whatsappAtivo } from "@/lib/whatsapp/mxchat";
import { mensagemOs } from "@/lib/whatsapp/os";
import EnviarWhatsappOs from "@/components/whatsapp/EnviarWhatsappOs";
import ListaMensagens from "@/components/whatsapp/ListaMensagens";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visualizar OS" };

const dia = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const quando = (d: Date | null) => (d ? `${dataSP(d)} ${horaSP(d)}` : "—");
const docFmt = (c: string) => (c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"));

function Vazio({ icone, titulo, texto }: { icone: string; titulo: string; texto?: string }) {
  return <div className="cartao flex flex-col items-center px-4 py-10 text-center text-slate-500"><Icone nome={icone} size={28} /><b className="mt-2 text-slate-700">{titulo}</b>{texto && <span className="text-[13px]">{texto}</span>}</div>;
}

export default async function VerOs({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; situacao?: string; carro?: string; q?: string; conta?: string; whatsapp?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const o = await prisma.ordemServico.findUnique({
    where: { id },
    include: {
      cliente: { include: { enderecos: { orderBy: { ordem: "asc" } } } }, vendedor: { select: { nome: true, comissao: true } }, tecnico: { select: { nome: true } },
      situacaoCfg: true, transportadora: { select: { nome: true } }, formaPagamento: true, equipe: { select: { nome: true, membros: true } },
      parcelas: { orderBy: { numero: "asc" }, include: { formaPagamento: { select: { nome: true } } } },
      equipamentos: { orderBy: { ordem: "asc" } },
      produtos: { orderBy: [{ ordem: "asc" }, { createdAt: "asc" }], include: { produto: { select: { id: true, codigo: true, nome: true, unidade: true } }, localOrigem: { select: { deposito: { select: { nome: true } } } } } },
      servicos: { orderBy: [{ ordem: "asc" }, { createdAt: "asc" }], include: { servico: { select: { id: true, codigo: true, nome: true } } } },
      historico: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!o) notFound();
  const [situacoes, criador, empresa, anexos, anotacoes, campos, modelo, lancamentos, reservas, orcamento, tecnicos, carros, trabalho] = await Promise.all([
    prisma.situacaoOsConfig.findMany({ orderBy: { ordem: "asc" } }),
    o.criadoPorId ? prisma.usuario.findUnique({ where: { id: o.criadoPorId }, select: { nome: true } }) : null,
    empresaDoDocumento(o.empresaId),
    prisma.anexo.findMany({ where: { entidade: { in: ["OS", "OS_FOTO"] }, entidadeId: id }, select: { id: true, nome: true, tamanho: true, createdAt: true, entidade: true, referencia: true }, orderBy: { createdAt: "asc" } }),
    prisma.anotacao.findMany({ where: { entidade: "OS", entidadeId: id }, orderBy: { createdAt: "desc" } }),
    prisma.campoExtra.findMany({ where: { entidade: "OS" }, orderBy: [{ ordem: "asc" }, { nome: "asc" }] }),
    prisma.modeloMensagem.findFirst({ where: { tipo: "OS" }, orderBy: { padrao: "desc" } }),
    prisma.lancamento.findMany({ where: { origemTipo: "OS", origemId: id }, include: { formaPagamento: true, categoria: true, boletos: { orderBy: { createdAt: "desc" } } }, orderBy: [{ vencimento: "asc" }, { parcela: "asc" }] }),
    prisma.reserva.findMany({ where: { origemTipo: "OS", origemId: id, status: { in: ["ATIVA", "BAIXADA"] } }, include: { local: { select: { codigo: true } } } }),
    prisma.orcamento.findFirst({ where: { osId: id }, select: { id: true, numero: true } }),
    prisma.usuario.findMany({ where: { id: { in: o.tecnicoIds } }, select: { id: true, nome: true } }),
    carrosDasEquipes(),
    resumoTrabalho(id),
  ]);
  const livreCarro = sp.carro ? await livreNosCarros(o.produtos.map((p) => p.produtoId), carros.map((c) => c.localId)) : new Map<string, number>();
  const h = await headers();
  const [interAtivo, baseCliente, zapAtivo, mensagensZap] = await Promise.all([
    boletosDisponiveis(), baseLinks(), whatsappAtivo(),
    prisma.mensagemWhatsapp.findMany({ where: { entidade: "OS", entidadeId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const zapOs = sp.whatsapp && zapAtivo ? await mensagemOs(id) : null;
  const errosBoleto = lancamentos.filter((l) => !l.pagoEm && l.boletos[0]?.situacao === "ERRO").length;
  const link = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}/cobranca/os/${o.token}`;
  const nomeEmpresa = empresa?.nomeFantasia || empresa?.razaoSocial || "MXTECH";
  const tags = { nome_cliente: o.cliente.nome, numero: String(o.numero), valor_total: brl(o.total), data: dataSP(o.entrada), validade: "", vendedor: o.vendedor?.nome ?? "", link, nome_empresa: nomeEmpresa };
  const assunto = aplicarTags(modelo?.assunto ?? "Ordem de serviço [numero]", tags);
  const corpo = aplicarTags(modelo?.email ?? "Segue a ordem de serviço: [link]", tags);
  const zap = aplicarTags(modelo?.sms ?? "Olá [nome_cliente], segue a OS [numero]: [link]", tags);
  const fone = (o.cliente.celular ?? o.cliente.telefone ?? "").replace(/\D/g, "");
  const idsUsuarios = [...anotacoes.map((a) => a.usuarioId), ...o.historico.map((x) => x.usuarioId)].filter((x): x is string => !!x);
  const usuarios = new Map((await prisma.usuario.findMany({ where: { id: { in: idsUsuarios } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome]));
  const ce = (o.camposExtras ?? {}) as Record<string, string>;
  const c = cor(o.situacaoCfg?.cor ?? "cinza");
  const base = `/os/${id}`;
  const fotosInstalacao = anexos.filter((a) => a.entidade === "OS_FOTO");
  const fotoDaLinha = fotosDoHistorico(o.historico, fotosInstalacao);
  const fotosDoItem = (itemId: string) => fotosInstalacao.filter((a) => a.referencia === itemId).map((a) => a.id);
  const nomesTecnicos = (tecnicos.length ? o.tecnicoIds.map((t) => tecnicos.find((x) => x.id === t)?.nome) : [o.tecnico?.nome]).filter(Boolean).join(", ")
    // OS sem técnico marcado: mostra quem trabalhou nela (tempo de mão de obra)
    || [...new Set(trabalho.trechos.map((t) => t.iniciadoPor))].join(", ");
  const ABAS = [
    { chave: "cliente", rotulo: "Cliente", icone: "pessoa", tem: true }, { chave: "produtos", rotulo: "Produtos/Peças", icone: "produtos", tem: o.produtos.length > 0 },
    { chave: "servicos", rotulo: "Serviços", icone: "servicos", tem: o.servicos.length > 0 }, { chave: "equipamentos", rotulo: "Equipamentos", icone: "os", tem: o.equipamentos.length > 0 },
    { chave: "pagamento", rotulo: "Pagamento", icone: "dinheiro", tem: true },
    { chave: "entrega", rotulo: "Entrega", icone: "frete", tem: o.mostrarEntrega || Number(o.frete) > 0 },
    { chave: "comissao", rotulo: "Comissão", icone: "percentual", tem: true }, { chave: "notas", rotulo: "Notas fiscais", icone: "notas", tem: true },
    { chave: "campos", rotulo: "Campos extras", icone: "ajustes", tem: campos.length > 0 }, { chave: "envios", rotulo: "Envios", icone: "envios", tem: true },
    { chave: "historico", rotulo: "Histórico", icone: "relogio", tem: true }, { chave: "anexos", rotulo: "Anexos", icone: "anexos", tem: true },
    { chave: "anotacoes", rotulo: "Anotações", icone: "anotacoes", tem: true },
  ].filter((a) => a.tem);
  const aba = ABAS.some((a) => a.chave === sp.aba) ? sp.aba! : ABAS[0].chave;
  const comissaoPct = Number(o.vendedor?.comissao ?? 0);
  const endEntrega = o.mostrarEntrega ? o.cliente.enderecos.find((e) => e.id === o.enderecoEntregaId) ?? o.cliente.enderecos[0] : null;
  const ondeItem = (itemId: string) => reservas.filter((r) => r.origemItemId === itemId).map((r) => `${r.local?.codigo ?? "EM FALTA"} (${qtd(r.quantidade)})${r.status === "BAIXADA" ? " · saiu" : ""}`).join(", ");
  const concluida = o.situacao === "CONCLUIDA" || o.situacao === "FATURADA";
  const podeEditar = o.situacaoCfg?.permiteEdicao ?? true;
  const emFalta = reservas.some((r) => r.status === "ATIVA" && !r.localId);
  const equipamentos = sp.q ? o.equipamentos.filter((e) => [e.equipamento, e.marca, e.modelo, e.serie, e.defeitos, e.laudo].join(" ").toLowerCase().includes(sp.q!.toLowerCase())) : o.equipamentos;

  return (
    <Pagina voltar="/os" titulo="Visualizar OS" trilha={[{ rotulo: "Ordens de serviços", href: "/os" }, { rotulo: "Visualizar" }]}>
      <VoltarConta contaId={sp.conta} />
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[18px]"><Icone nome="os" size={18} /> OS #{o.numero}
            <span className={`pilula ${c.pilula}`}>{o.situacaoCfg?.nome ?? o.situacao}</span>
            {emFalta && <span className="pilula border-red-300 bg-red-50 text-red-700">Peça em falta</span>}</h2>
          <p className="text-[12px] text-slate-500">Criado em {o.createdAt.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" })}{criador ? ` por ${criador.nome.toUpperCase()}` : ""}</p>
        </div>
        <div className="no-print ml-auto flex gap-2">
          <Suspenso direita classe="btn-laranja" botao={<><Icone nome="editar" size={15} /> Editar <Icone nome="abaixo" size={13} /></>}>
            {podeEditar && <LinkSuspenso href={`${base}/editar`} icone="editar">Editar OS</LinkSuspenso>}
            <LinkSuspenso href={`${base}?situacao=1`} icone="atualizar">Alterar situação</LinkSuspenso>
            <BotaoAcao acao={clonarOsAcao.bind(null, id)} icone="copiar">Gerar cópia</BotaoAcao>
            {concluida && o.servicos.length > 0 && <BotaoAcao acao={emitirNotaOsAcao.bind(null, id, "NFSE")} icone="notas" confirmar={`Emitir a NFS-e da OS nº ${o.numero}?`}>Emitir NFS-e</BotaoAcao>}
            {concluida && o.produtos.length > 0 && <BotaoAcao acao={emitirNotaOsAcao.bind(null, id, "NFE")} icone="notas" confirmar={`Emitir a NF-e das peças da OS nº ${o.numero}?`}>Emitir NF-e</BotaoAcao>}
            <LinkSuspenso href={`${base}/separacao`} icone="locais">Lista de separação</LinkSuspenso>
            {o.produtos.length > 0 && <LinkSuspenso href={`${base}?carro=1`} icone="frete">Itens no carro</LinkSuspenso>}
            <LinkSuspenso href={`/financeiro?tipo=RECEBER&periodo=todos&q=${encodeURIComponent(`OS de nº ${o.numero}`)}`} icone="financeiro">Ver no financeiro</LinkSuspenso>
            <BotaoExcluir acao={excluirOsEVoltarAcao.bind(null, id)} pergunta={`Excluir a OS nº ${o.numero}? As peças voltam ao estoque e as contas a receber em aberto são apagadas.`} rotulo="Excluir OS" />
          </Suspenso>
          <Suspenso direita classe="btn bg-emerald-600 hover:bg-emerald-700" botao={<><Icone nome="compartilhar" size={15} /> Compartilhar <Icone nome="abaixo" size={13} /></>}>
            <a href={`mailto:${o.cliente.email ?? ""}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`} className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="email" size={15} /> Por e-mail</a>
            <a href={`https://wa.me/${fone.length >= 10 ? "55" + fone.replace(/^55/, "") : ""}?text=${encodeURIComponent(zap)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="whatsapp" size={15} /> Por WhatsApp</a>
            {zapAtivo && <LinkSuspenso href={`${base}?whatsapp=1`} icone="whatsapp">WhatsApp (MXChat)</LinkSuspenso>}
            <CopiarLink url={link} menu />
            <div className="mt-1 border-t px-3 pt-1.5 pb-0.5 text-[11px] font-semibold uppercase text-slate-400">Imprimir</div>
            <a href={`${base}/imprimir`} target="_blank" className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="imprimir" size={15} /> OS</a>
            <a href={`${base}/imprimir?modo=completa`} target="_blank" className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="imprimir" size={15} /> OS completa</a>
            <a href={`${base}/imprimir?modo=historico`} target="_blank" className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="imprimir" size={15} /> OS completa com histórico</a>
          </Suspenso>
        </div>
      </div>

      {errosBoleto > 0 && (
        <Link href={`${base}?aba=pagamento`} className="mb-3 flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          <Icone nome="alerta" size={15} /> {errosBoleto === 1 ? "Um boleto não foi registrado" : `${errosBoleto} boletos não foram registrados`} no Banco Inter. Veja o motivo na aba Pagamento.
        </Link>
      )}

      {zapOs && <EnviarWhatsappOs id={id} numeroOs={o.numero} fone={zapOs.numero ? foneBonito(zapOs.numero) : ""} texto={zapOs.texto} temSenha={zapOs.temSenha} voltar={base} />}
      {sp.situacao && <FormSituacao id={id} numero={o.numero} atual={o.situacaoId ?? ""} situacoes={situacoes.map((s) => ({ id: s.id, nome: s.nome, aviso: avisoSituacaoOs(s) }))} voltar={base} acao={alterarSituacaoOsAcao} rotulo="da OS"
        depois={o.produtos.length && carros.length ? { href: `${base}?carro=1`, texto: "Indo para execução? Marque os itens que estão no carro da equipe" } : undefined} />}
      {sp.carro && <FormItensCarro osId={id} numero={o.numero} voltar={base}
        bloqueio={o.situacaoCfg?.estoque === "LANCAR" ? "A OS já baixou o estoque: reabra para trocar de onde saem as peças." : undefined}
        carros={carros.map((c) => ({ localId: c.localId, nome: c.nome, daOs: c.equipeId === o.equipeId }))}
        itens={o.produtos.map((p) => ({ id: p.id, nome: p.produto.nome, codigo: p.produto.codigo, quantidade: `${qtd(p.quantidade)} ${p.produto.unidade}`, localOrigemId: p.localOrigemId,
          livrePorCarro: Object.fromEntries(carros.map((c) => [c.localId, livreCarro.get(`${p.produtoId}|${c.localId}`) ?? 0])) }))} />}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-3">
          <div className="cartao p-4 text-[13px]">
            <div className="flex justify-between text-slate-500"><span>OS Nº {o.numero}</span><span>{quando(o.entrada)}</span></div>
            <div className="my-2 text-[26px] font-semibold text-marca">{brl(o.total)}</div>
            <div className="mb-2 flex justify-between text-[12px] text-slate-600"><span>Produtos/Peças <b>{brl(o.totalProdutos)}</b></span><span>Serviços <b>{brl(o.totalServicos)}</b></span></div>
            <dl className="space-y-1 border-t pt-2">
              <div><b>Situação:</b> {o.situacaoCfg?.nome ?? o.situacao}</div>
              <div><b>Cliente:</b> <Link href={`/clientes/${o.clienteId}`} className="text-marca hover:underline">{o.cliente.nome}</Link></div>
              <div><b>Vendedor:</b> {o.vendedor?.nome ?? "—"}</div>
              <div><b>Técnico:</b> {nomesTecnicos || "—"}</div>
              {o.equipe && <div><b>Equipe:</b> {o.equipe.nome}</div>}
              <div><b>Saída:</b> {quando(o.saida)}</div>
              {o.prioridade && <div><b>Prioridade:</b> {rotuloPrioridade(o.prioridade)}</div>}
              <div><b>Canal de venda:</b> {o.canal}</div>
              <div><b>Loja:</b> {nomeEmpresa}</div>
              {orcamento && <div><b>Orçamento:</b> <Link href={`/orcamentos/${orcamento.id}`} className="text-marca hover:underline">nº {orcamento.numero}</Link></div>}
            </dl>
            <div className="mt-2 border-t pt-2 text-[11px] text-slate-500">Atualizado em {dataSP(o.updatedAt)} {horaSP(o.updatedAt)}</div>
          </div>
          {trabalho.estado !== "NAO_INICIADO" && (
            <div className="cartao p-4 text-[13px]">
              <div className="mb-1 flex items-center font-semibold">Mão de obra
                <span className={`ml-auto text-[12px] ${{ TRABALHANDO: "text-emerald-700", PAUSADO: "text-amber-700", FINALIZADO: "text-sky-700", NAO_INICIADO: "" }[trabalho.estado]}`}>
                  {{ TRABALHANDO: "Trabalhando agora", PAUSADO: "Pausado", FINALIZADO: "Finalizado", NAO_INICIADO: "" }[trabalho.estado]}
                </span>
              </div>
              <div className="text-[22px] font-semibold tabular-nums">{duracao(trabalho.fechadoMs + (trabalho.abertoDesde ? Date.now() - new Date(trabalho.abertoDesde).getTime() : 0))}</div>
              <ul className="mt-2 space-y-1 border-t pt-2 text-[12px] text-slate-600">
                {trabalho.trechos.map((t, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{dataSP(new Date(t.inicio))} {horaSP(new Date(t.inicio))}–{t.fim ? horaSP(new Date(t.fim)) : "agora"} <span className="text-slate-400">{t.iniciadoPor}{t.motivo ? ` · ${t.motivo}` : ""}</span></span>
                    <b className="whitespace-nowrap">{duracao((t.fim ? new Date(t.fim).getTime() : Date.now()) - new Date(t.inicio).getTime())}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {o.situacaoCfg?.exibirCobranca !== false && (
            <div className="cartao p-4 text-[13px]">
              <div className="mb-2 font-semibold">Link de cobrança</div>
              <CopiarLink url={link} />
              <a href={`/cobranca/os/${o.token}`} target="_blank" className="mt-2 inline-block text-[12px] text-marca hover:underline">Abrir como o cliente vê</a>
            </div>
          )}
        </aside>

        <section>
          <nav className="mb-3 flex flex-wrap gap-1">
            {ABAS.map((a) => <Link key={a.chave} href={a.chave === ABAS[0].chave ? (sp.conta ? `${base}?conta=${sp.conta}` : base) : `${base}?aba=${a.chave}${sp.conta ? `&conta=${sp.conta}` : ""}`} className={`aba ${aba === a.chave ? "aba-ativa" : ""}`}><Icone nome={a.icone} size={14} /> {a.rotulo}</Link>)}
          </nav>

          {aba === "cliente" && (
            <div className="cartao p-4 text-[13px]">
              <div className="mb-2 flex items-center"><b className="text-[15px]">{o.cliente.nome}</b><Link href={`/clientes/${o.clienteId}`} className="btn-sec ml-auto py-1">Visualizar cliente</Link></div>
              <dl className="grid gap-1 sm:grid-cols-2">
                {o.cliente.fantasia && <div><b>Nome fantasia:</b> {o.cliente.fantasia}</div>}
                {o.cliente.documento && <div><b>CPF/CNPJ:</b> {docFmt(o.cliente.documento)}</div>}
                <div><b>Telefone:</b> {o.cliente.telefone || o.cliente.celular || "—"}</div>
                <div><b>E-mail:</b> {o.cliente.email || "—"}</div>
              </dl>
              {o.cliente.enderecos.map((e) => <p key={e.id} className="mt-2 border-t pt-2"><b>{e.tipo ?? "Endereço"}:</b> {e.logradouro}, {e.numero} · {e.bairro} · {e.cidade}/{e.uf} · CEP {e.cep}</p>)}
            </div>
          )}

          {aba === "produtos" && (
            <div className="space-y-2">
              {o.produtos.map((l) => (
                <div key={l.id} className="cartao p-3 text-[13px]">
                  <div className="flex flex-wrap items-center gap-2"><Link href={`/produtos/${l.produto.id}`} className="font-semibold hover:underline">{l.produto.nome}</Link><span className="pilula border-slate-300 bg-slate-50 text-slate-600">Varejo</span><span className="font-mono text-[11px] text-slate-500">{l.produto.codigo}</span>
                    {l.localOrigem && <span className="pilula border-teal-300 bg-teal-50 text-marca-escura">{l.localOrigem.deposito.nome}</span>}</div>
                  {l.detalhes && <div className="text-[12px] text-slate-500">{l.detalhes}</div>}
                  <Instalado i={l} fotos={fotosDoItem(l.id)} />
                  <div className="mt-1 grid gap-2 text-[12px] sm:grid-cols-5">
                    <div><span className="text-slate-500">Valor</span><br />{brl(l.valorUnit)}</div>
                    <DicaSaldo produtoId={l.produto.id}><span className="text-slate-500">Quantidade</span><br />{qtd(l.quantidade)} {l.produto.unidade}</DicaSaldo>
                    <div><span className="text-slate-500">Custo (total)</span><br />{brl(Number(l.custoUnit) * Number(l.quantidade))}</div>
                    <div><span className="text-slate-500">Estoque</span><br />{ondeItem(l.id) || "—"}</div>
                    <div className="text-right"><span className="text-slate-500">Subtotal</span><br /><b>{brl(l.subtotal)}</b></div>
                  </div>
                </div>
              ))}
              <div className="px-1 text-right text-[13px]">Total de produtos/peças <b>{brl(o.totalProdutos)}</b></div>
            </div>
          )}

          {aba === "servicos" && (
            <div className="cartao overflow-x-auto">
              <table className="tabela">
                <thead><tr><th>Serviço</th><th className="text-right">Quant.</th><th className="text-right">Valor</th><th className="text-right">Desconto</th><th className="text-right">Subtotal</th></tr></thead>
                <tbody>{o.servicos.map((l) => <tr key={l.id}><td><Link href={`/servicos/${l.servico.id}`} className="hover:underline"><span className="font-mono text-[11px] text-slate-500">{l.servico.codigo}</span> {l.servico.nome}</Link>{l.detalhes && <div className="text-[11px] text-slate-500">{l.detalhes}</div>}<Instalado i={l} fotos={fotosDoItem(l.id)} servico /></td>
                  <td className="text-right">{qtd(l.quantidade)}</td><td className="text-right">{num2(l.valorUnit)}</td><td className="text-right">{Number(l.desconto) ? num2(l.desconto) : ""}</td><td className="text-right font-semibold">{num2(l.subtotal)}</td></tr>)}</tbody>
                <tfoot><tr><td colSpan={4} className="text-right">Total de serviços</td><td className="text-right font-semibold">{num2(o.totalServicos)}</td></tr></tfoot>
              </table>
            </div>
          )}

          {aba === "equipamentos" && (
            <div className="space-y-2">
              <form action={base} className="flex max-w-md"><input type="hidden" name="aba" value="equipamentos" /><input name="q" defaultValue={sp.q} placeholder="Buscar equipamento" className="campo rounded-r-none" /><button className="btn rounded-l-none px-2.5"><Icone nome="buscar" size={15} /></button></form>
              {equipamentos.map((e) => (
                <details key={e.id} open className="cartao p-3 text-[13px]">
                  <summary className="flex cursor-pointer items-center gap-2"><b>{e.equipamento}</b><span className="pilula border-slate-300 bg-slate-50 text-slate-600">Equipamento</span>
                    <span className="text-[12px] text-slate-500">{[e.marca, e.modelo, e.serie && `Série ${e.serie}`].filter(Boolean).join(" · ")}</span><span className="ml-auto text-[12px] text-marca">Ocultar</span></summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {([["Condições", e.condicoes], ["Defeitos", e.defeitos], ["Acessórios", e.acessorios], ["Solução", e.solucao], ["Laudo técnico", e.laudo], ["Termos de garantia", e.garantia]] as const).filter(([, v]) => v).map(([r, v]) => (
                      <div key={r}><div className="text-[11px] font-semibold text-slate-500 uppercase">{r}</div><p className="whitespace-pre-wrap">{v}</p></div>
                    ))}
                  </div>
                </details>
              ))}
              {!equipamentos.length && <Vazio icone="os" titulo="Nenhum equipamento encontrado" />}
            </div>
          )}

          {aba === "pagamento" && (
            <div className="space-y-3">
              <div className="cartao grid gap-3 p-4 text-[13px] sm:grid-cols-6">
                {([["Mão de obra", o.totalServicos], ["Produtos", o.totalProdutos], ["Frete", o.frete], ["Outros", o.outros], ["Desconto", o.desconto], ["Total", o.total]] as [string, unknown][]).map(([k, x]) => <div key={k}><div className="text-slate-500">{k}</div><div className={`font-semibold ${k === "Total" ? "text-[18px] text-marca" : "text-[15px]"}`}>{brl(Number(x))}</div></div>)}
              </div>
              <div className="px-1 text-[13px]"><b>Condição:</b> {o.condicao === "PARCELADO" ? `Parcelado em ${o.parcelas.length}x` : "À vista"}{o.formaPagamento ? ` · ${o.formaPagamento.nome}` : ""}</div>
              {lancamentos.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {lancamentos.map((l) => {
                    const recebida = !!l.pagoEm;
                    const atrasada = !recebida && l.vencimento < diaSP();
                    return (
                      <div key={l.id} className="cartao p-3 text-[13px]">
                        <div className="flex items-center gap-2"><b>{l.formaPagamento?.nome ?? "A combinar"}</b>
                          <span className={`pilula ml-auto ${recebida ? "border-emerald-300 bg-emerald-50 text-emerald-700" : atrasada ? "border-red-300 bg-red-50 text-red-700" : "border-orange-300 bg-orange-50 text-orange-700"}`}>{recebida ? "Recebida" : atrasada ? "Atrasada" : "A receber"}</span></div>
                        <div className="mt-1 flex text-slate-600"><span>{l.totalParcelas > 1 ? `Parcela ${l.parcela}/${l.totalParcelas}` : "Parcela única"} · vence {dia(l.vencimento)} · {l.categoria.nome}</span><b className="ml-auto text-slate-800">{brl(l.valor)}</b></div>
                        <BoletoParcela parcela={l} cliente={o.cliente} base={baseCliente} interAtivo={interAtivo} />
                      </div>
                    );
                  })}
                </div>
              ) : o.parcelas.length ? (
                <div className="cartao overflow-x-auto">
                  <p className="px-4 pt-3 text-[12px] text-slate-500">Esta situação não lança o financeiro: as parcelas viram contas a receber quando a OS for para uma situação que lança.</p>
                  <table className="tabela"><thead><tr><th>Parcela</th><th>Vencimento</th><th className="text-right">Valor</th><th>Forma</th><th>Observação</th></tr></thead>
                    <tbody>{o.parcelas.map((p) => <tr key={p.id}><td>{p.numero}</td><td>{dia(p.vencimento)}</td><td className="text-right">{num2(p.valor)}</td><td>{p.formaPagamento?.nome ?? o.formaPagamento?.nome ?? "A combinar"}</td><td>{p.observacao}</td></tr>)}</tbody></table>
                </div>
              ) : <Vazio icone="dinheiro" titulo="Nenhuma forma de pagamento foi definida" />}
            </div>
          )}

          {aba === "entrega" && (
            <div className="cartao space-y-1 p-4 text-[13px]">
              <div><b>Saída:</b> {quando(o.saida)}</div>
              <div><b>Valor do frete:</b> {brl(o.frete)}</div>
              {endEntrega && <div><b>Endereço de entrega:</b> {endEntrega.logradouro}, {endEntrega.numero} · {endEntrega.bairro} · {endEntrega.cidade}/{endEntrega.uf}</div>}
            </div>
          )}

          {aba === "comissao" && (o.vendedor && comissaoPct > 0 ? (
            <div className="cartao p-4 text-[13px]">
              <b>{o.vendedor.nome}</b> · comissão de {num2(comissaoPct)}% sobre {brl(o.total)} = <b>{brl((Number(o.total) * comissaoPct) / 100)}</b>
            </div>
          ) : <Vazio icone="percentual" titulo="Sem comissão" texto="Nenhum dado de comissão foi encontrado para este registro." />)}

          {aba === "notas" && <NotasDoDocumento origemTipo="OS" origemId={id} podeEmitir={concluida} temProdutos={o.produtos.length > 0} temServicos={o.servicos.length > 0} />}

          {aba === "campos" && <div className="cartao p-4 text-[13px]">{campos.map((x) => <div key={x.id}><b>{x.nome}:</b> {ce[x.id] || "—"}</div>)}</div>}

          {aba === "envios" && (mensagensZap.length ? <div className="cartao"><ListaMensagens mensagens={mensagensZap} /></div>
            : <Vazio icone="envios" titulo="Nenhum envio registrado" texto={zapAtivo ? "Use Compartilhar › WhatsApp (MXChat) para mandar o status da OS ao cliente." : "Use Compartilhar › Por e-mail ou WhatsApp para mandar a OS e o link de cobrança ao cliente."} />)}

          {aba === "historico" && (
            <div className="cartao p-4">
              {trabalho.estado !== "NAO_INICIADO" && (
                <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[13px]">
                  <span><b>Mão de obra:</b> {duracao(trabalho.fechadoMs + (trabalho.abertoDesde ? Date.now() - new Date(trabalho.abertoDesde).getTime() : 0))}</span>
                  <span className="text-slate-500">{trabalho.trechos.length} {trabalho.trechos.length === 1 ? "trecho" : "trechos"} · {{ TRABALHANDO: "trabalhando agora", PAUSADO: "pausado", FINALIZADO: "finalizado", NAO_INICIADO: "" }[trabalho.estado]}</span>
                  {fotosInstalacao.length > 0 && <span className="text-slate-500">{fotosInstalacao.length} {fotosInstalacao.length === 1 ? "foto" : "fotos"} da instalação</span>}
                </div>
              )}
              <ol className="relative ml-2 border-l border-slate-200">
                {o.historico.map((x) => {
                  const quem = x.usuarioNome ?? (x.usuarioId ? usuarios.get(x.usuarioId) : null);
                  const foto = fotoDaLinha.get(x.id);
                  return (
                    <li key={x.id} className="mb-4 ml-4 text-[13px]">
                      <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-marca" />
                      <div>{x.descricao}{x.situacao && <span className="ml-1 text-slate-500">· {x.situacao}</span>}</div>
                      <div className="text-[11px] text-slate-500">{quem ? `Por ${quem} · ` : ""}{dataSP(x.createdAt)} • {horaSP(x.createdAt)}</div>
                      {foto && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a href={`/api/cadastros/anexo/${foto}`} target="_blank" className="mt-1.5 inline-block"><img src={`/api/cadastros/anexo/${foto}`} alt="Foto da instalação" loading="lazy" className="h-28 w-28 rounded border object-cover hover:opacity-90" /></a>
                      )}
                    </li>
                  );
                })}
                {!o.historico.length && <li className="ml-4 text-[13px] text-slate-500">Sem histórico registrado.</li>}
              </ol>
            </div>
          )}

          {aba === "anexos" && (
            <div className="cartao p-4">
              <FormAnexo entidade="OS" entidadeId={id} caminho={`${base}?aba=anexos`} />
              {fotosInstalacao.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1 text-[12px] font-semibold uppercase text-slate-500">Fotos da instalação (tela do técnico)</div>
                  <div className="flex flex-wrap gap-2">
                    {fotosInstalacao.map((a) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={a.id} href={`/api/cadastros/anexo/${a.id}`} target="_blank" title={a.nome}><img src={`/api/cadastros/anexo/${a.id}`} alt={a.nome} loading="lazy" className="h-24 w-24 rounded border object-cover" /></a>
                    ))}
                  </div>
                </div>
              )}
              {anexos.length ? (
                <table className="tabela"><tbody>{anexos.map((a) => <tr key={a.id}><td><a href={`/api/cadastros/anexo/${a.id}`} className="text-marca hover:underline">{a.nome}</a>{a.entidade === "OS_FOTO" && <span className="ml-2 rounded bg-slate-100 px-1.5 text-[10px]">Foto do técnico</span>}</td><td className="w-36">{dataSP(a.createdAt)}</td>
                  <td className="w-12 text-right"><BotaoExcluir acao={excluirAnexoAcao.bind(null, a.id)} pergunta={`Excluir o anexo ${a.nome}?`} /></td></tr>)}</tbody></table>
              ) : <p className="text-[13px] text-slate-500">Nenhum anexo.</p>}
            </div>
          )}

          {aba === "anotacoes" && (
            <div className="cartao p-4">
              <FormAnotacaoOrc id={id} caminho={`${base}?aba=anotacoes`} acao={anotarOsAcao} sobre="a OS" />
              <div className="space-y-2">
                {anotacoes.map((a) => (
                  <div key={a.id} className="rounded border border-slate-200 bg-[#fffdf3] p-3">
                    <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-500"><b>{usuarios.get(a.usuarioId ?? "") ?? "—"}</b> · {dataSP(a.createdAt)} {horaSP(a.createdAt)}
                      <span className="ml-auto"><BotaoExcluir acao={excluirAnotacaoAcao.bind(null, a.id)} pergunta="Excluir esta anotação?" /></span></div>
                    <p className="whitespace-pre-wrap text-[13px]">{a.texto}</p>
                  </div>
                ))}
                {!anotacoes.length && <p className="text-[13px] text-slate-500">Nenhuma anotação.</p>}
              </div>
            </div>
          )}
        </section>
      </div>
    </Pagina>
  );
}

/** Selo "instalado/feito" (marcado na tela do técnico) com as miniaturas das fotos do item. */
function Instalado({ i, fotos, servico }: { i: { instalado: boolean; instaladoEm: Date | null }; fotos: string[]; servico?: boolean }) {
  if (!i.instalado && !fotos.length) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {i.instalado && <span className="pilula border-emerald-300 bg-emerald-50 text-emerald-700">{servico ? "Feito" : "Instalado"}{i.instaladoEm ? ` ${dataSP(i.instaladoEm)}` : ""}</span>}
      {fotos.map((f) => (
        // eslint-disable-next-line @next/next/no-img-element
        <a key={f} href={`/api/cadastros/anexo/${f}`} target="_blank"><img src={`/api/cadastros/anexo/${f}`} alt="Foto da instalação" loading="lazy" className="h-8 w-8 rounded border object-cover" /></a>
      ))}
    </div>
  );
}
