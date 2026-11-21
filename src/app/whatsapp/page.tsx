import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { exigirArea } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { configWhatsappTela } from "@/lib/whatsapp/mxchat";
import { Bloco, Pagina } from "@/components/ui/Pagina";
import FormWhatsapp from "@/components/whatsapp/FormWhatsapp";
import ListaMensagens from "@/components/whatsapp/ListaMensagens";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp (MXChat)" };

const FILTROS = [{ v: "", r: "Todas" }, { v: "ENVIADA", r: "Enviadas" }, { v: "ERRO", r: "Com erro" }];

export default async function WhatsappPagina({ searchParams }: { searchParams: Promise<{ situacao?: string; q?: string }> }) {
  const u = await exigirArea("/whatsapp");
  const sp = await searchParams;
  const q = sp.q?.trim();
  const digitos = q?.replace(/\D/g, "");
  const where: Prisma.MensagemWhatsappWhereInput = {
    ...(sp.situacao ? { situacao: sp.situacao } : {}),
    ...(q ? { OR: [{ texto: { contains: q, mode: "insensitive" } }, ...(digitos && digitos.length >= 4 ? [{ numero: { contains: digitos } }] : [])] } : {}),
  };
  const [c, mensagens, total, erros24h] = await Promise.all([
    configWhatsappTela(),
    prisma.mensagemWhatsapp.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.mensagemWhatsapp.count({ where }),
    prisma.mensagemWhatsapp.count({ where: { situacao: "ERRO", createdAt: { gte: new Date(Date.now() - 86400000) } } }),
  ]);
  const idsOs = mensagens.filter((m) => m.entidade === "OS" && m.entidadeId).map((m) => m.entidadeId!);
  const idsCt = mensagens.filter((m) => m.entidade === "CONTRATO" && m.entidadeId).map((m) => m.entidadeId!);
  const [oss, cts] = await Promise.all([
    prisma.ordemServico.findMany({ where: { id: { in: idsOs } }, select: { id: true, numero: true } }),
    prisma.contrato.findMany({ where: { id: { in: idsCt } }, select: { id: true, numero: true } }),
  ]);
  const nOs = new Map(oss.map((o) => [o.id, o.numero])); const nCt = new Map(cts.map((x) => [x.id, x.numero]));
  const links = new Map<string, { href: string; rotulo: string }>();
  for (const m of mensagens) {
    if (m.entidade === "OS" && m.entidadeId && nOs.has(m.entidadeId)) links.set(m.id, { href: `/os/${m.entidadeId}?aba=envios`, rotulo: `OS nº ${nOs.get(m.entidadeId)}` });
    if (m.entidade === "CONTRATO" && m.entidadeId && nCt.has(m.entidadeId)) links.set(m.id, { href: `/contratos/${m.entidadeId}`, rotulo: `Contrato nº ${nCt.get(m.entidadeId)}` });
  }
  const filtro = (v: string) => `/whatsapp?${new URLSearchParams({ ...(v ? { situacao: v } : {}), ...(q ? { q } : {}) })}`;

  return (
    <Pagina titulo="WhatsApp (MXChat)" icone="whatsapp" trilha={[{ rotulo: "Configurações" }, { rotulo: "WhatsApp (MXChat)" }]}>
      {!c.ativo && <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">O envio por WhatsApp está desligado. Cole o token do MXChat, marque &quot;Ligar o envio&quot; e salve (de preferência com o seu celular no campo de teste).</p>}
      {erros24h > 0 && <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{erros24h === 1 ? "Uma mensagem não foi enviada" : `${erros24h} mensagens não foram enviadas`} nas últimas 24 horas. Veja o motivo na lista abaixo.</p>}
      <FormWhatsapp c={c} admin={u.papel === "ADMIN"} />
      <div className="mb-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] text-sky-900">
        <b>Onde o WhatsApp é usado:</b> na OS, em Compartilhar › WhatsApp (MXChat) e sozinho nas situações marcadas com &quot;Enviar mensagem&quot; (<Link href="/os/situacoes" className="underline">Situações</Link>; o texto fica em <Link href="/os/mensagens" className="underline">Mensagens</Link>);
        nos contratos com o WhatsApp marcado, a cobrança vai com o boleto em PDF e o lembrete também (textos em <Link href="/contratos/configuracoes" className="underline">Contratos › Configurações</Link>).
      </div>
      <Bloco icone="envios" titulo={<>Mensagens <b>enviadas</b></>} subtitulo={`${total} no total${total > mensagens.length ? ` (mostrando as ${mensagens.length} mais recentes)` : ""}`} corpo="p-0"
        acoes={<form className="flex items-center gap-2"><input name="q" defaultValue={q} placeholder="Buscar texto ou número" className="campo h-8 w-56 text-[12px]" />{sp.situacao && <input type="hidden" name="situacao" value={sp.situacao} />}<button className="btn-sec h-8 text-[12px]">Buscar</button></form>}>
        <div className="flex gap-1 border-b px-3 py-2 text-[12px]">
          {FILTROS.map((f) => <Link key={f.v} href={filtro(f.v)} className={`rounded px-2 py-1 ${(sp.situacao ?? "") === f.v ? "bg-marca text-white" : "hover:bg-slate-100"}`}>{f.r}</Link>)}
        </div>
        <ListaMensagens mensagens={mensagens} links={links} />
      </Bloco>
    </Pagina>
  );
}
