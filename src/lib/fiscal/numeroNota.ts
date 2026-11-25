/** Número que o usuário vê: na NFS-e é o número da nota (prefeitura/Sefin); a DPS/RPS fica para consulta interna. */
export function numeroDaNota(n: { modelo: string; numero: number; numeroNfse?: number | null }) {
  return n.modelo === "NFSE" && n.numeroNfse ? n.numeroNfse : n.numero;
}

/** O número da NFS-e no XML autorizado (<nNFSe>), ou null. */
export function numeroNfseDoXml(xml: string | null | undefined) {
  const m = xml?.match(/<nNFSe>\s*(\d+)\s*<\/nNFSe>/);
  return m ? Number(m[1]) : null;
}
