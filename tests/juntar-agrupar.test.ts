import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const est = await import("@/lib/estoque/estoque");
const ped = await import("@/lib/vendas/pedidos");
const ord = await import("@/lib/os/ordens");
const { juntarVendas } = await import("@/lib/vendas/juntar");
const { juntarOrdens } = await import("@/lib/os/juntar");
const { agruparContas, desagruparConta, referenciasBoleto } = await import("@/lib/financeiro/agrupar");
const { gerarParcelas } = await import("@/lib/orcamentos/orcamentos");
const { equipamentoVazio } = await import("@/lib/os/tipos");
type DadosV = import("@/lib/orcamentos/tipos").DadosOrcamento;
type DadosO = import("@/lib/os/tipos").DadosOs;

let prod = "", serv = "", cli = "", outro = "", loc = "";
let u = { id: "", nome: "Caue", papel: "OPERADOR" as const };

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Orcamento","Anotacao","Anexo","Lancamento","LancamentoAgrupado","VendaPagamento","VendaItem","Venda","OrdemServico","Reserva","MovimentoEstoque","Saldo","Produto","Servico","Local","Deposito","Pessoa","Sequencia" CASCADE`);
  await prisma.situacaoVendaConfig.updateMany({ data: { bloqueados: [], permiteEdicao: true } });
  await prisma.situacaoOsConfig.updateMany({ data: { bloqueados: [] } });
  await prisma.situacaoOsConfig.update({ where: { id: "so_aberto" }, data: { permiteEdicao: true } });
  const dep = await prisma.deposito.create({ data: { nome: "Loja" } });
  loc = (await prisma.local.create({ data: { depositoId: dep.id, codigo: "A-01" } })).id;
  prod = (await prisma.produto.create({ data: { codigo: "NB", nome: "Nobreak", precoVenda: 100, custo: 60, localPadraoId: loc } })).id;
  serv = (await prisma.servico.create({ data: { codigo: "INST", nome: "Instalação", preco: 150 } })).id;
  cli = (await prisma.pessoa.create({ data: { nome: "GN JOB", cliente: true } })).id;
  outro = (await prisma.pessoa.create({ data: { nome: "Outro cliente", cliente: true } })).id;
  const usuario = await prisma.usuario.upsert({ where: { email: "juntar@local.test" }, update: {}, create: { nome: "Caue", email: "juntar@local.test", papel: "OPERADOR" } });
  u = { id: usuario.id, nome: usuario.nome, papel: "OPERADOR" };
  await prisma.$transaction((tx) => est.entrada(tx, { produtoId: prod, localId: loc, quantidade: 10, origemTipo: "IMPLANTACAO" }));
});

const estoque = () => prisma.$transaction((tx) => est.resumoProduto(tx, prod));

const venda = (m: Partial<DadosV> = {}): DadosV => ({
  tipo: "PRODUTO", numero: "", clienteId: cli, clienteNome: "", data: "2026-11-20", validade: "", vendedorId: "", prazoEntrega: "", aosCuidados: "",
  canal: "Presencial", centroCusto: "", introducao: "", situacaoId: "sv_aberto",
  produtos: [{ produtoId: prod, nome: "Nobreak", codigo: "NB", unidade: "UN", detalhes: "", quantidade: "2", tipoValorId: "", valorUnit: "100,00", desconto: "0", descontoPct: false }],
  servicos: [],
  transportadoraId: "", transportadoraNome: "", frete: "0", mostrarEntrega: false, enderecoEntregaId: "",
  desconto: "", descontoPct: false, exibirTotal: true,
  gerarCondicoes: true, condicao: "AVISTA", formaPagamentoId: "", vencimento: "2026-12-10", intervaloDias: "30", numParcelas: "1", primeiraParcela: "",
  parcelas: [], observacoes: "", observacaoInterna: "", camposExtras: {}, ...m,
});

const os = (m: Partial<DadosO> = {}): DadosO => ({
  tipo: "SERVICO", numero: "", clienteId: cli, clienteNome: "", data: "2026-11-16", validade: "", vendedorId: "", prazoEntrega: "", aosCuidados: "",
  canal: "Presencial", centroCusto: "", introducao: "", situacaoId: "so_aberto",
  produtos: [{ produtoId: prod, nome: "Nobreak", codigo: "NB", unidade: "UN", detalhes: "", quantidade: "1", tipoValorId: "", valorUnit: "100,00", desconto: "0", descontoPct: false }],
  servicos: [{ servicoId: serv, nome: "Instalação", codigo: "INST", detalhes: "", quantidade: "1", valorUnit: "150,00", desconto: "0", descontoPct: false }],
  transportadoraId: "", transportadoraNome: "", frete: "0", mostrarEntrega: false, enderecoEntregaId: "",
  desconto: "", descontoPct: false, exibirTotal: true,
  gerarCondicoes: true, condicao: "AVISTA", formaPagamentoId: "", vencimento: "2026-12-05", intervaloDias: "30", numParcelas: "1", primeiraParcela: "",
  parcelas: [], observacoes: "", observacaoInterna: "", camposExtras: {},
  entrada: "2026-11-16T09:30", saida: "", prioridade: "MEDIA", tecnicoIds: [], outros: "0",
  equipamentos: [{ ...equipamentoVazio(), equipamento: "Computador" }],
  ...m,
});

