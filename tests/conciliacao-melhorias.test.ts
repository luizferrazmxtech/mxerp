import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;
process.env.CHAVE_SEGREDOS ??= "chave-de-teste-do-whatsapp-123";

const { prisma } = await import("@/lib/db");
const ext = await import("@/lib/financeiro/extrato");
const conc = await import("@/lib/financeiro/conciliacao");
const saldos = await import("@/lib/financeiro/saldos");
const folha = await import("@/lib/financeiro/maoDeObra");
const aviso = await import("@/lib/financeiro/avisoConciliacao");
const zap = await import("@/lib/whatsapp/mxchat");
const { garantirPadroes } = await import("@/lib/financeiro/padroes");

const dia = (s: string) => new Date(`${s}T00:00:00Z`);
const vazio = conc.montarHistorico([], []);
const t = (id: string, data: string, valor: number, descricao: string) => ({ id, data: dia(data), valor, descricao, conta: "INTER", contaBancariaId: "c1" });
const cats = [{ id: "outras", nome: "Outras despesas", tipo: "PAGAR" as const }, { id: "emprest", nome: "Empréstimos", tipo: "PAGAR" as const }, { id: "sal", nome: "Salários", tipo: "PAGAR" as const }];
const regra = (m: Partial<import("@/lib/financeiro/conciliacao").RegraAnalise>) => ({ id: "r1", texto: "cef matriz", modo: "IGUAL", tipo: "PAGAR" as const, categoriaId: "emprest", centroCustoId: "cc1", descricao: null, origem: "APRENDIDA", vezes: 1, ...m });

describe("regras da conciliação (sem banco)", () => {
  it("regra aprendida manda o favorecido para a categoria e o centro, ganhando do histórico", () => {
    const h = conc.montarHistorico([{ descricao: "Pix enviado - Cef Matriz", lancamentos: [{ pessoaId: null, categoriaId: "outras", centroCustoId: null, avulso: true }] }], []);
    const [l] = conc.analisar([t("t1", "2026-11-19", -2864.64, "Pix enviado - Cef Matriz")], [], h, cats, dia("2026-11-21"), new Map(), null, [regra({ vezes: 3 })]);
    expect([l.acao, l.categoriaId, l.centroCustoId, l.regraId]).toEqual(["LANCAR", "emprest", "cc1", "r1"]);
    expect(l.confianca).toBe(86);
    expect(l.motivos[0]).toContain("regra aprendida");
  });

  it("regra de 'contém' cadastrada à mão, a mais específica ganha; tipo diferente não vale", () => {
    const regras = [regra({ id: "a", modo: "CONTEM", texto: "tarifa", categoriaId: "outras", origem: "MANUAL" }), regra({ id: "b", modo: "CONTEM", texto: "tarifa pix", categoriaId: "emprest", origem: "MANUAL", descricao: "Tarifa do Pix" })];
    const [l, r] = conc.analisar([t("t1", "2026-11-19", -1.5, "TARIFA PIX ENVIADO"), t("t2", "2026-11-19", 1.5, "TARIFA PIX ESTORNO")], [], vazio, cats, dia("2026-11-21"), new Map(), null, regras);
    expect([l.categoriaId, l.confianca, l.descricaoLancamento]).toEqual(["emprest", 95, "Tarifa do Pix"]);
    expect(r.regraId).toBeNull();
  });

  it("funcionário cadastrado ganha da regra", () => {
    const pessoal = { funcionarios: [{ id: "u1", nome: "Wagner Jose Moretti", cpf: "19954623817", salarioRef: 2800 }], categorias: { SALARIO: "sal", ADIANTAMENTO: "sal", FERIAS: "sal", DECIMO: "sal", OUTROS: "sal" } };
    const [l] = conc.analisar([{ ...t("t1", "2026-11-05", -2800, "Pix enviado - Wagner Jose Moretti"), contraparteDocumento: "19954623817" }], [], vazio, cats, dia("2026-11-21"), new Map(), pessoal, [regra({ texto: "wagner jose moretti" })]);
    expect([l.categoriaId, l.funcionarioId, l.regraId]).toEqual(["sal", "u1", null]);
  });
});

