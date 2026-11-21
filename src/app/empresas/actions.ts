"use server";

import { conferirLimiteEmpresas } from "@/lib/licenca/licenca";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AmbienteFiscal, RegimeTributario } from "@prisma/client";
import { prisma } from "@/lib/db";
import { codigoIbge } from "@/lib/cadastros/municipio";
import { exigirUsuario } from "@/lib/auth/atual";
import { lojasDoUsuario } from "@/lib/empresa/atual";
import { COOKIE_LOJA, limparCacheLojas } from "@/lib/empresa/loja";
import { atribuirSemLoja, conferirIeEmpresa, criarDepositoDaLoja, definirUltimoNumero } from "@/lib/empresa/empresas";
import { buscarDadosCnpj } from "@/lib/cadastros/consultaCnpj";
import { cnpjValido } from "@/lib/cadastros/documentos";
import type { DadosCnpj } from "@/lib/cadastros/tipos";
import type { Certificado } from "@/lib/fiscal/certificado";
import { conferirCnpjCertificado, conferirTls, lerCertificado } from "@/lib/fiscal/certificado";
import { cifrar } from "@/lib/seguranca/segredos";
import { ClienteSefaz } from "@/lib/fiscal/sefaz";
import { certificadoDaEmpresa } from "@/lib/fiscal/certificado";

export type Res = { ok: boolean; mensagem: string; id?: string } | null;
const s = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const msg = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado");
const inteiro = (v: FormDataEntryValue | null) => {
  const t = s(v);
  if (!t) return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0) throw new Error(`Número inválido: ${t}`);
  return n;
};

