import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;
process.env.CHAVE_SEGREDOS ??= "chave-de-teste-do-whatsapp-123";

const { prisma } = await import("@/lib/db");
const painel = await import("@/lib/relatorios/painel");
const resumo = await import("@/lib/relatorios/resumoSemanal");
const fav = await import("@/lib/relatorios/favoritos");
const zap = await import("@/lib/whatsapp/mxchat");
const rota = await import("@/app/api/relatorios/[tipo]/route");

const d = (s: string) => new Date(`${s}T15:00:00Z`);
let ana: string, bia: string, vend: string, cabo: string;

beforeAll(() => execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" }));

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "VendaItem","VendaItemServico","Venda","OrdemServico","Lancamento","Produto","Servico","Pessoa","Usuario","MensagemWhatsapp","ContaBancaria" CASCADE`);
  await prisma.configuracao.deleteMany({ where: { chave: { in: ["relatorios-resumo", "whatsapp"] } } });
  ana = (await prisma.pessoa.create({ data: { nome: "Ana" } })).id;
  bia = (await prisma.pessoa.create({ data: { nome: "Bia" } })).id;
  vend = (await prisma.usuario.create({ data: { nome: "Carlos Vendas", vendedor: true } })).id;
  cabo = (await prisma.produto.create({ data: { codigo: "CABO", nome: "Cabo", precoVenda: 10 } })).id;
});

const venda = (n: number, clienteId: string, dia: string, valor: number, extra: Record<string, unknown> = {}) =>
  prisma.venda.create({ data: { numero: n, clienteId, situacao: "CONCLUIDA", data: d(dia), total: valor, ...extra,
    itens: { create: [{ produtoId: cabo, quantidade: valor / 10, valorUnit: 10, custoUnit: 4, subtotal: valor }] } } });

describe("comparar meses, exportar, favoritos e resumo semanal", () => {
  it("compara dois meses lado a lado", async () => {
    await venda(1, ana, "2026-10-05", 300, { vendedorId: vend, canal: "WhatsApp" });
    await venda(2, bia, "2026-10-06", 100);
    await venda(3, ana, "2026-09-10", 200, { vendedorId: vend });
    const r = await painel.compararPeriodos({ de: new Date("2026-10-01T00:00:00Z"), ate: new Date("2026-10-31T00:00:00Z") }, { de: new Date("2026-09-01T00:00:00Z"), ate: new Date("2026-09-30T00:00:00Z") });
    expect([r.a.receita, r.b.receita]).toEqual([400, 200]);
    expect(r.clientes.map((c) => [c.rotulo, c.a, c.b])).toEqual([["Ana", 300, 200], ["Bia", 100, 0]]);
    expect(r.vendedores.map((c) => [c.rotulo, c.a, c.b])).toEqual([["Carlos Vendas", 300, 200], ["Sem vendedor", 100, 0]]);
    expect(r.canais.map((c) => c.rotulo)).toEqual(["WhatsApp", "Presencial"]);
  });

  it("exporta em Excel e em CSV", async () => {
    await venda(1, ana, "2026-10-05", 300);
    const ctx = { params: Promise.resolve({ tipo: "lucro" }) };
    const csv = await (await rota.GET(new Request("http://x/api/relatorios/lucro?periodo=2026-10&por=cliente"), ctx)).text();
    expect(csv).toContain("Ana;;1;30;300;120;180;60");
    const xlsx = await rota.GET(new Request("http://x/api/relatorios/lucro?periodo=2026-10&por=cliente&formato=xlsx"), ctx);
    expect(xlsx.headers.get("Content-Type")).toContain("spreadsheetml");
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await xlsx.arrayBuffer());
    const ws = wb.worksheets[0];
    expect(ws.getCell("A1").value).toBe("Lucro · Outubro de 2026");
    expect(ws.getRow(4).values).toEqual([undefined, "Ana", "", 1, 30, 300, 120, 180, 60]);
  });

  it("favoritos só aceitam endereços de relatório", () => {
    expect(fav.normalizarFavorito("  Lucro   do mês ", "/relatorios/lucro?periodo=mes&por=vendedor")).toEqual({ nome: "Lucro do mês", url: "/relatorios/lucro?periodo=mes&por=vendedor" });
    expect(fav.normalizarFavorito("DRE", "/financeiro/dre?ano=2026").url).toBe("/financeiro/dre?ano=2026");
    expect(() => fav.normalizarFavorito("x", "https://site.com/relatorios")).toThrow();
    expect(() => fav.normalizarFavorito("x", "//site.com/relatorios")).toThrow();
    expect(() => fav.normalizarFavorito("", "/relatorios")).toThrow("nome");
    expect(fav.favoritosDe({ favoritosRelatorios: [{ nome: "a", url: "/relatorios" }, { nome: 1 }] })).toEqual([{ nome: "a", url: "/relatorios" }]);
    expect(fav.favoritosDe(null)).toEqual([]);
  });

  it("resumo semanal: semana passada, só no dia e hora escolhidos, uma vez", async () => {
    // sábado 21/11 → semana passada = segunda 09/11 a domingo 15/11
    expect(resumo.semanaPassada(new Date("2026-11-21T00:00:00Z"))).toEqual({ de: new Date("2026-11-09T00:00:00Z"), ate: new Date("2026-11-15T00:00:00Z") });
    // segunda 23/11 → 16/11 a 22/11
    expect(resumo.semanaPassada(new Date("2026-11-23T00:00:00Z"))).toEqual({ de: new Date("2026-11-16T00:00:00Z"), ate: new Date("2026-11-22T00:00:00Z") });
    await venda(1, ana, "2026-11-17", 500);
    await venda(2, bia, "2026-11-10", 250);
    await zap.salvarConfigWhatsapp({ ativo: true, url: "", token: "segredo", salvarNoTicket: true, convidarAreaCliente: true });
    await resumo.salvarConfigResumo({ ativo: true, numeros: "(11) 98765-4321", diaSemana: 1, hora: 8 });
    const enviados: string[] = [];
    const transporte = async (e: { texto: string }) => { enviados.push(e.texto); };
    expect((await resumo.enviarResumoSemanal({ agora: new Date("2026-11-22T12:00:00Z"), transporte })).motivo).toBe("só às segundas");
    expect((await resumo.enviarResumoSemanal({ agora: new Date("2026-11-23T10:00:00Z"), transporte })).motivo).toBe("antes das 8h");
    const ok = await resumo.enviarResumoSemanal({ agora: new Date("2026-11-23T12:00:00Z"), transporte });
    expect(ok.enviado).toBe(1);
    expect(enviados[0]).toContain("*Resumo da semana 16/11 a 22/11*");
    expect(enviados[0].replace(/\u00a0/g, " ")).toContain("Faturamento: R$ 500,00 (▲ 100% sobre a semana anterior)");
    expect(enviados[0]).toContain("Maior cliente: Ana");
    expect((await resumo.enviarResumoSemanal({ agora: new Date("2026-11-23T15:00:00Z"), transporte })).motivo).toBe("já enviado hoje");
    expect(await prisma.mensagemWhatsapp.count({ where: { entidade: "RELATORIO", situacao: "ENVIADA" } })).toBe(1);
    await expect(resumo.salvarConfigResumo({ ativo: true, numeros: "", diaSemana: 1, hora: 8 })).rejects.toThrow("ao menos um número");
  });
});
