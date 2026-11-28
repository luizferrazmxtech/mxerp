/** Número que o usuário vê: na NFS-e é o número da nota (prefeitura/Sefin); a DPS/RPS fica para consulta interna. */
export function numeroDaNota(n: { modelo: string; numero: number; numeroNfse?: number | null }) {
  return n.modelo === "NFSE" && n.numeroNfse ? n.numeroNfse : n.numero;
}

/** O número da NFS-e no XML autorizado (<nNFSe>), ou null. */
export function numeroNfseDoXml(xml: string | null | undefined) {
  const m = xml?.match(/<nNFSe>\s*(\d+)\s*<\/nNFSe>/);
  return m ? Number(m[1]) : null;
}

/** Nome do tipo da nota, igual em todas as telas. */
export const tipoNota = (modelo: string) => (modelo === "NFSE" ? "NFS-e" : modelo === "NFCE" ? "NFC-e" : "NF-e");

/** Como a nota aparece em todas as telas: "NF-e nº 1234", "NFC-e nº 56", "NFS-e nº 271" (número da nota, não da DPS). */
export const rotuloNota = (n: { modelo: string; numero: number; numeroNfse?: number | null }) => `${tipoNota(n.modelo)} nº ${numeroDaNota(n)}`;
