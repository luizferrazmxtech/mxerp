import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import ExcelJS from "exceljs";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const est = await import("@/lib/estoque/estoque");
const { lerPlanilha, numeroBr } = await import("@/lib/migracao/planilha");
const imp = await import("@/lib/migracao/importar");

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Reserva","MovimentoEstoque","Saldo","Produto","GrupoProduto","Local","Deposito","Pessoa","Servico" CASCADE`);
});

async function xlsx(linhas: (string | number)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Plan1");
  ws.addRow(["Relatório de produtos"]); // título antes do cabeçalho
  linhas.forEach((l) => ws.addRow(l));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("planilha", () => {
  it("lê CSV com ; e acentos, normalizando cabeçalhos", async () => {
    const csv = "Código;Nome/Razão Social;CPF/CNPJ\n1;João da Silva;123.456.789-09\n";
    const { cabecalhos, linhas } = await lerPlanilha("clientes.csv", Buffer.from(csv, "latin1"));
    expect(cabecalhos).toEqual(["codigo", "nome razao social", "cpf cnpj"]);
    expect(linhas[0]["nome razao social"]).toBe("João da Silva");
  });

  it("lê xlsx pulando linha de título", async () => {
    const buf = await xlsx([["Código", "Nome", "Estoque"], ["P1", "Cabo", 3]]);
    const { linhas } = await lerPlanilha("p.xlsx", buf);
    expect(linhas).toEqual([{ codigo: "P1", nome: "Cabo", estoque: "3" }]);
  });

  it("converte números no formato brasileiro", () => {
    expect(numeroBr("R$ 1.234,56")).toBeCloseTo(1234.56);
    expect(numeroBr("12.5")).toBeCloseTo(12.5);
    expect(numeroBr("-3")).toBe(-3);
  });
});

describe("importação", () => {
  it("simulação não grava e importação é idempotente", async () => {
    const buf = await xlsx([
      ["Código", "Nome", "Valor de venda", "Valor de custo", "Estoque", "NCM", "Localização", "Grupo"],
      ["P1", "Cabo HDMI", "39,90", "12,00", 5, "8544.42.00", "A 01", "Cabos"],
      ["P2", "Mouse", "50", "20", -2, "", "", ""],
      ["P1", "Duplicado", "1", "1", 1, "", "", ""],
      ["", "Sem código", "1", "1", 1, "", "", ""],
    ]);
    const { linhas } = await lerPlanilha("p.xlsx", buf);

    const sim = await imp.importarProdutos(linhas, { simular: true });
    expect(sim.criados).toBe(2);
    expect(sim.ignorados).toHaveLength(2);
    expect(await prisma.produto.count()).toBe(0);

    const r = await imp.importarProdutos(linhas, { simular: false });
    expect(r.criados).toBe(2);
    expect(r.avisos.join(" ")).toMatch(/negativo.*P2/);
    expect(r.avisos.join(" ")).toMatch(/sem NCM.*P2/);

    const p1 = await prisma.produto.findUniqueOrThrow({ where: { codigo: "P1" }, include: { localPadrao: true } });
    expect(Number(p1.precoVenda)).toBeCloseTo(39.9);
    expect(p1.ncm).toBe("85444200");
    expect(p1.localPadrao?.codigo).toBe("A-01");
    const res1 = await prisma.$transaction((tx) => est.resumoProduto(tx, p1.id));
    expect(res1.fisico).toBe(5);
    const p2 = await prisma.produto.findUniqueOrThrow({ where: { codigo: "P2" } });
    expect((await prisma.$transaction((tx) => est.resumoProduto(tx, p2.id))).fisico).toBe(0);

    // rodar de novo com estoque diferente ajusta, sem duplicar
    linhas[0].estoque = "3";
    const r2 = await imp.importarProdutos(linhas, { simular: false });
    expect(r2.atualizados).toBe(2);
    expect(await prisma.produto.count()).toBe(2);
    expect((await prisma.$transaction((tx) => est.resumoProduto(tx, p1.id))).fisico).toBe(3);
  });

  it("importa clientes e fornecedores pelo documento", async () => {
    const csv = [
      "Código;Nome;CPF/CNPJ;Inscrição estadual;E-mail;Cidade;UF;Situação",
      "10;Padaria Boa Ltda;11.222.333/0001-81;123456789;a@b.com;São Carlos;sp;Ativo",
      "11;Maria;123.456.789-09;;;São Carlos;SP;Inativo",
      "12;Doc ruim;123;;;;;Ativo",
      ";;;;;;;",
    ].join("\n");
    const { linhas } = await lerPlanilha("c.csv", Buffer.from(csv));
    const r = await imp.importarPessoas(linhas, "cliente", false);
    expect(r.criados).toBe(3);
    expect(r.avisos[0]).toMatch(/inválido/);
    const pj = await prisma.pessoa.findFirstOrThrow({ where: { documento: "11222333000181" } });
    expect(pj.tipoPessoa).toBe("JURIDICA");
    expect(pj.contribuinteIcms).toBe("CONTRIBUINTE");
    expect(pj.uf).toBe("SP");
    const pf = await prisma.pessoa.findFirstOrThrow({ where: { documento: "12345678909" } });
    expect(pf.ativo).toBe(false);

    // a mesma empresa na planilha de fornecedores vira cliente e fornecedor
    const f = await imp.importarPessoas([linhas[0]], "fornecedor", false);
    expect(f.atualizados).toBe(1);
    const ambos = await prisma.pessoa.findFirstOrThrow({ where: { documento: "11222333000181" } });
    expect(ambos.cliente && ambos.fornecedor).toBe(true);
  });

  it("importa serviços com código de tributação", async () => {
    const csv = "Código;Nome;Valor;Código de tributação nacional\nS1;Formatação;120,00;01.07.01\n";
    const { linhas } = await lerPlanilha("s.csv", Buffer.from(csv));
    const r = await imp.importarServicos(linhas, false);
    expect(r.criados).toBe(1);
    const s = await prisma.servico.findUniqueOrThrow({ where: { codigo: "S1" } });
    expect(s.codigoTributacaoNacional).toBe("010701");
    expect(Number(s.preco)).toBe(120);
  });
});
