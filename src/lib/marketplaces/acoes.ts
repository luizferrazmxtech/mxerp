"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import {
  ClienteML, conectarML, desconectarML, linkAutorizacaoML, processarPedidoML, salvarConfigML, sincronizarMercadoLivre, vincularAnuncio, type PedidoML,
} from "./mercadolivre";

export type Resultado = { ok: boolean; mensagem: string } | null;
const erro = (e: unknown) => ({ ok: false, mensagem: e instanceof Error ? e.message : String(e) });
const str = (x: FormDataEntryValue | null) => String(x ?? "").trim();
const atualizar = () => { revalidatePath("/marketplaces"); revalidatePath("/marketplaces/mercado-livre"); revalidatePath("/marketplaces/anuncios"); };

/** Vendas › Marketplaces › Mercado Livre: dados do aplicativo e regras das vendas geradas (só o administrador). */
export async function salvarConfigMLAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN"]);
  try {
    await salvarConfigML({
      ativo: form.get("ativo") === "on", clientId: str(form.get("clientId")), clientSecret: str(form.get("clientSecret")), redirectUri: str(form.get("redirectUri")),
      empresaId: str(form.get("empresaId")), contaBancariaId: str(form.get("contaBancariaId")), situacaoVendaId: str(form.get("situacaoVendaId")),
      formaPagamentoId: str(form.get("formaPagamentoId")), canalVenda: str(form.get("canalVenda")), importarDesde: str(form.get("importarDesde")),
      cancelarAuto: form.get("cancelarAuto") === "on", sincronizarAuto: form.get("sincronizarAuto") === "on",
    });
    atualizar();
    return { ok: true, mensagem: "Configuração do Mercado Livre salva" };
  } catch (e) { return erro(e); }
}

/** Botão "Conectar com o Mercado Livre": leva para a tela de autorização do Mercado Livre. */
export async function irParaAutorizacaoMLAcao() {
  await exigirUsuario(["ADMIN"]);
  let url: string;
  try { url = await linkAutorizacaoML(); } catch (e) { redirect(`/marketplaces/mercado-livre?erro=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`); }
  redirect(url);
}

/** Código (ou endereço final) colado à mão, quando a URL de redirecionamento não é o próprio ERP. */
export async function conectarMLAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN"]);
  try {
    const c = await conectarML(str(form.get("codigo")));
    atualizar();
    return { ok: true, mensagem: `Conta ${c.contaNome} conectada. Clique em "Sincronizar agora" para trazer os pedidos.` };
  } catch (e) { return erro(e); }
}

export async function desconectarMLAcao(): Promise<Resultado> {
  await exigirUsuario(["ADMIN"]);
  try { await desconectarML(); atualizar(); return { ok: true, mensagem: "Conta desconectada" }; } catch (e) { return erro(e); }
}

export async function sincronizarMLAcao(_: Resultado, _form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const r = await sincronizarMercadoLivre();
    atualizar();
    if ("ignorado" in r) return { ok: false, mensagem: `Nada feito: ${r.ignorado}` };
    return {
      ok: !r.erros.length,
      mensagem: `${r.pedidos} pedido(s) conferido(s): ${r.vendas} venda(s) nova(s), ${r.baixas} baixa(s), ${r.cancelados} cancelado(s)${r.semVinculo ? `, ${r.semVinculo} esperando ligar o produto` : ""}${r.erros.length ? `. Erros: ${r.erros.slice(0, 3).join(" · ")}` : ""}`,
    };
  } catch (e) { atualizar(); return erro(e); }
}

/** Anúncios: liga (ou desliga, com o código em branco) um anúncio a um produto pelo código. */
export async function vincularAnuncioAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const r = await vincularAnuncio(str(form.get("id")), str(form.get("codigo")));
    atualizar();
    return { ok: true, mensagem: str(form.get("codigo")) ? `Anúncio ligado${r.reprocessados ? `; ${r.reprocessados} pedido(s) viraram venda` : ""}` : "Vínculo removido" };
  } catch (e) { return erro(e); }
}

/** Pedido com erro: tenta de novo (consulta o pedido e o pagamento outra vez). */
export async function reprocessarPedidoAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const p = await prisma.pedidoMarketplace.findUniqueOrThrow({ where: { id: str(form.get("id")) } });
    if (p.etapa === "GERANDO" && !p.vendaId) await prisma.pedidoMarketplace.update({ where: { id: p.id }, data: { etapa: "ERRO" } });
    const ml = await ClienteML.criar();
    const pedido = await ml.get<PedidoML>(`/orders/${p.externoId}`);
    const r = await processarPedidoML(ml, pedido);
    atualizar();
    const depois = await prisma.pedidoMarketplace.findUniqueOrThrow({ where: { id: p.id } });
    return { ok: r.etapa !== "ERRO", mensagem: depois.erro ?? "Pedido atualizado" };
  } catch (e) { atualizar(); return erro(e); }
}
