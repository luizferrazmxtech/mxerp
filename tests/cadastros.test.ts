import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const pes = await import("@/lib/cadastros/pessoas");
const func = await import("@/lib/cadastros/funcionarios");
const imp = await import("@/lib/migracao/importar");
const { garantirPadroes } = await import("@/lib/financeiro/padroes");

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Lancamento","Venda","OrdemServico","Compra","PessoaEndereco","PessoaContato","PessoaAnotacao","Anexo","CampoExtra","Pessoa","Sequencia","FormaPagamento","CategoriaFinanceira","ContaBancaria","Sessao","Usuario","Empresa" CASCADE`);
  await prisma.$transaction((tx) => garantirPadroes(tx));
});

const base = (m: Partial<import("@/lib/cadastros/pessoas").DadosPessoa> = {}): import("@/lib/cadastros/pessoas").DadosPessoa => ({
  tipoPessoa: "JURIDICA", ativo: true, nome: "ACAB", email: "", documento: "07.105.759/0001-88", nomeSocial: "", rg: "", nascimento: "",
  razaoSocial: "ACAB-BEM ARAMADOS LTDA", inscricaoEstadual: "637271680113", ieIsento: false, inscricaoMunicipal: "", suframa: "", responsavel: "",
  contribuinteIcms: "CONTRIBUINTE", telefone: "(16) 3361-4848", celular: "", fax: "", site: "", vendedorId: "", pais: "Brasil",
  enderecos: [
    { tipo: "Entrega", cep: "13560-000", logradouro: "Rua B", numero: "2", complemento: "", bairro: "Centro", cidade: "São Carlos", codigoMunicipio: "3548906", uf: "SP" },
    { tipo: "Comercial", cep: "13561-000", logradouro: "Rua A", numero: "1", complemento: "", bairro: "Vila", cidade: "São Carlos", codigoMunicipio: "3548906", uf: "sp" },
  ],
  contatos: [{ tipo: "WhatsApp", nome: "João", contato: "16 99999-0000", cargo: "Compras", observacao: "" }, { tipo: "", nome: "", contato: "", cargo: "", observacao: "" }],
  limiteCredito: "1.500,00", excederLimite: false, observacoes: "", camposExtras: {}, ...m,
});

