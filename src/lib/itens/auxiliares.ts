"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";
import { lerNumero } from "./tipos";

export type Resultado = { ok: boolean; mensagem: string } | null;
const GER = ["ADMIN", "GERENTE"] as const;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const unico = (e: unknown, msg: string) => ({ ok: false, mensagem: e instanceof Error && /Unique/.test(e.message) ? msg : e instanceof Error ? e.message : String(e) });

// ---------- grupos de produtos

export async function salvarGrupoAcao(_: Resultado, f: FormData): Promise<Resultado> {
  await exigirUsuario([...GER]);
  const id = txt(f, "id"), nome = txt(f, "nome"), paiId = txt(f, "paiId") || null;
  if (!nome) return { ok: false, mensagem: "Informe o nome" };
  if (id && paiId) {
    // o grupo pai não pode ser o próprio grupo nem um subgrupo dele
    for (let g: string | null = paiId; g; g = (await prisma.grupoProduto.findUnique({ where: { id: g }, select: { paiId: true } }))?.paiId ?? null)
      if (g === id) return { ok: false, mensagem: "O grupo pai não pode ser o próprio grupo nem um subgrupo dele" };
  }
  try {
    if (id) await prisma.grupoProduto.update({ where: { id }, data: { nome, paiId } });
    else await prisma.grupoProduto.create({ data: { nome, paiId } });
  } catch (e) { return unico(e, "Já existe um grupo com esse nome"); }
  revalidatePath("/grupos-produtos");
  redirect("/grupos-produtos");
}

export async function excluirGrupoAcao(id: string) {
  await exigirUsuario([...GER]);
  const g = await prisma.grupoProduto.findUniqueOrThrow({ where: { id }, select: { nome: true, _count: { select: { produtos: true } } } });
  if (g._count.produtos) return { ok: false, mensagem: `${g.nome} tem ${g._count.produtos} produto(s). Mude o grupo deles antes de excluir.` };
  await prisma.$transaction([prisma.grupoProduto.updateMany({ where: { paiId: id }, data: { paiId: null } }), prisma.grupoProduto.delete({ where: { id } })]);
  revalidatePath("/grupos-produtos");
  return { ok: true, mensagem: "Grupo excluído" };
}

// ---------- unidades

export async function salvarUnidadeAcao(_: Resultado, f: FormData): Promise<Resultado> {
  await exigirUsuario([...GER]);
  const id = txt(f, "id"), nome = txt(f, "nome"), sigla = txt(f, "sigla").toUpperCase(), padrao = f.get("padrao") === "1";
  if (!nome || !sigla) return { ok: false, mensagem: "Informe o nome e a sigla" };
  if (sigla.length > 6) return { ok: false, mensagem: "A sigla tem no máximo 6 letras (vai na nota fiscal)" };
  try {
    await prisma.$transaction(async (tx) => {
      if (padrao) await tx.unidade.updateMany({ where: { padrao: true }, data: { padrao: false } });
      if (id) {
        const antiga = await tx.unidade.findUniqueOrThrow({ where: { id } });
        await tx.unidade.update({ where: { id }, data: { nome, sigla, padrao } });
        if (antiga.sigla !== sigla) await tx.produto.updateMany({ where: { unidade: antiga.sigla }, data: { unidade: sigla } });
      } else await tx.unidade.create({ data: { nome, sigla, padrao } });
    });
  } catch (e) { return unico(e, "Já existe uma unidade com essa sigla"); }
  revalidatePath("/unidades");
  redirect("/unidades");
}

export async function excluirUnidadeAcao(id: string) {
  await exigirUsuario([...GER]);
  const u = await prisma.unidade.findUniqueOrThrow({ where: { id } });
  const n = await prisma.produto.count({ where: { OR: [{ unidade: u.sigla }, { unidadeCompra: u.sigla }] } });
  if (n) return { ok: false, mensagem: `${n} produto(s) usam a unidade ${u.sigla}.` };
  await prisma.unidade.delete({ where: { id } });
  revalidatePath("/unidades");
  return { ok: true, mensagem: "Unidade excluída" };
}

// ---------- valores de venda (tipos de valor)

