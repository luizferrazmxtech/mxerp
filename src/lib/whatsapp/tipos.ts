/** Textos e tags do WhatsApp que também rodam no navegador (sem banco). */
export const TEXTO_PADRAO_OS =
  "Olá, [nome_cliente]!\n\nA sua ordem de serviço nº [numero] está agora: *[situacao]*.\n\n" +
  "Acompanhe os detalhes, fotos e documentos pela Área do Cliente:\n[link_area_cliente]\n\n[nome_empresa]";

export const TAGS_WHATSAPP_OS = ["[nome_cliente]", "[numero]", "[situacao]", "[valor_total]", "[data]", "[equipamento]", "[tecnico]", "[vendedor]", "[link]", "[link_area_cliente]", "[nome_empresa]"];

/** 5511987654321 → (11) 98765-4321 (para mostrar na tela). */
export function foneBonitoTela(n: string) {
  const m = n.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : n;
}