describe("conferência de saldo (sem banco)", () => {
  it("calcula o saldo do banco pelo extrato a partir do informado e mostra onde a diferença apareceu", () => {
    const r = saldos.montarConferencia({
      inicio: dia("2026-11-17"), fim: dia("2026-11-20"), saldoSistemaAntes: 1000,
      extrato: new Map([["2026-11-18", -300], ["2026-11-19", 500], ["2026-11-20", -100]]),
      sistema: new Map([["2026-11-18", -300], ["2026-11-20", -100]]), // os 500 do dia 19 não foram conciliados
      pendentes: new Map([["2026-11-19", { n: 1, v: 500 }]]),
      saldos: new Map([["2026-11-20", 1100]]),
    });
    expect(r.map((d) => d.saldoBanco)).toEqual([1000, 700, 1200, 1100]);
    expect(r.map((d) => d.saldoSistema)).toEqual([1000, 700, 700, 600]);
    expect(r.map((d) => d.diferenca)).toEqual([0, 0, 500, 500]);
    expect(r[3].bancoInformado).toBe(true);
    expect(r[2].pendentes).toBe(1);
  });
});

describe("folha (sem banco)", () => {
  const f = [{ id: "u1", nome: "Caua Leonardo Pereira", salario: 1600, ativo: true }, { id: "u2", nome: "Felipe Alves Macera", salario: null, ativo: true }, { id: "u3", nome: "Pedro Vitor", salario: 1500, ativo: true }];
  const p = (id: string, tipo: "SALARIO" | "ADIANTAMENTO", valor: number, descricao: string, funcionarioId: string | null = null) => ({ id, tipo, valor, competencia: dia("2026-10-01"), pagoEm: dia("2026-11-05"), descricao, funcionarioId });

  it("soma por funcionário e avisa pagamento em dobro, acima do combinado e salário faltando", () => {
    const r = folha.montarFolha("2026-10", [
      p("1", "ADIANTAMENTO", 800, "Adiantamento 10/2026 - CAUA LEONARDO PEREIRA"),
      p("2", "SALARIO", 800, "x", "u1"),
      p("3", "SALARIO", 800, "Salário 10/2026 - CAUA LEONARDO PEREIRA"),
      p("4", "SALARIO", 967.29, "Salário 10/2026 - FELIPE ALVES MACERA"),
      p("5", "SALARIO", 50, "Salário 10/2026 - FULANO SEM CADASTRO"),
    ], f, dia("2026-11-21"));
    const caua = r.linhas.find((l) => l.id === "u1")!;
    expect([caua.total, caua.porTipo.SALARIO, caua.porTipo.ADIANTAMENTO]).toEqual([2400, 1600, 800]);
    expect(caua.alertas.join(" | ")).toMatch(/2 pagamentos de salário.*passam do salário/);
    expect(r.linhas.find((l) => l.id === "u2")!.alertas).toEqual([]);
    expect(r.linhas.find((l) => l.id === "u3")!.alertas[0]).toContain("não foi pago");
    expect(r.semFuncionario).toBe(50);
    // antes do dia 10 do mês seguinte, salário que falta ainda não é alerta
    expect(folha.montarFolha("2026-10", [], f, dia("2026-11-08")).linhas.find((l) => l.id === "u3")!.alertas).toEqual([]);
  });
});

describe("aviso diário (sem banco)", () => {
  it("monta o texto com pendentes, urgentes, sugestões e saldo; nada pendente não manda", () => {
    const [l] = conc.analisar([t("t1", "2026-09-10", -100, "Pix enviado - Fornecedor X")], [], vazio, cats, dia("2026-11-21"));
    const txt = aviso.montarAviso([l], dia("2026-11-21"), { saldos: [{ conta: "INTER", banco: 1500, sistema: 1000 }], link: "https://erp/x" })!;
    expect(txt).toContain("*Conciliação bancária - 21/11/2026*");
    expect(txt).toContain("Pendentes: 1");
    expect(txt).toContain("Urgentes pelo prazo: 0");
    expect(txt).toContain("• 10/09 Pix enviado - Fornecedor X -R$\u00a0100,00 (pendente há 72 dias)");
    expect(txt).toMatch(/INTER: banco R\$\s1\.500,00/);
    expect(txt.endsWith("https://erp/x")).toBe(true);
    expect(aviso.montarAviso([], dia("2026-11-21"))).toBeNull();
  });
});