export async function salvarTipoValorAcao(_: Resultado, f: FormData): Promise<Resultado> {
  await exigirUsuario([...GER]);
  const id = txt(f, "id"), nome = txt(f, "nome"), lucro = lerNumero(txt(f, "lucro")) ?? 0;
  const padrao = f.get("padrao") === "1", porRegras = f.get("porRegras") === "1", lojas = f.getAll("lojas").map(String);
  if (!nome) return { ok: false, mensagem: "Informe o nome" };
  if (!lojas.length) return { ok: false, mensagem: "Selecione ao menos uma loja" };
  if (!padrao && !(await prisma.tipoValor.count({ where: { padrao: true, NOT: id ? { id } : undefined } })))
    return { ok: false, mensagem: "Deixe ao menos um valor de venda como padrão" };
  try {
    await prisma.$transaction(async (tx) => {
      if (padrao) await tx.tipoValor.updateMany({ where: { padrao: true, NOT: id ? { id } : undefined }, data: { padrao: false } });
      const t = id ? await tx.tipoValor.update({ where: { id }, data: { nome, lucro, padrao, porRegras, lojas } }) : await tx.tipoValor.create({ data: { nome, lucro, padrao, porRegras, lojas } });
      if (padrao) {
        // o valor padrão é o preço que vai para vendas, OS e PDV
        await tx.$executeRaw`UPDATE "Produto" p SET "precoVenda" = v.valor FROM "ProdutoValor" v WHERE v."produtoId" = p.id AND v."tipoValorId" = ${t.id}`;
      }
    });
  } catch (e) { return unico(e, "Já existe um valor de venda com esse nome"); }
  revalidatePath("/valores-venda");
  redirect("/valores-venda");
}

export async function excluirTipoValorAcao(id: string) {
  await exigirUsuario([...GER]);
  const t = await prisma.tipoValor.findUniqueOrThrow({ where: { id } });
  if (t.padrao) return { ok: false, mensagem: "O valor de venda padrão não pode ser excluído. Marque outro como padrão antes." };
  await prisma.$transaction([prisma.produtoValor.deleteMany({ where: { tipoValorId: id } }), prisma.tipoValor.delete({ where: { id } })]);
  revalidatePath("/valores-venda");
  return { ok: true, mensagem: "Valor de venda excluído" };
}

// ---------- grades

export async function salvarGradeAcao(_: Resultado, f: FormData): Promise<Resultado> {
  await exigirUsuario([...GER]);
  const id = txt(f, "id"), nome = txt(f, "nome");
  const variacoes = [...new Set(f.getAll("variacao").map((v) => String(v).trim()).filter(Boolean))];
  if (!nome) return { ok: false, mensagem: "Informe o nome da grade" };
  if (!variacoes.length) return { ok: false, mensagem: "Cadastre ao menos uma variação" };
  try {
    if (id) await prisma.grade.update({ where: { id }, data: { nome, variacoes } });
    else await prisma.grade.create({ data: { nome, variacoes } });
  } catch (e) { return unico(e, "Já existe uma grade com esse nome"); }
  revalidatePath("/grades");
  redirect("/grades");
}

export async function excluirGradeAcao(id: string) {
  await exigirUsuario([...GER]);
  await prisma.grade.delete({ where: { id } });
  revalidatePath("/grades");
  return { ok: true, mensagem: "Grade excluída" };
}

// ---------- modelos de etiqueta

export async function salvarEtiquetaAcao(_: Resultado, f: FormData): Promise<Resultado> {
  await exigirUsuario([...GER]);
  const id = txt(f, "id"), nome = txt(f, "nome");
  if (!nome) return { ok: false, mensagem: "Informe o nome da etiqueta" };
  const num = (k: string) => lerNumero(txt(f, k));
  const campos = ["altura", "largura", "margemSuperior", "margemLateral", "distVertical", "distHorizontal"] as const;
  const medidas = Object.fromEntries(campos.map((k) => [k, num(k)])) as Record<(typeof campos)[number], number | null>;
  if (campos.some((k) => medidas[k] == null || medidas[k]! < 0) || !medidas.altura || !medidas.largura) return { ok: false, mensagem: "Preencha todas as medidas (em cm)" };
  const colunas = Math.trunc(num("colunas") ?? 0), linhas = Math.trunc(num("linhas") ?? 0);
  if (colunas < 1 || linhas < 1) return { ok: false, mensagem: "Informe colunas e linhas na página" };
  const dados = {
    nome, padrao: txt(f, "padrao") || "Personalizado", pagina: txt(f, "pagina") || "A4", colunas, linhas,
    altura: medidas.altura!, largura: medidas.largura!, margemSuperior: medidas.margemSuperior!, margemLateral: medidas.margemLateral!,
    distVertical: medidas.distVertical!, distHorizontal: medidas.distHorizontal!,
    mostrarNome: f.get("mostrarNome") === "1", mostrarPreco: f.get("mostrarPreco") === "1", mostrarCodigo: f.get("mostrarCodigo") === "1", mostrarBarras: f.get("mostrarBarras") === "1",
  };
  if (id) await prisma.modeloEtiqueta.update({ where: { id }, data: dados });
  else await prisma.modeloEtiqueta.create({ data: dados });
  revalidatePath("/etiquetas");
  redirect("/etiquetas");
}

export async function excluirEtiquetaAcao(id: string) {
  await exigirUsuario([...GER]);
  await prisma.modeloEtiqueta.delete({ where: { id } });
  revalidatePath("/etiquetas");
  return { ok: true, mensagem: "Modelo excluído" };
}
