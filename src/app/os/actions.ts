"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PrioridadeOs, SituacaoOs } from "@prisma/client";
import { exigirUsuario } from "@/lib/auth/atual";
import type { DadosFormOs } from "./FormOs";
import { prisma } from "@/lib/db";
import * as os from "@/lib/os/os";
import { EstoqueError } from "@/lib/estoque/estoque";
import { resultadoReserva } from "@/lib/estoque/resultado";

const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(",", "."));

import type { Resultado } from "@/components/AdicionarProduto";
export type { Resultado };

export type ResultadoForm = { ok: boolean; mensagem: string } | null;

/** "AAAA-MM-DDTHH:mm" digitado no horário de São Paulo → instante. */
const instante = (s: string) => (s ? new Date(`${s.slice(0, 16)}:00-03:00`) : null);
const txt = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim() : null);

/** Cadastrar/editar OS pelo formulário completo (padrão Gestão Click). */
export async function salvarOsForm(_: ResultadoForm, form: FormData): Promise<ResultadoForm> {
  const u = await exigirUsuario();
  let osId: string;
  try {
    const d = JSON.parse(String(form.get("dados"))) as DadosFormOs;
    if (!d.cliente?.id) return { ok: false, mensagem: "Escolha o cliente" };
    if (!d.entrada) return { ok: false, mensagem: "Informe a data de entrada" };
    if (d.equipamentos.some((e) => !e.equipamento.trim() && Object.values(e).some((v) => v.trim())))
      return { ok: false, mensagem: "Informe o nome de cada equipamento" };
    const r = await os.salvarOs({
      osId: d.id,
      situacao: d.situacao as SituacaoOs,
      usuarioId: u.id,
      permitirNegativo: form.get("negativo") === "on",
      forcar: form.get("forcar") === "on",
      cabecalho: {
        clienteId: d.cliente.id,
        tecnicoId: d.tecnicoId || null,
        vendedorId: d.vendedorId || null,
        entrada: instante(d.entrada) ?? new Date(),
        saida: instante(d.saida),
        previsao: d.previsao ? new Date(`${d.previsao}T12:00:00-03:00`) : null,
        canal: d.canal || "Presencial",
        prioridade: (d.prioridade || null) as PrioridadeOs | null,
        observacoes: txt(d.observacoes),
        observacaoInterna: txt(d.observacaoInterna),
        frete: d.frete, outros: d.outros, desconto: d.desconto,
        equipamentos: d.equipamentos.map((e) => ({
          equipamento: e.equipamento, marca: txt(e.marca), modelo: txt(e.modelo), serie: txt(e.serie), condicoes: txt(e.condicoes),
          defeitos: txt(e.defeitos), acessorios: txt(e.acessorios), solucao: txt(e.solucao), laudo: txt(e.laudo), garantia: txt(e.garantia),
        })),
      },
      produtos: d.produtos.map((p) => ({ id: p.id, produtoId: p.produtoId, quantidade: p.quantidade, valorUnit: p.valorUnit })),
      servicos: d.servicos.map((s) => ({ id: s.id, servicoId: s.servicoId, quantidade: s.quantidade, valorUnit: s.valorUnit })),
    });
    osId = r.osId;
  } catch (e) {
    return { ok: false, mensagem: erro(e, "Erro ao salvar a OS") };
  }
  revalidatePath("/os");
  redirect(`/os/${osId}`);
}

