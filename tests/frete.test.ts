import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;
process.env.CHAVE_SEGREDOS ??= "chave-de-teste-do-frete-123456";

const { prisma } = await import("@/lib/db");
const me = await import("@/lib/frete/melhorEnvio");
const ped = await import("@/lib/vendas/pedidos");
type Dados = import("@/lib/orcamentos/tipos").DadosOrcamento;

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

type Chamada = { url: string; metodo: string; corpo: unknown; auth: string | null; ua: string | null };
/** Melhor Envio falso: responde por caminho e guarda cada chamada. */
function falso(respostas: Record<string, (corpo: unknown) => unknown>) {
  const chamadas: Chamada[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const caminho = new globalThis.URL(url).pathname.replace("/api/v2", "");
    const corpo = init.body ? JSON.parse(String(init.body)) : undefined;
    const h = new Headers(init.headers);
    chamadas.push({ url, metodo: init.method ?? "GET", corpo, auth: h.get("authorization"), ua: h.get("user-agent") });
    const r = respostas[caminho];
    if (!r) return new Response(JSON.stringify({ message: `sem resposta para ${caminho}` }), { status: 404 });
    try { return new Response(JSON.stringify(r(corpo)), { status: 200 }); } catch (e) { return new Response(JSON.stringify({ message: (e as Error).message }), { status: 422 }); }
  }) as unknown as typeof fetch;
  return { f, chamadas };
}

const COTACAO = () => [
  { id: 1, name: "PAC", price: "25.50", delivery_time: 7, company: { name: "Correios", picture: "x.png" }, packages: [{ dimensions: { height: 10, width: 20, length: 30 }, weight: "1.2" }] },
  { id: 2, name: "SEDEX", price: "48.90", delivery_time: 2, company: { name: "Correios" }, packages: [{ dimensions: { height: 10, width: 20, length: 30 }, weight: "1.2" }] },
  { id: 3, name: ".Package", error: "Transportadora não atende este trecho.", company: { name: "Jadlog" } },
];

let cli = "", prod = "", semMedida = "", emp = "";
const u = { id: "", nome: "Caue", papel: "OPERADOR" as const };

const ligar = (m: Partial<Parameters<typeof me.salvarConfigFrete>[0]> = {}) => me.salvarConfigFrete({
  ativo: true, ambiente: "SANDBOX", token: "token-do-melhor-envio", email: "ti@loja.test", cepOrigem: "01310-100", acrescimoPct: 10, acrescimoValor: 2, diasExtras: 1,
  servicos: "", seguro: true, maoPropria: false, avisoRecebimento: false, pacote: { altura: 4, largura: 12, comprimento: 17, peso: 0.3 }, ...m,
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "EnvioFrete","Lancamento","Reserva","VendaItem","Venda","Produto","Pessoa","Sequencia","NotaFiscal" CASCADE`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Configuracao" WHERE chave = 'melhorenvio'`);
  await prisma.situacaoVendaConfig.updateMany({ data: { bloqueados: [], permiteEdicao: true } });
  const dadosEmp = { razaoSocial: "Loja Frete Ltda", cep: "01310100", logradouro: "Av. Paulista", numero: "1000", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP" };
  emp = (await prisma.empresa.upsert({ where: { cnpj: "11222333000181" }, update: dadosEmp, create: { ...dadosEmp, cnpj: "11222333000181" } })).id;
  cli = (await prisma.pessoa.create({ data: { nome: "Maria Souza", cliente: true, documento: "52998224725", celular: "(11) 98765-4321", email: "maria@x.test", cep: "20040-020", logradouro: "Rua do Ouvidor", numero: "50", bairro: "Centro", cidade: "Rio de Janeiro", uf: "RJ" } })).id;
  // medidas do cadastro em metros (como pede o formulário de produto)
  prod = (await prisma.produto.create({ data: { codigo: "NB", nome: "Nobreak 1500VA", precoVenda: 100, peso: 1.2, largura: 0.2, altura: 0.1, comprimento: 0.3 } })).id;
  semMedida = (await prisma.produto.create({ data: { codigo: "CB", nome: "Cabo", precoVenda: 10 } })).id;
  const usuario = await prisma.usuario.upsert({ where: { email: "frete@local.test" }, update: {}, create: { nome: "Caue", email: "frete@local.test", papel: "OPERADOR" } });
  u.id = usuario.id;
});

