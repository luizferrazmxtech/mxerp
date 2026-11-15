/** Mini construtor de XML com ordem de elementos explícita (o XSD da SEFAZ exige a ordem). */

export type No = string | null | undefined | false;

export function esc(v: string | number): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Remove acentos/caracteres fora do aceito pela SEFAZ e espaços duplicados. */
export function limpar(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** <tag>valor</tag>; omitido se valor for vazio/undefined. */
export function t(tag: string, valor: string | number | null | undefined): string {
  if (valor === undefined || valor === null || valor === "") return "";
  return `<${tag}>${esc(typeof valor === "string" ? limpar(valor) : valor)}</${tag}>`;
}

/** <tag attrs>filhos</tag>; omitido se não houver filhos. */
export function g(tag: string, filhos: No[] | No, attrs?: Record<string, string | number>): string {
  const conteudo = (Array.isArray(filhos) ? filhos : [filhos]).filter(Boolean).join("");
  if (!conteudo) return "";
  const a = attrs ? Object.entries(attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join("") : "";
  return `<${tag}${a}>${conteudo}</${tag}>`;
}

export const dec = (v: number, casas = 2) => (Math.round(v * 10 ** casas) / 10 ** casas).toFixed(casas);
export const so = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/** Data/hora no formato AAAA-MM-DDThh:mm:ss-03:00 (horário de Brasília). */
export function dataHoraTz(d: Date = new Date()): string {
  const local = new Date(d.getTime() - 3 * 3600000);
  return local.toISOString().slice(0, 19) + "-03:00";
}
