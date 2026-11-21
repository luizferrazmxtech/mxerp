import { prisma } from "@/lib/db";

/** Configurações dos contratos (Contratos → Configurações). */
export type ConfigContratos = {
  situacaoVendaId: string; // situação da venda gerada (precisa lançar o financeiro)
  diasAntecedencia: number; diasLembrete: number; // padrões do formulário
  assuntoBoleto: string; textoBoleto: string;
  assuntoLembrete: string; textoLembrete: string;
  whatsBoleto: string; whatsLembrete: string; // textos do WhatsApp (MXChat); o boleto vai em PDF junto
};

export const PADRAO_CONTRATOS: ConfigContratos = {
  situacaoVendaId: "", diasAntecedencia: 10, diasLembrete: 3,
  assuntoBoleto: "[nome_empresa] - Cobrança [referencia] - contrato nº [numero_contrato]",
  textoBoleto:
    "Olá, [nome_cliente]!\n\nSegue a cobrança referente a [referencia] do contrato nº [numero_contrato].\n\n" +
    "Valor: R$ [valor]\nVencimento: [vencimento]\n\nLinha digitável do boleto: [linha_digitavel]\nPix copia e cola: [pix_copia_cola]\n\n" +
    "O boleto também vai em anexo. Qualquer dúvida, é só responder este e-mail.\n\nObrigado,\n[nome_empresa]",
  assuntoLembrete: "[nome_empresa] - Lembrete: vencimento em [vencimento]",
  textoLembrete:
    "Olá, [nome_cliente]!\n\nPassando para lembrar que a cobrança de [referencia] do contrato nº [numero_contrato], no valor de R$ [valor], vence em [vencimento].\n\n" +
    "Linha digitável do boleto: [linha_digitavel]\nPix copia e cola: [pix_copia_cola]\n\nSe já pagou, por favor desconsidere esta mensagem.\n\nObrigado,\n[nome_empresa]",
  whatsBoleto:
    "Olá, [nome_cliente]! Segue a cobrança de *[referencia]* do contrato nº [numero_contrato].\n\n" +
    "Valor: *R$ [valor]*\nVencimento: *[vencimento]*\n\nO boleto vai em anexo. Linha digitável:\n[linha_digitavel]\n\nPix copia e cola:\n[pix_copia_cola]\n\n[nome_empresa]",
  whatsLembrete:
    "Olá, [nome_cliente]! Passando para lembrar que a cobrança de *[referencia]* (contrato nº [numero_contrato]), no valor de *R$ [valor]*, vence em *[vencimento]*.\n\n" +
    "Pix copia e cola:\n[pix_copia_cola]\n\nSe já pagou, por favor desconsidere esta mensagem.\n[nome_empresa]",
};

export async function configContratos(): Promise<ConfigContratos> {
  const c = await prisma.configuracao.findUnique({ where: { chave: "contratos" } });
  return { ...PADRAO_CONTRATOS, ...((c?.valor ?? {}) as Partial<ConfigContratos>) };
}

export async function salvarConfigContratos(v: ConfigContratos) {
  await prisma.configuracao.upsert({ where: { chave: "contratos" }, create: { chave: "contratos", valor: v }, update: { valor: v } });
}

/** Situação usada nas vendas geradas: a configurada, senão a "concretizada" (lança o financeiro e permite a NFS-e). */
export async function situacaoVendaContrato(cfg?: ConfigContratos) {
  cfg ??= await configContratos();
  const conf = cfg.situacaoVendaId ? await prisma.situacaoVendaConfig.findUnique({ where: { id: cfg.situacaoVendaId } }) : null;
  if (conf) return conf;
  const s = await prisma.situacaoVendaConfig.findFirst({ where: { estoque: "LANCAR", financeiro: true }, orderBy: [{ padrao: "desc" }, { ordem: "asc" }] });
  if (!s) throw new Error("Cadastre uma situação de venda que lance o financeiro (ex.: Concretizada)");
  return s;
}
