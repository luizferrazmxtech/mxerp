"use server";

import { revalidatePath } from "next/cache";
import { exigirAcao, exigirUsuario } from "@/lib/auth/atual";
import { atualizarRastreio, avancarEnvio, cancelarEnvio, comprarEtiqueta, salvarConfigFrete, testarConexao } from "./melhorEnvio";
import { prisma } from "@/lib/db";

export type Resultado = { ok: boolean; mensagem: string } | null;
const erro = (e: unknown) => ({ ok: false, mensagem: e instanceof Error ? e.message : String(e) });
const str = (x: FormDataEntryValue | null) => String(x ?? "").trim();
const num = (x: FormDataEntryValue | null) => Number(str(x).replace(/\./g, "").replace(",", ".")) || 0;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Configurações → Integrações → Melhor Envio: só o administrador salva o token. Testa a conexão depois de salvar. */
export async function salvarFreteAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN"]);
  try {
    await salvarConfigFrete({
      ativo: form.get("ativo") === "on", ambiente: str(form.get("ambiente")) === "SANDBOX" ? "SANDBOX" : "PRODUCAO",
      token: String(form.get("token") ?? ""), apagarToken: form.get("apagarToken") === "on", email: str(form.get("email")), cepOrigem: str(form.get("cepOrigem")),
      acrescimoPct: num(form.get("acrescimoPct")), acrescimoValor: num(form.get("acrescimoValor")), diasExtras: num(form.get("diasExtras")), servicos: str(form.get("servicos")),
      seguro: form.get("seguro") === "on", maoPropria: form.get("maoPropria") === "on", avisoRecebimento: form.get("avisoRecebimento") === "on",
      pacote: { altura: num(form.get("altura")), largura: num(form.get("largura")), comprimento: num(form.get("comprimento")), peso: num(form.get("peso")) },
    });
    revalidatePath("/frete");
    if (form.get("apagarToken") === "on" || !(await prisma.configuracao.findUnique({ where: { chave: "melhorenvio" } }))) return { ok: true, mensagem: "Configuração do frete salva" };
    try {
      const t = await testarConexao();
      return { ok: true, mensagem: `Configuração salva. Conectado à conta ${t.nome}${t.saldo != null ? ` (saldo da carteira: ${brl(t.saldo)})` : ""}.` };
    } catch (e) {
      return { ok: false, mensagem: `Configuração salva, mas o teste falhou: ${e instanceof Error ? e.message : String(e)}` };
    }
  } catch (e) { return erro(e); }
}

/** Venda → Entrega → Comprar etiqueta. */
export async function comprarEtiquetaAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirAcao("venda.etiqueta");
  const vendaId = str(form.get("vendaId"));
  try {
    const e = await comprarEtiqueta(vendaId, Number(str(form.get("servicoId"))), u.nome);
    revalidatePath(`/vendas/${vendaId}`);
    return { ok: true, mensagem: `Etiqueta ${e.transportadora} ${e.servicoNome} comprada (${brl(Number(e.valor))}). Clique em Imprimir etiqueta.` };
  } catch (e) { revalidatePath(`/vendas/${vendaId}`); return erro(e); }
}

export async function tentarDeNovoAcao(envioId: string) {
  await exigirAcao("venda.etiqueta");
  try {
    const e = await avancarEnvio(envioId);
    revalidatePath(`/vendas/${e.vendaId}`); revalidatePath("/frete");
    return { ok: true, mensagem: "Etiqueta gerada" };
  } catch (e) { revalidatePath("/vendas", "layout"); return erro(e); }
}

export async function atualizarRastreioAcao(envioId: string) {
  await exigirUsuario();
  try {
    await atualizarRastreio([envioId]);
    revalidatePath("/vendas", "layout"); revalidatePath("/frete");
    return { ok: true, mensagem: "Rastreio atualizado" };
  } catch (e) { return erro(e); }
}

export async function cancelarEnvioAcao(envioId: string) {
  await exigirAcao("venda.etiqueta");
  try {
    const e = await cancelarEnvio(envioId, "Cancelada no MXERP");
    revalidatePath(`/vendas/${e.vendaId}`); revalidatePath("/frete");
    return { ok: true, mensagem: "Etiqueta cancelada. O valor volta para a carteira do Melhor Envio." };
  } catch (e) { return erro(e); }
}