describe("cadastro de clientes, fornecedores e transportadoras", () => {
  it("PJ: razão social vai para o nome, o Nome da tela vira fantasia; endereço principal é o comercial; código sequencial", async () => {
    const p = await pes.salvarPessoa("cliente", base());
    const r = await prisma.pessoa.findUniqueOrThrow({ where: { id: p.id }, include: { enderecos: true, contatos: true } });
    expect(r.nome).toBe("ACAB-BEM ARAMADOS LTDA");
    expect(r.fantasia).toBe("ACAB");
    expect(r.documento).toBe("07105759000188");
    expect(r.logradouro).toBe("Rua A");
    expect(r.uf).toBe("SP");
    expect(r.enderecos).toHaveLength(2);
    expect(r.contatos).toHaveLength(1);
    expect(Number(r.limiteCredito)).toBe(1500);
    expect(r.codigoCliente).toBe(1);
    const p2 = await pes.salvarPessoa("cliente", base({ documento: "", nome: "Outro", razaoSocial: "" }));
    expect((await prisma.pessoa.findUniqueOrThrow({ where: { id: p2.id } })).codigoCliente).toBe(2);
  });

  it("mesmo CNPJ cadastrado como fornecedor só ganha o papel; duplicado no mesmo papel dá erro", async () => {
    const c = await pes.salvarPessoa("cliente", base());
    const f = await pes.salvarPessoa("fornecedor", base({ telefone: "(16) 1111-2222" }));
    expect(f.id).toBe(c.id);
    const r = await prisma.pessoa.findUniqueOrThrow({ where: { id: c.id } });
    expect(r.cliente && r.fornecedor).toBe(true);
    expect(r.codigoFornecedor).toBe(1);
    await expect(pes.salvarPessoa("cliente", base())).rejects.toThrow(/Já existe/);
  });

  it("valida CPF/CNPJ e campos extras obrigatórios", async () => {
    await expect(pes.salvarPessoa("cliente", base({ tipoPessoa: "FISICA", documento: "123" }))).rejects.toThrow(/CPF/);
    await expect(pes.salvarPessoa("cliente", base({ tipoPessoa: "FISICA", documento: "123.456.789-08" }))).rejects.toThrow(/CPF inválido/);
    await expect(pes.salvarPessoa("cliente", base({ documento: "07.105.759/0001-89" }))).rejects.toThrow(/CNPJ inválido/);
    const ce = await prisma.campoExtra.create({ data: { nome: "Como nos conheceu", tipo: "SELECAO_UNICA", opcoes: ["Google", "Indicação"], obrigatorio: true } });
    await expect(pes.salvarPessoa("cliente", base())).rejects.toThrow(/Como nos conheceu/);
    const p = await pes.salvarPessoa("cliente", base({ camposExtras: { [ce.id]: "Google" } }));
    expect(await prisma.pessoa.count({ where: { id: p.id, camposExtras: { path: [ce.id], string_contains: "Goo" } } })).toBe(1);
  });

  it("situação financeira: novo, em dia, a vencer e atrasado", async () => {
    const ids = await Promise.all(["A", "B", "C", "D"].map(async (n) => (await prisma.pessoa.create({ data: { nome: n } })).id));
    const cat = (await prisma.categoriaFinanceira.findFirstOrThrow({ where: { tipo: "RECEBER" } })).id;
    const l = (pessoaId: string, venc: string, pago: boolean) => prisma.lancamento.create({ data: {
      tipo: "RECEBER", descricao: "x", pessoaId, categoriaId: cat, valor: 10, vencimento: new Date(venc), competencia: new Date(venc),
      ...(pago ? { pagoEm: new Date(venc), valorPago: 10 } : {}) } });
    await l(ids[1], "2026-01-10", true);
    await l(ids[2], "2099-01-10", false);
    await l(ids[3], "2026-01-10", false);
    await l(ids[3], "2099-01-10", false);
    const s = await pes.situacoesFinanceiras(ids);
    expect(ids.map((i) => s.get(i))).toEqual(["NOVO", "EM_DIA", "A_VENCER", "ATRASADO"]);
    for (const [i, sit] of (["NOVO", "EM_DIA", "A_VENCER", "ATRASADO"] as const).entries()) {
      const achados = await prisma.pessoa.findMany({ where: pes.whereSituacao(sit), select: { id: true } });
      expect(achados.map((x) => x.id)).toEqual([ids[i]]);
    }
  });

  it("excluir: tira só o papel quando há outro; com movimento não apaga", async () => {
    const p = await pes.salvarPessoa("cliente", base());
    await pes.salvarPessoa("transportadora", base());
    expect((await pes.excluirPessoa("cliente", p.id)).ok).toBe(true);
    expect((await prisma.pessoa.findUniqueOrThrow({ where: { id: p.id } })).cliente).toBe(false);
    const q = await pes.salvarPessoa("cliente", base({ documento: "", nome: "Sem doc", razaoSocial: "" }));
    await prisma.venda.create({ data: { numero: 1, clienteId: q.id } });
    expect((await pes.excluirPessoa("cliente", q.id)).ok).toBe(false);
    await prisma.venda.deleteMany();
    expect((await pes.excluirPessoa("cliente", q.id)).ok).toBe(true);
    expect(await prisma.pessoa.findUnique({ where: { id: q.id } })).toBeNull();
  });

  it("importação usa o código do sistema anterior, todos os endereços e a data de cadastro", async () => {
    const linhas = [{
      codigo: "237", nome: "Fulano", "tipo de pessoa": "física", documento: "529.982.247-25", rg: "12.345", "data de nascimento": "02/03/1980",
      "cadastrado em": "19/05/2025 14:43:25",
      __enderecos: JSON.stringify([{ tipo: "Residencial", cep: "13560-000", logradouro: "Rua X", numero: "5", complemento: "", bairro: "C", cidade: "São Carlos", uf: "SP" }, { tipo: "Entrega", cep: "", logradouro: "Rua Y", numero: "", complemento: "", bairro: "", cidade: "", uf: "" }]),
    }];
    await imp.importarPessoas(linhas, "cliente", false);
    const p = await prisma.pessoa.findFirstOrThrow({ include: { enderecos: true } });
    expect(p.codigoCliente).toBe(237);
    expect(p.rg).toBe("12.345");
    expect(p.nascimento?.toISOString().slice(0, 10)).toBe("1980-03-02");
    expect(p.createdAt.toISOString()).toBe("2025-05-19T17:43:25.000Z");
    expect(p.enderecos).toHaveLength(2);
    const novo = await pes.salvarPessoa("cliente", base({ documento: "", nome: "Novo", razaoSocial: "" }));
    expect((await prisma.pessoa.findUniqueOrThrow({ where: { id: novo.id } })).codigoCliente).toBe(238);
  });
});

