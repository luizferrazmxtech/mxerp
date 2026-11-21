import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;
process.env.CHAVE_SEGREDOS ??= "chave-de-teste-do-open-finance-1";

const { prisma } = await import("@/lib/db");
const of = await import("@/lib/openfinance/openfinance");
const { garantirPadroes } = await import("@/lib/financeiro/padroes");

beforeAll(() => execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" }));

type Chamada = { url: string; metodo: string; corpo: unknown; chave: string | null };
function pluggy(extra: (u: URL, metodo: string) => unknown | undefined = () => undefined) {
  const chamadas: Chamada[] = [];
  let status = "UPDATED";
  const f = (async (url: string, init: RequestInit = {}) => {
    const u = new globalThis.URL(url);
    const metodo = init.method ?? "GET";
    chamadas.push({ url, metodo, corpo: init.body ? JSON.parse(String(init.body)) : undefined, chave: new Headers(init.headers).get("x-api-key") });
    const r = extra(u, metodo);
    const json = r !== undefined ? r
      : u.pathname === "/auth" ? { apiKey: "chave-api" }
      : u.pathname === "/connect_token" ? { accessToken: "tok-connect" }
      : u.pathname === "/items/item-0001-itau" && metodo === "DELETE" ? {}
      : u.pathname.startsWith("/items/") ? { id: "item-0001-itau", status, connector: { name: "Itaú Empresas", imageUrl: "https://x/itau.svg" }, consentExpiresAt: "2027-11-20T00:00:00Z" }
      : u.pathname === "/accounts" ? { results: [
        { id: "acc-cc", type: "BANK", subtype: "CHECKING_ACCOUNT", name: "Conta Corrente", number: "1234/56789-0", balance: 5230.1 },
        { id: "acc-cartao", type: "CREDIT", subtype: "CREDIT_CARD", name: "Cartão Itaú", number: "1111", balance: 800 },
      ] }
      : u.pathname === "/transactions" ? {
        page: Number(u.searchParams.get("page")), totalPages: 2,
        results: u.searchParams.get("page") === "1"
          ? [{ id: "t1", date: "2026-11-18T03:00:00.000Z", description: "PAG BOLETO ENERGIA SA", amount: -350.4, type: "DEBIT" },
             { id: "t2", date: "2026-11-19T03:00:00.000Z", description: "TARIFA PACOTE", amount: -45, type: "DEBIT" }]
          : [{ id: "t3", date: "2026-11-19T03:00:00.000Z", description: "PIX RECEBIDO CLIENTE", amount: 1200, type: "CREDIT" }],
      }
      : { message: "rota desconhecida" };
    return new Response(JSON.stringify(json), { status: (json as { message?: string }).message ? 404 : 200 });
  }) as unknown as typeof fetch;
  return { f, chamadas, mudar: (s: string) => { status = s; } };
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "ConexaoOpenFinance","ContaOpenFinance","TransacaoBancaria","Lancamento","ContaBancaria" CASCADE`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Configuracao" WHERE chave = 'openfinance'`);
});

const ligar = () => of.salvarConfigOpenFinance({ ativo: true, clientId: "cli-123", clientSecret: "segredo-pluggy", diasRetroativos: 10 });

