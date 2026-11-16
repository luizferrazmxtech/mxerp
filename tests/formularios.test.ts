import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const est = await import("@/lib/estoque/estoque");
const os = await import("@/lib/os/os");
const vendas = await import("@/lib/vendas/vendas");
const caixa = await import("@/lib/pdv/caixa");
const { garantirPadroes } = await import("@/lib/financeiro/padroes");

let prod: string, cliente: string, servico: string, usuario: string, dinheiro: string;

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Lancamento","VendaPagamento","VendaItem","Venda","CaixaPdv","Reserva","MovimentoEstoque","Saldo","OsEquipamento","OsItemProduto","OsItemServico","OsHistorico","OrdemServico","Servico","Produto","Local","Deposito","Pessoa","Sequencia","FormaPagamento","CategoriaFinanceira","ContaBancaria","Sessao","Usuario" CASCADE`);
  const dep = await prisma.deposito.create({ data: { nome: "Loja" } });
  const loc = (await prisma.local.create({ data: { depositoId: dep.id, codigo: "A-01" } })).id;
  prod = (await prisma.produto.create({ data: { codigo: "SW", nome: "Switch", precoVenda: 500, custo: 200, localPadraoId: loc } })).id;
  servico = (await prisma.servico.create({ data: { codigo: "INST", nome: "Instalação", preco: 300 } })).id;
  cliente = (await prisma.pessoa.create({ data: { nome: "Cliente" } })).id;
  usuario = (await prisma.usuario.create({ data: { nome: "Op", email: "op@x.test", senhaHash: "x" } })).id;
  await prisma.$transaction(async (tx) => {
    await est.entrada(tx, { produtoId: prod, localId: loc, quantidade: 10, origemTipo: "IMPLANTACAO" });
    await garantirPadroes(tx);
  });
  dinheiro = (await prisma.formaPagamento.findUniqueOrThrow({ where: { nome: "Dinheiro" } })).id;
});

const reservado = async () => (await prisma.$transaction((tx) => est.resumoProduto(tx, prod))).reservado;

describe("formulário de OS (padrão Gestão Click)", () => {
  it("cadastra com equipamentos, peças reservadas, serviços, frete e outros", async () => {
    const r = await os.salvarOs({
      situacao: "ABERTA", usuarioId: usuario,
      cabecalho: { clienteId: cliente, canal: "Internet", prioridade: "URGENTE", frete: 20, outros: 5, desconto: 25,
        equipamentos: [{ equipamento: "DVR", marca: "Intelbras" }, { equipamento: "Câmera", defeitos: "sem imagem" }, { equipamento: "  " }] },
      produtos: [{ produtoId: prod, quantidade: 2, valorUnit: 450 }],
      servicos: [{ servicoId: servico, quantidade: 1, valorUnit: 300 }],
    });
    const o = await prisma.ordemServico.findUniqueOrThrow({ where: { id: r.osId }, include: { equipamentos: { orderBy: { ordem: "asc" } } } });
    expect(o.equipamentos.map((e) => e.equipamento)).toEqual(["DVR", "Câmera"]);
    expect(o).toMatchObject({ canal: "Internet", prioridade: "URGENTE" });
    expect(Number(o.total)).toBeCloseTo(900 + 300 + 20 + 5 - 25);
    expect(await reservado()).toBe(2);
  });

  it("editar: muda quantidade, remove e adiciona, e conclui baixando o estoque", async () => {
    const r = await os.salvarOs({ situacao: "ABERTA", cabecalho: { clienteId: cliente }, produtos: [{ produtoId: prod, quantidade: 2, valorUnit: 500 }], servicos: [] });
    const item = await prisma.osItemProduto.findFirstOrThrow({ where: { osId: r.osId } });
    await os.salvarOs({ osId: r.osId, situacao: "ABERTA", cabecalho: { clienteId: cliente }, produtos: [{ id: item.id, produtoId: prod, quantidade: 3, valorUnit: 480 }], servicos: [] });
    expect(await reservado()).toBe(3);
    expect(Number((await prisma.ordemServico.findUniqueOrThrow({ where: { id: r.osId } })).total)).toBeCloseTo(1440);
    await os.salvarOs({ osId: r.osId, situacao: "CONCLUIDA", cabecalho: { clienteId: cliente }, produtos: [{ id: item.id, produtoId: prod, quantidade: 3, valorUnit: 480 }], servicos: [] });
    const res = await prisma.$transaction((tx) => est.resumoProduto(tx, prod));
    expect(res.fisico).toBe(7);
    expect(res.reservado).toBe(0);
    // concluída: mudar peça sem reabrir é recusado
    await expect(os.salvarOs({ osId: r.osId, situacao: "CONCLUIDA", cabecalho: { clienteId: cliente }, produtos: [], servicos: [] })).rejects.toThrow(/Reabra/);
    // reabrir e tirar a peça no mesmo salvar: estorna e libera
    await os.salvarOs({ osId: r.osId, situacao: "ABERTA", cabecalho: { clienteId: cliente }, produtos: [], servicos: [] });
    const fim = await prisma.$transaction((tx) => est.resumoProduto(tx, prod));
    expect(fim.fisico).toBe(10);
    expect(fim.reservado).toBe(0);
  });
});

describe("formulário de venda", () => {
  it("pedido em aberto reserva; orçamento libera; cancelar e voltar", async () => {
    const r = await vendas.salvarVenda({ situacao: "ABERTA", cabecalho: { clienteId: cliente, frete: 10 }, produtos: [{ produtoId: prod, quantidade: 4, valorUnit: 500 }] });
    expect(await reservado()).toBe(4);
    expect(Number((await prisma.venda.findUniqueOrThrow({ where: { id: r.vendaId } })).total)).toBeCloseTo(2010);
    const item = await prisma.vendaItem.findFirstOrThrow({ where: { vendaId: r.vendaId } });
    await vendas.salvarVenda({ vendaId: r.vendaId, situacao: "ORCAMENTO", cabecalho: { clienteId: cliente }, produtos: [{ id: item.id, produtoId: prod, quantidade: 1, valorUnit: 500 }] });
    expect(await reservado()).toBe(0);
    await vendas.salvarVenda({ vendaId: r.vendaId, situacao: "ABERTA", cabecalho: { clienteId: cliente }, produtos: [{ id: item.id, produtoId: prod, quantidade: 1, valorUnit: 500 }] });
    expect(await reservado()).toBe(1);
  });
});

describe("caixa do PDV", () => {
  it("abre, vende no balcão ligado ao caixa e fecha com o resumo", async () => {
    const c = await caixa.abrirCaixa(usuario, 100, true);
    expect((await caixa.abrirCaixa(usuario, 50)).id).toBe(c.id); // não abre dois
    expect(await prisma.lancamento.count({ where: { descricao: "Abertura de caixa do PDV", pagoEm: { not: null } } })).toBe(1);
    await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1, valorUnit: 500 }], pagamentos: [{ formaPagamentoId: dinheiro, valor: 500 }], usuarioId: usuario, caixaId: c.id });
    const r = await caixa.resumoCaixa(c.id);
    expect(r.vendas).toBe(1);
    expect(r.dinheiroEsperado).toBe(600);
    await caixa.fecharCaixa(c.id, usuario, 600);
    expect(await caixa.caixaAberto(usuario)).toBeNull();
  });
});
