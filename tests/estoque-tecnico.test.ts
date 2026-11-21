import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const est = await import("@/lib/estoque/estoque");
const doc = await import("@/lib/estoque/documentos");
const tecEst = await import("@/lib/estoque/tecnico");
const ord = await import("@/lib/os/ordens");
const tec = await import("@/lib/os/tecnico");
const itens = await import("@/lib/os/itensTecnico");
const { equipamentoVazio } = await import("@/lib/os/tipos");
type Dados = import("@/lib/os/tipos").DadosOs;
type U = import("@/lib/os/tecnico").UsuarioTecnico;

let prod = "", cli = "", loc = "", loc2 = "", loja = "";
let escritorio: U, ana: U, beto: U;
let carroAna = { depositoId: "", localId: "" };

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

const usuario = async (nome: string, papel: U["papel"]): Promise<U> => {
  const x = await prisma.usuario.upsert({ where: { email: `${nome}@estoque-tec.test` }, update: { papel }, create: { nome, email: `${nome}@estoque-tec.test`, papel, tecnico: papel === "TECNICO" } });
  return { id: x.id, nome: x.nome, papel };
};

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Orcamento","Anotacao","Anexo","Lancamento","OrdemServico","Equipe","Reserva","MovimentoEstoque","Saldo","TransferenciaEstoque","Produto","Servico","Local","Deposito","Pessoa","Sequencia" CASCADE`);
  await prisma.situacaoOsConfig.updateMany({ data: { bloqueados: [] } });
  await prisma.situacaoOsConfig.update({ where: { id: "so_aberto" }, data: { permiteEdicao: true } });
  const dep = await prisma.deposito.create({ data: { nome: "Loja" } });
  loja = dep.id;
  loc = (await prisma.local.create({ data: { depositoId: dep.id, codigo: "A-01" } })).id;
  loc2 = (await prisma.local.create({ data: { depositoId: dep.id, codigo: "B-01" } })).id;
  prod = (await prisma.produto.create({ data: { codigo: "RJ45", nome: "Conector RJ45", precoVenda: 2, custo: 0.5, localPadraoId: loc } })).id;
  cli = (await prisma.pessoa.create({ data: { nome: "Condomínio Azul", cliente: true } })).id;
  escritorio = await usuario("escritorio", "GERENTE");
  ana = await usuario("ana", "TECNICO");
  beto = await usuario("beto", "TECNICO");
  await prisma.$transaction((tx) => est.entrada(tx, { produtoId: prod, localId: loc, quantidade: 10, origemTipo: "IMPLANTACAO" }));
  carroAna = await tecEst.criarEstoqueTecnico(ana.id);
});

const resumo = () => prisma.$transaction((tx) => est.resumoProduto(tx, prod));
const saldo = async (localId: string) => Number((await prisma.saldo.findUnique({ where: { produtoId_localId: { produtoId: prod, localId } } }))?.quantidade ?? 0);
const abastecer = (q: number, u: U = escritorio) =>
  doc.criarTransferencia({ origemDepositoId: loja, destinoDepositoId: carroAna.depositoId, observacoes: "", itens: [{ produtoId: prod, quantidade: String(q) }] }, u);

const dados = (m: Partial<Dados> = {}, q = "3", localOrigemId?: string): Dados => ({
  tipo: "SERVICO", numero: "", clienteId: cli, clienteNome: "", data: "2026-11-21", validade: "", vendedorId: "", prazoEntrega: "", aosCuidados: "",
  canal: "Presencial", centroCusto: "", introducao: "", situacaoId: "so_aberto",
  produtos: [{ produtoId: prod, nome: "RJ45", codigo: "RJ45", unidade: "UN", detalhes: "", quantidade: q, tipoValorId: "", valorUnit: "2,00", desconto: "0", descontoPct: false, localOrigemId }],
  servicos: [], transportadoraId: "", transportadoraNome: "", frete: "0", mostrarEntrega: false, enderecoEntregaId: "",
  desconto: "", descontoPct: false, exibirTotal: true, gerarCondicoes: true, condicao: "AVISTA", formaPagamentoId: "", vencimento: "", intervaloDias: "30",
  numParcelas: "1", primeiraParcela: "", parcelas: [], observacoes: "", observacaoInterna: "", camposExtras: {},
  entrada: "2026-11-21T09:00", saida: "", prioridade: "", tecnicoIds: [ana.id], outros: "0",
  equipamentos: [{ ...equipamentoVazio(), equipamento: "Rede" }],
  ...m,
});

