import Link from "next/link";
import { headers } from "next/headers";
import { exigirArea } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { nomeLoja } from "@/lib/empresa/atual";
import { configMLTela } from "@/lib/marketplaces/mercadolivre";
import { sincronizarMLAcao } from "@/lib/marketplaces/acoes";
import { dataHora } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import FormMercadoLivre from "@/components/marketplaces/FormMercadoLivre";
import BotaoForm from "@/components/marketplaces/BotaoForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mercado Livre" };

export default async function MercadoLivrePagina({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const u = await exigirArea("/marketplaces/mercado-livre");
  const sp = await searchParams;
  const h = await headers();
  const origem = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "seu-erp"}`;
  const [c, empresas, contas, situacoes, formas] = await Promise.all([
    configMLTela(),
    prisma.empresa.findMany({ where: { ativa: true }, orderBy: { createdAt: "asc" }, select: { id: true, razaoSocial: true, nomeFantasia: true } }),
    prisma.contaBancaria.findMany({ where: { ativa: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.situacaoVendaConfig.findMany({ where: { financeiro: true }, orderBy: { ordem: "asc" }, select: { id: true, nome: true } }),
    prisma.formaPagamento.findMany({ where: { ativa: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  const urlNotificacoes = c.webhookToken ? `${origem}/api/mercadolivre/notificacoes/${c.webhookToken}` : null;
  return (
    <Pagina titulo="Mercado Livre" icone="lojas" trilha={[{ rotulo: "Vendas", href: "/vendas" }, { rotulo: "Marketplaces", href: "/marketplaces" }, { rotulo: "Mercado Livre" }]}>
      {sp.ok && <p className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">{sp.ok}</p>}
      {sp.erro && <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{sp.erro}</p>}
      {c.conectado && (
        <div className="cartao mb-3 flex flex-wrap items-center gap-3 p-3 text-[13px]">
          <span>Última busca: <b>{c.ultimaSincEm ? dataHora(c.ultimaSincEm) : "nunca"}</b>{c.ultimaSincMsg ? ` · ${c.ultimaSincMsg}` : ""}</span>
          <span className="ml-auto"><BotaoForm acao={sincronizarMLAcao} rotulo="Sincronizar agora" /></span>
          <Link href="/marketplaces" className="btn-sec h-8 text-[12px]">Ver pedidos</Link>
        </div>
      )}
      <FormMercadoLivre c={c} admin={u.papel === "ADMIN"} urlCallback={`${origem}/api/mercadolivre/callback`}
        empresas={empresas.map((e) => ({ id: e.id, nome: nomeLoja(e) }))} contas={contas} situacoes={situacoes} formas={formas} />
      <div className="mb-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] text-sky-900">
        <b>Notificações (opcional):</b> quando o ERP estiver num endereço https público, cadastre no aplicativo, em &quot;URL de retorno de notificações&quot;, o endereço
        {urlNotificacoes ? <> <span className="break-all font-mono text-[12px]">{urlNotificacoes}</span></> : " que aparece aqui depois de salvar"} e marque o tópico <b>Orders</b>.
        Assim o pedido entra na hora; sem isso, entra na busca de hora em hora. Produtos são ligados pelo SKU do anúncio (igual ao código do produto); o que não casar aparece em{" "}
        <Link href="/marketplaces/anuncios" className="underline">Anúncios</Link>.
      </div>
    </Pagina>
  );
}
