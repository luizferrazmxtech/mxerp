"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { exigirAdmin } from "@/lib/auth";
import { pedir } from "@/lib/tarefas";
import { ler, salvar } from "@/lib/config";
import { diaSP } from "@/lib/datas";
import { cancelarBoleto, emitirBoleto, registrarWebhook, salvarInter, testarInter, atualizarBoleto } from "@/lib/inter";
import { salvarSmtp, enviarEmail } from "@/lib/email";
import { processar } from "@/lib/faturas";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(txt(f, k).replace(/\./g, "").replace(",", ".")) || 0;
const opc = (f: FormData, k: string) => txt(f, k) || null;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
function voltar(caminho: string, r: { ok?: string; erro?: string }): never {
  const q = new URLSearchParams(r.ok ? { ok: r.ok } : { erro: r.erro ?? "" });
  redirect(`${caminho}${caminho.includes("?") ? "&" : "?"}${q}`);
}

// ---------- planos

export async function salvarPlano(f: FormData) {
  await exigirAdmin();
  const id = txt(f, "id");
  const dados = { nome: txt(f, "nome"), descricao: opc(f, "descricao"), valorMensal: num(f, "valorMensal"), maxEmpresas: Math.max(1, Math.trunc(num(f, "maxEmpresas"))), maxUsuarios: Math.max(1, Math.trunc(num(f, "maxUsuarios"))), ativo: f.get("ativo") === "on" };
  if (!dados.nome) voltar("/planos", { erro: "Informe o nome do plano" });
  try {
    if (id) await prisma.plano.update({ where: { id }, data: dados });
    else await prisma.plano.create({ data: dados });
  } catch (e) { voltar("/planos", { erro: msg(e).includes("Unique") ? "Já existe um plano com esse nome" : msg(e) }); }
  revalidatePath("/planos");
  voltar("/planos", { ok: "Plano salvo" });
}

// ---------- clientes

const SLUG = /^[a-z][a-z0-9]{1,29}$/;
const DOMINIO = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

function dadosCliente(f: FormData) {
  const documento = txt(f, "documento").replace(/\D/g, "");
  return {
    nome: txt(f, "nome"), documento, email: txt(f, "email").toLowerCase(), telefone: opc(f, "telefone"),
    logradouro: opc(f, "logradouro"), numero: opc(f, "numero"), complemento: opc(f, "complemento"), bairro: opc(f, "bairro"),
    cidade: opc(f, "cidade"), uf: opc(f, "uf")?.toUpperCase() ?? null, cep: opc(f, "cep")?.replace(/\D/g, "") ?? null,
    planoId: txt(f, "planoId"), valorMensal: txt(f, "valorMensal") ? num(f, "valorMensal") : null,
    maxEmpresas: txt(f, "maxEmpresas") ? Math.trunc(num(f, "maxEmpresas")) : null, maxUsuarios: txt(f, "maxUsuarios") ? Math.trunc(num(f, "maxUsuarios")) : null,
    diaVencimento: Math.min(28, Math.max(1, Math.trunc(num(f, "diaVencimento")) || 10)),
    inicioCobranca: new Date(`${txt(f, "inicioCobranca") || diaSP().toISOString().slice(0, 10)}T00:00:00Z`),
    observacoes: opc(f, "observacoes"),
  };
}

function validar(d: ReturnType<typeof dadosCliente>) {
  if (!d.nome) return "Informe o nome";
  if (!(d.documento.length === 11 || d.documento.length === 14)) return "CPF/CNPJ inválido";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return "E-mail inválido";
  if (!d.planoId) return "Escolha o plano";
  return null;
}

export async function criarCliente(f: FormData) {
  const admin = await exigirAdmin();
  const slug = txt(f, "slug").toLowerCase();
  const dominio = txt(f, "dominio").toLowerCase();
  const d = dadosCliente(f);
  const erro = !SLUG.test(slug) ? "Nome interno: só letras minúsculas e números, começando com letra (ex.: jtecobio)"
    : ["mxtech", "central", "postgres"].includes(slug) ? "Esse nome interno é reservado"
    : !DOMINIO.test(dominio) ? "Endereço inválido (ex.: jtecobio.mxerp.com.br)" : validar(d);
  if (erro) voltar("/clientes/novo", { erro });
  let id = "";
  try {
    const c = await prisma.cliente.create({ data: { ...d, slug, dominio, licencaToken: randomBytes(32).toString("base64url") } });
    id = c.id;
    await pedir("CRIAR", c.id, { slug, dominio, token: c.licencaToken, horarios: c.backupHorarios }, admin.email);
  } catch (e) { voltar("/clientes/novo", { erro: msg(e).includes("Unique") ? "Já existe cliente com esse nome interno" : msg(e) }); }
  voltar(`/clientes/${id}`, { ok: "Cliente cadastrado. A VPS está criando o banco e o sistema (leva uns 2 minutos)." });
}

