"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { ESCOPO_EXTRATO, lerArquivosInter, testarInter } from "@/lib/financeiro/inter";
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
    const escopos = str(form.get("escopos")).split(/[\s,;]+/).filter(Boolean).join(" ") || ESCOPO_EXTRATO;
    const contaBancariaId = str(form.get("contaBancariaId")) || null;
    const arquivos = await Promise.all(
      form.getAll("arquivos").filter((f): f is File => f instanceof File && f.size > 0)
        .map(async (f) => ({ nome: f.name, bytes: Buffer.from(await f.arrayBuffer()) })),
    );
    if (!clientId) return { ok: false, mensagem: "Informe o Client ID" };
    if (!clientSecret && !atual) return { ok: false, mensagem: "Informe o Client Secret" };
    if (!escopos.split(" ").includes(ESCOPO_EXTRATO)) return { ok: false, mensagem: `Os escopos precisam incluir ${ESCOPO_EXTRATO} (consultar extrato e saldo)` };

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
      certificado: cert, chaveCifrada: cifrar(key),
      clientSecretCifrado: clientSecret ? cifrar(clientSecret) : atual!.clientSecretCifrado,
    };
    await prisma.integracaoInter.upsert({ where: { id: "inter" }, create: { id: "inter", ...dados }, update: dados });
    const t = await testarInter();
    atualizar();
    return { ok: t.ok, mensagem: `Configuração salva. ${t.mensagem}` };
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
