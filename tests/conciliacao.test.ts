import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const ext = await import("@/lib/financeiro/extrato");
const conc = await import("@/lib/financeiro/conciliacao");
const { garantirPadroes } = await import("@/lib/financeiro/padroes");

const dia = (s: string) => new Date(`${s}T00:00:00Z`);
const vazio = conc.montarHistorico([], []);

describe("favorecido", () => {
  it("tira a operação do banco e fica com o nome", () => {
    expect(conc.favorecido("Pix recebido - Paula Cristina Tome Marleta - Paula Cristina Tome Marleta")).toBe("paula cristina tome marleta");
    expect(conc.favorecido("Boleto de cobrança recebido - PHOENIX-SEG SERVICOS DE MONITORAMENTO")).toBe("phoenix seg servicos de monitoramento");
    expect(conc.favorecido("Pagamento efetuado - PERSONAL CARE OPERADORA DE SAUDE SA")).toBe("personal care operadora de saude sa");
    expect(conc.favorecido("PAGAMENTO BOLETO PASSALACQUA TECH")).toBe("passalacqua tech");
  });
});

describe("análise (sem banco)", () => {
  const t = (id: string, data: string, valor: number, descricao: string) => ({ id, data: dia(data), valor, descricao, conta: "INTER", contaBancariaId: "c1" });
  const a = (id: string, tipo: "PAGAR" | "RECEBER", valor: number, venc: string, descricao: string, pessoa: string | null, extra: Partial<import("@/lib/financeiro/conciliacao").AbertoAnalise> = {}) =>
    ({ id, tipo, valor, vencimento: dia(venc), descricao, pessoa, pessoaId: pessoa ? `p-${pessoa}` : null, categoriaId: "cat1", centroCustoId: null, ...extra });
  const cats = [{ id: "tar", nome: "Tarifas bancárias e taxas de cartão", tipo: "PAGAR" as const }, { id: "rend", nome: "Receitas financeiras", tipo: "RECEBER" as const }];

  it("sugere a conta com nome batendo, com confiança alta, e cada conta para uma linha só", () => {
    const r = conc.analisar(
      [t("t1", "2026-11-10", -229.29, "Pagamento efetuado - SINDICATO DOS EMPREGADOS NO COMERCIO"), t("t2", "2026-11-10", -229.29, "Pagamento efetuado - OUTRA EMPRESA")],
      [a("l1", "PAGAR", 229.29, "2026-11-10", "Contribuição", "Sindicato dos Empregados no Comércio")],
      vazio, cats, dia("2026-11-12"),
    );
    expect(r[0].acao).toBe("BAIXAR");
    expect(r[0].lancamentoId).toBe("l1");
    expect(r[0].nivel).toBe("alta");
    expect(r[1].lancamentoId).toBeNull(); // a conta já foi para a linha certa
  });

  it("conta a receber sem o nome do pagador fica com confiança baixa", () => {
    const [r] = conc.analisar([t("t1", "2026-11-10", 99, "Pix recebido - Erika Tejima")], [a("l1", "RECEBER", 99, "2026-11-10", "Venda 8258", "Luiz Ferraz ME")], vazio, cats, dia("2026-11-12"));
    expect(r.confianca).toBeLessThan(60);
    expect(r.nivel).toBe("baixa");
    expect(r.motivos.join(" ")).toContain("pagador não identificado");
  });

  it("aprende com o histórico: pessoa, categoria e centro de custo do favorecido", () => {
    const h = conc.montarHistorico(
      [
        { descricao: "Pix recebido - Erika Tejima - Erika Tejima", lancamentos: [{ pessoaId: "p-Luiz Ferraz ME", categoriaId: "cat1", centroCustoId: "cc-loja", avulso: false }] },
        { descricao: "Pagamento efetuado - GOOGLE CLOUD", lancamentos: [{ pessoaId: null, categoriaId: "sw", centroCustoId: "cc-ti", avulso: true }] },
        { descricao: "Pagamento efetuado - GOOGLE CLOUD", lancamentos: [{ pessoaId: null, categoriaId: "sw", centroCustoId: "cc-ti", avulso: true }] },
      ],
      [],
    );
    const [rec, desp] = conc.analisar(
      [t("t1", "2026-11-10", 99, "Pix recebido - Erika Tejima - Erika Tejima"), t("t2", "2026-11-11", -52.3, "Pagamento efetuado - GOOGLE CLOUD")],
      [a("l1", "RECEBER", 99, "2026-11-08", "Venda 8300", "Luiz Ferraz ME")],
      h, [...cats, { id: "sw", nome: "Software", tipo: "PAGAR" }], dia("2026-11-12"),
    );
    expect(rec.acao).toBe("BAIXAR");
    expect(rec.nivel).toBe("alta");
    expect(rec.centroCustoId).toBe("cc-loja");
    expect(desp.acao).toBe("LANCAR");
    expect(desp.categoriaId).toBe("sw");
    expect(desp.centroCustoId).toBe("cc-ti");
  });

  it("reconhece tarifa e rendimento pela descrição", () => {
    const [tar, rend] = conc.analisar([t("t1", "2026-11-10", -9.9, "TARIFA PACOTE DE SERVICOS"), t("t2", "2026-11-10", 0.14, "Rendimento poupança")], [], vazio, cats, dia("2026-11-12"));
    expect([tar.acao, tar.categoriaId]).toEqual(["LANCAR", "tar"]);
    expect([rend.acao, rend.categoriaId]).toEqual(["LANCAR", "rend"]);
  });

  it("urgência: conta vencida a receber e linha antiga de mês fechado", () => {
    const [venc, velha, nova] = conc.analisar(
      [t("t1", "2026-11-01", 500, "Pix recebido - Tay Motos Ltda"), t("t2", "2026-09-14", -1295.44, "Pagamento efetuado - XYZ"), t("t3", "2026-11-20", -10, "Pagamento efetuado - ABC")],
      [a("l1", "RECEBER", 500, "2026-11-01", "OS 7004", "Tay Motos Ltda")],
      vazio, cats, dia("2026-11-21"),
    );
    expect(venc.urgencia).toBe("urgente");
    expect(venc.prazo).toContain("vencida há 20 dias");
    expect(velha.urgencia).toBe("atencao");
    expect(velha.prazo).toContain("pendente há 68 dias");
    expect(nova.urgencia).toBe("normal");
  });
});

