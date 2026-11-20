import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";
import { ABERTOS, CANAIS, COR_STATUS, horasTexto, ROTULO_PRIORIDADE, ROTULO_STATUS } from "@/lib/chamados/chamados";
import { atualizarChamadoAcao, comentarChamadoAcao, vincularOsAcao } from "@/lib/chamados/acoes";
import { dataSP, horaSP } from "@/lib/ui/format";
import { Bloco, Pagina, Pilula } from "@/components/ui/Pagina";
import FormAcao from "@/components/financeiro/FormAcao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chamado" };

/** datetime-local no horário de Brasília */
const local = (d: Date | null) => (d ? new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 16) : "");

export default async function Chamado({ params }: { params: Promise<{ id: string }> }) {
  await exigirUsuario();
  const { id } = await params;
  const c = await prisma.chamado.findUnique({
    where: { id },
    include: {
      cliente: { select: { id: true, nome: true, telefone: true, celular: true, email: true } }, responsavel: { select: { nome: true } },
      abertoPor: { select: { nome: true } }, os: { select: { id: true, numero: true } }, interacoes: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!c) notFound();
  const [usuarios, anteriores] = await Promise.all([
    prisma.usuario.findMany({ where: { ativo: true, acessoSistema: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    c.clienteId ? prisma.chamado.findMany({ where: { clienteId: c.clienteId, NOT: { id: c.id } }, orderBy: { numero: "desc" }, take: 8, select: { id: true, numero: true, assunto: true, status: true, createdAt: true } }) : [],
  ]);
  const atrasado = ABERTOS.includes(c.status) && c.prazo && c.prazo < new Date();
  const fone = c.telefone ?? c.cliente?.celular ?? c.cliente?.telefone;
  return (
    <Pagina voltar="/chamados" titulo={<>Chamado nº {c.numero}</>} icone="atendimento" trilha={[{ rotulo: "Atendimentos", href: "/chamados" }, { rotulo: `Nº ${c.numero}` }]}
      acoes={<Link href="/chamados/novo" className="btn-sec">Novo chamado</Link>}>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Bloco icone="atendimento" titulo={<b>{c.assunto}</b>}
            subtitulo={`${CANAIS[c.canal as keyof typeof CANAIS] ?? c.canal}${c.categoria ? ` · ${c.categoria}` : ""} · aberto por ${c.abertoPor?.nome ?? "—"} em ${dataSP(c.createdAt)} ${horaSP(c.createdAt)}`}>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
              <Pilula rotulo={ROTULO_STATUS[c.status]} cor={COR_STATUS[c.status]} />
              <span>Prioridade <b>{ROTULO_PRIORIDADE[c.prioridade]}</b></span>
              <span className={atrasado ? "font-semibold text-red-600" : ""}>· Prazo {c.prazo ? `${dataSP(c.prazo)} ${horaSP(c.prazo)}` : "—"}{atrasado ? " (atrasado)" : ""}</span>
              {c.primeiraRespostaEm && <span className="text-slate-500">· 1ª resposta em {horasTexto((c.primeiraRespostaEm.getTime() - c.createdAt.getTime()) / 3600_000)}</span>}
            </div>
            {c.descricao ? <p className="whitespace-pre-wrap text-[14px]">{c.descricao}</p> : <p className="text-[13px] text-slate-400">Sem descrição.</p>}
            {c.solucao && <p className="mt-3 rounded bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800"><b>Solução:</b> {c.solucao}</p>}
          </Bloco>

          <Bloco icone="anotacoes" titulo={<>Histórico</>}>
            <ol className="space-y-3">
              {c.interacoes.map((i) => (
                <li key={i.id} className={`rounded border px-3 py-2 text-[13px] ${i.interno ? "border-amber-200 bg-amber-50" : i.tipo === "COMENTARIO" ? "bg-white" : "border-dashed bg-slate-50 text-slate-600"}`}>
                  <div className="mb-0.5 text-[11px] text-slate-500">{i.usuarioNome ?? "Sistema"} · {dataSP(i.createdAt)} {horaSP(i.createdAt)}{i.interno ? " · nota interna" : ""}</div>
                  <div className="whitespace-pre-wrap">{i.texto}</div>
                </li>
              ))}
            </ol>
            <FormAcao acao={comentarChamadoAcao} className="mt-3 space-y-2" botao="Registrar" classeBotao="btn">
              <input type="hidden" name="id" value={c.id} />
              <textarea name="texto" required rows={3} className="campo" placeholder="O que foi feito ou combinado com o cliente" />
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="interno" /> Nota interna (não conta como resposta ao cliente)</label>
            </FormAcao>
          </Bloco>
        </div>

        <div className="space-y-4">
          <Bloco icone="pessoa" titulo="Cliente">
            <div className="space-y-1 text-[13px]">
              {c.cliente ? <Link href={`/clientes/${c.cliente.id}`} className="font-semibold text-marca-escura hover:underline">{c.cliente.nome}</Link> : <div className="font-semibold">{c.contato ?? "—"}</div>}
              {c.cliente && c.contato && <div>Contato: {c.contato}</div>}
              {fone && <div>{fone}{" "}<a className="text-marca-escura hover:underline" href={`https://wa.me/55${fone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a></div>}
              {c.cliente?.email && <div>{c.cliente.email}</div>}
            </div>
            {anteriores.length > 0 && (
              <div className="mt-3 border-t pt-2 text-[12px]">
                <div className="mb-1 text-slate-500">Outros chamados deste cliente</div>
                {anteriores.map((a) => <div key={a.id}><Link href={`/chamados/${a.id}`} className="hover:underline">nº {a.numero} · {a.assunto}</Link> <span className="text-slate-400">({ROTULO_STATUS[a.status]})</span></div>)}
              </div>
            )}
          </Bloco>

          <Bloco icone="editar" titulo="Atendimento">
            <FormAcao acao={atualizarChamadoAcao} className="space-y-2" botao="Salvar" classeBotao="btn w-full" limpar={false}>
              <input type="hidden" name="id" value={c.id} />
              <label className="block"><span className="rotulo">Situação</span>
                <select name="status" defaultValue={c.status} className="campo">{Object.entries(ROTULO_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="block"><span className="rotulo">Responsável</span>
                <select name="responsavelId" defaultValue={c.responsavelId ?? ""} className="campo"><option value="">Ninguém</option>{usuarios.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
              <div className="grid grid-cols-2 gap-2">
                <label><span className="rotulo">Prioridade</span>
                  <select name="prioridade" defaultValue={c.prioridade} className="campo">{Object.entries(ROTULO_PRIORIDADE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label><span className="rotulo">Prazo</span><input type="datetime-local" name="prazo" defaultValue={local(c.prazo)} className="campo" /></label>
              </div>
              <label className="block"><span className="rotulo">Solução</span><textarea name="solucao" rows={3} defaultValue={c.solucao ?? ""} className="campo" placeholder="Obrigatória para resolver" /></label>
            </FormAcao>
          </Bloco>

          <Bloco icone="os" titulo="Ordem de serviço">
            {c.os ? (
              <p className="text-[13px]">Vinculado à <Link href={`/os/${c.os.id}`} className="font-semibold text-marca-escura hover:underline">OS nº {c.os.numero}</Link>.</p>
            ) : (
              <p className="mb-2 text-[13px] text-slate-500">Se o atendimento virar serviço na bancada, abra a OS e vincule pelo número.</p>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <Link href={`/os/adicionar${c.clienteId ? `?cliente=${c.clienteId}` : ""}`} className="btn-sec">Abrir OS</Link>
              <FormAcao acao={vincularOsAcao} className="flex items-end gap-2" botao="Vincular" classeBotao="btn-sec">
                <input type="hidden" name="id" value={c.id} />
                <label><span className="rotulo">Nº da OS</span><input name="numeroOs" inputMode="numeric" className="campo w-24" /></label>
              </FormAcao>
            </div>
          </Bloco>
        </div>
      </div>
    </Pagina>
  );
}
