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

  it("não sugere conta de outro cliente só pelo valor (caso FCRJ)", () => {
    const r = conc.analisar(
      [t("t1", "2026-09-15", 3999, "Boleto de cobrança recebido - FCRJ ORGANIZACAO CONTABIL LTDA."), t("t2", "2026-09-15", 1779, "Boleto de cobrança recebido - FCRJ ORGANIZACAO CONTABIL LTDA.")],
      [a("l1", "RECEBER", 4000, "2026-08-10", "Ordem de serviço de nº 6961", "GUSTAVO MORETTI"), a("l2", "RECEBER", 1813.3, "2026-07-14", "Ordem de serviço de nº 6764", "ZPL CONTAINERS")],
      vazio, cats, dia("2026-11-21"),
    );
    for (const x of r) {
      expect(x.acao).toBe("REVISAR");
      expect(x.lancamentoId).toBeNull();
      // continua na lista para escolha manual, com confiança baixa e o aviso
      expect(x.candidatos[0].confianca).toBeLessThanOrEqual(30);
      expect(x.candidatos[0].motivos.join(" ")).toContain("pagador não confere");
    }
  });

  it("mesmo valor e data, mas nome diferente, não vira sugestão; nem conta a pagar", () => {
    const [rec, pag] = conc.analisar(
      [t("t1", "2026-11-10", 99, "Pix recebido - Erika Tejima"), t("t2", "2026-11-10", -100, "Pix enviado - Joao Pereira")],
      [a("l1", "RECEBER", 99, "2026-11-10", "Venda 8258", "Luiz Ferraz ME"), a("l2", "PAGAR", 100, "2026-11-10", "Frete", "TRANSPORTES RAPIDO LTDA")],
      vazio, cats, dia("2026-11-12"),
    );
    expect(rec.acao).toBe("REVISAR");
    expect(pag.acao).toBe("REVISAR");
  });

  it("identifica pelo nosso número do boleto e pelo CNPJ na descrição", () => {
    const [bol, doc] = conc.analisar(
      [{ ...t("t1", "2026-11-10", 150, "Boleto de cobrança recebido - FCRJ ORGANIZACAO CONTABIL"), documento: "00012345" }, t("t2", "2026-11-11", 80, "PIX RECEBIDO 12.345.678/0001-95")],
      [a("l1", "RECEBER", 150, "2026-11-10", "OS 7000", "GUSTAVO MORETTI", { boletos: ["00012345"] }), a("l2", "RECEBER", 80, "2026-11-11", "Venda 1", "ZPL CONTAINERS", { pessoaDocumento: "12345678000195" })],
      vazio, cats, dia("2026-11-12"),
    );
    expect([bol.acao, bol.lancamentoId, bol.nivel]).toEqual(["BAIXAR", "l1", "alta"]);
    expect(bol.motivos[0]).toBe("nosso número do boleto");
    expect([doc.acao, doc.lancamentoId]).toEqual(["BAIXAR", "l2"]);
  });

  it("nome: sobrenome comum e palavras de razão social não bastam", () => {
    expect(conc.nomeConfere("Pix recebido - Gustavo Silva", "GUSTAVO MORETTI")).toBe(false);
    expect(conc.nomeConfere("Boleto - FCRJ ORGANIZACAO CONTABIL LTDA", "ORGANIZACAO CONTABIL ALFA LTDA")).toBe(false);
    expect(conc.nomeConfere("Pix recebido - Tay Motos Ltda", "TAY MOTOS LTDA")).toBe(true);
    expect(conc.nomeConfere("BOLETO PASSALACQUA", "PASSALACQUA TECH LTDA")).toBe(true);
  });

  it("despesa sem histórico: categoria pelo ramo de atividade (CNAE)", () => {
    const cs = [...cats, { id: "terc", nome: "Serviços de terceiros", tipo: "PAGAR" as const }, { id: "comb", nome: "Combustível e veículos", tipo: "PAGAR" as const }];
    const ramos = new Map([["fcrj organizacao contabil ltda", { cnae: "6920601", documento: "11222333000181" }], ["auto posto ipiranga", { cnae: "4731800", documento: null }]]);
    const [cont, posto] = conc.analisar(
      [t("t1", "2026-11-10", -500, "Pagamento efetuado - FCRJ ORGANIZACAO CONTABIL LTDA"), t("t2", "2026-11-10", -200, "Compra no debito - AUTO POSTO IPIRANGA")],
      [], vazio, cs, dia("2026-11-12"), ramos,
    );
    expect([cont.acao, cont.categoriaId]).toEqual(["LANCAR", "terc"]);
    expect(cont.motivos[0]).toContain("contabilidade");
    expect(cont.ramo).toContain("6920-6/01");
    expect([posto.acao, posto.categoriaId]).toEqual(["LANCAR", "comb"]);
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

  it("busca o ramo pelo CNPJ do cadastro e sugere a categoria da despesa", async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "FavorecidoExtrato"`);
    await prisma.pessoa.create({ data: { nome: "FCRJ ORGANIZACAO CONTABIL LTDA", documento: "11222333000181" } });
    await ext.importarExtrato(conta, [{ data: dia("2026-11-10"), valor: -500, descricao: "Pagamento efetuado - FCRJ ORGANIZACAO CONTABIL LTDA.", chave: "f1" }], { baixarAutomatico: false });
    const consultados: string[] = [];
    const r = await conc.buscarRamos({ consultar: async (cnpj) => { consultados.push(cnpj); return { cnae: "6920601", razaoSocial: "FCRJ" }; } });
    expect(consultados).toEqual(["11222333000181"]);
    expect(r).toMatchObject({ consultados: 1, achados: 1 });
    const [l] = await conc.analisarExtrato();
    const terc = await prisma.categoriaFinanceira.findFirstOrThrow({ where: { nome: "Serviços de terceiros" } });
    expect([l.acao, l.categoriaId]).toEqual(["LANCAR", terc.id]);
    // segunda vez não consulta de novo
    await conc.buscarRamos({ consultar: async (c) => { consultados.push(c); return { cnae: "", razaoSocial: "" }; } });
    expect(consultados).toHaveLength(1);
  });

  it("guarda hora e CPF/CNPJ do banco, completa linhas antigas e usa o CNPJ para identificar e achar o ramo", async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "FavorecidoExtrato"`);
    const linha = { data: dia("2026-11-10"), valor: -500, descricao: "Pagamento efetuado - FCRJ ORGANIZACAO CONTABIL LTDA.", chave: "h1" };
    await ext.importarExtrato(conta, [linha], { baixarAutomatico: false });
    // a mesma linha chega de novo, agora com hora e CNPJ: completa sem duplicar
    await ext.importarExtrato(conta, [{ ...linha, dataHora: new Date("2026-11-10T13:25:00Z"), contraparteDocumento: "11222333000181" }], { baixarAutomatico: false });
    const t = await prisma.transacaoBancaria.findFirstOrThrow({ where: { chave: "h1" } });
    expect(t.contraparteDocumento).toBe("11222333000181");
    const consultados: string[] = [];
    await conc.buscarRamos({ consultar: async (c) => { consultados.push(c); return { cnae: "6920601", razaoSocial: "FCRJ" }; } });
    expect(consultados).toEqual(["11222333000181"]);
    const [l] = await conc.analisarExtrato();
    expect(l.hora).toBe("10:25");
    expect(l.documentoFavorecido).toBe("11222333000181");
    expect(l.acao).toBe("LANCAR");
  });
});

