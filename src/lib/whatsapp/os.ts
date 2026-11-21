import { prisma } from "@/lib/db";
import { empresaDoDocumento } from "@/lib/empresa/atual";
import { baseLinks } from "@/lib/financeiro/boletos";
import { gerarConvite } from "@/lib/portal/sessao";
import { aplicarTags } from "@/lib/orcamentos/tipos";
import { brl, dataSP } from "@/lib/ui/format";
import { TEXTO_PADRAO_OS } from "./tipos";
import { configWhatsapp, enviarWhatsapp, numeroDaPessoa, whatsappAtivo, type TransporteWhatsapp } from "./mxchat";

/**
 * Status da OS por WhatsApp: o atendente manda pela visualização da OS (Compartilhar → WhatsApp pelo MXChat) e o
 * sistema manda sozinho quando a OS entra numa situação marcada com "Enviar mensagem" (Ordens de serviços →
 * Situações), usando o texto de WhatsApp do modelo de mensagem escolhido nela.
 */
type Deps = { transporte?: TransporteWhatsapp; base?: string };

/** Endereço público do sistema para os links (URL_PUBLICA do .env, senão o endereço público do Inter, senão o da requisição). */
async function baseSistema(deps: Deps) {
  if (deps.base) return deps.base.replace(/\/+$/, "");
  const env = process.env.URL_PUBLICA?.trim().replace(/\/+$/, "");
  if (env) return env;
  const inter = await baseLinks();
  if (inter) return inter;
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  } catch { return ""; }
}

/**
 * Monta a mensagem da OS. Com `convidar`, um cliente que ainda não criou a senha da Área do Cliente recebe no
 * [link_area_cliente] o link para criar a senha (vale 7 dias; o link anterior deixa de valer).
 */
export async function mensagemOs(osId: string, opts: Deps & { modeloId?: string | null; texto?: string; convidar?: boolean } = {}) {
  const o = await prisma.ordemServico.findUniqueOrThrow({
    where: { id: osId },
    include: {
      cliente: { select: { id: true, nome: true, fantasia: true, celular: true, telefone: true, documento: true, email: true, portalSenhaHash: true, areaCliente: true } },
      situacaoCfg: { select: { nome: true, modeloMensagemId: true } }, vendedor: { select: { nome: true } }, tecnico: { select: { nome: true } },
      equipamentos: { orderBy: { ordem: "asc" }, select: { equipamento: true, marca: true, modelo: true } },
    },
  });
  const modeloId = opts.modeloId ?? o.situacaoCfg?.modeloMensagemId ?? null;
  const modelo = modeloId
    ? await prisma.modeloMensagem.findUnique({ where: { id: modeloId } })
    : await prisma.modeloMensagem.findFirst({ where: { tipo: "OS", whatsapp: { not: null } }, orderBy: { padrao: "desc" } });
  const base = await baseSistema(opts);
  const emp = await empresaDoDocumento(o.empresaId);
  const temSenha = !!o.cliente.portalSenhaHash;
  let linkArea = `${base}/area-cliente/os/${o.id}`;
  let convite = false;
  const texto = opts.texto ?? (modelo?.whatsapp?.trim() || TEXTO_PADRAO_OS);
  if (!temSenha && opts.convidar && texto.includes("[link_area_cliente]") && (o.cliente.documento || o.cliente.email)) {
    linkArea = `${base}/area-cliente/senha/${await gerarConvite(o.cliente.id)}`;
    convite = true;
  }
  const equip = o.equipamentos.map((e) => [e.equipamento, e.marca, e.modelo].filter(Boolean).join(" ")).filter(Boolean).join(", ");
  const tags: Record<string, string> = {
    nome_cliente: o.cliente.fantasia || o.cliente.nome, numero: String(o.numero), situacao: o.situacaoCfg?.nome ?? o.situacao,
    valor_total: brl(o.total), data: dataSP(o.entrada), equipamento: equip || "-", tecnico: o.tecnico?.nome ?? "", vendedor: o.vendedor?.nome ?? "",
    link: `${base}/cobranca/os/${o.token}`, link_area_cliente: linkArea, nome_empresa: emp?.nomeFantasia || emp?.razaoSocial || "",
  };
  return { os: o, numero: numeroDaPessoa(o.cliente), texto: aplicarTags(texto, tags), modelo: texto, temSenha, convite };
}