describe("estoque do técnico", () => {
  it("cria o estoque do técnico uma vez só e lista nos estoques de técnicos", async () => {
    expect(await tecEst.criarEstoqueTecnico(ana.id)).toEqual(carroAna);
    const l = await tecEst.estoquesDosTecnicos();
    expect(l).toEqual([{ tecnicoId: ana.id, tecnicoNome: "ana", depositoId: carroAna.depositoId, nome: "Carro - ana", localId: carroAna.localId }]);
    expect(await tecEst.localDoTecnico(prisma, ana.id)).toBe(carroAna.localId);
    expect(await tecEst.localDoTecnico(prisma, beto.id)).toBeNull();
  });

  it("transferência loja → carro não gera venda e o carro fica fora do disponível da loja", async () => {
    await abastecer(4);
    expect(await saldo(loc)).toBe(6);
    expect(await saldo(carroAna.localId)).toBe(4);
    expect(await prisma.venda.count()).toBe(0);
    expect(await resumo()).toMatchObject({ fisico: 10, reservado: 0, disponivel: 6, comTecnicos: 4 });
    // OS comum (item da loja) nunca reserva do carro: o que passa da loja vira falta
    const o = await ord.salvarOrdem(dados({}, "8"), escritorio);
    const r = await prisma.reserva.findMany({ where: { origemId: o.id, status: "ATIVA" }, orderBy: { quantidade: "desc" } });
    expect(r.map((x) => [x.localId, Number(x.quantidade)])).toEqual([[loc, 6], [null, 2]]);
    const d = await tecEst.saldoDetalhado(prod);
    expect(d).toMatchObject({ fisico: 10, reservado: 6, falta: 2, disponivel: 0, comTecnicos: 4 });
    expect(d!.onde).toEqual([{ nome: "Loja", tecnico: false, fisico: 6, reservado: 6 }, { nome: "Carro - ana", tecnico: true, fisico: 4, reservado: 0 }]);
  });

  it("item da OS marcado com o técnico reserva e baixa do carro; reabrir devolve ao carro", async () => {
    await abastecer(4);
    const o = await ord.salvarOrdem(dados({}, "3", carroAna.localId), escritorio);
    expect((await prisma.reserva.findMany({ where: { origemId: o.id, status: "ATIVA" } })).map((x) => [x.localId, Number(x.quantidade)])).toEqual([[carroAna.localId, 3]]);
    expect(await resumo()).toMatchObject({ disponivel: 6, comTecnicos: 1 });
    // concluir (situação que lança estoque): sai do carro, a loja não mexe
    await ord.alterarSituacaoOrdem(o.id, "so_teste", escritorio);
    expect(await saldo(carroAna.localId)).toBe(1);
    expect(await saldo(loc)).toBe(6);
    // reabrir: volta ao carro e reserva de novo no carro
    await ord.alterarSituacaoOrdem(o.id, "so_aberto", escritorio);
    expect(await saldo(carroAna.localId)).toBe(4);
    expect((await prisma.reserva.findMany({ where: { origemId: o.id, status: "ATIVA" } })).map((x) => x.localId)).toEqual([carroAna.localId]);
    // editar a OS mantém a marca
    const item = await prisma.osItemProduto.findFirstOrThrow({ where: { osId: o.id } });
    await ord.salvarOrdem({ ...dados({}, "2", carroAna.localId), produtos: [{ ...dados().produtos[0], id: item.id, quantidade: "2", localOrigemId: carroAna.localId }] }, escritorio, o.id);
    expect((await prisma.reserva.findMany({ where: { origemId: o.id, status: "ATIVA" } })).map((x) => [x.localId, Number(x.quantidade)])).toEqual([[carroAna.localId, 2]]);
  });

  it("ao ir para execução, o escritório marca os itens que estão com o técnico", async () => {
    await abastecer(4);
    const o = await ord.salvarOrdem(dados({}, "3"), escritorio);
    const item = await prisma.osItemProduto.findFirstOrThrow({ where: { osId: o.id } });
    expect(await itens.definirOrigemItens(o.id, [{ itemId: item.id, localId: carroAna.localId }], escritorio)).toBe(1);
    expect((await prisma.reserva.findMany({ where: { origemId: o.id, status: "ATIVA" } })).map((x) => x.localId)).toEqual([carroAna.localId]);
    expect(await resumo()).toMatchObject({ reservado: 3, disponivel: 6, comTecnicos: 1 });
    // volta para a loja
    await itens.definirOrigemItens(o.id, [{ itemId: item.id, localId: null }], escritorio);
    expect((await prisma.reserva.findMany({ where: { origemId: o.id, status: "ATIVA" } })).map((x) => x.localId)).toEqual([loc]);
    // só estoque de técnico; e com a OS baixada precisa reabrir
    await expect(itens.definirOrigemItens(o.id, [{ itemId: item.id, localId: loc2 }], escritorio)).rejects.toThrow(/estoque de um técnico/);
    await ord.alterarSituacaoOrdem(o.id, "so_teste", escritorio);
    await expect(itens.definirOrigemItens(o.id, [{ itemId: item.id, localId: carroAna.localId }], escritorio)).rejects.toThrow(/reabra/);
    expect(await prisma.osHistorico.count({ where: { osId: o.id, descricao: { startsWith: "Itens com o técnico" } } })).toBe(2);
  });

  it("técnico lança pela tela dele saindo do próprio carro (mesmo sem saldo, sem virar falta)", async () => {
    await abastecer(2);
    const o = await ord.salvarOrdem(dados({ produtos: [] }), escritorio);
    const r = await tec.lancarItemTecnico(ana, o.id, { tipo: "produto", id: prod, quantidade: 3, doMeuEstoque: true });
    expect(r.alocacoes).toEqual([{ localId: carroAna.localId, quantidade: 3 }]);
    expect((await prisma.osItemProduto.findUniqueOrThrow({ where: { id: r.itemId } })).localOrigemId).toBe(carroAna.localId);
    expect((await tecEst.saldoDoTecnico(ana.id))[0]).toMatchObject({ fisico: 2, reservado: 3, livre: -1 });
    // quem não tem carro não pode marcar
    await prisma.ordemServico.update({ where: { id: o.id }, data: { tecnicoIds: [ana.id, beto.id] } });
    await expect(tec.lancarItemTecnico(beto, o.id, { tipo: "produto", id: prod, quantidade: 1, doMeuEstoque: true })).rejects.toThrow(/estoque próprio/);
    // o técnico não usa o carro de outro
    const carroBeto = await tecEst.criarEstoqueTecnico(beto.id);
    await expect(itens.definirOrigemItens(o.id, [{ itemId: r.itemId, localId: carroBeto.localId }], beto, { soDoTecnico: beto.id })).rejects.toThrow(/seu próprio/);
  });

  it("do carro só volta para a loja o que não está separado para OS", async () => {
    await abastecer(4);
    await ord.salvarOrdem(dados({}, "3", carroAna.localId), escritorio);
    const devolver = (q: number) => doc.criarTransferencia({ origemDepositoId: carroAna.depositoId, destinoDepositoId: loja, observacoes: "", itens: [{ produtoId: prod, quantidade: String(q) }] }, escritorio);
    await expect(devolver(2)).rejects.toThrow(/só tem livre 1/);
    await devolver(1);
    expect(await saldo(carroAna.localId)).toBe(3);
  });

  it("abastecer o carro com peça reservada na loja não leva a reserva junto: ela procura outra prateleira", async () => {
    await prisma.$transaction((tx) => est.entrada(tx, { produtoId: prod, localId: loc2, quantidade: 5, origemTipo: "IMPLANTACAO" }));
    const o = await ord.salvarOrdem(dados({}, "9"), escritorio); // A-01 tem 10 (local padrão): reserva 9 lá
    await doc.criarTransferencia({ origemDepositoId: loja, destinoDepositoId: carroAna.depositoId, observacoes: "", itens: [{ produtoId: prod, quantidade: "12" }] }, escritorio);
    const r = await prisma.reserva.findMany({ where: { origemId: o.id, status: "ATIVA" } });
    expect(r.every((x) => x.localId !== carroAna.localId)).toBe(true);
    expect(r.reduce((s, x) => s + Number(x.quantidade), 0)).toBe(9);
    expect(await resumo()).toMatchObject({ fisico: 15, comTecnicos: 12 });
  });
});