/** Gerar cópia: nova OS em aberto com o mesmo cliente, equipamentos, peças e serviços. */
export async function copiarOs(form: FormData) {
  const u = await exigirUsuario();
  const o = await prisma.ordemServico.findUniqueOrThrow({
    where: { id: String(form.get("osId")) },
    include: { equipamentos: { orderBy: { ordem: "asc" } }, produtos: true, servicos: true },
  });
  const r = await os.salvarOs({
    situacao: "ABERTA",
    usuarioId: u.id,
    cabecalho: {
      clienteId: o.clienteId, tecnicoId: o.tecnicoId, vendedorId: o.vendedorId, canal: o.canal, prioridade: o.prioridade,
      observacoes: o.observacoes, observacaoInterna: o.observacaoInterna,
      frete: Number(o.frete), outros: Number(o.outros), desconto: Number(o.desconto),
      equipamentos: o.equipamentos.map((e) => ({ equipamento: e.equipamento, marca: e.marca, modelo: e.modelo, serie: e.serie, condicoes: e.condicoes, defeitos: e.defeitos, acessorios: e.acessorios, solucao: e.solucao, laudo: e.laudo, garantia: e.garantia })),
    },
    produtos: o.produtos.map((p) => ({ produtoId: p.produtoId, quantidade: Number(p.quantidade), valorUnit: Number(p.valorUnit) })),
    servicos: o.servicos.map((s) => ({ servicoId: s.servicoId, quantidade: Number(s.quantidade), valorUnit: Number(s.valorUnit) })),
  });
  await prisma.osHistorico.create({ data: { osId: r.osId, descricao: `Cópia da OS ${o.numero}`, usuarioId: u.id } });
  revalidatePath("/os");
  redirect(`/os/${r.osId}/editar`);
}

export async function adicionarProduto(_: Resultado, form: FormData): Promise<Resultado> {
  const osId = String(form.get("docId"));
  try {
    const quantidade = num(form.get("quantidade"));
    if (!(quantidade > 0)) return { ok: false, mensagem: "Informe a quantidade" };
    const { alocacoes } = await os.adicionarProduto(osId, {
      produtoId: String(form.get("produtoId")),
      quantidade,
      valorUnit: form.get("valorUnit") ? num(form.get("valorUnit")) : undefined,
    });
    revalidatePath(`/os/${osId}`);
    return await resultadoReserva(alocacoes);
  } catch (e) {
    return { ok: false, mensagem: e instanceof EstoqueError ? e.message : "Erro ao adicionar produto" };
  }
}

export async function removerProduto(form: FormData) {
  const osId = String(form.get("osId"));
  await os.removerProduto(osId, String(form.get("itemId")));
  revalidatePath(`/os/${osId}`);
}

export async function alterarQuantidade(form: FormData) {
  const osId = String(form.get("osId"));
  await os.alterarQuantidade(osId, String(form.get("itemId")), num(form.get("quantidade")));
  revalidatePath(`/os/${osId}`);
}

export async function adicionarServico(form: FormData) {
  const osId = String(form.get("osId"));
  await os.adicionarServico(osId, {
    servicoId: String(form.get("servicoId")),
    valorUnit: form.get("valorUnit") ? num(form.get("valorUnit")) : undefined,
  });
  revalidatePath(`/os/${osId}`);
}

export async function removerServico(form: FormData) {
  const osId = String(form.get("osId"));
  await os.removerServico(osId, String(form.get("itemId")));
  revalidatePath(`/os/${osId}`);
}

export async function mudarSituacao(_: Resultado, form: FormData): Promise<Resultado> {
  const osId = String(form.get("osId"));
  try {
    await os.alterarSituacao(osId, String(form.get("situacao")) as SituacaoOs, {
      permitirNegativo: form.get("negativo") === "on",
      forcar: form.get("forcar") === "on",
    });
    revalidatePath(`/os/${osId}`);
    return { ok: true, mensagem: "Situação atualizada." };
  } catch (e) {
    return { ok: false, mensagem: erro(e, "Erro ao mudar a situação") };
  }
}

export async function faturar(_: Resultado, form: FormData): Promise<Resultado> {
  const osId = String(form.get("osId"));
  try {
    await os.faturarOs(osId, JSON.parse(String(form.get("pagamentos") || "[]")), {
      permitirNegativo: form.get("negativo") === "on",
    });
    revalidatePath(`/os/${osId}`);
    return { ok: true, mensagem: "OS faturada." };
  } catch (e) {
    return { ok: false, mensagem: erro(e, "Erro ao faturar") };
  }
}

const erro = (e: unknown, padrao: string) =>
  e instanceof EstoqueError || (e instanceof Error && !(e as { code?: string }).code) ? (e as Error).message : padrao;

export async function marcarSeparado(form: FormData) {
  const osId = String(form.get("osId"));
  await prisma.reserva.update({
    where: { id: String(form.get("reservaId")) },
    data: { separado: form.get("separado") === "1" },
  });
  revalidatePath(`/os/${osId}/separacao`);
  revalidatePath(`/os/${osId}`);
}
