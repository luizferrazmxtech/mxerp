/** Só caminhos internos ("/os/…"): nada de "//site", "http:" ou "\" (redirecionamento aberto). */
export function destinoSeguro(ir: string | null | undefined): string {
  if (!ir || !ir.startsWith("/") || ir.startsWith("//") || ir.includes("\\") || /[\r\n]/.test(ir)) return "/";
  return ir;
}

/** Link que troca para a empresa do documento antes de abri-lo (documento de outra empresa do grupo). */
export const linkNaEmpresa = (empresaId: string, href: string) =>
  `/api/loja/abrir?${new URLSearchParams({ loja: empresaId, ir: href })}`;
