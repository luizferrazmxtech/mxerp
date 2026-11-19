import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const { garantirPadroes } = await import("@/lib/financeiro/padroes");
const { ClienteInter, ESCOPOS_PADRAO } = await import("@/lib/financeiro/inter");
const bol = await import("@/lib/financeiro/boletos");
const ext = await import("@/lib/financeiro/extrato");
const { diaSP, somarDias } = await import("@/lib/datas");

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
const hoje = diaSP();
const venc = somarDias(hoje, 10);

/** Banco Inter de mentira: guarda as cobranças e responde como a API de Cobrança v3. */
function interFalso() {
  const cobrancas = new Map<string, { cobranca: Record<string, unknown>; boleto: Record<string, unknown>; pix: Record<string, unknown> }>();
  const chamadas: { metodo: string; caminho: string; corpo: unknown; escopo?: string }[] = [];
  const escopos: string[] = [];
  let n = 0;
  const fake = async (metodo: string, url: string, headers: Record<string, string>, corpo: string | null) => {
    const u = new globalThis.URL(url);
    if (u.pathname === "/oauth/v2/token") {
      escopos.push(new URLSearchParams(corpo!).get("scope")!);
      return { status: 200, corpo: JSON.stringify({ access_token: `tok-${escopos.length}`, expires_in: 3600 }) };
    }
    chamadas.push({ metodo, caminho: u.pathname, corpo: corpo ? JSON.parse(corpo) : null });
    const p = u.pathname.replace("/cobranca/v3/cobrancas", "");
    if (metodo === "POST" && p === "") {
      const c = JSON.parse(corpo!);
      const cs = `cs-${++n}`;
      cobrancas.set(cs, {
        cobranca: { codigoSolicitacao: cs, seuNumero: c.seuNumero, situacao: "A_RECEBER", valorNominal: c.valorNominal, dataVencimento: c.dataVencimento, dataSituacao: iso(hoje) },
        boleto: { nossoNumero: `0000${n}`, linhaDigitavel: `07790.00116 ${n}`, codigoBarras: `0779${n}` },
        pix: { txid: `TX${n}`, pixCopiaECola: `00020101PIX${n}` },
      });
      return { status: 200, corpo: JSON.stringify({ codigoSolicitacao: cs }) };
    }
    if (metodo === "GET" && p === "") {
      const lista = [...cobrancas.values()].filter((c) => !u.searchParams.get("seuNumero") || c.cobranca.seuNumero === u.searchParams.get("seuNumero"));
      return { status: 200, corpo: JSON.stringify({ totalPaginas: 1, ultimaPagina: true, cobrancas: lista }) };
    }
    const [, cs, acao] = p.split("/");
    const c = cobrancas.get(cs);
    if (!c) return { status: 404, corpo: "{}" };
    if (metodo === "GET" && !acao) return { status: 200, corpo: JSON.stringify(c) };
    if (metodo === "GET" && acao === "pdf") return { status: 200, corpo: JSON.stringify({ pdf: Buffer.from("%PDF-1.4 boleto").toString("base64") }) };
    if (metodo === "POST" && acao === "cancelar") {
      if (c.cobranca.situacao === "RECEBIDO") return { status: 409, corpo: '{"title":"Cobrança já paga"}' };
      c.cobranca.situacao = "CANCELADO";
      return { status: 202, corpo: "" };
    }
    return { status: 400, corpo: "{}" };
  };
  const pagar = (cs: string, valor: number, data: string, origem = "BOLETO") => Object.assign(cobrancas.get(cs)!.cobranca, { situacao: "RECEBIDO", dataSituacao: data, valorTotalRecebido: valor, origemRecebimento: origem });
  const cliente = () => new ClienteInter({ clientId: "id", clientSecret: "s", cert: "", key: "", conta: null, base: "https://inter.teste", contaErp: "INTER MXTECH", escopos: ESCOPOS_PADRAO }, fake);
  return { fake, chamadas, escopos, cobrancas, pagar, cliente };
}

