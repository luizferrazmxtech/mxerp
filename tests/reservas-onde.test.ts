import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const { naLoja, limparCacheLojas } = await import("@/lib/empresa/loja");
const { reservasDosProdutos, reservasDoProduto } = await import("@/lib/estoque/reservas");

execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });

async function limpar() {
  await prisma.$executeRawUnsafe(`TRUNCATE "Reserva", "Venda", "OrdemServico", "Empresa", "Pessoa", "Produto" CASCADE`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Local" WHERE codigo LIKE 'T-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Deposito" WHERE nome LIKE 'T-%'`);
  limparCacheLojas();
}
beforeEach(limpar);
afterAll(limpar);

describe("onde o produto está reservado", () => {
  it("agrupa as reservas por venda/OS, com link, prateleira e falta, só da empresa escolhida", async () => {
    const a = await prisma.empresa.create({ data: { razaoSocial: "MXTECH LTDA", cnpj: "12965283000195", createdAt: new Date("2026-01-01") } });
    const b = await prisma.empresa.create({ data: { razaoSocial: "VFX INFO SERVICE", cnpj: "36130603000155" } });
    limparCacheLojas();
    const cli = await prisma.pessoa.create({ data: { nome: "JOAO", fantasia: "JOAO ME", cliente: true } });
    const prod = await prisma.produto.create({ data: { codigo: "T-1", nome: "T-MICROSD" } });
    const depA = await prisma.deposito.create({ data: { nome: "T-Loja A", empresaId: a.id } });
    const depB = await prisma.deposito.create({ data: { nome: "T-Loja B", empresaId: b.id } });
    const locA = await prisma.local.create({ data: { depositoId: depA.id, codigo: "T-A1" } });
    const locB = await prisma.local.create({ data: { depositoId: depB.id, codigo: "T-B1" } });

    const os = await naLoja(a.id, () => prisma.ordemServico.create({ data: { numero: 990101, clienteId: cli.id } }));
    const venda = await naLoja(a.id, () => prisma.venda.create({ data: { numero: 990201, clienteId: cli.id } }));
    const osB = await naLoja(b.id, () => prisma.ordemServico.create({ data: { numero: 990102, clienteId: cli.id } }));
    const res = (origemTipo: "OS" | "VENDA", origemId: string, quantidade: number, localId: string | null, status: "ATIVA" | "BAIXADA" = "ATIVA") =>
      prisma.reserva.create({ data: { produtoId: prod.id, quantidade, origemTipo, origemId, origemItemId: "x", localId, status } });
    await res("OS", os.id, 2, locA.id);
    await res("OS", os.id, 1, null); // parte em falta
    await res("VENDA", venda.id, 4, locA.id);
    await res("VENDA", venda.id, 9, locA.id, "BAIXADA"); // já saiu: não conta
    await res("OS", osB.id, 5, locB.id); // outra empresa
    await res("OS", osB.id, 3, null); // falta da outra empresa

    const docsA = await naLoja(a.id, () => reservasDoProduto(prod.id));
    expect(docsA.map((d) => d.rotulo).sort()).toEqual(["OS #990101", "Venda #990201"]);
    const dOs = docsA.find((d) => d.tipo === "OS")!;
    expect(dOs).toMatchObject({ href: `/os/${os.id}`, quantidade: 3, falta: 1, pessoa: "JOAO ME" });
    expect(dOs.locais).toEqual([{ codigo: "T-A1", deposito: "T-Loja A", quantidade: 2 }]);
    expect(docsA.find((d) => d.tipo === "VENDA")).toMatchObject({ href: `/vendas/${venda.id}`, quantidade: 4, falta: 0 });

    const docsB = await naLoja(b.id, () => reservasDosProdutos([prod.id]));
    expect(docsB.get(prod.id)!.map((d) => [d.rotulo, d.quantidade])).toEqual([["OS #990102", 8]]);
  });
});
