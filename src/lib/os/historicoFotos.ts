/**
 * Liga cada "Foto da instalação anexada" do histórico à foto (Anexo OS_FOTO) gravada na mesma hora.
 * A foto e a linha do histórico são criadas na mesma transação (anexarFoto), então a mais próxima
 * em até 2 minutos é a dela. Funciona para as fotos antigas também, sem campo novo no banco.
 */
export const FOTO_ANEXADA = "Foto da instalação anexada";
const JANELA_MS = 120_000;

export function fotosDoHistorico<H extends { id: string; descricao: string; createdAt: Date }>(
  historico: readonly H[],
  fotos: readonly { id: string; createdAt: Date }[],
): Map<string, string> {
  const livres = new Set(fotos.map((f) => f.id));
  const porId = new Map(fotos.map((f) => [f.id, f]));
  const res = new Map<string, string>();
  const entradas = [...historico].filter((h) => h.descricao.startsWith(FOTO_ANEXADA)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const h of entradas) {
    let melhor: string | null = null, dist = Infinity;
    for (const id of livres) {
      const d = Math.abs(porId.get(id)!.createdAt.getTime() - h.createdAt.getTime());
      if (d <= JANELA_MS && d < dist) { melhor = id; dist = d; }
    }
    if (melhor) { res.set(h.id, melhor); livres.delete(melhor); }
  }
  return res;
}