let boleto: string, pix: string, cat: string, cliente: string;
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Boleto","Lancamento","TransacaoBancaria","Pessoa","FormaPagamento","CategoriaFinanceira","ContaBancaria","IntegracaoInter" CASCADE`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Sequencia" WHERE chave = 'BOLETO'`);
  await prisma.$transaction((tx) => garantirPadroes(tx));
  boleto = (await prisma.formaPagamento.findUniqueOrThrow({ where: { nome: "Boleto" } })).id;
  pix = (await prisma.formaPagamento.findUniqueOrThrow({ where: { nome: "PIX" } })).id;
  cat = (await prisma.categoriaFinanceira.findFirstOrThrow({ where: { nome: "Venda de produtos" } })).id;
  cliente = (await prisma.pessoa.create({ data: {
    nome: "FOLK COMERCIO LTDA", documento: "12345678000195", tipoPessoa: "JURIDICA", logradouro: "Rua das Flores", numero: "10", bairro: "Centro",
    cidade: "São Paulo", uf: "SP", cep: "01001-000", email: "financeiro@folk.com", celular: "(11) 98765-4321",
  } })).id;
});

const parcela = (o: { valor?: number; forma?: string; pessoaId?: string | null; vencimento?: Date; origemId?: string; parcela?: number; idLegado?: string } = {}) =>
  prisma.lancamento.create({ data: {
    tipo: "RECEBER", descricao: "Venda de nº 77", valor: o.valor ?? 100, vencimento: o.vencimento ?? venc, competencia: hoje, categoriaId: cat,
    pessoaId: o.pessoaId === undefined ? cliente : o.pessoaId, formaPagamentoId: o.forma ?? boleto, origemTipo: "VENDA", origemId: o.origemId ?? "venda-77",
    parcela: o.parcela ?? 1, totalParcelas: 2, idLegado: o.idLegado,
  } });

describe("boletos do Inter", () => {
  it("a forma Boleto vem marcada para gerar boleto no Inter", async () => {
    expect((await prisma.formaPagamento.findUniqueOrThrow({ where: { id: boleto } })).boletoInter).toBe(true);
    expect((await prisma.formaPagamento.findUniqueOrThrow({ where: { id: pix } })).boletoInter).toBe(false);
  });

  it("registra um boleto por parcela de boleto, com pagador, multa e juros; token de cobrança separado do extrato", async () => {
    const f = interFalso();
    const p1 = await parcela();
    const p2 = await parcela({ parcela: 2, vencimento: somarDias(venc, 30) });
    await parcela({ forma: pix, parcela: 3 }); // Pix não vira boleto
    const r = await bol.boletosDoDocumento({ origemTipo: "VENDA", origemId: "venda-77" }, { cliente: f.cliente() });
    expect(r).toEqual({ emitidos: 2, erros: [] });
    expect(f.escopos).toEqual(["boleto-cobranca.read boleto-cobranca.write"]);

    const post = f.chamadas.find((c) => c.metodo === "POST")!.corpo as Record<string, any>;
    expect(post).toMatchObject({
      seuNumero: "1", valorNominal: 100, dataVencimento: iso(venc), numDiasAgenda: 30,
      multa: { codigo: "PERCENTUAL", taxa: 2 }, mora: { codigo: "TAXAMENSAL", taxa: 1 },
      mensagem: { linha1: "Venda de nº 77 (1/2)" },
      pagador: { cpfCnpj: "12345678000195", tipoPessoa: "JURIDICA", nome: "FOLK COMERCIO LTDA", endereco: "Rua das Flores", cidade: "São Paulo", uf: "SP", cep: "01001000", ddd: "11", telefone: "987654321" },
    });
    const b1 = await prisma.boleto.findFirstOrThrow({ where: { lancamentoId: p1.id } });
    expect(b1).toMatchObject({ situacao: "A_RECEBER", codigoSolicitacao: "cs-1", nossoNumero: "00001", linhaDigitavel: "07790.00116 1", pixCopiaECola: "00020101PIX1" });
    expect(b1.token.length).toBeGreaterThanOrEqual(20);
    expect(await prisma.boleto.count({ where: { lancamentoId: p2.id } })).toBe(1);

    // de novo: não duplica
    expect(await bol.boletosDoDocumento({ origemTipo: "VENDA", origemId: "venda-77" }, { cliente: f.cliente() })).toEqual({ emitidos: 0, erros: [] });
    expect(f.cobrancas.size).toBe(2);
    expect((await bol.pdfBoleto(b1.id, await bol.contextoBoletos(f.cliente()))).toString()).toContain("%PDF");
  });

  it("cadastro incompleto vira erro claro no boleto e não é repetido sozinho", async () => {
    const f = interFalso();
    const semEnd = await prisma.pessoa.create({ data: { nome: "JOAO", documento: "123" } });
    const l = await parcela({ pessoaId: semEnd.id });
    const r = await bol.boletosDoDocumento({ lancamentoIds: [l.id] }, { cliente: f.cliente() });
    expect(r.erros[0]).toMatch(/Complete o cadastro de JOAO.*CPF\/CNPJ, endereço, cidade, UF, CEP/);
    expect((await prisma.boleto.findFirstOrThrow({ where: { lancamentoId: l.id } })).situacao).toBe("ERRO");
    expect((await bol.boletosDoDocumento({ lancamentoIds: [l.id] }, { cliente: f.cliente() })).emitidos).toBe(0);
    expect(f.chamadas.filter((c) => c.metodo === "POST")).toHaveLength(0);
  });

  it("não emite para contas migradas nem para as lançadas antes de ligar os boletos", async () => {
    const f = interFalso();
    const antiga = await parcela({ idLegado: "gc:1" });
    const antes = await parcela({ parcela: 2 });
    await prisma.integracaoInter.create({ data: { clientId: "x", clientSecretCifrado: "x", certificado: "x", chaveCifrada: "x", boletosDesde: new Date(Date.now() + 1000) } });
    const r = await bol.boletosDoDocumento({ lancamentoIds: [antiga.id, antes.id] }, { cliente: f.cliente() });
    expect(r.emitidos).toBe(0);
    // o botão "Emitir boleto" continua funcionando para qualquer uma
    await bol.emitirBoleto(antes.id, { cliente: f.cliente() });
    expect(f.cobrancas.size).toBe(1);
  });

  it("baixa a conta quando o boleto é pago, na data do pagamento, com juros, e amarra o extrato", async () => {
    const f = interFalso();
    const l = await parcela();
    const b = await bol.emitirBoleto(l.id, { cliente: f.cliente() });
    f.pagar(b.codigoSolicitacao!, 103.5, iso(somarDias(hoje, -1)), "PIX");

    const r = await bol.sincronizarBoletos({ cliente: f.cliente() });
    expect(r).toMatchObject({ baixados: 1, erros: [] });
    const pago = await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id }, include: { contaBancaria: true } });
    expect(iso(pago.pagoEm!)).toBe(iso(somarDias(hoje, -1)));
    expect(Number(pago.valorPago)).toBeCloseTo(103.5);
    expect(Number(pago.juros)).toBeCloseTo(3.5);
    expect(pago.contaBancaria?.nome).toBe("INTER MXTECH");
    expect((await prisma.boleto.findUniqueOrThrow({ where: { id: b.id } })).origemRecebimento).toBe("PIX");

    // rodar de novo não baixa duas vezes
    expect((await bol.sincronizarBoletos({ cliente: f.cliente() }))!.baixados).toBe(0);

    // a entrada do extrato com o txid do Pix é amarrada à conta (sem casar por valor/data)
    await ext.importarExtrato(pago.contaBancariaId!, [{ data: somarDias(hoje, -1), valor: 103.5, descricao: "PIX RECEBIDO FOLK", documento: "TX1", chave: "inter:Z9" }]);
    const t = await prisma.transacaoBancaria.findFirstOrThrow({ where: { chave: "inter:Z9" } });
    expect(t.situacao).toBe("CONCILIADA");
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } })).transacaoId).toBe(t.id);
  });

  it("extrato com o nosso número baixa a conta do boleto mesmo antes da consulta de boletos", async () => {
    const f = interFalso();
    const l = await parcela();
    await bol.emitirBoleto(l.id, { cliente: f.cliente() });
    const conta = await prisma.contaBancaria.create({ data: { nome: "INTER MXTECH" } });
    const outra = await parcela({ origemId: "venda-78" }); // mesma pessoa e valor: não é baixada
    const r = await ext.importarExtrato(conta.id, [{ data: hoje, valor: 100, descricao: "BOLETO RECEBIDO FOLK", documento: "00001", chave: "inter:B1" }]);
    expect(r.baixadas).toBe(1);
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } })).pagoEm).not.toBeNull();
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id: outra.id } })).pagoEm).toBeNull();
  });

  it("cancela no Inter o boleto de parcela apagada e o de conta recebida à mão", async () => {
    const f = interFalso();
    const l1 = await parcela();
    const l2 = await parcela({ parcela: 2 });
    const b1 = await bol.emitirBoleto(l1.id, { cliente: f.cliente() });
    const b2 = await bol.emitirBoleto(l2.id, { cliente: f.cliente() });

    await prisma.lancamento.delete({ where: { id: l1.id } }); // venda editada: parcela refeita
    await bol.boletosDoDocumento({ lancamentoIds: [] }, { cliente: f.cliente() });
    expect((await prisma.boleto.findUniqueOrThrow({ where: { id: b1.id } })).situacao).toBe("CANCELADO");
    expect(f.cobrancas.get(b1.codigoSolicitacao!)!.cobranca.situacao).toBe("CANCELADO");

    expect(await bol.cancelarBoletosDoLancamento(l2.id, "Recebido em dinheiro", { cliente: f.cliente() })).toBe(1);
    expect((await prisma.boleto.findUniqueOrThrow({ where: { id: b2.id } })).situacao).toBe("CANCELADO");
  });

  it("webhook não confia no aviso: consulta o Inter antes de baixar", async () => {
    const f = interFalso();
    const l = await parcela();
    const b = await bol.emitirBoleto(l.id, { cliente: f.cliente() });
    // aviso forjado dizendo que pagou
    await bol.receberWebhook([{ codigoSolicitacao: b.codigoSolicitacao, situacao: "RECEBIDO", valorTotalRecebido: 100 }], { cliente: f.cliente() });
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } })).pagoEm).toBeNull();
    // pagou de verdade
    f.pagar(b.codigoSolicitacao!, 100, iso(hoje));
    expect(await bol.receberWebhook([{ codigoSolicitacao: b.codigoSolicitacao }, { codigoSolicitacao: "de-outro-sistema" }], { cliente: f.cliente() })).toBe(1);
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } })).pagoEm).not.toBeNull();
  });

  it("recupera boleto que ficou no meio do registro e emite as parcelas que ficaram sem boleto", async () => {
    const f = interFalso();
    const l = await parcela();
    const b = await bol.emitirBoleto(l.id, { cliente: f.cliente() });
    // simula queda do servidor: a resposta do Inter não foi gravada
    await prisma.boleto.update({ where: { id: b.id }, data: { codigoSolicitacao: null, situacao: "EMITINDO", nossoNumero: null, linhaDigitavel: null, createdAt: new Date(Date.now() - 3600000) } });
    const sem = await parcela({ parcela: 2 }); // lançada por outro caminho, sem boleto
    const r = await bol.sincronizarBoletos({ cliente: f.cliente() });
    expect(r!.emitidos).toBe(1);
    expect(await prisma.boleto.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ codigoSolicitacao: "cs-1", situacao: "A_RECEBER", nossoNumero: "00001" });
    expect(await prisma.boleto.count({ where: { lancamentoId: sem.id, situacao: "A_RECEBER" } })).toBe(1);
  });

  it("vencimento no passado e valor abaixo do mínimo não vão ao banco", async () => {
    const f = interFalso();
    const vencida = await parcela({ vencimento: somarDias(hoje, -2) });
    await expect(bol.emitirBoleto(vencida.id, { cliente: f.cliente() })).rejects.toThrow(/já passou/);
    const pouco = await parcela({ valor: 2, parcela: 2 });
    await expect(bol.emitirBoleto(pouco.id, { cliente: f.cliente() })).rejects.toThrow(/2,50/);
    expect(f.chamadas.filter((c) => c.metodo === "POST")).toHaveLength(0);
  });
});
