import type { Empresa } from "@prisma/client";
import { prisma } from "@/lib/db";
import { chaveDps, chaveSeq } from "@/lib/fiscal/emissao";
import { MODELOS_POR_LOJA, todasAsLojas } from "./loja";

const tabela = (m: string) => `"${m}"`;

/** Passa para a loja todos os registros ainda sem loja (usado ao cadastrar a primeira empresa e na migração). */
export async function atribuirSemLoja(empresaId: string) {
  let total = 0;
  for (const m of MODELOS_POR_LOJA) {
    total += await prisma.$executeRawUnsafe(`UPDATE ${tabela(m)} SET "empresaId" = $1 WHERE "empresaId" IS NULL`, empresaId);
  }
  return total;
}

/** Garante um depósito (com um local) para a loja: cada CNPJ tem o próprio estoque. */
export async function criarDepositoDaLoja(empresaId: string) {
  return todasAsLojas(async () => {
    if (await prisma.deposito.findFirst({ where: { empresaId } })) return null;
    const e = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    const nomeBase = (e.nomeFantasia || e.razaoSocial).toUpperCase();
    let nome = nomeBase;
    for (let i = 2; await prisma.deposito.findUnique({ where: { nome } }); i++) nome = `${nomeBase} ${i}`;
    const codigoBase = nomeBase.normalize("NFD").replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "LOJA";
    let codigo = `${codigoBase}-01`;
    for (let i = 2; await prisma.local.findUnique({ where: { codigo } }); i++) codigo = `${codigoBase}-${String(i).padStart(2, "0")}`;
    return prisma.deposito.create({ data: { nome, empresaId, locais: { create: { codigo, descricao: `Estoque da loja ${nomeBase}` } } } });
  });
}

const chaveDe = (e: Pick<Empresa, "cnpj" | "serieNfe" | "serieNfce" | "serieDps" | "ambienteFiscal" | "ambienteNfse">, tipo: "NFE" | "NFCE" | "DPS") =>
  tipo === "DPS"
    ? chaveDps(e.cnpj, e.serieDps, e.ambienteNfse === "PRODUCAO" ? 1 : 2)
    : chaveSeq(e.cnpj, tipo === "NFCE" ? 65 : 55, tipo === "NFCE" ? e.serieNfce : e.serieNfe, e.ambienteFiscal === "PRODUCAO" ? 1 : 2);

/** Última nota emitida na série e ambiente atuais da empresa (0 = nenhuma). */
export async function ultimoNumero(e: Pick<Empresa, "cnpj" | "serieNfe" | "serieNfce" | "serieDps" | "ambienteFiscal" | "ambienteNfse">, tipo: "NFE" | "NFCE" | "DPS") {
  return (await prisma.sequencia.findUnique({ where: { chave: chaveDe(e, tipo) } }))?.valor ?? 0;
}

/**
 * Define a última nota emitida (a próxima sai com o número seguinte). Serve para continuar a numeração do
 * sistema anterior. Não deixa voltar para trás de uma nota que este sistema já emitiu na série.
 */
export async function definirUltimoNumero(e: Empresa, tipo: "NFE" | "NFCE" | "DPS", valor: number) {
  const chave = chaveDe(e, tipo);
  const atual = await prisma.sequencia.findUnique({ where: { chave } });
  if (atual?.valor === valor) return;
  const modelo = tipo === "DPS" ? "NFSE" : tipo;
  const serie = tipo === "DPS" ? e.serieDps : tipo === "NFCE" ? e.serieNfce : e.serieNfe;
  const ambiente = tipo === "DPS" ? e.ambienteNfse : e.ambienteFiscal;
  const maior = await todasAsLojas(() => prisma.notaFiscal.aggregate({ where: { empresaId: e.id, modelo, serie, ambiente }, _max: { numero: true } }));
  if (maior._max.numero && valor < maior._max.numero)
    throw new Error(`A ${tipo === "DPS" ? "DPS" : tipo === "NFCE" ? "NFC-e" : "NF-e"} nº ${maior._max.numero} já foi emitida por aqui nesta série: a última não pode ser menor que ela`);
  await prisma.sequencia.upsert({ where: { chave }, create: { chave, valor }, update: { valor } });
}