describe("dados do banco", async () => {
  const inter = await import("@/lib/financeiro/inter");
  it("lê a hora e o CPF/CNPJ da contraparte do Inter e a hora do OFX", () => {
    expect(inter.dataHoraInter({ dataInclusao: "2026-11-05 10:23:11" })?.toISOString()).toBe("2026-11-05T13:23:11.000Z");
    expect(inter.dataHoraInter({ dataTransacao: "2026-11-05" })).toBeNull();
    expect(inter.documentoContraparte({ cpfCnpjPagador: "123.456.789-09", cpfCnpjRecebedor: "11.222.333/0001-81" }, true)).toBe("11222333000181");
    expect(inter.documentoContraparte({ cpfCnpjPagador: "123.456.789-09", cpfCnpjRecebedor: "11.222.333/0001-81" }, false)).toBe("12345678909");
    expect(inter.documentoContraparte({ nomeRecebedor: "X" }, true)).toBeNull();
    expect(ext.dataHoraOfx("20261105103000[-3:BRT]")?.toISOString()).toBe("2026-11-05T13:30:00.000Z");
    expect(ext.dataHoraOfx("20261105000000[-3:BRT]")).toBeNull();
  });

  it("CPF/CNPJ mandado pelo banco identifica o cliente mesmo com nome diferente", () => {
    const [r] = conc.analisar(
      [{ id: "t1", data: dia("2026-11-10"), valor: 300, descricao: "Pix recebido - J S", conta: "INTER", contaBancariaId: "c", contraparteDocumento: "12345678909" }],
      [{ id: "l1", tipo: "RECEBER", valor: 300, vencimento: dia("2026-11-10"), descricao: "OS 1", pessoa: "JOAO DA SILVA", pessoaId: "p1", categoriaId: "c1", centroCustoId: null, pessoaDocumento: "12345678909" }],
      vazio, [], dia("2026-11-12"),
    );
    expect([r.acao, r.lancamentoId, r.motivos[0]]).toEqual(["BAIXAR", "l1", "CPF/CNPJ confere"]);
  });
});