/** Manda a mensagem da OS (já montada ou editada pelo atendente) e anota no histórico da OS. */
export async function enviarWhatsappOs(osId: string, d: { numero: string; texto: string; usuarioNome?: string | null; automatica?: boolean }, deps: Deps = {}) {
  const o = await prisma.ordemServico.findUniqueOrThrow({ where: { id: osId }, select: { id: true, clienteId: true, situacaoCfg: { select: { nome: true } } } });
  const m = await enviarWhatsapp({ numero: d.numero, texto: d.texto, entidade: "OS", entidadeId: o.id, pessoaId: o.clienteId, automatica: d.automatica, usuarioNome: d.usuarioNome }, deps);
  await prisma.osHistorico.create({
    data: { osId, descricao: `${d.automatica ? "Aviso automático" : "Mensagem"} enviado por WhatsApp para ${m.numero}`, situacao: o.situacaoCfg?.nome ?? null, usuarioNome: d.usuarioNome ?? null },
  });
  return m;
}

/**
 * Aviso automático ao trocar de situação: só se a situação nova tem "Enviar mensagem", o WhatsApp está ligado e a
 * situação mudou de fato. Nunca lança erro (a troca de situação já foi feita); devolve um texto curto para a tela.
 */
export async function avisoAutomaticoOs(osId: string, situacaoAntes: string | null | undefined, u: { nome?: string | null } = {}, deps: Deps = {}): Promise<string> {
  try {
    const o = await prisma.ordemServico.findUnique({ where: { id: osId }, select: { situacaoId: true, situacaoCfg: { select: { enviarMensagem: true } } } });
    if (!o || o.situacaoId === situacaoAntes || !o.situacaoCfg?.enviarMensagem) return "";
    if (!(await whatsappAtivo())) return "";
    const cfg = await configWhatsapp();
    const m = await mensagemOs(osId, { ...deps, convidar: cfg.convidarAreaCliente });
    if (!m.numero) {
      await prisma.mensagemWhatsapp.create({ data: { numero: m.os.cliente.celular ?? "", texto: m.texto, entidade: "OS", entidadeId: osId, pessoaId: m.os.cliente.id, situacao: "ERRO", erro: "O cliente não tem celular no cadastro", automatica: true, usuarioNome: u.nome ?? null } });
      return "Aviso por WhatsApp não enviado: o cliente não tem celular no cadastro.";
    }
    await enviarWhatsappOs(osId, { numero: m.numero, texto: m.texto, usuarioNome: u.nome, automatica: true }, deps);
    return "Cliente avisado por WhatsApp.";
  } catch (e) {
    return `Aviso por WhatsApp não enviado: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * Envio pela tela: o texto já vem montado (e talvez editado). Com `convidar`, troca o link da OS na Área do Cliente
 * pelo link de criar a senha (para cliente que ainda não tem acesso).
 */
export async function enviarWhatsappOsTela(osId: string, d: { numero: string; texto: string; convidar?: boolean; usuarioNome?: string | null }, deps: Deps = {}) {
  let texto = d.texto;
  if (d.convidar) {
    const o = await prisma.ordemServico.findUniqueOrThrow({ where: { id: osId }, select: { cliente: { select: { id: true, documento: true, email: true } } } });
    if (!o.cliente.documento && !o.cliente.email) throw new Error("Para mandar o link de acesso, cadastre o CPF/CNPJ ou o e-mail do cliente: é com ele que o cliente entra.");
    const base = await baseSistema(deps);
    const convite = `${base}/area-cliente/senha/${await gerarConvite(o.cliente.id)}`;
    const linkOs = `${base}/area-cliente/os/${osId}`;
    texto = texto.includes(linkOs) ? texto.split(linkOs).join(convite) : `${texto.trimEnd()}\n\nCrie a sua senha da Área do Cliente: ${convite}`;
  }
  return enviarWhatsappOs(osId, { numero: d.numero, texto, usuarioNome: d.usuarioNome }, deps);
}