export async function salvarCliente(f: FormData) {
  await exigirAdmin();
  const id = txt(f, "id");
  const d = dadosCliente(f);
  const erro = validar(d);
  if (erro) voltar(`/clientes/${id}?aba=dados`, { erro });
  await prisma.cliente.update({ where: { id }, data: d });
  // faturas em aberto ainda sem boleto acompanham o valor novo
  const valor = d.valorMensal ?? Number((await prisma.plano.findUniqueOrThrow({ where: { id: d.planoId } })).valorMensal);
  await prisma.fatura.updateMany({ where: { clienteId: id, situacao: "ABERTA", codigoSolicitacao: null }, data: { valor } });
  voltar(`/clientes/${id}?aba=dados`, { ok: "Dados salvos" });
}

export async function acaoCliente(f: FormData) {
  const admin = await exigirAdmin();
  const id = txt(f, "id"), acao = txt(f, "acao");
  const c = await prisma.cliente.findUniqueOrThrow({ where: { id } });
  const aqui = `/clientes/${id}`;
  switch (acao) {
    case "suspender":
      await prisma.cliente.update({ where: { id }, data: { situacao: "SUSPENSO" } });
      await pedir("SUSPENDER", id, { slug: c.slug }, admin.email);
      voltar(aqui, { ok: "Suspensão pedida à VPS. Os dados ficam guardados." });
    case "reativar":
      await prisma.cliente.update({ where: { id }, data: { situacao: "ATIVO" } });
      await pedir("REATIVAR", id, { slug: c.slug }, admin.email);
      voltar(aqui, { ok: "Reativação pedida à VPS." });
    case "cancelar":
      await prisma.cliente.update({ where: { id }, data: { situacao: "CANCELADO" } });
      await prisma.fatura.updateMany({ where: { clienteId: id, situacao: "ABERTA", codigoSolicitacao: null }, data: { situacao: "CANCELADA" } });
      await pedir("BACKUP", id, { slug: c.slug }, admin.email);
      await pedir("SUSPENDER", id, { slug: c.slug }, admin.email);
      voltar(aqui, { ok: "Cliente cancelado: fiz um backup final e tirei do ar. Boletos já emitidos continuam válidos; cancele-os em Mensalidades se quiser." });
    case "liberar": {
      const dias = Math.min(60, Math.max(1, Math.trunc(num(f, "dias")) || 5));
      const ate = new Date(diaSP().getTime() + dias * 86400000);
      await prisma.cliente.update({ where: { id }, data: { liberadoAte: ate } });
      voltar(aqui, { ok: `Liberado por ${dias} dia(s) mesmo com atraso.` });
    }
    case "retirar-liberacao":
      await prisma.cliente.update({ where: { id }, data: { liberadoAte: null } });
      voltar(aqui, { ok: "Liberação retirada." });
    case "recriar":
      await pedir("CRIAR", id, { slug: c.slug, dominio: c.dominio, token: c.licencaToken, horarios: c.backupHorarios }, admin.email);
      voltar(aqui, { ok: "Pedido de criação reenviado à VPS." });
    case "dominio": {
      const dominio = txt(f, "dominio").toLowerCase();
      if (!DOMINIO.test(dominio)) voltar(aqui, { erro: "Endereço inválido" });
      await prisma.cliente.update({ where: { id }, data: { dominio } });
      await pedir("DOMINIO", id, { slug: c.slug, dominio }, admin.email);
      voltar(aqui, { ok: "Endereço novo pedido à VPS. Aponte o DNS para o IP da VPS antes." });
    }
  }
  voltar(aqui, { erro: "Ação desconhecida" });
}

// ---------- backups

export async function backupAgora(f: FormData) {
  const admin = await exigirAdmin();
  const c = await prisma.cliente.findUniqueOrThrow({ where: { id: txt(f, "id") } });
  await pedir("BACKUP", c.id, { slug: c.slug }, admin.email);
  voltar(`/clientes/${c.id}?aba=backups`, { ok: "Backup pedido. Atualize a página em instantes." });
}

export async function salvarHorarios(f: FormData) {
  const admin = await exigirAdmin();
  const c = await prisma.cliente.findUniqueOrThrow({ where: { id: txt(f, "id") } });
  const hs = [...new Set(f.getAll("horario").map(String).filter((h) => /^\d{2}:\d{2}$/.test(h)).map((h) => h.replace(":", "")))].sort();
  if (!hs.length || hs.some((h) => Number(h.slice(0, 2)) > 23 || Number(h.slice(2)) > 59)) voltar(`/clientes/${c.id}?aba=backups`, { erro: "Informe pelo menos um horário válido" });
  const horarios = hs.join(",");
  await prisma.cliente.update({ where: { id: c.id }, data: { backupHorarios: horarios } });
  await pedir("HORARIOS", c.id, { slug: c.slug, horarios }, admin.email);
  voltar(`/clientes/${c.id}?aba=backups`, { ok: "Horários salvos" });
}