/** Troca a loja atual (cartão da empresa, no topo do menu). */
export async function trocarLoja(form: FormData) {
  await exigirUsuario();
  const id = s(form.get("lojaId"));
  const lojas = await lojasDoUsuario();
  if (!lojas.some((l) => l.id === id)) throw new Error("Você não tem acesso a esta loja");
  (await cookies()).set(COOKIE_LOJA, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  revalidatePath("/", "layout");
  redirect("/");
}

/** Cadastra ou altera uma empresa (loja): dados, configuração fiscal, certificado A1 e numeração. */
export async function salvarEmpresa(_: Res, form: FormData): Promise<Res> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  let id = s(form.get("id")) || null;
  try {
    const cnpj = s(form.get("cnpj")).replace(/\D/g, "");
    if (cnpj.length !== 14) throw new Error("Informe o CNPJ com 14 dígitos");
    if (!cnpjValido(cnpj)) throw new Error("CNPJ inválido: os dígitos verificadores não conferem");
    const razaoSocial = s(form.get("razaoSocial"));
    if (!razaoSocial) throw new Error("Informe a razão social");
    const ie = s(form.get("ie"));
    const regimeEspecial = Number(form.get("regimeEspecialNfse") || 0);
    const dados = {
      razaoSocial, nomeFantasia: s(form.get("nomeFantasia")) || null, cnpj,
      // "ISENTO" vai como está na NF-e; os demais só com dígitos
      inscricaoEstadual: /^isent/i.test(ie) ? "ISENTO" : ie.replace(/\D/g, "") || null,
      inscricaoMunicipal: s(form.get("im")).replace(/\D/g, "") || null, cnae: s(form.get("cnae")).replace(/\D/g, "") || null,
      regimeTributario: (s(form.get("regime")) || "SIMPLES_NACIONAL") as RegimeTributario,
      logradouro: s(form.get("logradouro")) || null, complemento: s(form.get("complemento")) || null, numero: s(form.get("numero")) || null, bairro: s(form.get("bairro")) || null,
      cidade: s(form.get("cidade")) || null, codigoMunicipio: s(form.get("codigoMunicipio")).replace(/\D/g, "") || null,
      uf: s(form.get("uf")).toUpperCase() || null, cep: s(form.get("cep")).replace(/\D/g, "") || null,
      telefone: s(form.get("telefone")) || null, email: s(form.get("email")) || null,
      ativa: form.get("ativa") !== null || !id,
      ambienteFiscal: (s(form.get("ambiente")) || "HOMOLOGACAO") as AmbienteFiscal,
      ambienteNfse: (s(form.get("ambienteNfse")) || "HOMOLOGACAO") as AmbienteFiscal,
      serieNfe: inteiro(form.get("serieNfe")) || 1, serieNfce: inteiro(form.get("serieNfce")) || 1, serieDps: inteiro(form.get("serieDps")) || 1,
      regimeEspecialNfse: [0, 1, 2, 3, 4, 5, 6, 9].includes(regimeEspecial) ? regimeEspecial : 0,
      cscId: s(form.get("cscId")) || null,
      ...(s(form.get("cscToken")) ? { cscToken: s(form.get("cscToken")) } : {}),
      infCplNfe: s(form.get("infCplNfe")) || null, infCplNfse: s(form.get("infCplNfse")) || null,
    };
    // código IBGE sai da cidade/UF (o campo não aparece na tela)
    if (dados.cidade && dados.uf) dados.codigoMunicipio = (await codigoIbge(dados.cidade, dados.uf)) ?? dados.codigoMunicipio;
    if (dados.codigoMunicipio && dados.codigoMunicipio.length !== 7) throw new Error("Não encontrei a cidade na lista do IBGE: confira o nome da cidade e a UF");

    // certificado A1: confere senha, validade e CNPJ antes de guardar (cifrado)
    const arq = form.get("certificado");
    const senha = String(form.get("certificadoSenha") ?? "");
    let cert: Record<string, unknown> = {};
    if (arq instanceof File && arq.size > 0) {
      if (arq.size > 100_000) throw new Error("Arquivo grande demais para um certificado A1 (.pfx)");
      if (!senha) throw new Error("Informe a senha do certificado");
      const pfx = Buffer.from(await arq.arrayBuffer());
      let lido;
      try {
        lido = lerCertificado(pfx, senha);
      } catch {
        throw new Error("Não foi possível abrir o certificado: confira o arquivo (.pfx/.p12) e a senha");
      }
      conferirCnpjCertificado(lido, cnpj);
      conferirTls(lido);
      if (lido.validoAte < new Date()) throw new Error(`Este certificado venceu em ${lido.validoAte.toLocaleDateString("pt-BR")}`);
      const titular = lerTitular(lido.certificadoPem);
      cert = { certificadoPfx: cifrar(pfx.toString("base64")), certificadoSenha: cifrar(senha), certificadoValidade: lido.validoAte, certificadoTitular: titular };
    }
    if (form.get("removerCertificado") !== null) cert = { certificadoPfx: null, certificadoSenha: null, certificadoValidade: null, certificadoTitular: null };
    // logo da loja (DANFE e impressos): só PNG/JPG, que o gerador de PDF lê
    const arqLogo = form.get("logo");
    if (arqLogo instanceof File && arqLogo.size > 0) {
      if (arqLogo.size > 1_000_000) throw new Error("O logo pode ter até 1 MB");
      const bytes = Buffer.from(await arqLogo.arrayBuffer());
      const png = bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
      if (!png && !jpg) throw new Error("Envie o logo em PNG ou JPG (arquivos .ai/.pdf/.svg precisam ser exportados como PNG)");
      cert = { ...cert, logo: bytes, logoTipo: png ? "image/png" : "image/jpeg" };
    }
    if (form.get("removerLogo") !== null) cert = { ...cert, logo: null, logoTipo: null };

    const primeira = !(await prisma.empresa.count());
    const outra = await prisma.empresa.findUnique({ where: { cnpj } });
    if (outra && outra.id !== id) throw new Error(`O CNPJ já está cadastrado na loja ${outra.nomeFantasia || outra.razaoSocial}`);
    if (!id) await conferirLimiteEmpresas();
    const e = id
      ? await prisma.empresa.update({ where: { id }, data: { ...dados, ...cert } })
      : await prisma.empresa.create({ data: { ...dados, ...cert } });
    id = e.id;

    // a primeira empresa cadastrada fica com tudo o que já existia (vendas, OS, financeiro, estoque…)
    if (primeira) await atribuirSemLoja(e.id);
    await criarDepositoDaLoja(e.id);

    // "última nota emitida": a próxima sai com o número seguinte (continua a numeração do sistema anterior)
    // só o que a pessoa mudou na tela (trocar ambiente/série não leva o número de um para o outro)
    const ultimos: [string, string][] = [["NFE", "ultimaNfe"], ["NFCE", "ultimaNfce"], ["DPS", "ultimaDps"]];
    for (const [tipo, campo] of ultimos) {
      const n = inteiro(form.get(campo));
      if (n != null && n !== inteiro(form.get(`${campo}Antes`))) await definirUltimoNumero(e, tipo as "NFE" | "NFCE" | "DPS", n);
    }

    // certificado novo: confere a inscrição estadual na SEFAZ (corrige se a cadastrada estiver diferente)
    const conferencia = cert.certificadoPfx ? await conferirIeEmpresa(e.id) : null;

    limparCacheLojas();
    revalidatePath("/empresas");
    revalidatePath("/", "layout");
    return { ok: true, mensagem: [primeira ? "Empresa cadastrada. Os registros que já existiam ficaram nesta loja." : "Dados salvos.", conferencia].filter(Boolean).join(" "), id };
  } catch (err) {
    return { ok: false, mensagem: msg(err), id: id ?? undefined };
  }
}

