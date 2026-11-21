/** Formatação usada pela Área do Cliente (roda no servidor e no navegador). */
export const documentoFmt = (d: string) =>
  d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
    : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : d;

export const MODELO_NOTA: Record<string, string> = { NFE: "NF-e", NFCE: "NFC-e", NFSE: "NFS-e" };