export async function restaurar(f: FormData) {
  const admin = await exigirAdmin();
  const c = await prisma.cliente.findUniqueOrThrow({ where: { id: txt(f, "id") } });
  const arquivo = txt(f, "arquivo");
  if (txt(f, "confirmacao") !== c.slug) voltar(`/clientes/${c.id}?aba=backups`, { erro: `Para restaurar, digite o nome interno do cliente (${c.slug}) na confirmação` });
  if (!/^[a-z0-9]+-\d{8}-\d{4}-[a-z-]+\.dump$/.test(arquivo) || !arquivo.startsWith(`${c.slug}-`)) voltar(`/clientes/${c.id}?aba=backups`, { erro: "Arquivo inválido" });
  await pedir("RESTAURAR", c.id, { slug: c.slug, arquivo }, admin.email);
  voltar(`/clientes/${c.id}?aba=backups`, { ok: `Restauração de ${arquivo} pedida. A VPS guarda o estado atual antes.` });
}

// ---------- versão nova

export async function atualizarTodos() {
  const admin = await exigirAdmin();
  await pedir("ATUALIZAR_TODOS", null, {}, admin.email);
  voltar("/tarefas", { ok: "Atualização pedida: backup de todos, MXTECH primeiro, depois cada cliente." });
}

// ---------- faturas

export async function acaoFatura(f: FormData) {
  await exigirAdmin();
  const id = txt(f, "id"), acao = txt(f, "acao");
  const volta = txt(f, "volta") || "/faturas";
  try {
    if (acao === "emitir") await emitirBoleto(id);
    else if (acao === "consultar") await atualizarBoleto(id);
    else if (acao === "pagar") {
      await cancelarBoleto(id, "Recebido por outro meio").catch(() => {});
      await prisma.fatura.update({ where: { id }, data: { situacao: "PAGA", pagaEm: diaSP(), valorPago: undefined, formaPagamento: "MANUAL" } });
    } else if (acao === "cancelar") {
      await cancelarBoleto(id, "Mensalidade cancelada");
      await prisma.fatura.update({ where: { id }, data: { situacao: "CANCELADA" } });
    } else if (acao === "reabrir") {
      await prisma.fatura.update({ where: { id }, data: { situacao: "ABERTA", pagaEm: null, valorPago: null, formaPagamento: null } });
    }
  } catch (e) { voltar(volta, { erro: msg(e) }); }
  voltar(volta, { ok: "Feito" });
}

export async function processarAgora() {
  await exigirAdmin();
  const r = await processar();
  voltar("/faturas", r.erros.length ? { erro: `Feito com erros: ${r.erros.slice(0, 2).join(" · ")}` } : { ok: `${r.criadas} criada(s), ${r.boletos} boleto(s), ${r.emails} e-mail(s), ${r.lembretes} lembrete(s), ${r.pagas} paga(s)` });
}

// ---------- configurações

export async function salvarGeral(f: FormData) {
  await exigirAdmin();
  const geral = await ler("geral");
  await salvar("geral", { ...geral, urlPublica: txt(f, "urlPublica").replace(/\/+$/, ""), nomeEmpresa: txt(f, "nomeEmpresa") || "MXTECH", multaPct: num(f, "multaPct"), jurosMesPct: num(f, "jurosMesPct") });
  await salvar("regua", {
    diasAviso: Math.trunc(num(f, "diasAviso")) || 5, diasLeitura: Math.trunc(num(f, "diasLeitura")) || 10,
    diasBloqueio: Math.trunc(num(f, "diasBloqueio")) || 30, diasAntecedencia: Math.trunc(num(f, "diasAntecedencia")) || 10,
  });
  voltar("/configuracoes", { ok: "Salvo" });
}

export async function salvarInterTela(f: FormData) {
  await exigirAdmin();
  try {
    const arquivos: { nome: string; bytes: Buffer }[] = [];
    for (const a of f.getAll("arquivos")) if (a instanceof File && a.size) arquivos.push({ nome: a.name, bytes: Buffer.from(await a.arrayBuffer()) });
    await salvarInter({ clientId: txt(f, "clientId"), clientSecret: txt(f, "clientSecret") || undefined, contaCorrente: txt(f, "contaCorrente"), ambiente: txt(f, "ambiente") === "sandbox" ? "sandbox" : "producao", arquivos });
    await testarInter();
  } catch (e) { voltar("/configuracoes", { erro: msg(e) }); }
  const geral = await ler("geral");
  if (geral.urlPublica) {
    try { await registrarWebhook(geral.urlPublica); } catch (e) { voltar("/configuracoes", { erro: `Inter conectado, mas o webhook falhou: ${msg(e)}` }); }
  }
  voltar("/configuracoes", { ok: "Banco Inter conectado" });
}

export async function salvarSmtpTela(f: FormData) {
  await exigirAdmin();
  try {
    await salvarSmtp({ host: txt(f, "host"), porta: Math.trunc(num(f, "porta")), seguro: f.get("seguro") === "on", usuario: txt(f, "usuario"), senha: txt(f, "senha") || undefined, remetente: txt(f, "remetente") });
    if (txt(f, "testar")) await enviarEmail({ para: txt(f, "testar"), assunto: "Teste da Central MXTECH", texto: "Se chegou, o e-mail da Central está funcionando." });
  } catch (e) { voltar("/configuracoes", { erro: msg(e) }); }
  voltar("/configuracoes", { ok: "E-mail salvo" });
}