describe("análise com banco", () => {
  let conta: string, catPagar: string, cc: string;
  beforeAll(() => {
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "Lancamento","TransacaoBancaria","Pessoa","FormaPagamento","CategoriaFinanceira","ContaBancaria","CentroCusto" CASCADE`);
    await prisma.$transaction((tx) => garantirPadroes(tx));
    conta = (await prisma.contaBancaria.create({ data: { nome: "INTER MXTECH" } })).id;
    catPagar = (await prisma.categoriaFinanceira.findFirstOrThrow({ where: { nome: "Outras despesas" } })).id;
    cc = (await prisma.centroCusto.create({ data: { nome: "Administrativo" } })).id;
  });

  it("baixa com centro de custo, aprende e sugere o mesmo centro na próxima vez", async () => {
    const p = await prisma.pessoa.create({ data: { nome: "PERSONAL CARE OPERADORA DE SAUDE SA" } });
    const l1 = await prisma.lancamento.create({ data: { tipo: "PAGAR", descricao: "Plano de saúde 10/2026", valor: 1295.44, vencimento: dia("2026-10-14"), competencia: dia("2026-10-14"), categoriaId: catPagar, pessoaId: p.id } });
    const l2 = await prisma.lancamento.create({ data: { tipo: "PAGAR", descricao: "Plano de saúde 11/2026", valor: 1295.44, vencimento: dia("2026-11-14"), competencia: dia("2026-11-14"), categoriaId: catPagar, pessoaId: p.id } });
    await ext.importarExtrato(conta, [
      { data: dia("2026-10-14"), valor: -1295.44, descricao: "Pagamento efetuado - PERSONAL CARE OPERADORA DE SAUDE SA", chave: "a1" },
      { data: dia("2026-11-14"), valor: -1295.44, descricao: "Pagamento efetuado - PERSONAL CARE OPERADORA DE SAUDE SA", chave: "a2" },
    ], { baixarAutomatico: false });

    let an = await conc.analisarExtrato();
    expect(an.map((x) => x.data)).toEqual(["2026-10-14", "2026-11-14"]); // ordem de lançamento
    expect(an[0].lancamentoId).toBe(l1.id);
    expect(an[1].lancamentoId).toBe(l2.id);
    expect(an[0].centroCustoId).toBeNull();

    await prisma.$transaction((tx) => ext.conciliarTx(tx, an[0].transacaoId, [l1.id], { centroCustoId: cc }));
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id: l1.id } })).centroCustoId).toBe(cc);

    an = await conc.analisarExtrato();
    expect(an).toHaveLength(1);
    expect(an[0].lancamentoId).toBe(l2.id);
    expect(an[0].centroCustoId).toBe(cc);
    expect(an[0].nivel).toBe("alta");
  });

  it("lançamento avulso grava o centro de custo", async () => {
    await ext.importarExtrato(conta, [{ data: dia("2026-11-10"), valor: -9.9, descricao: "TARIFA PACOTE", chave: "t1" }], { baixarAutomatico: false });
    const [l] = await conc.analisarExtrato();
    expect(l.acao).toBe("LANCAR");
    await prisma.$transaction((tx) => ext.lancarAvulsoTx(tx, l.transacaoId, l.categoriaId!, undefined, cc));
    const lanc = await prisma.lancamento.findFirstOrThrow({ where: { transacaoId: l.transacaoId } });
    expect(lanc.centroCustoId).toBe(cc);
    expect(Number(lanc.valorPago)).toBe(9.9);
  });
});
