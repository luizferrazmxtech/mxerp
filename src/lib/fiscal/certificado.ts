import fs from "node:fs";
import forge from "node-forge";

export type Certificado = {
  pfx: Buffer;
  senha: string;
  chavePrivadaPem: string;
  certificadoPem: string;
  /** certificado em base64 sem cabeçalho, para o <X509Certificate> */
  certificadoB64: string;
  cnpj: string | null;
  validoAte: Date;
};

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
