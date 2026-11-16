import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const est = await import("@/lib/estoque/estoque");
const ord = await import("@/lib/os/ordens");
const { gerarParcelas } = await import("@/lib/orcamentos/orcamentos");
const { equipamentoVazio } = await import("@/lib/os/tipos");
type Dados = import("@/lib/os/tipos").DadosOs;

let prod = "", serv = "", cli = "", loc = "";
let u = { id: "", nome: "Caue", papel: "OPERADOR" as const };

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Orcamento","Anotacao","Lancamento","VendaPagamento","VendaItem","Venda","OrdemServico","Reserva","MovimentoEstoque","Saldo","Produto","Servico","Local","Deposito","Pessoa","Sequencia" CASCADE`);
  await prisma.situacaoOsConfig.updateMany({ data: { bloqueados: [] } });
  await prisma.situacaoOsConfig.update({ where: { id: "so_aberto" }, data: { permiteEdicao: true } });
  const dep = await prisma.deposito.create({ data: { nome: "Loja" } });
  loc = (await prisma.local.create({ data: { depositoId: dep.id, codigo: "A-01" } })).id;
  prod = (await prisma.produto.create({ data: { codigo: "FON", nome: "Fonte ATX", precoVenda: 200, custo: 120, localPadraoId: loc } })).id;
  serv = (await prisma.servico.create({ data: { codigo: "MO", nome: "Mão de obra", preco: 150 } })).id;
  cli = (await prisma.pessoa.create({ data: { nome: "Escritório Central", cliente: true } })).id;
  const usuario = await prisma.usuario.upsert({ where: { email: "os@local.test" }, update: {}, create: { nome: "Caue", email: "os@local.test", papel: "OPERADOR" } });
  u = { id: usuario.id, nome: usuario.nome, papel: "OPERADOR" };
  await prisma.$transaction((tx) => est.entrada(tx, { produtoId: prod, localId: loc, quantidade: 5, origemTipo: "IMPLANTACAO" }));
});

const estoque = () => prisma.$transaction((tx) => est.resumoProduto(tx, prod));
const recebiveis = (osId: string) => prisma.lancamento.findMany({ where: { origemTipo: "OS", origemId: osId }, orderBy: { parcela: "asc" } });

const dados = (m: Partial<Dados> = {}): Dados => ({
  tipo: "SERVICO", numero: "", clienteId: cli, clienteNome: "", data: "2026-11-16", validade: "", vendedorId: "", prazoEntrega: "", aosCuidados: "",
  canal: "Presencial", centroCusto: "", introducao: "", situacaoId: "so_aberto",
  produtos: [{ produtoId: prod, nome: "Fonte", codigo: "FON", unidade: "UN", detalhes: "", quantidade: "1", tipoValorId: "", valorUnit: "200,00", desconto: "0", descontoPct: false }],
  servicos: [{ servicoId: serv, nome: "Mão de obra", codigo: "MO", detalhes: "", quantidade: "1", valorUnit: "150,00", desconto: "0", descontoPct: false }],
  transportadoraId: "", transportadoraNome: "", frete: "0", mostrarEntrega: false, enderecoEntregaId: "",
  desconto: "", descontoPct: false, exibirTotal: true,
  gerarCondicoes: true, condicao: "PARCELADO", formaPagamentoId: "", vencimento: "", intervaloDias: "30", numParcelas: "2", primeiraParcela: "2026-12-01",
  parcelas: gerarParcelas(350, 2, "2026-12-01", 30, ""),
  observacoes: "", observacaoInterna: "", camposExtras: {},
  entrada: "2026-11-16T09:30", saida: "", prioridade: "ALTA", tecnicoIds: [], outros: "0",
  equipamentos: [{ ...equipamentoVazio(), equipamento: "Computador", marca: "Dell", defeitos: "Não liga" }],
  ...m,
});

