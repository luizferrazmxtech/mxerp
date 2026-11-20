import fs from "node:fs";
import tls from "node:tls";
import path from "node:path";
import forge from "node-forge";
import { decifrar } from "@/lib/seguranca/segredos";

export type Certificado = {
  pfx: Buffer;
  senha: string;
  chavePrivadaPem: string;
  certificadoPem: string;
  /** titular + cadeia, em PEM: usado na conexão TLS (não depende do formato do .pfx) */
  cadeiaPem: string;
  /** certificado em base64 sem cabeçalho, para o <X509Certificate> */
  certificadoB64: string;
  cnpj: string | null;
  validoAte: Date;
};

/**
 * Opções TLS do certificado para a SEFAZ e a NFS-e Nacional. Usa a chave e os certificados já abertos (PEM)
 * em vez do .pfx: o OpenSSL 3 do Node recusa .pfx antigos (RC2/3DES) com "Unsupported PKCS12 PFX data".
 */
export function opcoesTls(cert: Pick<Certificado, "chavePrivadaPem" | "cadeiaPem">) {
  return { key: cert.chavePrivadaPem, cert: cert.cadeiaPem };
}

/** Confere se o certificado serve para abrir a conexão segura (antes de gastar um número de nota). */
export function conferirTls(cert: Pick<Certificado, "chavePrivadaPem" | "cadeiaPem">) {
  try {
    tls.createSecureContext(opcoesTls(cert));
  } catch (e) {
    throw new Error(`O certificado não pode ser usado na conexão com a SEFAZ: ${(e as Error).message}`);
  }
}

let cacheCa: string[] | null = null;
/**
 * Autoridades confiáveis para a SEFAZ e a NFS-e Nacional: as do Node (Mozilla) + a cadeia ICP-Brasil
 * (ca-icp-brasil/icp-brasil.pem, do site do ITI), que os servidores da SEFAZ usam e o Node não conhece.
 * SEFAZ_CA_FILE acrescenta outro .pem, se precisar. A verificação do servidor continua ligada.
 */
export function autoridadesSefaz(): string[] {
  if (cacheCa) return cacheCa;
  const extras = [path.join(process.cwd(), "ca-icp-brasil", "icp-brasil.pem"), process.env.SEFAZ_CA_FILE]
    .filter((f): f is string => !!f && fs.existsSync(f))
    .map((f) => fs.readFileSync(f, "utf8"));
  cacheCa = [...tls.rootCertificates, ...extras];
  return cacheCa;
}

/** Erro antes de qualquer dado chegar à SEFAZ (certificado, rede, endereço): a nota com certeza não foi enviada. */
export class NaoEnviadoError extends Error {}

/** Lê um certificado A1 (.pfx/.p12). */
export function lerCertificado(pfx: Buffer, senha: string): Certificado {
  const asn1 = forge.asn1.fromDer(pfx.toString("binary"));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
  const keyBag =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  if (!keyBag?.key || !certBags.length) throw new Error("Certificado sem chave privada ou sem certificado");
  // o certificado do titular é o que não é emissor de nenhum outro da cadeia
  const certs = certBags.map((b) => b.cert!).filter(Boolean);
  const titular = certs.find((c) => !certs.some((o) => o !== c && o.issuer.hash === c.subject.hash)) ?? certs[0];
  const certificadoPem = forge.pki.certificateToPem(titular);
  const cnpjAttr = titular.subject.attributes.find((a) => typeof a.value === "string" && /:\d{14}$/.test(a.value as string));
  return {
    pfx,
    senha,
    chavePrivadaPem: forge.pki.privateKeyToPem(keyBag.key),
    certificadoPem,
    cadeiaPem: [titular, ...certs.filter((c) => c !== titular)].map((c) => forge.pki.certificateToPem(c)).join(""),
    certificadoB64: certificadoPem.replace(/-----(BEGIN|END) CERTIFICATE-----|\s/g, ""),
    cnpj: cnpjAttr ? String(cnpjAttr.value).slice(-14) : null,
    validoAte: titular.validity.notAfter,
  };
}

/**
 * Carrega o certificado configurado no servidor:
 *   CERTIFICADO_A1_PATH  caminho do .pfx
 *   CERTIFICADO_A1_SENHA senha
 * A senha fica só no ambiente do servidor, nunca no banco.
 */
let cache: Certificado | null = null;
export function certificadoDoAmbiente(): Certificado {
  if (cache) return cache;
  const path = process.env.CERTIFICADO_A1_PATH;
  const senha = process.env.CERTIFICADO_A1_SENHA;
  if (!path || senha === undefined) throw new Error("Configure CERTIFICADO_A1_PATH e CERTIFICADO_A1_SENHA no servidor");
  cache = lerCertificado(fs.readFileSync(path), senha);
  return cache;
}

/** Há um .pfx no servidor (CERTIFICADO_A1_PATH apontando para um arquivo que existe)? */
export function temCertificadoServidor() {
  const p = process.env.CERTIFICADO_A1_PATH;
  return !!p && fs.existsSync(p);
}

const cacheEmpresa = new Map<string, { chave: string; cert: Certificado }>();

/** Confere se o certificado é do CNPJ (mesma raiz de 8 dígitos: o da matriz assina pelas filiais). */
export function conferirCnpjCertificado(cert: Pick<Certificado, "cnpj">, cnpj: string) {
  if (cert.cnpj && cert.cnpj.slice(0, 8) !== cnpj.replace(/\D/g, "").slice(0, 8))
    throw new Error(`O certificado é do CNPJ ${cert.cnpj}, não da empresa ${cnpj}. Envie o certificado A1 desta empresa.`);
}

/**
 * Certificado A1 da empresa emitente: o enviado em Configurações › Empresas (guardado cifrado no banco)
 * ou, se ela não tiver, o do servidor (CERTIFICADO_A1_PATH), desde que seja do mesmo CNPJ.
 */
export function certificadoDaEmpresa(e: { id: string; cnpj: string; certificadoPfx: string | null; certificadoSenha: string | null; updatedAt: Date }): Certificado {
  if (e.certificadoPfx && e.certificadoSenha) {
    const chave = `${e.updatedAt.getTime()}:${e.certificadoPfx.length}`;
    const c = cacheEmpresa.get(e.id);
    if (c && c.chave === chave) return c.cert;
    const cert = lerCertificado(Buffer.from(decifrar(e.certificadoPfx), "base64"), decifrar(e.certificadoSenha));
    cacheEmpresa.set(e.id, { chave, cert });
    return cert;
  }
  if (!temCertificadoServidor()) throw new Error("Envie o certificado A1 desta empresa em Configurações › Empresas (lojas)");
  const cert = certificadoDoAmbiente();
  conferirCnpjCertificado(cert, e.cnpj);
  return cert;
}
