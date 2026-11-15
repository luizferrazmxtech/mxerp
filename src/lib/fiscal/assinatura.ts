import { SignedXml } from "xml-crypto";
import type { Certificado } from "./certificado";

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";

/**
 * Assina um elemento (infNFe, infEvento, infInut, infDPS...) no padrão da
 * SEFAZ: RSA-SHA1, C14N, transform enveloped. A <Signature> vai como último
 * filho do elemento pai indicado.
 */
export function assinarXml(
  xml: string,
  cert: Certificado,
  opts: { tag: string; pai: string; sha256?: boolean },
): string {
  const sig = new SignedXml({
    privateKey: cert.chavePrivadaPem,
    publicCert: cert.certificadoPem,
    canonicalizationAlgorithm: C14N,
    signatureAlgorithm: opts.sha256
      ? "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"
      : "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    getKeyInfoContent: () => `<X509Data><X509Certificate>${cert.certificadoB64}</X509Certificate></X509Data>`,
  });
  sig.addReference({
    xpath: `//*[local-name(.)='${opts.tag}']`,
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", C14N],
    digestAlgorithm: opts.sha256 ? "http://www.w3.org/2001/04/xmlenc#sha256" : "http://www.w3.org/2000/09/xmldsig#sha1",
  });
  sig.computeSignature(xml, {
    location: { reference: `//*[local-name(.)='${opts.pai}']`, action: "append" },
  });
  return sig.getSignedXml();
}

/** Confere uma assinatura (usado em testes e para validar XML recebido). */
export function verificarAssinatura(xml: string, certificadoPem: string): boolean {
  const doc = xml;
  const m = doc.match(/<Signature[\s\S]*?<\/Signature>/);
  if (!m) return false;
  const sig = new SignedXml({ publicCert: certificadoPem });
  sig.loadSignature(m[0]);
  return sig.checkSignature(doc);
}
