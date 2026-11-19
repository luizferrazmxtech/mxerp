"use server";

import { revalidatePath } from "next/cache";
import type { GrupoDre, TipoLancamento } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";
import { parseDia } from "@/lib/datas";
import { lerNumero } from "@/lib/itens/tipos";
import { excluirCategoria, excluirCentroCusto, salvarCategoria, salvarCentroCusto } from "./plano";
import { excluirTransferencia, transferirEntreContas } from "./transferencias";
import type { Resultado } from "@/components/financeiro/FormAcao";

const GER = ["ADMIN", "GERENTE"] as const;
const str = (x: FormDataEntryValue | null) => String(x ?? "").trim();
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function tentar(fn: () => Promise<unknown>, ok: string, caminho: string, ir?: string): Promise<Resultado> {
  try {
    await fn();
  } catch (e) {
    return { ok: false, mensagem: msg(e) };
  }
  revalidatePath(caminho);
  return { ok: true, mensagem: ok, ir };
}

export async function salvarCategoriaAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario([...GER]);
  const id = str(form.get("id")) || undefined;
  return tentar(
    () => prisma.$transaction((tx) => salvarCategoria(tx, {
      id, nome: str(form.get("nome")), codigo: str(form.get("codigo")) || null,
      tipo: str(form.get("tipo")) as TipoLancamento, grupoDre: str(form.get("grupoDre")) as GrupoDre,
      paiId: str(form.get("paiId")) || null, ativa: form.get("ativa") !== "0",
    })),
    id ? "Plano de contas salvo" : "Plano de contas cadastrado", "/financeiro/plano-contas", "/financeiro/plano-contas",
  );
}

export async function excluirCategoriaAcao(id: string) {
  await exigirUsuario([...GER]);
  const r = await tentar(() => prisma.$transaction((tx) => excluirCategoria(tx, id)), "Plano de contas excluído", "/financeiro/plano-contas");
  return r!;
}

export async function salvarCentroAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario([...GER]);
  const id = str(form.get("id")) || undefined;
  return tentar(
    () => prisma.$transaction((tx) => salvarCentroCusto(tx, { id, nome: str(form.get("nome")), ativo: form.get("ativo") !== "0" })),
    id ? "Centro de custo salvo" : "Centro de custo cadastrado", "/financeiro/centros-custo", "/financeiro/centros-custo",
  );
}

export async function excluirCentroAcao(id: string) {
  await exigirUsuario([...GER]);
  return (await tentar(() => prisma.$transaction((tx) => excluirCentroCusto(tx, id)), "Centro de custo excluído", "/financeiro/centros-custo"))!;
}

export async function transferirAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario([...GER]);
  return tentar(
    () => prisma.$transaction((tx) => transferirEntreContas(tx, {
      origemId: str(form.get("origemId")), destinoId: str(form.get("destinoId")),
      valor: lerNumero(str(form.get("valor"))) ?? 0, data: parseDia(str(form.get("data"))),
      descricao: str(form.get("descricao")) || undefined, observacao: str(form.get("observacao")) || null,
    })),
    "Transferência registrada", "/financeiro/transferencias",
  );
}

export async function excluirTransferenciaAcao(id: string) {
  await exigirUsuario([...GER]);
  return (await tentar(() => prisma.$transaction((tx) => excluirTransferencia(tx, id)), "Transferência excluída", "/financeiro/transferencias"))!;
}

export async function salvarContaBancariaAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario([...GER]);
  const id = str(form.get("id"));
  const nome = str(form.get("nome"));
  if (!nome) return { ok: false, mensagem: "Informe o nome da conta" };
  const data = {
    nome, banco: str(form.get("banco")) || null, agencia: str(form.get("agencia")) || null, conta: str(form.get("conta")) || null,
    saldoInicial: lerNumero(str(form.get("saldoInicial"))) ?? 0, ativa: form.get("ativa") !== "0",
  };
  return tentar(
    async () => {
      const dup = await prisma.contaBancaria.findFirst({ where: { nome: { equals: nome, mode: "insensitive" }, NOT: id ? { id } : undefined } });
      if (dup) throw new Error(`Já existe a conta "${dup.nome}"`);
      if (id) {
        const antes = await prisma.contaBancaria.findUniqueOrThrow({ where: { id } });
        // o Caixa é usado pelo PDV e pelos recebimentos à vista: o nome não pode mudar
        if (antes.nome === "Caixa" && nome !== "Caixa") throw new Error("A conta Caixa é usada pelo PDV: o nome não pode mudar");
        if (antes.nome === "Caixa" && !data.ativa) throw new Error("A conta Caixa é usada pelo PDV: não pode ser desativada");
        await prisma.contaBancaria.update({ where: { id }, data });
      } else await prisma.contaBancaria.create({ data });
    },
    id ? "Conta salva" : "Conta cadastrada", "/financeiro/contas", "/financeiro/contas",
  );
}