describe("open finance (Pluggy)", () => {
  it("guarda o secret cifrado e exige as credenciais para ligar", async () => {
    await expect(of.salvarConfigOpenFinance({ ativo: true, clientId: "", diasRetroativos: 30 })).rejects.toThrow(/Client ID/);
    await ligar();
    const bruto = JSON.stringify((await prisma.configuracao.findUniqueOrThrow({ where: { chave: "openfinance" } })).valor);
    expect(bruto).not.toContain("segredo-pluggy");
    expect(await of.configOpenFinanceTela()).toMatchObject({ ativo: true, clientId: "cli-123", temSecret: true, diasRetroativos: 10 });
    const p = pluggy();
    expect(await of.tokenConexao(undefined, { fetch: p.f })).toBe("tok-connect");
    expect(p.chamadas[0]).toMatchObject({ metodo: "POST", corpo: { clientId: "cli-123", clientSecret: "segredo-pluggy" } });
    expect(p.chamadas[1].chave).toBe("chave-api");
  });

  it("conecta o banco, liga a conta ao ERP, importa o extrato (paginado) e baixa a conta a pagar que casa", async () => {
    await ligar();
    await garantirPadroes(prisma as never);
    const p = pluggy();
    const hoje = new Date("2026-11-20T00:00:00Z");
    const cx = await of.registrarConexao("item-0001-itau", { fetch: p.f, hoje });
    expect(cx).toMatchObject({ banco: "Itaú Empresas", situacao: "UPDATED" });
    expect(cx.contas.map((c) => [c.nome, c.tipo, Number(c.saldo)]).sort()).toEqual([["Cartão Itaú", "CREDIT", 800], ["Conta Corrente", "BANK", 5230.1]]);
    const cc = cx.contas.find((c) => c.tipo === "BANK")!;
    expect(cc.importarDesde?.toISOString().slice(0, 10)).toBe("2026-11-10");

    // sem conta do ERP ligada, nada é importado
    expect((await of.sincronizarOpenFinance({ fetch: p.f, hoje })).bancos?.["Itaú Empresas"]).toMatch(/nenhuma conta ligada/);

    const erp = await prisma.contaBancaria.create({ data: { nome: "ITAÚ MXTECH", banco: "341" } });
    await of.vincularConta(cc.id, erp.id);
    const outra = cx.contas.find((c) => c.tipo === "CREDIT")!;
    await expect(of.vincularConta(outra.id, erp.id)).rejects.toThrow(/já recebe o extrato/);

    const cat = await prisma.categoriaFinanceira.findFirstOrThrow({ where: { tipo: "PAGAR" } });
    // só baixa sozinho quando o fornecedor confere com o extrato (valor e data não bastam)
    const energia = await prisma.pessoa.create({ data: { nome: "ENERGIA SA" } });
    const luz = await prisma.lancamento.create({ data: { tipo: "PAGAR", descricao: "Conta de energia", pessoaId: energia.id, categoriaId: cat.id, valor: 350.4, vencimento: new Date("2026-11-18T00:00:00Z"), competencia: new Date("2026-11-01T00:00:00Z") } });

    const r = await of.sincronizarOpenFinance({ fetch: p.f, hoje });
    expect(r.bancos?.["Itaú Empresas"]).toBe("ITAÚ MXTECH: 3 novas, 1 baixadas");
    const ts = await prisma.transacaoBancaria.findMany({ orderBy: { chave: "asc" } });
    expect(ts.map((t) => [t.chave, Number(t.valor), t.data.toISOString().slice(0, 10)])).toEqual([
      ["pluggy:t1", -350.4, "2026-11-18"], ["pluggy:t2", -45, "2026-11-19"], ["pluggy:t3", 1200, "2026-11-19"],
    ]);
    expect(await prisma.lancamento.findUniqueOrThrow({ where: { id: luz.id } })).toMatchObject({ contaBancariaId: erp.id });
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id: luz.id } })).pagoEm).not.toBeNull();
    // cartão de crédito não é pedido; o período começa no "importar desde"
    const pedidos = p.chamadas.filter((c) => c.url.includes("/transactions"));
    expect(pedidos.every((c) => c.url.includes("accountId=acc-cc") && c.url.includes("from=2026-11-10") && c.url.includes("to=2026-11-20"))).toBe(true);

    // de novo: nada repetido
    expect((await of.sincronizarOpenFinance({ fetch: p.f, hoje })).bancos?.["Itaú Empresas"]).toBe("ITAÚ MXTECH: 0 novas, 0 baixadas");
  });

  it("autorização recusada aparece na conexão; desconectar apaga no Pluggy e mantém o extrato", async () => {
    await ligar();
    const p = pluggy();
    const cx = await of.registrarConexao("item-0001-itau", { fetch: p.f });
    p.mudar("LOGIN_ERROR");
    const r = await of.sincronizarOpenFinance({ fetch: p.f });
    expect(r.bancos?.["Itaú Empresas"]).toMatch(/Autorização recusada/);
    expect((await prisma.conexaoOpenFinance.findUniqueOrThrow({ where: { id: cx.id } })).situacao).toBe("LOGIN_ERROR");
    await of.desconectar(cx.id, { fetch: p.f });
    expect(p.chamadas.some((c) => c.metodo === "DELETE" && c.url.endsWith("/items/item-0001-itau"))).toBe(true);
    expect(await prisma.conexaoOpenFinance.count()).toBe(0);
    expect(await prisma.contaOpenFinance.count()).toBe(0);
  });

  it("desligado não chama o Pluggy; credencial recusada vira mensagem clara", async () => {
    expect(await of.sincronizarOpenFinance({ fetch: (async () => { throw new Error("não devia chamar"); }) as unknown as typeof fetch })).toEqual({ ignorado: "Open Finance desligado" });
    await ligar();
    const p = pluggy((u) => (u.pathname === "/auth" ? { message: "x" } : undefined));
    const f401 = (async (url: string, init?: RequestInit) => (String(url).endsWith("/auth") ? new Response("{}", { status: 401 }) : p.f(url, init))) as unknown as typeof fetch;
    await expect(of.testarOpenFinance({ fetch: f401 })).rejects.toThrow(/recusou as credenciais/);
  });
});