describe("ordens de serviço (situações configuráveis)", () => {
  it("em aberto reserva; concretizada baixa, lança o financeiro e preenche a saída; cancelada estorna", async () => {
    await prisma.sequencia.create({ data: { chave: "OS", valor: 7083 } });
    const o = await ord.salvarOrdem(dados(), u);
    expect(o.numero).toBe(7084);
    expect(o.situacao).toBe("ABERTA");
    expect(Number(o.total)).toBe(350);
    expect(await prisma.osEquipamento.count({ where: { osId: o.id } })).toBe(1);
    expect(await estoque()).toMatchObject({ fisico: 5, reservado: 1 });
    expect(await recebiveis(o.id)).toHaveLength(0);

    await ord.alterarSituacaoOrdem(o.id, "so_andamento", u);
    expect((await prisma.ordemServico.findUniqueOrThrow({ where: { id: o.id } })).situacao).toBe("EM_ANDAMENTO");
    expect(await estoque()).toMatchObject({ reservado: 1 });

    await ord.alterarSituacaoOrdem(o.id, "so_concretizada", u);
    const fechada = await prisma.ordemServico.findUniqueOrThrow({ where: { id: o.id } });
    expect(fechada.situacao).toBe("FATURADA");
    expect(fechada.saida).not.toBeNull();
    expect(await estoque()).toMatchObject({ fisico: 4, reservado: 0 });
    expect((await recebiveis(o.id)).map((x) => Number(x.valor))).toEqual([175, 175]);

    await ord.alterarSituacaoOrdem(o.id, "so_cancelada", u);
    expect(await estoque()).toMatchObject({ fisico: 5, reservado: 0 });
    expect(await recebiveis(o.id)).toHaveLength(0);
    expect(await prisma.osHistorico.count({ where: { osId: o.id } })).toBeGreaterThanOrEqual(4);
  });

  it("CONCLUIDA - FATURAR baixa sem lançar financeiro; trava a edição", async () => {
    const o = await ord.salvarOrdem(dados({ condicao: "AVISTA", parcelas: [] }), u);
    await ord.alterarSituacaoOrdem(o.id, "so_faturar", u);
    expect(await estoque()).toMatchObject({ fisico: 4 });
    expect(await recebiveis(o.id)).toHaveLength(0);
    expect((await prisma.ordemServico.findUniqueOrThrow({ where: { id: o.id } })).situacao).toBe("CONCLUIDA");
    await expect(ord.salvarOrdem(dados({ situacaoId: "so_faturar", condicao: "AVISTA", parcelas: [] }), u, o.id)).rejects.toThrow(/não podem ser editadas|não pode ser editada/);
  });

  it("editar a quantidade refaz a reserva; parcelas que não fecham são recusadas", async () => {
    const o = await ord.salvarOrdem(dados({ condicao: "AVISTA", parcelas: [] }), u);
    await ord.salvarOrdem(dados({ produtos: [{ ...dados().produtos[0], quantidade: "3" }], condicao: "AVISTA", parcelas: [] }), u, o.id);
    expect(await estoque()).toMatchObject({ reservado: 3 });
    await expect(ord.salvarOrdem(dados({ parcelas: gerarParcelas(300, 2, "2026-12-01", 30, "") }), u)).rejects.toThrow(/não fecha/);
  });

  it("OS migrada já concretizada no Gestão Click devolve as peças ao ser cancelada", async () => {
    const o = await prisma.ordemServico.create({
      data: {
        numero: 6500, idLegado: "os:6500", clienteId: cli, situacaoId: "so_concretizada", situacao: "FATURADA", total: 400, totalProdutos: 400,
        produtos: { create: [{ produtoId: prod, quantidade: 2, valorUnit: 200, subtotal: 400 }] },
      },
    });
    await ord.alterarSituacaoOrdem(o.id, "so_cancelada", u);
    expect(await estoque()).toMatchObject({ fisico: 7, reservado: 0 });
  });

  it("gerar cópia cria uma nova OS em aberto com os mesmos itens e equipamentos", async () => {
    const o = await ord.salvarOrdem(dados({ situacaoId: "so_concretizada" }), u);
    const c = await ord.clonarOrdem(o.id, u);
    expect(c.numero).not.toBe(o.numero);
    expect(c.situacaoId).toBe("so_aberto");
    expect(await prisma.osItemProduto.count({ where: { osId: c.id } })).toBe(1);
    expect(await prisma.osItemServico.count({ where: { osId: c.id } })).toBe(1);
    expect(await prisma.osEquipamento.count({ where: { osId: c.id } })).toBe(1);
  });
});