describe("juntar vendas", () => {
  it("soma os itens numa venda nova, refaz as reservas uma vez e cancela as originais apontando para a nova", async () => {
    const a = await ped.salvarPedido(venda(), u);
    const b = await ped.salvarPedido(venda({ produtos: [{ produtoId: prod, nome: "Nobreak", codigo: "NB", unidade: "UN", detalhes: "", quantidade: "3", tipoValorId: "", valorUnit: "100,00", desconto: "0", descontoPct: false }], servicos: [{ servicoId: serv, nome: "Instalação", codigo: "INST", detalhes: "", quantidade: "1", valorUnit: "150,00", desconto: "0", descontoPct: false }] }), u);
    const orc = await prisma.orcamento.findFirst();
    expect(orc).toBeNull();
    expect(await estoque()).toMatchObject({ reservado: 5 });

    const { venda: nova, numeros } = await juntarVendas([b.id, a.id], u);
    expect(numeros).toEqual([a.numero, b.numero]);
    expect(nova.situacao).toBe("ABERTA");
    expect(nova.situacaoId).toBe("sv_aberto");
    expect(Number(nova.total)).toBe(650);
    const itens = await prisma.vendaItem.findMany({ where: { vendaId: nova.id } });
    expect(itens).toHaveLength(1);
    expect(Number(itens[0].quantidade)).toBe(5);
    expect(await prisma.vendaItemServico.count({ where: { vendaId: nova.id } })).toBe(1);
    expect(await estoque()).toMatchObject({ fisico: 10, reservado: 5 });
    const originais = await prisma.venda.findMany({ where: { id: { in: [a.id, b.id] } } });
    expect(originais.every((v) => v.situacao === "CANCELADA" && v.juntadaEmId === nova.id)).toBe(true);

    // a nova cancelada devolve tudo (vínculos desfeitos como no PR #93)
    await ped.cancelarVenda(nova.id, u);
    expect(await estoque()).toMatchObject({ reservado: 0 });
  });

  it("concretizadas: o financeiro das originais sai e a nova lança uma conta só", async () => {
    const a = await ped.salvarPedido(venda({ situacaoId: "sv_concretizada" }), u);
    const b = await ped.salvarPedido(venda({ situacaoId: "sv_concretizada", vencimento: "2026-12-01" }), u);
    expect(await prisma.lancamento.count({ where: { tipo: "RECEBER" } })).toBe(2);
    expect(await estoque()).toMatchObject({ fisico: 6 });
    const { venda: nova } = await juntarVendas([a.id, b.id], u);
    const contas = await prisma.lancamento.findMany({ where: { tipo: "RECEBER" } });
    expect(contas).toHaveLength(1);
    expect(contas[0].origemId).toBe(nova.id);
    expect(Number(contas[0].valor)).toBe(400);
    expect(contas[0].vencimento.toISOString().slice(0, 10)).toBe("2026-12-01");
    expect(await estoque()).toMatchObject({ fisico: 6, reservado: 0 });
  });

  it("recusa clientes ou situações diferentes e conta já recebida", async () => {
    const a = await ped.salvarPedido(venda(), u);
    const b = await ped.salvarPedido(venda({ clienteId: outro }), u);
    await expect(juntarVendas([a.id, b.id], u)).rejects.toThrow(/clientes diferentes/);
    const c = await ped.salvarPedido(venda({ situacaoId: "sv_concretizada" }), u);
    await expect(juntarVendas([a.id, c.id], u)).rejects.toThrow(/situações diferentes/);
    const d = await ped.salvarPedido(venda({ situacaoId: "sv_concretizada" }), u);
    await prisma.lancamento.updateMany({ where: { origemId: d.id }, data: { pagoEm: new Date("2026-11-21"), valorPago: 200 } });
    await expect(juntarVendas([c.id, d.id], u)).rejects.toThrow(/já recebida/);
    // nada mudou
    expect((await prisma.venda.findUniqueOrThrow({ where: { id: a.id } })).situacao).toBe("ABERTA");
  });

  it("o orçamento da venda original passa para a nova", async () => {
    const a = await ped.salvarPedido(venda(), u);
    const b = await ped.salvarPedido(venda(), u);
    const sit = await prisma.situacaoOrcamento.findFirstOrThrow({ where: { geraVenda: true } });
    const orc = await prisma.orcamento.create({ data: { numero: 501, data: new Date(), clienteId: cli, situacaoId: sit.id, vendaId: a.id } });
    const { venda: nova } = await juntarVendas([a.id, b.id], u);
    expect((await prisma.orcamento.findUniqueOrThrow({ where: { id: orc.id } })).vendaId).toBe(nova.id);
  });
});

