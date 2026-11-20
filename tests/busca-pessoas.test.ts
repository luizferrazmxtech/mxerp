import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const { buscarPessoas } = await import("@/lib/cadastros/buscaPessoas");
const { garantirPadroes } = await import("@/lib/financeiro/padroes");

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Lancamento","Venda","OrdemServico","Compra","PessoaEndereco","PessoaContato","PessoaAnotacao","Anexo","Pessoa","CategoriaFinanceira","Empresa" CASCADE`);
  await prisma.$transaction((tx) => garantirPadroes(tx));
});

const rotulos = (r: Awaited<ReturnType<typeof buscarPessoas>>, nome: string) => r.find((p) => p.nome === nome)!.etiquetas!.map((e) => e.rotulo);

describe("busca de pessoas com etiquetas", () => {
  it("mostra PF/PJ, CPF/CNPJ, IE, cidade, atraso e limite de crédito", async () => {
    const pj = await prisma.pessoa.create({ data: { nome: "ECOBIO LTDA", documento: "11222333000181", tipoPessoa: "JURIDICA", inscricaoEstadual: "123456789", contribuinteIcms: "CONTRIBUINTE", cidade: "Belo Horizonte", uf: "MG", codigoCliente: 12, limiteCredito: 100, celular: "31999990000" } });
    await prisma.pessoa.create({ data: { nome: "Maria Eco", documento: "52998224725", tipoPessoa: "FISICA", contribuinteIcms: "NAO_CONTRIBUINTE" } });
    await prisma.pessoa.create({ data: { nome: "Ecoplast", tipoPessoa: "JURIDICA", contribuinteIcms: "ISENTO", inscricaoEstadual: "ISENTO" } });
    await prisma.pessoa.create({ data: { nome: "Eco Inativo", ativo: false } });
    const cat = await prisma.categoriaFinanceira.findFirstOrThrow({ where: { tipo: "RECEBER" } });
    await prisma.lancamento.create({ data: { tipo: "RECEBER", descricao: "x", pessoaId: pj.id, categoriaId: cat.id, valor: 350.5, vencimento: new Date("2020-01-10"), competencia: new Date("2020-01-10") } });

    const r = await buscarPessoas("cliente", "eco");
    expect(r.map((p) => p.nome)).toEqual(["ECOBIO LTDA", "Ecoplast", "Maria Eco"]);
    expect(r[0].codigo).toBe("#12");
    expect(r[0].documento).toBe("11.222.333/0001-81");
    const a = rotulos(r, "ECOBIO LTDA");
    expect(a).toEqual(expect.arrayContaining(["PJ", "CNPJ 11.222.333/0001-81", "Contribuinte · IE 123456789", "Belo Horizonte/MG"]));
    expect(a.find((x) => x.startsWith("Atrasado"))).toMatch(/350,50/);
    expect(a.find((x) => x.startsWith("Limite excedido"))).toBeTruthy();
    expect(rotulos(r, "Maria Eco")).toEqual(["PF", "CPF 529.982.247-25", "Novo"]);
    expect(rotulos(r, "Ecoplast")).toEqual(["PJ", "Sem CNPJ", "Isento de IE", "Novo"]);

    // por CPF/CNPJ e telefone (só dígitos)
    expect((await buscarPessoas("cliente", "11.222.333")).map((p) => p.nome)).toEqual(["ECOBIO LTDA"]);
    expect((await buscarPessoas("cliente", "99999")).map((p) => p.nome)).toEqual(["ECOBIO LTDA"]);
    // fornecedor não leva situação financeira de cliente
    expect(await buscarPessoas("fornecedor", "eco")).toEqual([]);
  });
});
