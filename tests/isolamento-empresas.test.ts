import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const { naLoja, limparCacheLojas } = await import("@/lib/empresa/loja");
const { fluxoCaixa } = await import("@/lib/financeiro/fluxo");

execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });

async function limpar() {
  await prisma.$executeRawUnsafe(`TRUNCATE "Reserva", "TransacaoBancaria", "MensagemWhatsapp", "Lancamento", "OrdemServico", "Empresa", "Pessoa", "Produto" CASCADE`);
  await prisma.$executeRawUnsafe(`DELETE FROM "ContaBancaria" WHERE nome LIKE 'T-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "CategoriaFinanceira" WHERE nome LIKE 'T-%'`);
  limparCacheLojas();
}
beforeEach(limpar);
afterAll(limpar);

describe("com uma empresa escolhida, nada da outra aparece", () => {
  it("caixas do PDV: o relatório de caixas só mostra os da empresa escolhida", async () => {
    const { abrirCaixa } = await import("@/lib/pdv/caixa");
    const { linhasCaixas } = await import("@/lib/pdv/relatorio");
    const a = await prisma.empresa.create({ data: { razaoSocial: "MXTECH LTDA", cnpj: "12965283000195", createdAt: new Date("2026-01-01") } });
    const b = await prisma.empresa.create({ data: { razaoSocial: "VFX INFO SERVICE", cnpj: "36130603000155" } });
    limparCacheLojas();
    const op = await prisma.usuario.create({ data: { nome: "T-OP", email: "t-op-caixa@x.test", senhaHash: "x" } });
    try {
      const ca = await naLoja(a.id, () => abrirCaixa(op.id, 10));
      expect(ca.empresaId).toBe(a.id);
      expect((await naLoja(a.id, () => linhasCaixas({ usuarioId: op.id }))).map((l) => l.id)).toEqual([ca.id]);
      expect(await naLoja(b.id, () => linhasCaixas({ usuarioId: op.id }))).toHaveLength(0);
      // o mesmo operador abre outro caixa na outra empresa (cada empresa tem a sua gaveta)
      const cb = await naLoja(b.id, () => abrirCaixa(op.id, 5));
      expect(cb.id).not.toBe(ca.id);
      expect((await naLoja(b.id, () => linhasCaixas({ usuarioId: op.id }))).map((l) => l.abertura)).toEqual([5]);
    } finally {
      await prisma.caixaPdv.deleteMany({ where: { usuarioId: op.id } });
      await prisma.usuario.delete({ where: { id: op.id } });
    }
  });

  it("OS com peça em falta, extrato, mensagens e fluxo de caixa ficam na empresa", async () => {
    const a = await prisma.empresa.create({ data: { razaoSocial: "MXTECH LTDA", cnpj: "12965283000195", createdAt: new Date("2026-01-01") } });
    const b = await prisma.empresa.create({ data: { razaoSocial: "VFX INFO SERVICE", cnpj: "36130603000155" } });
    limparCacheLojas();
    const cli = await prisma.pessoa.create({ data: { nome: "CLIENTE DO GRUPO", cliente: true } });
    const prod = await prisma.produto.create({ data: { codigo: "T-1", nome: "T-PECA" } });

    const os = await naLoja(a.id, () => prisma.ordemServico.create({ data: { numero: 990001, clienteId: cli.id } }));
    await prisma.reserva.create({ data: { produtoId: prod.id, quantidade: 1, origemTipo: "OS", origemId: os.id, origemItemId: "x", status: "ATIVA" } });
    const faltaIds = (await prisma.reserva.findMany({ where: { origemTipo: "OS", status: "ATIVA", localId: null }, select: { origemId: true } })).map((r) => r.origemId);
    expect(await naLoja(b.id, () => prisma.ordemServico.findMany({ where: { id: { in: faltaIds } } }))).toHaveLength(0);
    expect(await naLoja(a.id, () => prisma.ordemServico.findMany({ where: { id: { in: faltaIds } } }))).toHaveLength(1);
    // abrir a OS pelo id continua funcionando
    expect(await naLoja(b.id, () => prisma.ordemServico.findFirst({ where: { id: os.id } }))).not.toBeNull();

    // extrato: cada empresa vê só as linhas das contas dela
    const contaA = await naLoja(a.id, () => prisma.contaBancaria.create({ data: { nome: "T-INTER MXTECH" } }));
    const contaB = await naLoja(b.id, () => prisma.contaBancaria.create({ data: { nome: "T-INTER SERVICE" } }));
    await prisma.transacaoBancaria.create({ data: { contaBancariaId: contaA.id, data: new Date("2026-11-20"), valor: 100, descricao: "PIX A", chave: "a" } });
    await prisma.transacaoBancaria.create({ data: { contaBancariaId: contaB.id, data: new Date("2026-11-20"), valor: 50, descricao: "PIX B", chave: "b" } });
    expect((await naLoja(b.id, () => prisma.transacaoBancaria.findMany())).map((t) => t.descricao)).toEqual(["PIX B"]);
    expect(await naLoja(a.id, () => prisma.transacaoBancaria.count())).toBe(1);

    // mensagens do WhatsApp gravam a empresa
    await naLoja(a.id, () => prisma.mensagemWhatsapp.create({ data: { numero: "5516999999999", texto: "OS pronta", entidade: "OS", situacao: "ENVIADA" } }));
    expect(await naLoja(b.id, () => prisma.mensagemWhatsapp.count())).toBe(0);
    expect(await naLoja(a.id, () => prisma.mensagemWhatsapp.count())).toBe(1);

    // fluxo de caixa: só os lançamentos da empresa
    const cat = await naLoja(a.id, () => prisma.categoriaFinanceira.create({ data: { nome: "T-Receita", tipo: "RECEBER", grupoDre: "RECEITA_BRUTA" } }));
    const catB = await naLoja(b.id, () => prisma.categoriaFinanceira.create({ data: { nome: "T-Receita", tipo: "RECEBER", grupoDre: "RECEITA_BRUTA" } }));
    const dia = new Date("2026-11-20T00:00:00Z");
    await naLoja(a.id, () => prisma.lancamento.create({ data: { tipo: "RECEBER", descricao: "Recebido A", categoriaId: cat.id, valor: 100, valorPago: 100, vencimento: dia, competencia: dia, pagoEm: dia, contaBancariaId: contaA.id } }));
    await naLoja(b.id, () => prisma.lancamento.create({ data: { tipo: "RECEBER", descricao: "Recebido B", categoriaId: catB.id, valor: 50, valorPago: 50, vencimento: dia, competencia: dia, pagoEm: dia, contaBancariaId: contaB.id } }));
    const f = { de: new Date("2026-11-01T00:00:00Z"), ate: new Date("2026-11-30T00:00:00Z"), hoje: new Date("2026-11-23T00:00:00Z") };
    const fluxoB = await naLoja(b.id, () => fluxoCaixa(f));
    expect(JSON.stringify(fluxoB)).toContain("Recebido B");
    expect(JSON.stringify(fluxoB)).not.toContain("Recebido A");
  });
});
