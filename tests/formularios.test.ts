import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { LOJA_ATUAL } from "@/lib/empresa/loja";

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
  dinheiro = (await prisma.formaPagamento.findUniqueOrThrow({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "Dinheiro" } } })).id;
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
    expect(await prisma.lancamento.count({ where: { descricao: "Abertura de caixa do PDV nº 1", pagoEm: { not: null } } })).toBe(1);
    await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1, valorUnit: 500 }], pagamentos: [{ formaPagamentoId: dinheiro, valor: 500 }], usuarioId: usuario, caixaId: c.id });
    const r = await caixa.resumoCaixa(c.id);
    expect(r.vendas).toBe(1);
    expect(r.dinheiroEsperado).toBe(600);
    await caixa.fecharCaixa(c.id, usuario, 600);
    expect(await caixa.caixaAberto(usuario)).toBeNull();
  });

  it("sangria e suprimento mudam o dinheiro esperado e, com conta, viram transferência", async () => {
    const c = await caixa.abrirCaixa(usuario, 100);
    await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1, valorUnit: 500 }], pagamentos: [{ formaPagamentoId: dinheiro, valor: 500 }], usuarioId: usuario, caixaId: c.id });
    await caixa.movimentarCaixa(c.id, usuario, { tipo: "SUPRIMENTO", valor: 50, motivo: "troco" });
    const banco = (await prisma.contaBancaria.create({ data: { nome: "Banco" } })).id;
    await caixa.movimentarCaixa(c.id, usuario, { tipo: "SANGRIA", valor: 400, motivo: "depósito", contaId: banco });
    await expect(caixa.movimentarCaixa(c.id, usuario, { tipo: "SANGRIA", valor: 300 })).rejects.toThrow(/gaveta tem só/);
    await expect(caixa.movimentarCaixa(c.id, usuario, { tipo: "SANGRIA", valor: 0 })).rejects.toThrow(/maior que zero/);
    const r = await caixa.resumoCaixa(c.id);
    expect([r.suprimentos, r.sangrias, r.dinheiroEsperado]).toEqual([50, 400, 250]);
    expect(r.movimentos.map((m) => m.tipo)).toEqual(["SUPRIMENTO", "SANGRIA"]);
    // só a sangria com conta gerou transferência Caixa → Banco
    const pernas = await prisma.lancamento.findMany({ where: { transferenciaId: { not: null } }, include: { contaBancaria: true } });
    expect(pernas.map((l) => [l.tipo, l.contaBancaria!.nome, Number(l.valor)]).sort()).toEqual([["PAGAR", "Caixa", 400], ["RECEBER", "Banco", 400]]);
    await caixa.fecharCaixa(c.id, usuario, 250);
    await expect(caixa.movimentarCaixa(c.id, usuario, { tipo: "SUPRIMENTO", valor: 10 })).rejects.toThrow(/não está aberto/);
  });

  it("dois operadores abrindo ao mesmo tempo ficam no mesmo caixa", async () => {
    const outro = (await prisma.usuario.create({ data: { nome: "Outro", email: "o@x.test", senhaHash: "x" } })).id;
    const [a, b] = await Promise.all([caixa.abrirCaixa(usuario, 10), caixa.abrirCaixa(outro, 20)]);
    expect(a.id).toBe(b.id);
    expect(await prisma.caixaPdv.count({ where: { fechadoEm: null } })).toBe(1);
  });

  it("fecha com conferência por forma, lança a quebra no financeiro e aparece no relatório de caixas", async () => {
    const pix = (await prisma.formaPagamento.findUniqueOrThrow({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "PIX" } } })).id;
    const c1 = await caixa.abrirCaixa(usuario, 50);
    const c = await caixa.abrirCaixa(usuario, 50);
    expect(c.numero).toBe(1);
    await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1, valorUnit: 500 }], pagamentos: [{ formaPagamentoId: dinheiro, valor: 200 }, { formaPagamentoId: pix, valor: 300 }], usuarioId: usuario, caixaId: c.id });
    await caixa.movimentarCaixa(c.id, usuario, { tipo: "SANGRIA", valor: 100, motivo: "cofre" });
    const r = await caixa.resumoCaixa(c.id);
    expect(r.esperadoPorForma.map((x) => [x.forma, x.esperado])).toEqual([["Dinheiro", 150], ["PIX", 300]]);
    // um caixa por empresa: outro operador que "abre" o caixa entra no mesmo, e pode fechá-lo
    const gerente = (await prisma.usuario.create({ data: { nome: "Gerente", email: "g@x.test", senhaHash: "x", papel: "GERENTE" } })).id;
    expect((await caixa.abrirCaixa(gerente, 999)).id).toBe(c.id);
    expect((await caixa.caixaAberto(gerente))?.id).toBe(c.id);
    expect((await caixa.caixasAbertos()).map((x) => x.usuario.nome)).toEqual(["Op"]);
    const f = await caixa.fecharCaixa(c.id, gerente, { Dinheiro: 140, PIX: 300 }, "faltou troco", { lancarDiferenca: true });
    expect([Number(f.valorFechamento), Number(f.valorEsperado), f.fechadoPorId]).toEqual([140, 150, gerente]);
    expect(caixa.lerConferencia(f.conferencia)).toEqual([{ forma: "Dinheiro", esperado: 150, contado: 140 }, { forma: "PIX", esperado: 300, contado: 300 }]);
    const quebra = await prisma.lancamento.findUniqueOrThrow({ where: { id: f.lancamentoDiferencaId! }, include: { contaBancaria: true } });
    expect([quebra.tipo, Number(quebra.valor), quebra.contaBancaria?.nome, !!quebra.pagoEm, quebra.descricao]).toEqual(["PAGAR", 10, "Caixa", true, "Quebra de caixa do PDV nº 1"]);
    await expect(caixa.fecharCaixa(c.id, usuario, 0)).rejects.toThrow(/não está aberto/);

    const c2 = await caixa.abrirCaixa(usuario, 20);
    expect(c2.numero).toBe(2);
    const { linhasCaixas } = await import("@/lib/pdv/relatorio");
    const linhas = await linhasCaixas({});
    expect(linhas.map((l) => l.numero)).toEqual([2, 1]);
    const [aberto, fechado] = linhas;
    expect([aberto.aberto, aberto.esperado, aberto.diferenca]).toEqual([true, 20, null]);
    expect([fechado.vendido, fechado.vendas, fechado.sangrias, fechado.esperado, fechado.contado, fechado.diferenca, fechado.fechadoPor]).toEqual([500, 1, 100, 150, 140, -10, "Gerente"]);
    expect(c1.id).toBe(c.id);
  });
});
