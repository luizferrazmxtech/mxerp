"use server";

import { exigirUsuario } from "@/lib/auth/atual";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { baixarLancamento, criarLancamentos, estornarLancamento } from "@/lib/financeiro/lancamentos";
import { parseDia } from "@/lib/datas";
import { boletosDoDocumento, cancelarBoletosDoLancamento } from "@/lib/financeiro/boletos";

const num = (x: FormDataEntryValue | null) => Number(String(x ?? "").replace(/\./g, "").replace(",", ".")) || 0;
const str = (x: FormDataEntryValue | null) => String(x ?? "").trim();

export async function novoLancamento(form: FormData) {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  const criados = await prisma.$transaction((tx) =>
    criarLancamentos(tx, {
      tipo: str(form.get("tipo")) as "PAGAR" | "RECEBER",
      descricao: str(form.get("descricao")),
      categoriaId: str(form.get("categoriaId")),
      pessoaId: str(form.get("pessoaId")) || null,
      valorTotal: num(form.get("valor")),
      parcelas: Number(form.get("parcelas") || 1),
      primeiroVencimento: parseDia(str(form.get("vencimento"))),
      formaPagamentoId: str(form.get("formaPagamentoId")) || null,
    }),
  );
  await boletosDoDocumento({ lancamentoIds: criados.map((l) => l.id) });
  revalidatePath("/financeiro");
}

export async function baixar(form: FormData) {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  await prisma.$transaction((tx) =>
    baixarLancamento(tx, str(form.get("id")), {
      data: parseDia(str(form.get("data"))),
      contaBancariaId: str(form.get("contaBancariaId")),
      juros: num(form.get("juros")),
      desconto: num(form.get("desconto")),
    }),
  );
  // recebido à mão: o boleto em aberto é cancelado no Inter para o cliente não pagar duas vezes
  await cancelarBoletosDoLancamento(str(form.get("id")));
  revalidatePath("/financeiro");
}

export async function estornar(form: FormData) {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  await prisma.$transaction((tx) => estornarLancamento(tx, str(form.get("id"))));
  revalidatePath("/financeiro");
}

export async function excluir(form: FormData) {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  await prisma.lancamento.deleteMany({ where: { id: str(form.get("id")), pagoEm: null, origemTipo: null } });
  await boletosDoDocumento({ lancamentoIds: [] }); // cancela no Inter o boleto da conta apagada
  revalidatePath("/financeiro");
}

export async function novaConta(form: FormData) {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  await prisma.contaBancaria.create({
    data: { nome: str(form.get("nome")), banco: str(form.get("banco")) || null, saldoInicial: num(form.get("saldoInicial")) },
  });
  revalidatePath("/financeiro");
}