describe("funcionários", () => {
  const f = (m: Partial<import("@/lib/cadastros/funcionarios").DadosFuncionario> = {}): import("@/lib/cadastros/funcionarios").DadosFuncionario => ({
    nome: "Paula", cpf: "", rg: "", nascimento: "", sexo: "F", email: "paula@x.test", ativo: true, acessoSistema: false, papel: "OPERADOR", senha: "",
    tecnico: false, vendedor: true, observacoes: "", comissao: "2,5", liberacaoComissao: "PARCIAL", telefone: "", celular: "", celular2: "",
    cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", codigoMunicipio: "", uf: "", lojas: ["loja"], ...m,
  });

  it("acesso exige e-mail e senha; só admin libera; ninguém tira o próprio acesso", async () => {
    const admin = await prisma.usuario.create({ data: { nome: "Admin", email: "a@x.test", senhaHash: "x", papel: "ADMIN" } });
    const ger = { id: "g", papel: "GERENTE" as const };
    const u = await func.salvarFuncionario(f({ acessoSistema: true, senha: "segredo123" }), ger);
    expect(u.acessoSistema).toBe(false);
    expect(Number(u.comissao)).toBe(2.5);
    await expect(func.salvarFuncionario(f({ acessoSistema: true }), admin, u.id)).rejects.toThrow(/senha inicial/);
    await expect(func.salvarFuncionario(f({ acessoSistema: true, email: "", senha: "segredo123" }), admin, u.id)).rejects.toThrow(/e-mail/);
    const ok = await func.salvarFuncionario(f({ acessoSistema: true, senha: "segredo123", papel: "CAIXA" }), admin, u.id);
    expect(ok.acessoSistema && !!ok.senhaHash && ok.papel === "CAIXA").toBe(true);
    await expect(func.salvarFuncionario(f({ nome: "Admin", email: "a@x.test", acessoSistema: false }), admin, admin.id)).rejects.toThrow(/próprio/);
    await expect(func.salvarFuncionario(f({ lojas: [] }), admin)).rejects.toThrow(/loja/);
  });

  it("excluir funcionário com movimento inativa e bloqueia", async () => {
    const u = await prisma.usuario.create({ data: { nome: "Vend", email: "v@x.test", senhaHash: "x" } });
    const c = await prisma.pessoa.create({ data: { nome: "C", vendedorId: u.id } });
    const r = await func.excluirFuncionario(u.id, "outro");
    expect(r.mensagem).toMatch(/inativado/);
    expect(await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } })).toMatchObject({ ativo: false, acessoSistema: false });
    await prisma.pessoa.delete({ where: { id: c.id } });
    expect((await func.excluirFuncionario(u.id, "outro")).ok).toBe(true);
  });
});
