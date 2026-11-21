import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";
import { pode } from "@/lib/auth/permissoesAcao";
import { estadoDe } from "@/lib/os/ordens";
import { estadoEstoque } from "@/lib/os/os";
import { ehGerencia, podeMexerNaOs } from "@/lib/os/tecnico";
import { carroDoTecnico, saldoDoCarro } from "@/lib/estoque/carro";
import { resumoTrabalho } from "@/lib/os/trabalho";
import { cor } from "@/lib/orcamentos/tipos";
import { rotuloPrioridade } from "@/lib/os/tipos";
import Icone from "@/components/Icone";
import TelaOsTecnico, { type ItemTecnico } from "@/components/tecnico/TelaOsTecnico";

export const dynamic = "force-dynamic";
export const metadata = { title: "OS do técnico" };

const qtd = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const quando = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function OsDoTecnico({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await exigirUsuario();
  const o = await prisma.ordemServico.findUnique({
    where: { id },
    include: {
      cliente: { select: { nome: true, fantasia: true, celular: true, telefone: true, logradouro: true, numero: true, complemento: true, bairro: true, cidade: true, uf: true } },
      situacaoCfg: true, equipe: { select: { nome: true, membros: true } },
      equipamentos: { orderBy: { ordem: "asc" } },
      produtos: { orderBy: [{ ordem: "asc" }, { createdAt: "asc" }], include: { produto: { select: { codigo: true, nome: true, unidade: true } } } },
      servicos: { orderBy: [{ ordem: "asc" }, { createdAt: "asc" }], include: { servico: { select: { codigo: true, nome: true } } } },
    },
  });
  if (!o) notFound();
  if (!(await podeMexerNaOs(prisma, u, id))) {
    return (
      <div className="mx-auto max-w-3xl px-3 pt-4">
        <div className="rounded-lg border bg-white p-6 text-center text-[15px]">
          <p className="mb-3">Você não é técnico da OS {o.numero} nem da equipe dela.</p>
          <Link href="/tecnico" className="btn">Voltar para minhas OS</Link>
        </div>
      </div>
    );
  }
  const [reservas, fotos, anotacoes, situacoes, podeItens, podeFotos, podeSituacao, meuLocal, trabalho] = await Promise.all([
    prisma.reserva.findMany({ where: { origemTipo: "OS", origemId: id, status: { in: ["ATIVA", "BAIXADA"] } }, include: { local: { select: { codigo: true } } } }),
    prisma.anexo.findMany({ where: { entidade: "OS_FOTO", entidadeId: id }, select: { id: true, nome: true, referencia: true, usuarioId: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.anotacao.findMany({ where: { entidade: "OS", entidadeId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.situacaoOsConfig.findMany({ where: { exibir: true }, orderBy: { ordem: "asc" }, select: { id: true, nome: true, cor: true, bloqueados: true } }),
    pode(u.papel, "os.tecnicoItens"), pode(u.papel, "os.tecnicoFotos"), pode(u.papel, "os.situacao"),
    carroDoTecnico(prisma, u.id, id),
    resumoTrabalho(id),
  ]);
  // depois de finalizar, já sugere a situação de concluída (o técnico confirma em "Mudar situação")
  const sitFinal = situacoes.find((s) => /finaliz|conclu|executad|encerrad/i.test(s.nome) && s.id !== o.situacaoId)?.id;
  const carro = meuLocal ? await prisma.local.findUnique({ where: { id: meuLocal }, select: { deposito: { select: { nome: true, equipeId: true } } } }) : null;
  const meuEstoque = carro?.deposito.equipeId ? { nome: carro.deposito.nome, livre: Object.fromEntries((await saldoDoCarro(carro.deposito.equipeId)).map((x) => [x.produtoId, x.livre])) } : null;
  const idsUsuarios = [...new Set([...o.tecnicoIds, ...(o.equipe?.membros ?? []), ...anotacoes.map((a) => a.usuarioId), ...o.produtos.map((p) => p.instaladoPorId), ...o.servicos.map((p) => p.instaladoPorId)].filter((x): x is string => !!x))];
  const nomes = new Map((await prisma.usuario.findMany({ where: { id: { in: idsUsuarios } }, select: { id: true, nome: true } })).map((x) => [x.id, x.nome]));
  const estado = o.situacaoCfg ? estadoDe(o.situacaoCfg.estoque) : estadoEstoque(o.situacao);
  const editavel = estado === "RESERVADO" && (o.situacaoCfg?.permiteEdicao ?? true) && !o.situacaoCfg?.financeiro;
  const gerencia = ehGerencia(u);
  const fotosDe = (ref: string | null) => fotos.filter((f) => f.referencia === ref).map((f) => ({ id: f.id, nome: f.nome, minha: gerencia || f.usuarioId === u.id }));
  const idsItens = new Set([...o.produtos.map((p) => p.id), ...o.servicos.map((s) => s.id)]);
  const marca = (i: { instalado: boolean; instaladoEm: Date | null; instaladoPorId: string | null; criadoPorId: string | null }) => ({
    instalado: i.instalado,
    instaladoInfo: i.instalado ? [i.instaladoPorId && nomes.get(i.instaladoPorId), i.instaladoEm && quando(i.instaladoEm)].filter(Boolean).join(" · ") : "",
    podeRemover: editavel && podeItens && (gerencia || (i.criadoPorId === u.id && !i.instalado)),
  });
  const itens: ItemTecnico[] = [
    ...o.produtos.map((p) => ({
      id: p.id, tipo: "produto" as const, nome: p.produto.nome, codigo: p.produto.codigo, quantidade: `${qtd(p.quantidade)} ${p.produto.unidade}`, detalhes: p.detalhes ?? "",
      onde: reservas.filter((r) => r.origemItemId === p.id).map((r) => `${r.local?.codigo ?? "EM FALTA"} (${qtd(r.quantidade)})${r.status === "BAIXADA" ? " · saiu" : ""}`).join(", "),
      emFalta: reservas.some((r) => r.origemItemId === p.id && r.status === "ATIVA" && !r.localId),
      fotos: fotosDe(p.id), ...marca(p),
      comigo: meuLocal && editavel && podeItens && (!p.localOrigemId || p.localOrigemId === meuLocal) ? p.localOrigemId === meuLocal : null,
    })),
    ...o.servicos.map((s) => ({
      id: s.id, tipo: "servico" as const, nome: s.servico.nome, codigo: s.servico.codigo, quantidade: qtd(s.quantidade), detalhes: s.detalhes ?? "", onde: "", emFalta: false,
      fotos: fotosDe(s.id), ...marca(s),
    })),
  ];
  const fone = (o.cliente.celular ?? o.cliente.telefone ?? "").replace(/\D/g, "");
  const endereco = [o.cliente.logradouro && `${o.cliente.logradouro}${o.cliente.numero ? `, ${o.cliente.numero}` : ""}${o.cliente.complemento ? ` ${o.cliente.complemento}` : ""}`, o.cliente.bairro, o.cliente.cidade && `${o.cliente.cidade}${o.cliente.uf ? `/${o.cliente.uf}` : ""}`].filter(Boolean).join(" · ");
  const equipe = [...new Set([...o.tecnicoIds, ...(o.equipe?.membros ?? [])])].map((x) => nomes.get(x)).filter(Boolean).join(", ");
  const c = cor(o.situacaoCfg?.cor ?? "cinza");

  return (
    <div className="mx-auto max-w-3xl px-3 pb-28 pt-3">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/tecnico" className="btn-sec h-10 px-3" aria-label="Voltar"><Icone nome="direita" size={18} className="rotate-180" /></Link>
        <h1 className="text-[20px] font-semibold">OS {o.numero}</h1>
        <span className={`pilula ${c.pilula}`}>{o.situacaoCfg?.nome ?? o.situacao}</span>
        {o.prioridade && <span className="text-[12px] text-slate-600">{rotuloPrioridade(o.prioridade)}</span>}
      </div>

      <section className="mb-3 rounded-lg border bg-white p-3">
        <div className="text-[16px] font-semibold">{o.cliente.nome}</div>
        {endereco && <div className="text-[13px] text-slate-600">{endereco}</div>}
        <div className="mt-2 flex flex-wrap gap-2">
          {fone.length >= 10 && <a href={`tel:${fone}`} className="btn-sec h-10 px-3"><Icone nome="telefone" size={16} /> Ligar</a>}
          {fone.length >= 10 && <a href={`https://wa.me/55${fone.replace(/^55/, "")}`} target="_blank" rel="noreferrer" className="btn-sec h-10 px-3"><Icone nome="whatsapp" size={16} /> WhatsApp</a>}
          {endereco && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`} target="_blank" rel="noreferrer" className="btn-sec h-10 px-3"><Icone nome="endereco" size={16} /> Mapa</a>}
        </div>
        {equipe && <div className="mt-2 text-[12px] text-slate-500"><Icone nome="equipe" size={12} className="mr-1 inline" />{o.equipe ? `${o.equipe.nome}: ` : "Técnicos: "}{equipe}</div>}
      </section>

      {o.equipamentos.length > 0 && (
        <section className="mb-3 rounded-lg border bg-white p-3">
          <h2 className="mb-1 text-[13px] font-semibold uppercase text-slate-500">Equipamentos</h2>
          {o.equipamentos.map((e) => (
            <div key={e.id} className="border-t py-2 text-[14px] first:border-t-0">
              <b>{[e.equipamento, e.marca, e.modelo].filter(Boolean).join(" ")}</b>{e.serie ? <span className="text-slate-500"> · série {e.serie}</span> : null}
              {e.defeitos && <div className="text-slate-700"><span className="text-slate-500">Defeito:</span> {e.defeitos}</div>}
              {e.acessorios && <div className="text-slate-700"><span className="text-slate-500">Acessórios:</span> {e.acessorios}</div>}
            </div>
          ))}
        </section>
      )}

      {(o.observacoes || o.observacaoInterna) && (
        <section className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[14px]">
          {o.observacoes && <p className="whitespace-pre-line">{o.observacoes}</p>}
          {o.observacaoInterna && <p className="mt-1 whitespace-pre-line text-amber-900"><b>Interna:</b> {o.observacaoInterna}</p>}
        </section>
      )}

      <TelaOsTecnico
        osId={id} numero={o.numero} itens={itens} fotosGerais={fotosDe(null).concat(fotos.filter((f) => f.referencia && !idsItens.has(f.referencia)).map((f) => ({ id: f.id, nome: f.nome, minha: gerencia || f.usuarioId === u.id })))}
        editavel={editavel} motivoBloqueio={editavel ? "" : estado === "BAIXADO" ? "OS concluída: para lançar itens, peça ao escritório para reabrir." : o.situacaoCfg?.financeiro ? "A OS já lançou o financeiro: lançar itens é com o escritório." : `OS em "${o.situacaoCfg?.nome ?? o.situacao}": não permite lançar itens.`}
        podeItens={podeItens} podeFotos={podeFotos}
        situacao={podeSituacao && !(o.situacaoCfg?.bloqueados.includes(u.papel)) ? { atual: o.situacaoId ?? "", opcoes: situacoes.map((s) => ({ id: s.id, nome: s.nome })) } : null}
        meuEstoque={meuEstoque}
        trabalho={podeItens ? trabalho : null} situacaoFinal={sitFinal}
        anotacoes={anotacoes.map((a) => ({ id: a.id, texto: a.texto, autor: a.usuarioId ? nomes.get(a.usuarioId) ?? "" : "", quando: quando(a.createdAt) }))}
      />
    </div>
  );
}