describe("com banco", () => {
  let conta: string, catPagar: string, catReceber: string;
  beforeAll(() => {
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "Lancamento","TransacaoBancaria","Pessoa","FormaPagamento","CategoriaFinanceira","ContaBancaria","CentroCusto","RegraConciliacao","SaldoBancario","FavorecidoExtrato","MensagemWhatsapp" CASCADE`);
    await prisma.configuracao.deleteMany({ where: { chave: { in: ["conciliacao-aviso", "whatsapp"] } } });
    await prisma.$transaction((tx) => garantirPadroes(tx));
    conta = (await prisma.contaBancaria.create({ data: { nome: "INTER MXTECH", saldoInicial: 1000 } })).id;
    catPagar = (await prisma.categoriaFinanceira.findFirstOrThrow({ where: { nome: "Outras despesas" } })).id;
    catReceber = (await prisma.categoriaFinanceira.findFirstOrThrow({ where: { tipo: "RECEBER" } })).id;
  });
  const conta_ = (tipo: "PAGAR" | "RECEBER", valor: number, descricao = "Conta") =>
    prisma.lancamento.create({ data: { tipo, descricao, valor, vencimento: dia("2026-11-10"), competencia: dia("2026-11-10"), categoriaId: tipo === "PAGAR" ? catPagar : catReceber } });
  const linha = async (chave: string, valor: number, descricao: string, data = "2026-11-10") => {
    await ext.importarExtrato(conta, [{ data: dia(data), valor, descricao, chave }], { baixarAutomatico: false });
    return (await prisma.transacaoBancaria.findFirstOrThrow({ where: { chave } })).id;
  };

  it("aprende a regra ao lançar, soma as confirmações, recomeça se mudar e não troca a cadastrada", async () => {
    const cc = (await prisma.centroCusto.create({ data: { nome: "Financeiro" } })).id;
    const apr = (desc: string, categoriaId: string, centroCustoId: string | null = null) => prisma.$transaction((tx) => conc.aprenderRegra(tx, { descricao: desc, valor: -10, categoriaId, centroCustoId }));
    await apr("Pix enviado - Cef Matriz", catPagar, cc);
    await apr("Pix enviado - CEF MATRIZ", catPagar);
    let r = await prisma.regraConciliacao.findFirstOrThrow();
    expect([r.texto, r.vezes, r.centroCustoId, r.origem]).toEqual(["cef matriz", 2, cc, "APRENDIDA"]);
    const outra = (await prisma.categoriaFinanceira.findFirstOrThrow({ where: { tipo: "PAGAR", NOT: { id: catPagar } } })).id;
    await apr("Pix enviado - Cef Matriz", outra);
    r = await prisma.regraConciliacao.findFirstOrThrow();
    expect([r.categoriaId, r.vezes, r.centroCustoId]).toEqual([outra, 1, null]);
    await prisma.regraConciliacao.update({ where: { id: r.id }, data: { origem: "MANUAL" } });
    await apr("Pix enviado - Cef Matriz", catPagar);
    expect((await prisma.regraConciliacao.findFirstOrThrow()).categoriaId).toBe(outra);
    // a próxima linha do mesmo favorecido já vem pela regra
    await linha("n1", -2864.64, "Pix enviado - Cef Matriz");
    const [l] = await conc.analisarExtrato();
    expect([l.acao, l.categoriaId, l.confianca]).toEqual(["LANCAR", outra, 95]);
  });

  it("uma linha paga várias contas: a soma tem que bater (ou aceitar a diferença)", async () => {
    const a = await conta_("PAGAR", 300), b = await conta_("PAGAR", 200);
    const tx1 = await linha("v1", -510, "Pagamento efetuado - FORNECEDOR");
    await expect(prisma.$transaction((tx) => ext.conciliarTx(tx, tx1, [a.id, b.id]))).rejects.toThrow(/soma das 2 contas \(R\$\s500,00\) não bate.*R\$\s510,00/);
    await prisma.$transaction((tx) => ext.conciliarTx(tx, tx1, [a.id, b.id], { aceitarDiferenca: true }));
    const [x, y] = await Promise.all([a, b].map((l) => prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } })));
    expect([Number(x.valorPago), Number(x.juros), Number(y.valorPago)]).toEqual([310, 10, 200]);
    const tx2 = await linha("v2", -500, "Pagamento efetuado - FORNECEDOR");
    const c = await conta_("PAGAR", 250), d = await conta_("PAGAR", 250);
    await prisma.$transaction((tx) => ext.conciliarTx(tx, tx2, [c.id, d.id]));
    expect((await prisma.transacaoBancaria.findUniqueOrThrow({ where: { id: tx2 } })).situacao).toBe("CONCILIADA");
  });

  it("várias linhas pagam uma conta: divide a conta, confere a soma e pode deixar o resto em aberto", async () => {
    const l = await conta_("RECEBER", 1000, "Venda 9001");
    await prisma.lancamentoRateio.create({ data: { lancamentoId: l.id, categoriaId: catReceber, fracao: 1 } });
    const a = await linha("j1", 500, "Pix recebido - Cliente", "2026-11-10");
    const b = await linha("j2", 300, "Pix recebido - Cliente", "2026-11-12");
    const c = await linha("j3", 900, "Pix recebido - Cliente", "2026-11-13");
    await expect(prisma.$transaction((tx) => ext.conciliarLinhasTx(tx, [a, c], l.id))).rejects.toThrow(/passa do valor da conta/);
    await expect(prisma.$transaction((tx) => ext.conciliarLinhasTx(tx, [a, b], l.id))).rejects.toThrow(/faltam R\$\s200,00/);
    const r = await prisma.$transaction((tx) => ext.conciliarLinhasTx(tx, [a, b], l.id, { deixarRestante: true }));
    expect(r).toEqual({ partes: 3, restante: 200 });
    const partes = await prisma.lancamento.findMany({ where: { descricao: { startsWith: "Venda 9001" } }, include: { rateio: true }, orderBy: { descricao: "asc" } });
    expect(partes.map((p) => [p.descricao, Number(p.valor), p.pagoEm?.toISOString().slice(0, 10) ?? null, p.rateio.length])).toEqual([
      ["Venda 9001 (parte 1/3)", 500, "2026-11-10", 1],
      ["Venda 9001 (parte 2/3)", 300, "2026-11-12", 1],
      ["Venda 9001 (parte 3/3)", 200, null, 1],
    ]);
    expect(partes.reduce((s, p) => s + Number(p.valor), 0)).toBe(1000);
    // desfazer uma linha volta a parte dela para em aberto
    await prisma.$transaction((tx) => ext.desfazerTx(tx, b));
    expect((await prisma.lancamento.findFirstOrThrow({ where: { descricao: "Venda 9001 (parte 2/3)" } })).pagoEm).toBeNull();
  });

  it("conferência de saldo com o saldo informado e o aviso diário pelo WhatsApp (uma vez por dia, depois da hora)", async () => {
    const l = await conta_("PAGAR", 300);
    const tx1 = await linha("s1", -300, "Pagamento efetuado - FORNECEDOR", "2026-11-18");
    await prisma.$transaction((tx) => ext.conciliarTx(tx, tx1, [l.id]));
    await linha("s2", 500, "Pix recebido - Alguem", "2026-11-19");
    await saldos.registrarSaldo(conta, dia("2026-11-20"), 1200, "MANUAL");
    const r = await saldos.conferenciaSaldo(conta, 5, dia("2026-11-20"));
    expect(r.linhas.map((d) => [d.data, d.saldoBanco, d.saldoSistema, d.diferenca])).toEqual([
      ["2026-11-16", 1000, 1000, 0], ["2026-11-17", 1000, 1000, 0], ["2026-11-18", 700, 700, 0], ["2026-11-19", 1200, 700, 500], ["2026-11-20", 1200, 700, 500],
    ]);

    await zap.salvarConfigWhatsapp({ ativo: true, url: "", token: "segredo", salvarNoTicket: true, convidarAreaCliente: true });
    await aviso.salvarConfigAviso({ ativo: true, numeros: "(11) 98765-4321\n11987654321", hora: 9 });
    expect((await aviso.configAviso()).numeros).toEqual(["5511987654321"]);
    const enviados: string[] = [];
    const transporte = async (e: { texto: string }) => { enviados.push(e.texto); };
    // 8h em Brasília: ainda não
    expect((await aviso.enviarAvisoConciliacao({ agora: new Date("2026-11-21T11:00:00Z"), transporte })).motivo).toBe("antes das 9h");
    const ok = await aviso.enviarAvisoConciliacao({ agora: new Date("2026-11-21T12:30:00Z"), transporte });
    expect(ok.enviado).toBe(1);
    expect(enviados[0]).toContain("Pendentes: 1");
    expect((await aviso.enviarAvisoConciliacao({ agora: new Date("2026-11-21T15:00:00Z"), transporte })).motivo).toBe("já enviado hoje");
    expect(await prisma.mensagemWhatsapp.count({ where: { entidade: "CONCILIACAO", situacao: "ENVIADA" } })).toBe(1);
  });
});
