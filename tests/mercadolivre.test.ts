import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;
process.env.CHAVE_SEGREDOS ??= "chave-de-teste-do-mercado-livre-123";

const { prisma } = await import("@/lib/db");
const est = await import("@/lib/estoque/estoque");
const ml = await import("@/lib/marketplaces/mercadolivre");
type PedidoML = import("@/lib/marketplaces/mercadolivre").PedidoML;
type PagamentoMP = import("@/lib/marketplaces/mercadolivre").PagamentoMP;

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

/** Mercado Livre + Mercado Pago de mentira: guarda pedidos e pagamentos e responde como a API. */
function mlFalso() {
  const pedidos = new Map<string, PedidoML>();
  const pagamentos = new Map<string, PagamentoMP>();
  const chamadas: string[] = [];
  let tokens = 0;
  const transporte = async (metodo: string, url: string, headers: Record<string, string>, corpo: string | null) => {
    const u = new globalThis.URL(url);
    chamadas.push(`${metodo} ${u.host}${u.pathname}`);
    if (u.pathname === "/oauth/token") {
      const f = new URLSearchParams(corpo ?? "");
      if (f.get("grant_type") === "authorization_code" && f.get("code") !== "TG-bom") return { status: 400, corpo: JSON.stringify({ error: "invalid_grant", message: "code expired" }) };
      tokens++;
      return { status: 200, corpo: JSON.stringify({ access_token: `APP_USR-${tokens}`, refresh_token: `TG-refresh-${tokens}`, expires_in: 21600, user_id: 123456 }) };
    }
    if (!headers.Authorization?.startsWith("Bearer APP_USR-")) return { status: 401, corpo: "{}" };
    if (u.pathname === "/users/me") return { status: 200, corpo: JSON.stringify({ id: 123456, nickname: "MXTECH_LOJA" }) };
    if (u.pathname === "/orders/search") {
      const lista = [...pedidos.values()];
      return { status: 200, corpo: JSON.stringify({ results: lista, paging: { total: lista.length } }) };
    }
    let m = /^\/orders\/(\d+)\/billing_info$/.exec(u.pathname);
    if (m) return { status: 200, corpo: JSON.stringify({ billing_info: { doc_type: "CPF", doc_number: "52998224725", additional_info: [{ type: "FIRST_NAME", value: "Maria" }, { type: "LAST_NAME", value: "Souza" }] } }) };
    m = /^\/orders\/(\d+)$/.exec(u.pathname);
    if (m) return pedidos.has(m[1]) ? { status: 200, corpo: JSON.stringify(pedidos.get(m[1])) } : { status: 404, corpo: "{}" };
    m = /^\/v1\/payments\/(\d+)$/.exec(u.pathname);
    if (m && u.host === "api.mercadopago.com") return pagamentos.has(m[1]) ? { status: 200, corpo: JSON.stringify(pagamentos.get(m[1])) } : { status: 404, corpo: "{}" };
    return { status: 404, corpo: "{}" };
  };
  return { pedidos, pagamentos, chamadas, transporte };
}

let prod = "", loc = "";
const iso = (d: Date) => d.toISOString().slice(0, 10);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "PedidoMarketplace","AnuncioMarketplace","IntegracaoMarketplace","Lancamento","VendaItem","Venda","Reserva","MovimentoEstoque","Saldo","Produto","Local","Deposito","Pessoa","Sequencia" CASCADE`);
  await prisma.situacaoVendaConfig.updateMany({ data: { bloqueados: [], permiteEdicao: true } });
  const dep = await prisma.deposito.create({ data: { nome: "Loja" } });
  loc = (await prisma.local.create({ data: { depositoId: dep.id, codigo: "A-01" } })).id;
  prod = (await prisma.produto.create({ data: { codigo: "NB1500", nome: "Nobreak 1500VA", precoVenda: 1240, custo: 800, localPadraoId: loc } })).id;
  await prisma.$transaction((tx) => est.entrada(tx, { produtoId: prod, localId: loc, quantidade: 5, origemTipo: "IMPLANTACAO" }));
  await ml.salvarConfigML({
    ativo: true, clientId: "1234567890123456", clientSecret: "segredo-do-app", redirectUri: "https://erp.mxtech.inf.br/api/mercadolivre/callback",
    empresaId: "", contaBancariaId: "", situacaoVendaId: "", formaPagamentoId: "", canalVenda: "Mercado Livre", importarDesde: "2026-11-01", cancelarAuto: true, sincronizarAuto: true,
  });
});

async function conectar(f: ReturnType<typeof mlFalso>) {
  const link = await ml.linkAutorizacaoML();
  const state = new globalThis.URL(link).searchParams.get("state");
  return ml.conectarML(`https://erp.mxtech.inf.br/api/mercadolivre/callback?code=TG-bom&state=${state}`, { transporte: f.transporte });
}