function lerTitular(pem: string) {
  // CN do titular ("EMPRESA LTDA:12345678000195") sem o CNPJ
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const forge = require("node-forge") as typeof import("node-forge");
    const c = forge.pki.certificateFromPem(pem);
    const cn = c.subject.getField("CN")?.value as string | undefined;
    return cn ? cn.replace(/:\d{11,14}$/, "") : null;
  } catch {
    return null;
  }
}

/** Testa o certificado e a comunicação com a SEFAZ desta empresa. */
export async function testarSefaz(_: Res, form: FormData): Promise<Res> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const e = await prisma.empresa.findUniqueOrThrow({ where: { id: s(form.get("id")) } });
    if (!e.uf) throw new Error("Informe a UF da empresa");
    const modelo = Number(form.get("modelo")) === 65 ? 65 : 55;
    const r = await new ClienteSefaz(certificadoDaEmpresa(e), e.uf, e.ambienteFiscal === "PRODUCAO" ? 1 : 2).status(modelo);
    return { ok: r.cStat === "107", mensagem: `SEFAZ-${e.uf} ${modelo === 65 ? "NFC-e" : "NF-e"} (${e.ambienteFiscal === "PRODUCAO" ? "produção" : "homologação"}): ${r.cStat} - ${r.xMotivo}` };
  } catch (err) {
    return { ok: false, mensagem: msg(err) };
  }
}

/**
 * Busca os dados da empresa pelo CNPJ (Receita pela base pública; IE pela SEFAZ com o certificado desta empresa,
 * ou o da loja atual; sem certificado, IE da base pública).
 */
export async function consultarCnpjEmpresa(cnpj: string, id?: string | null): Promise<{ ok: true; dados: DadosCnpj } | { ok: false; mensagem: string }> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const propria = id ? await prisma.empresa.findUnique({ where: { id } }) : null;
    const candidatas = [propria, ...(await lojasDoUsuario())].filter((x): x is NonNullable<typeof x> => !!x);
    let cert: Certificado | null = null;
    for (const c of candidatas) {
      try { cert = certificadoDaEmpresa(c); break; } catch { /* sem certificado nesta: tenta a próxima */ }
    }
    return { ok: true, dados: await buscarDadosCnpj(cnpj, { cert, ufLoja: propria?.uf ?? candidatas[0]?.uf ?? null }) };
  } catch (err) {
    return { ok: false, mensagem: msg(err) };
  }
}
