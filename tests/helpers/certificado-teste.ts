import forge from "node-forge";

/** Gera um .pfx autoassinado só para testes (não serve para a SEFAZ). */
export function pfxDeTeste(cnpj = "12345678000195", senha = "teste") {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400000);
  const attrs = [{ name: "commonName", value: `EMPRESA TESTE LTDA:${cnpj}` }, { name: "countryName", value: "BR" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha, { algorithm: "3des" });
  return { pfx: Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary"), senha };
}