const dados = (m: Partial<Dados> = {}): Dados => ({
  tipo: "PRODUTO", numero: "", clienteId: cli, clienteNome: "", data: "2026-11-21", validade: "", vendedorId: "", prazoEntrega: "", aosCuidados: "",
  canal: "Internet", centroCusto: "", introducao: "", situacaoId: "sv_aberto",
  produtos: [{ produtoId: prod, nome: "Nobreak", codigo: "NB", unidade: "UN", detalhes: "", quantidade: "2", tipoValorId: "", valorUnit: "100,00", desconto: "0", descontoPct: false }],
  servicos: [], transportadoraId: "", transportadoraNome: "", frete: "30,05", mostrarEntrega: false, enderecoEntregaId: "",
  freteServicoId: "1", freteServicoNome: "Correios PAC", fretePrazoDias: "8",
  desconto: "", descontoPct: false, exibirTotal: true, gerarCondicoes: true, condicao: "AVISTA", formaPagamentoId: "", vencimento: "", intervaloDias: "30", numParcelas: "1", primeiraParcela: "",
  parcelas: [], observacoes: "", observacaoInterna: "", camposExtras: {}, ...m,
});

describe("frete pelo Melhor Envio", () => {
  it("só liga com token e e-mail; o token fica cifrado e não volta para a tela", async () => {
    await expect(ligar({ token: "" })).rejects.toThrow(/token/);
    await expect(ligar({ email: "" })).rejects.toThrow(/e-mail/);
    await ligar();
    const salvo = await prisma.configuracao.findUnique({ where: { chave: "melhorenvio" } });
    expect(JSON.stringify(salvo?.valor)).not.toContain("token-do-melhor-envio");
    const tela = await me.configFreteTela();
    expect(tela).toMatchObject({ temToken: true, cepOrigem: "01310100", ambiente: "SANDBOX" });
    expect(tela).not.toHaveProperty("tokenCifrado");
  });

  it("cota com medidas em cm, caixa padrão para produto sem medida, acréscimos e indisponíveis no fim", async () => {
    await ligar();
    const { f, chamadas } = falso({ "/me/shipment/calculate": COTACAO });
    const r = await me.cotarFrete({ cepDestino: "20040-020", itens: [{ produtoId: prod, quantidade: 2, valor: 200 }, { produtoId: semMedida, quantidade: 1, valor: 10 }] }, { fetch: f });
    expect(chamadas[0].url).toBe("https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate");
    expect(chamadas[0].auth).toBe("Bearer token-do-melhor-envio");
    expect(chamadas[0].ua).toContain("ti@loja.test");
    const corpo = chamadas[0].corpo as { from: { postal_code: string }; to: { postal_code: string }; products: Record<string, number | string>[] };
    expect(corpo.from.postal_code).toBe("01310100");
    expect(corpo.to.postal_code).toBe("20040020");
    expect(corpo.products[0]).toMatchObject({ width: 20, height: 10, length: 30, weight: 1.2, quantity: 2, insurance_value: 200 });
    expect(corpo.products[1]).toMatchObject({ width: 12, height: 4, length: 17, weight: 0.3 });
    expect(r.map((c) => c.servicoId)).toEqual([1, 2, 3]);
    expect(r[0]).toMatchObject({ custo: 25.5, valor: 30.05, prazoDias: 8, transportadora: "Correios", erro: null }); // 25,50 + 10% + R$ 2
    expect(r[2].erro).toMatch(/não atende/);
  });

  it("a venda guarda o serviço escolhido; comprar etiqueta põe no carrinho, paga, gera e lê o rastreio", async () => {
    await ligar();
    const v = await ped.salvarPedido(dados(), u);
    expect(v).toMatchObject({ freteServicoId: 1, freteServicoNome: "Correios PAC", fretePrazoDias: 8 });
    expect(Number(v.frete)).toBe(30.05);
    await prisma.venda.update({ where: { id: v.id }, data: { empresaId: emp } });
    const { f, chamadas } = falso({
      "/me/shipment/calculate": COTACAO,
      "/me/cart": () => ({ id: "ord-1", protocol: "ORD-202611" }),
      "/me/shipment/checkout": () => ({ purchase: { id: "p1", status: "paid" } }),
      "/me/shipment/generate": () => ({ "ord-1": { status: true } }),
      "/me/shipment/tracking": () => ({ "ord-1": { id: "ord-1", status: "released", tracking: "BR123456789BR", melhorenvio_tracking: "ME2611ABC", protocol: "ORD-202611" } }),
    });
    const e = await me.comprarEtiqueta(v.id, 1, "Caue", { fetch: f });
    expect(chamadas.map((c) => c.url.split("/api/v2")[1])).toEqual(["/me/shipment/calculate", "/me/cart", "/me/shipment/checkout", "/me/shipment/generate", "/me/shipment/tracking"]);
    const cart = chamadas[1].corpo as { service: number; from: Record<string, unknown>; to: Record<string, unknown>; volumes: unknown[]; options: Record<string, unknown> };
    expect(cart.service).toBe(1);
    expect(cart.from).toMatchObject({ company_document: "11222333000181", postal_code: "01310100", city: "São Paulo", name: "Loja Frete Ltda" });
    expect(cart.to).toMatchObject({ name: "Maria Souza", document: "52998224725", postal_code: "20040020", number: "50", phone: "11987654321" });
    expect(cart.volumes).toEqual([{ height: 10, width: 20, length: 30, weight: 1.2 }]);
    expect(cart.options).toMatchObject({ non_commercial: true, insurance_value: 200 });
    expect(e).toMatchObject({ meId: "ord-1", rastreio: "BR123456789BR", rastreioMe: "ME2611ABC", servicoNome: "PAC" });
    expect(e.geradaEm).toBeTruthy();
    // não deixa comprar a segunda sem cancelar a primeira
    await expect(me.comprarEtiqueta(v.id, 2, "Caue", { fetch: f })).rejects.toThrow(/já tem uma etiqueta/);
  });

  it("sem saldo para no carrinho; Tentar de novo continua sem pôr no carrinho outra vez", async () => {
    await ligar();
    const v = await ped.salvarPedido(dados(), u);
    let saldo = false;
    const { f, chamadas } = falso({
      "/me/shipment/calculate": COTACAO,
      "/me/cart": () => ({ id: "ord-2" }),
      "/me/shipment/checkout": () => { if (!saldo) throw new Error("Saldo insuficiente"); return {}; },
      "/me/shipment/generate": () => ({}),
      "/me/shipment/tracking": () => ({}),
    });
    await expect(me.comprarEtiqueta(v.id, 2, "Caue", { fetch: f })).rejects.toThrow(/Sem saldo/);
    const e = await prisma.envioFrete.findFirstOrThrow({ where: { vendaId: v.id } });
    expect(e).toMatchObject({ situacao: "CARRINHO", meId: "ord-2" });
    expect(e.erro).toMatch(/Saldo insuficiente/);
    saldo = true;
    const ok = await me.avancarEnvio(e.id, { fetch: f });
    expect(ok.situacao).toBe("GERADA");
    expect(ok.erro).toBeNull();
    expect(chamadas.filter((c) => c.url.endsWith("/me/cart"))).toHaveLength(1);
  });

  it("agendador atualiza o rastreio até entregue; cancelar só antes de postar", async () => {
    await ligar();
    const v = await ped.salvarPedido(dados(), u);
    const a = await prisma.envioFrete.create({ data: { vendaId: v.id, servicoId: 1, servicoNome: "PAC", transportadora: "Correios", valor: 25.5, meId: "ord-a", situacao: "GERADA", pagaEm: new Date(), geradaEm: new Date() } });
    const { f, chamadas } = falso({
      "/me/shipment/tracking": () => ({ "ord-a": { id: "ord-a", status: "delivered", tracking: "BR9", posted_at: "2026-11-22 10:00:00", delivered_at: "2026-11-25 15:30:00" } }),
      "/me/shipment/cancel": () => ({ "ord-a": { canceled: true } }),
    });
    expect(await me.sincronizarFrete({ fetch: f })).toEqual({ consultados: 1, atualizados: 1 });
    const x = await prisma.envioFrete.findUniqueOrThrow({ where: { id: a.id } });
    expect(x).toMatchObject({ situacao: "ENTREGUE", rastreio: "BR9" });
    expect(x.entregueEm?.toISOString()).toBe("2026-11-25T18:30:00.000Z");
    await expect(me.cancelarEnvio(a.id, "", { fetch: f })).rejects.toThrow(/já foi postada/);
    // nada em andamento: o agendador não chama o Melhor Envio
    const antes = chamadas.length;
    expect(await me.sincronizarFrete({ fetch: f })).toEqual({ consultados: 0, atualizados: 0 });
    expect(chamadas.length).toBe(antes);

    const b = await prisma.envioFrete.create({ data: { vendaId: v.id, servicoId: 2, servicoNome: "SEDEX", transportadora: "Correios", valor: 48.9, meId: "ord-b", situacao: "GERADA", pagaEm: new Date(), geradaEm: new Date() } });
    const c = await me.cancelarEnvio(b.id, "Cliente desistiu", { fetch: f });
    expect(c.situacao).toBe("CANCELADA");
    expect(chamadas.at(-1)?.corpo).toMatchObject({ order: { id: "ord-b", description: "Cliente desistiu" } });
  });

  it("desligado: não cota e o agendador ignora", async () => {
    await expect(me.cotarFrete({ cepDestino: "20040020", itens: [{ produtoId: prod, quantidade: 1, valor: 1 }] })).rejects.toThrow(/Ligue o frete/);
    expect(await me.sincronizarFrete()).toEqual({ ignorado: "frete desligado" });
  });
});