describe("juntar OS", () => {
  it("leva equipamentos, itens (com marcas e fotos) e refaz as reservas", async () => {
    const a = await ord.salvarOrdem(os(), u);
    const b = await ord.salvarOrdem(os({ equipamentos: [{ ...equipamentoVazio(), equipamento: "Impressora" }] }), u);
    const item = await prisma.osItemProduto.findFirstOrThrow({ where: { osId: b.id } });
    await prisma.osItemProduto.update({ where: { id: item.id }, data: { instalado: true, instaladoEm: new Date() } });
    await prisma.anexo.create({ data: { entidade: "OS_FOTO", entidadeId: b.id, referencia: item.id, nome: "f.jpg", tipo: "image/jpeg", tamanho: 1, dados: Buffer.from("x") } });
    expect(await estoque()).toMatchObject({ reservado: 2 });

    const { os: nova } = await juntarOrdens([a.id, b.id], u);
    expect(Number(nova.total)).toBe(500);
    expect(await prisma.osEquipamento.count({ where: { osId: nova.id } })).toBe(2);
    const itens = await prisma.osItemProduto.findMany({ where: { osId: nova.id }, orderBy: { ordem: "asc" } });
    expect(itens).toHaveLength(2); // um instalado e um não: linhas separadas
    const serv = await prisma.osItemServico.findMany({ where: { osId: nova.id } });
    expect(serv).toHaveLength(1);
    expect(Number(serv[0].quantidade)).toBe(2);
    const foto = await prisma.anexo.findFirstOrThrow({ where: { entidade: "OS_FOTO" } });
    expect(foto.entidadeId).toBe(nova.id);
    expect(itens.find((i) => i.instalado)?.id).toBe(foto.referencia);
    expect(await estoque()).toMatchObject({ fisico: 10, reservado: 2 });
    const originais = await prisma.ordemServico.findMany({ where: { id: { in: [a.id, b.id] } } });
    expect(originais.every((o) => o.situacao === "CANCELADA" && o.juntadaEmId === nova.id)).toBe(true);
  });
});

describe("agrupar contas a receber", () => {
  it("junta as contas num título com as referências; a venda não lança de novo nem cancela; desagrupar volta como era", async () => {
    const v = await ped.salvarPedido(venda({ situacaoId: "sv_concretizada" }), u);
    const o = await ord.salvarOrdem(os({ situacaoId: "so_concretizada" }), u);
    const contas = await prisma.lancamento.findMany({ where: { tipo: "RECEBER" } });
    expect(contas).toHaveLength(2);

    const { titulo } = await agruparContas(contas.map((c) => c.id), u, { vencimento: new Date("2026-12-20") });
    expect(titulo.origemTipo).toBe("AGRUPAMENTO");
    expect(Number(titulo.valor)).toBe(450);
    expect(titulo.descricao).toContain(`Venda nº ${v.numero}`);
    expect(titulo.descricao).toContain(`OS nº ${o.numero}`);
    expect(await prisma.lancamento.count({ where: { tipo: "RECEBER" } })).toBe(1);
    expect((await referenciasBoleto(titulo.id))[0]).toMatch(/^Ref\.: /);

    // trocar a situação da venda para outra que lança financeiro não duplica a conta
    await ped.alterarSituacaoPedido(v.id, "sv_rma", u).catch(() => null);
    await ped.alterarSituacaoPedido(v.id, "sv_concretizada", u).catch(() => null);
    expect(await prisma.lancamento.count({ where: { tipo: "RECEBER" } })).toBe(1);
    // cancelar a venda pede para desagrupar antes
    await expect(ped.cancelarVenda(v.id, u)).rejects.toThrow(/desagrupe/);

    await desagruparConta(titulo.id);
    const voltaram = await prisma.lancamento.findMany({ where: { tipo: "RECEBER" }, orderBy: { valor: "asc" } });
    expect(voltaram.map((l) => [l.origemTipo, Number(l.valor)])).toEqual([["VENDA", 200], ["OS", 250]]);
    await ped.cancelarVenda(v.id, u);
    expect(await prisma.lancamento.count({ where: { tipo: "RECEBER" } })).toBe(1);
  });

  it("recusa clientes diferentes e conta recebida", async () => {
    await ped.salvarPedido(venda({ situacaoId: "sv_concretizada" }), u);
    await ped.salvarPedido(venda({ situacaoId: "sv_concretizada", clienteId: outro }), u);
    const contas = await prisma.lancamento.findMany({ where: { tipo: "RECEBER" } });
    await expect(agruparContas(contas.map((c) => c.id), u)).rejects.toThrow(/clientes diferentes/);
    await prisma.lancamento.update({ where: { id: contas[0].id }, data: { pagoEm: new Date(), valorPago: 200 } });
    await expect(agruparContas(contas.map((c) => c.id), u)).rejects.toThrow(/já foi recebida/);
  });
});

void gerarParcelas;
