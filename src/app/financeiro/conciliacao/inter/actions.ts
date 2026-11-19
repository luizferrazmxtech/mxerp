"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { ESCOPO_EXTRATO, ESCOPOS_COBRANCA, lerArquivosInter, testarInter } from "@/lib/financeiro/inter";
import { registrarWebhook } from "@/lib/financeiro/boletos";
import { cifrar, decifrar } from "@/lib/seguranca/segredos";

export type Estado = { ok: boolean; mensagem: string } | null;
const str = (x: FormDataEntryValue | null) => String(x ?? "").trim();
const atualizar = () => { revalidatePath("/financeiro/conciliacao"); revalidatePath("/financeiro/conciliacao/inter"); };

export async function salvarInter(_: Estado, form: FormData): Promise<Estado> {
  await exigirUsuario(["ADMIN"]);
  try {
    const atual = await prisma.integracaoInter.findUnique({ where: { id: "inter" } });
    const clientId = str(form.get("clientId"));
    const clientSecret = str(form.get("clientSecret"));
    const contaCorrente = str(form.get("contaCorrente")).replace(/\D/g, "");
    const ambiente = str(form.get("ambiente")) === "sandbox" ? "sandbox" : "producao";
    const cobranca = form.get("cobranca") === "on";
    const escopos = cobranca ? `${ESCOPO_EXTRATO} ${ESCOPOS_COBRANCA}` : ESCOPO_EXTRATO;
    const emitirBoletos = form.get("emitirBoletos") === "on";
    const pct = (k: string, max: number) => Math.min(max, Math.max(0, Number(str(form.get(k)).replace(",", ".")) || 0));
    const urlPublica = str(form.get("urlPublica")).replace(/\/+$/, "") || null;
    if (urlPublica && !/^https:\/\/[^/\s]+/i.test(urlPublica)) return { ok: false, mensagem: "O endereço público do ERP precisa começar com https:// (ou deixe em branco)" };
    const contaBancariaId = str(form.get("contaBancariaId")) || null;
    const arquivos = await Promise.all(
      form.getAll("arquivos").filter((f): f is File => f instanceof File && f.size > 0)
        .map(async (f) => ({ nome: f.name, bytes: Buffer.from(await f.arrayBuffer()) })),
    );
    if (!clientId) return { ok: false, mensagem: "Informe o Client ID" };
    if (!clientSecret && !atual) return { ok: false, mensagem: "Informe o Client Secret" };

    const lidos = arquivos.length ? await lerArquivosInter(arquivos) : { cert: null, key: null };
    if (arquivos.length && !lidos.cert && !lidos.key) return { ok: false, mensagem: "Nenhum certificado (.crt) nem chave (.key) encontrado nos arquivos enviados" };
    const cert = lidos.cert ?? atual?.certificado ?? null;
    const key = lidos.key ?? (atual ? decifrar(atual.chaveCifrada) : null);
    if (!cert) return { ok: false, mensagem: "Envie o certificado .crt da integração" };
    if (!key) return { ok: false, mensagem: "Envie a chave .key da integração" };
    // confere o par mesmo quando só um dos dois foi trocado
    await lerArquivosInter([{ nome: "c.crt", bytes: Buffer.from(cert) }, { nome: "c.key", bytes: Buffer.from(key) }]);

    const dados = {
      clientId, contaCorrente: contaCorrente || null, ambiente, escopos, contaBancariaId,
      sincronizarAuto: form.get("sincronizarAuto") === "on",
      emitirBoletos, multaPct: pct("multaPct", 10), jurosMesPct: pct("jurosMesPct", 10), diasBaixa: Math.round(pct("diasBaixa", 60)),
      mensagemBoleto: str(form.get("mensagemBoleto")).slice(0, 78) || null, urlPublica,
      // só parcelas lançadas a partir de quando os boletos foram ligados viram boleto (as antigas não)
      boletosDesde: cobranca && emitirBoletos ? (atual?.boletosDesde && atual.emitirBoletos && (atual.escopos ?? "").includes("boleto-cobranca") ? atual.boletosDesde : new Date()) : atual?.boletosDesde ?? null,
      certificado: cert, chaveCifrada: cifrar(key),
      clientSecretCifrado: clientSecret ? cifrar(clientSecret) : atual!.clientSecretCifrado,
    };
    await prisma.integracaoInter.upsert({ where: { id: "inter" }, create: { id: "inter", ...dados }, update: dados });
    const formas = form.getAll("formasBoleto").map(String);
    await prisma.$transaction([
      prisma.formaPagamento.updateMany({ where: { id: { in: formas } }, data: { boletoInter: true } }),
      prisma.formaPagamento.updateMany({ where: { id: { notIn: formas } }, data: { boletoInter: false } }),
    ]);
    const t = await testarInter();
    let webhook = "";
    if (t.ok && cobranca && urlPublica && (urlPublica !== atual?.urlPublica || !atual?.webhookToken)) {
      try { await registrarWebhook(urlPublica); webhook = " Webhook de boletos cadastrado no Inter."; }
      catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        await prisma.integracaoInter.updateMany({ where: { id: "inter" }, data: { webhookMsg: `Erro: ${m}`.slice(0, 500) } });
        webhook = ` Webhook não cadastrado: ${m}`;
      }
    }
    atualizar();
    return { ok: t.ok, mensagem: `Configuração salva. ${t.mensagem}${webhook}` };
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : String(e) };
  }
}

export async function testarConexao(): Promise<Estado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  const t = await testarInter();
  atualizar();
  return t;
}

export async function removerInter(): Promise<Estado> {
  await exigirUsuario(["ADMIN"]);
  await prisma.integracaoInter.deleteMany({ where: { id: "inter" } });
  atualizar();
  return { ok: true, mensagem: "Integração removida. As transações já importadas continuam na conciliação." };
}