const pedido = (id: string, m: Partial<PedidoML> = {}): PedidoML => ({
  id, status: "paid", date_created: "2026-11-20T10:00:00.000-03:00", date_closed: "2026-11-20T10:01:00.000-03:00", total_amount: 1200, paid_amount: 1200,
  order_items: [{ item: { id: "MLB111", title: "Nobreak 1500VA bivolt", seller_sku: "NB1500" }, quantity: 1, unit_price: 1200, sale_fee: 168 }],
  payments: [{ id: `9${id}`, status: "approved", transaction_amount: 1200, total_paid_amount: 1230, shipping_cost: 30 }],
  buyer: { id: 77, nickname: "MARIASOUZA", first_name: "Maria", last_name: "Souza" }, ...m,
});
const pagamento = (id: string, m: Partial<PagamentoMP> = {}): PagamentoMP => ({
  id, status: "approved", transaction_amount: 1200, date_approved: "2026-11-20T10:01:00.000-03:00",
  money_release_date: "2026-12-05T10:00:00.000-03:00", money_release_status: "pending",
  transaction_details: { net_received_amount: 1001.4 }, fee_details: [{ type: "ml_fee", amount: 168, fee_payer: "collector" }, { type: "mercadopago_fee", amount: 30.6, fee_payer: "collector" }], ...m,
});

describe("conexão com o Mercado Livre", () => {
  it("troca o código pelo token, guarda cifrado e descobre a conta; recusa código de outra tentativa", async () => {
    const f = mlFalso();
    expect(ml.extrairCodigo("TG-abc").code).toBe("TG-abc");
    expect(ml.extrairCodigo("https://x.com/cb?code=TG-xyz&state=1")).toEqual({ code: "TG-xyz", state: "1" });
    await ml.linkAutorizacaoML();
    await expect(ml.conectarML("https://x.com/cb?code=TG-bom&state=outro", { transporte: f.transporte })).rejects.toThrow(/antigo/);
    expect(await conectar(f)).toEqual({ contaId: "123456", contaNome: "MXTECH_LOJA" });
    const r = await prisma.integracaoMarketplace.findUniqueOrThrow({ where: { id: "MERCADO_LIVRE" } });
    expect(r.accessTokenCifrado).toMatch(/^v1:/);
    expect(r.refreshTokenCifrado).not.toContain("TG-refresh");
    expect(r.clientSecretCifrado).not.toContain("segredo");
    expect((await ml.configMLTela()).conectado).toBe(true);
  });

  it("renova o token vencido com o refresh token (e guarda o novo)", async () => {
    const f = mlFalso();
    await conectar(f);
    await prisma.integracaoMarketplace.update({ where: { id: "MERCADO_LIVRE" }, data: { tokenExpiraEm: new Date(Date.now() - 1000) } });
    const antes = await prisma.integracaoMarketplace.findUniqueOrThrow({ where: { id: "MERCADO_LIVRE" } });
    await ml.sincronizarMercadoLivre({ transporte: f.transporte });
    const depois = await prisma.integracaoMarketplace.findUniqueOrThrow({ where: { id: "MERCADO_LIVRE" } });
    expect(depois.refreshTokenCifrado).not.toBe(antes.refreshTokenCifrado);
    expect(depois.tokenExpiraEm!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("pedidos do Mercado Livre", () => {
  it("pedido pago vira venda com estoque baixado e conta a receber na data da liberação; na liberação baixa e lança a tarifa", async () => {
    const f = mlFalso();
    await conectar(f);
    f.pedidos.set("2000001", pedido("2000001"));
    f.pagamentos.set("92000001", pagamento("92000001"));

    const r1 = await ml.sincronizarMercadoLivre({ transporte: f.transporte, agora: new Date("2026-11-21T12:00:00Z") });
    expect(r1).toMatchObject({ pedidos: 1, vendas: 1, baixas: 0, erros: [] });
    const p = await prisma.pedidoMarketplace.findUniqueOrThrow({ where: { canal_externoId: { canal: "MERCADO_LIVRE", externoId: "2000001" } } });
    expect(p).toMatchObject({ etapa: "AGUARDANDO_LIBERACAO", compradorDocumento: "52998224725", compradorNome: "Maria Souza" });
    expect(Number(p.liquido)).toBe(1001.4);
    const v = await prisma.venda.findUniqueOrThrow({ where: { id: p.vendaId! }, include: { cliente: true, itens: true } });
    expect(v).toMatchObject({ situacao: "CONCLUIDA", canal: "Mercado Livre" });
    expect(v.cliente?.documento).toBe("52998224725");
    expect(v.observacoes).toContain("Pedido Mercado Livre nº 2000001");
    expect(Number(v.total)).toBe(1200);
    expect(await prisma.$transaction((tx) => est.resumoProduto(tx, prod))).toMatchObject({ fisico: 4 });
    const [l] = await prisma.lancamento.findMany({ where: { origemTipo: "VENDA", origemId: v.id }, include: { formaPagamento: true } });
    expect(iso(l.vencimento)).toBe("2026-12-05");
    expect(l.pagoEm).toBeNull();
    expect(l.formaPagamento?.nome).toBe("Mercado Pago");

    // rodar de novo antes da liberação: nada muda, nada duplica
    expect(await ml.sincronizarMercadoLivre({ transporte: f.transporte, agora: new Date("2026-11-22T12:00:00Z") })).toMatchObject({ vendas: 0, baixas: 0 });
    expect(await prisma.venda.count()).toBe(1);

    // o Mercado Pago libera o dinheiro
    f.pagamentos.set("92000001", pagamento("92000001", { money_release_status: "released" }));
    const r3 = await ml.sincronizarMercadoLivre({ transporte: f.transporte, agora: new Date("2026-12-05T15:00:00Z") });
    expect(r3).toMatchObject({ baixas: 1, erros: [] });
    const pago = await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id }, include: { contaBancaria: true } });
    expect(iso(pago.pagoEm!)).toBe("2026-12-05");
    expect(Number(pago.valorPago)).toBe(1200);
    expect(pago.contaBancaria?.nome).toBe("Mercado Pago");
    const tarifa = await prisma.lancamento.findFirstOrThrow({ where: { tipo: "PAGAR" }, include: { categoria: true } });
    expect(Number(tarifa.valor)).toBe(198.6);
    expect(tarifa.categoria.nome).toBe("Tarifas de marketplace");
    expect(iso(tarifa.pagoEm!)).toBe("2026-12-05");
    expect(await prisma.pedidoMarketplace.findFirstOrThrow()).toMatchObject({ etapa: "LIBERADO" });

    // de novo: não baixa nem lança tarifa duas vezes
    expect(await ml.sincronizarMercadoLivre({ transporte: f.transporte, agora: new Date("2026-12-06T15:00:00Z") })).toMatchObject({ baixas: 0 });
    expect(await prisma.lancamento.count({ where: { tipo: "PAGAR" } })).toBe(1);
  });

  it("SKU que não casa fica 'sem vínculo'; ligar o anúncio ao produto gera a venda", async () => {
    const f = mlFalso();
    await conectar(f);
    f.pedidos.set("2000002", pedido("2000002", { order_items: [{ item: { id: "MLB222", title: "Nobreak genérico", seller_sku: "XPTO" }, quantity: 2, unit_price: 600 }] }));
    f.pagamentos.set("92000002", pagamento("92000002"));
    expect(await ml.sincronizarMercadoLivre({ transporte: f.transporte })).toMatchObject({ semVinculo: 1, vendas: 0 });
    const a = await prisma.anuncioMarketplace.findFirstOrThrow({ where: { anuncioId: "MLB222" } });
    expect(a).toMatchObject({ sku: "XPTO", produtoId: null });
    await expect(ml.vincularAnuncio(a.id, "NAOEXISTE", { transporte: f.transporte })).rejects.toThrow(/Não há produto/);
    expect(await ml.vincularAnuncio(a.id, "NB1500", { transporte: f.transporte })).toEqual({ reprocessados: 1 });
    const p = await prisma.pedidoMarketplace.findFirstOrThrow();
    expect(p.etapa).toBe("AGUARDANDO_LIBERACAO");
    const v = await prisma.venda.findUniqueOrThrow({ where: { id: p.vendaId! }, include: { itens: true } });
    expect(Number(v.itens[0].quantidade)).toBe(2);
  });

  it("pedido cancelado antes da liberação cancela a venda e devolve o estoque", async () => {
    const f = mlFalso();
    await conectar(f);
    f.pedidos.set("2000003", pedido("2000003"));
    f.pagamentos.set("92000003", pagamento("92000003"));
    await ml.sincronizarMercadoLivre({ transporte: f.transporte });
    expect(await prisma.$transaction((tx) => est.resumoProduto(tx, prod))).toMatchObject({ fisico: 4 });
    f.pedidos.set("2000003", pedido("2000003", { status: "cancelled", payments: [{ id: "92000003", status: "refunded", transaction_amount: 1200 }] }));
    expect(await ml.sincronizarMercadoLivre({ transporte: f.transporte })).toMatchObject({ cancelados: 1, erros: [] });
    const p = await prisma.pedidoMarketplace.findFirstOrThrow();
    expect(p.etapa).toBe("CANCELADO");
    expect(await prisma.venda.findUniqueOrThrow({ where: { id: p.vendaId! } })).toMatchObject({ situacao: "CANCELADA" });
    expect(await prisma.lancamento.count({ where: { origemTipo: "VENDA", origemId: p.vendaId! } })).toBe(0);
    expect(await prisma.$transaction((tx) => est.resumoProduto(tx, prod))).toMatchObject({ fisico: 5 });
  });

  it("pedidos de antes da data de início são ignorados; aguardando pagamento não gera venda; o mesmo comprador reaproveita o cadastro", async () => {
    const f = mlFalso();
    await conectar(f);
    f.pedidos.set("1999999", pedido("1999999", { date_created: "2026-10-20T10:00:00.000-03:00", date_closed: "2026-10-20T10:00:00.000-03:00" }));
    f.pedidos.set("2000004", pedido("2000004", { status: "payment_required", payments: [{ id: "92000004", status: "pending", transaction_amount: 1200 }] }));
    f.pedidos.set("2000005", pedido("2000005"));
    f.pedidos.set("2000006", pedido("2000006"));
    for (const id of ["92000005", "92000006"]) f.pagamentos.set(id, pagamento(id));
    expect(await ml.sincronizarMercadoLivre({ transporte: f.transporte })).toMatchObject({ pedidos: 4, vendas: 2 });
    const etapas = Object.fromEntries((await prisma.pedidoMarketplace.findMany()).map((p) => [p.externoId, p.etapa]));
    expect(etapas).toEqual({ "1999999": "IGNORADO", "2000004": "AGUARDANDO_PAGAMENTO", "2000005": "AGUARDANDO_LIBERACAO", "2000006": "AGUARDANDO_LIBERACAO" });
    expect(await prisma.pessoa.count()).toBe(1);
  });

  it("notificação com token errado é recusada; com o certo reprocessa o pedido", async () => {
    const f = mlFalso();
    await conectar(f);
    f.pedidos.set("2000007", pedido("2000007"));
    f.pagamentos.set("92000007", pagamento("92000007"));
    expect(await ml.receberNotificacaoML("errado", { topic: "orders_v2", resource: "/orders/2000007" }, { transporte: f.transporte })).toEqual({ status: 404 });
    const token = (await prisma.integracaoMarketplace.findUniqueOrThrow({ where: { id: "MERCADO_LIVRE" } })).webhookToken!;
    expect(await ml.receberNotificacaoML(token, { topic: "orders_v2", resource: "/orders/2000007", user_id: 123456 }, { transporte: f.transporte })).toEqual({ status: 200, etapa: "AGUARDANDO_LIBERACAO" });
    expect(await ml.receberNotificacaoML(token, { topic: "questions", resource: "/questions/1" }, { transporte: f.transporte })).toMatchObject({ ignorado: "questions" });
  });
});
