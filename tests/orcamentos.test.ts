import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const orc = await import("@/lib/orcamentos/orcamentos");
const est = await import("@/lib/estoque/estoque");
const { periodoDia } = await import("@/lib/datas");
const { importarBackupGestaoClick } = await import("@/lib/migracao/gestaoclick");

let prod = "", serv = "", cli = "", loc = "";
let u = { id: "", nome: "Caue", papel: "OPERADOR" as const };

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Orcamento","Anotacao","Lancamento","VendaPagamento","VendaItem","Venda","OrdemServico","Reserva","MovimentoEstoque","Saldo","Produto","Servico","Local","Deposito","Pessoa","Sequencia" CASCADE`);
  // situações do jeito que a migração cria
  await prisma.situacaoOrcamento.updateMany({ data: { bloqueados: [] } });
  const dep = await prisma.deposito.create({ data: { nome: "Loja" } });
  loc = (await prisma.local.create({ data: { depositoId: dep.id, codigo: "A-01" } })).id;
  prod = (await prisma.produto.create({ data: { codigo: "NB", nome: "Nobreak 1500VA", precoVenda: 1240, custo: 800, localPadraoId: loc } })).id;
  serv = (await prisma.servico.create({ data: { codigo: "INST", nome: "Instalação", preco: 150 } })).id;
  cli = (await prisma.pessoa.create({ data: { nome: "Departamento de Engenharia", cliente: true } })).id;
  const usuario = await prisma.usuario.upsert({ where: { email: "orc@local.test" }, update: {}, create: { nome: "Caue", email: "orc@local.test", papel: "OPERADOR" } });
  u = { id: usuario.id, nome: usuario.nome, papel: "OPERADOR" };
  await prisma.$transaction((tx) => est.entrada(tx, { produtoId: prod, localId: loc, quantidade: 5, origemTipo: "IMPLANTACAO" }));
});

const dados = (m: Partial<import("@/lib/orcamentos/tipos").DadosOrcamento> = {}): import("@/lib/orcamentos/tipos").DadosOrcamento => ({
  tipo: "PRODUTO", numero: "", clienteId: cli, clienteNome: "", data: "2026-11-09", validade: "10 dias", vendedorId: "", prazoEntrega: "", aosCuidados: "",
  canal: "Presencial", centroCusto: "", introducao: "", situacaoId: "",
  produtos: [{ produtoId: prod, nome: "Nobreak", codigo: "NB", unidade: "UN", detalhes: "", quantidade: "2", tipoValorId: "", valorUnit: "100,00", desconto: "10", descontoPct: true }],
  servicos: [{ servicoId: serv, nome: "Instalação", codigo: "INST", detalhes: "", quantidade: "1", valorUnit: "150,00", desconto: "0", descontoPct: false }],
  transportadoraId: "", transportadoraNome: "", frete: "20,00", mostrarEntrega: false, enderecoEntregaId: "",
  desconto: "", descontoPct: false, exibirTotal: true,
  gerarCondicoes: true, condicao: "PARCELADO", formaPagamentoId: "", vencimento: "", intervaloDias: "30", numParcelas: "3", primeiraParcela: "2026-12-01",
  parcelas: orc.gerarParcelas(350, 3, "2026-12-01", 30, ""),
  observacoes: "", observacaoInterna: "", camposExtras: {}, ...m,
});

describe("orçamentos", () => {
  it("calcula totais com desconto por linha em % e R$, e divide as parcelas sem perder centavos", () => {
    const t = orc.totais({ produtos: dados().produtos, servicos: dados().servicos, desconto: "10", descontoPct: true, frete: "20" });
    expect(t).toEqual({ produtos: 180, servicos: 150, desconto: 33, frete: 20, total: 317 });
    const p = orc.gerarParcelas(100, 3, "2026-01-31", 30, "");
    expect(p.map((x) => x.valor)).toEqual(["33,33", "33,33", "33,34"]);
    expect(p.map((x) => x.vencimento)).toEqual(["2026-01-31", "2026-03-02", "2026-04-01"]);
    expect(orc.aplicarTags("Olá [nome_cliente], segue o orçamento [numero] [x]", { nome_cliente: "Maria", numero: "6650" })).toBe("Olá Maria, segue o orçamento 6650 [x]");
  });

  it("cadastra com número sequencial, histórico e parcelas; recusa parcelas que não fecham", async () => {
    await prisma.sequencia.create({ data: { chave: "ORCAMENTO", valor: 6649 } });
    const o = await orc.salvarOrcamento(dados(), u);
    expect(o.numero).toBe(6650);
    expect(Number(o.total)).toBe(350);
    const comp = await prisma.orcamento.findUniqueOrThrow({ where: { id: o.id }, include: { parcelas: true, historico: true, situacao: true } });
    expect(comp.parcelas.map((x) => Number(x.valor))).toEqual([116.66, 116.66, 116.68]);
    expect(comp.situacao.nome).toBe("Em aberto");
    expect(comp.historico[0].descricao).toBe("O orçamento foi cadastrado no sistema");
    await expect(orc.salvarOrcamento(dados({ frete: "30" }), u)).rejects.toThrow(/não fecha/);
    await expect(orc.salvarOrcamento(dados({ numero: "6650" }), u)).rejects.toThrow(/Já existe/);
    expect(await orc.proximoNumeroOrcamento()).toBe(6651);
  });

  it("orçamento não mexe no estoque; gerar venda reserva e muda para a situação que gera venda", async () => {
    const o = await orc.salvarOrcamento(dados(), u);
    expect(await prisma.reserva.count()).toBe(0);
    const { vendaId } = await orc.gerarVendaDoOrcamento(o.id, u);
    const v = await prisma.venda.findUniqueOrThrow({ where: { id: vendaId } });
    expect(Number(v.total)).toBe(350);
    expect(await prisma.reserva.aggregate({ _sum: { quantidade: true } }).then((r) => Number(r._sum.quantidade))).toBe(2);
    const depois = await prisma.orcamento.findUniqueOrThrow({ where: { id: o.id }, include: { situacao: true } });
    expect(depois.situacao.nome).toBe("Concretizado");
    expect(depois.vendaId).toBe(vendaId);
    await expect(orc.gerarVendaDoOrcamento(o.id, u)).rejects.toThrow(/já gerou/);
  });

  it("gerar OS leva produtos e serviços", async () => {
    const o = await orc.salvarOrcamento(dados(), u);
    const { osId } = await orc.gerarOsDoOrcamento(o.id, u);
    const os = await prisma.ordemServico.findUniqueOrThrow({ where: { id: osId }, include: { produtos: true, servicos: true } });
    expect(os.produtos).toHaveLength(1);
    expect(os.servicos).toHaveLength(1);
  });

  it("grupo bloqueado na situação não troca a situação; cópia volta para a situação inicial", async () => {
    const o = await orc.salvarOrcamento(dados(), u);
    const [aberto, andamento] = await prisma.situacaoOrcamento.findMany({ orderBy: { ordem: "asc" }, take: 2 });
    await prisma.situacaoOrcamento.update({ where: { id: aberto.id }, data: { bloqueados: ["OPERADOR"] } });
    await expect(orc.alterarSituacaoOrcamento(o.id, andamento.id, u)).rejects.toThrow(/não pode trocar/);
    await orc.alterarSituacaoOrcamento(o.id, andamento.id, { ...u, papel: "GERENTE" as never });
    const c = await orc.clonarOrcamento(o.id, u);
    expect(c.numero).toBe(o.numero + 1);
    expect(c.situacaoId).toBe(aberto.id);
    expect(await prisma.orcamentoItem.count({ where: { orcamentoId: c.id } })).toBe(1);
    await orc.excluirOrcamento(c.id);
    expect(await prisma.orcamento.count()).toBe(1);
  });

  it("lista filtra por período e esconde situações ocultas", async () => {
    await orc.salvarOrcamento(dados(), u);
    const out = await orc.salvarOrcamento(dados({ data: "2026-10-05" }), u);
    const canc = await prisma.situacaoOrcamento.findFirstOrThrow({ where: { exibir: false } });
    const can = await orc.salvarOrcamento(dados(), u);
    await prisma.orcamento.update({ where: { id: can.id }, data: { situacaoId: canc.id } });
    const n = async (sp: Record<string, string>) => prisma.orcamento.count({ where: await orc.whereOrcamentos(sp) });
    expect(await n({ periodo: "2026-11" })).toBe(1);
    expect(await n({ periodo: "todos" })).toBe(2);
    expect(await n({ periodo: "todos", s: canc.id })).toBe(1);
    expect(await n({ periodo: "periodo", pde: "2026-10-01", pate: "2026-10-31" })).toBe(1);
    expect(out.numero).toBeGreaterThan(0);
    expect(periodoDia("todos", "", "")).toBeNull();
  });

  it("orçamento é um só: o de serviços entra na mesma lista e o tipo segue o conteúdo", async () => {
    const so = await orc.salvarOrcamento(dados({ tipo: "PRODUTO", produtos: [], condicao: "AVISTA", vencimento: "2026-11-09" }), u);
    const misto = await orc.salvarOrcamento(dados({ tipo: "SERVICO" }), u);
    expect(so.tipo).toBe("SERVICO");
    expect(misto.tipo).toBe("PRODUTO");
    expect(await prisma.orcamento.count({ where: await orc.whereOrcamentos({ periodo: "todos" }) })).toBe(2);
    await expect(orc.salvarOrcamento(dados({ produtos: [], servicos: [] }), u)).rejects.toThrow(/produto ou serviço/);
  });

  it("importa orçamentos do backup do Gestão Click com itens, parcelas e situação, e continua a numeração", async () => {
    const t = {
      clientes: [{ codigo: "1", nome: "Departamento de Engenharia" }],
      produtos: [{ codigo: "NB", produto: "Nobreak 1500VA" }],
      servicos: [{ servico: "Instalação", "codigo interno": "INST" }],
      orcamentos: [
        { "n do orcamento": "6003", cliente: "Departamento de Engenharia", data: "05/06/2025", "prazo de entrega": "10/06/2025", "valor frete": "0,00", "desconto valor": "", "total do pedido": "1.390,00", "canal de venda": "Presencial", "cadastrado em": "05/06/2025 11:25:14" },
        { "n do orcamento": "6004", cliente: "Cliente Novo", data: "06/06/2025", "total do pedido": "300,00", "canal de venda": "Presencial" },
      ],
      orcamentos_produtos: [{ "n do orcamento": "6003", produto: "Nobreak 1500VA", quantidade: "1", "valor unitario": "1.240,00", "valor total": "1.240,00" },
        { "n do orcamento": "6004", produto: "Produto que saiu de linha", quantidade: "2", "valor unitario": "150,00", "valor total": "300,00" }],
      orcamentos_servicos: [{ "n do orcamento": "6003", servico: "Instalação", quantidade: "1", "valor unitario": "150,00", "valor total": "150,00" }],
      orcamentos_pagamentos: [{ "n do orcamento": "6003", vencimento: "05/07/2025", "valor da parcela": "695,00" }, { "n do orcamento": "6003", vencimento: "05/08/2025", "valor da parcela": "695,00" }],
      orcamentos_historicos: [{ "n do orcamento": "6003", data: "05/06/2025 11:25:15", observacao: "Orçamento cadastrado", situacao: "Em aberto" },
        { "n do orcamento": "6003", data: "06/06/2025 09:00:00", observacao: "", situacao: "Concretizado" }],
    } as unknown as import("@/lib/migracao/gestaoclick").Tabelas;
    const [sim] = await importarBackupGestaoClick(t, { simular: true, etapas: { orcamentos: true } });
    expect(sim.criados).toBe(2);
    expect(await prisma.orcamento.count()).toBe(0);
    const [r] = await importarBackupGestaoClick(t, { simular: false, etapas: { orcamentos: true } });
    expect(r.criados).toBe(2);
    const o = await prisma.orcamento.findUniqueOrThrow({ where: { numero: 6003 }, include: { produtos: true, servicos: true, parcelas: true, situacao: true } });
    expect([o.produtos.length, o.servicos.length, o.parcelas.length, Number(o.total), o.situacao.nome, o.condicao]).toEqual([1, 1, 2, 1390, "Concretizado", "PARCELADO"]);
    const fora = await prisma.produto.findFirstOrThrow({ where: { nome: "Produto que saiu de linha" } });
    expect([fora.ativo, fora.controlaEstoque, fora.codigo.startsWith("GC-")]).toEqual([false, false, true]);
    expect(await orc.proximoNumeroOrcamento()).toBe(6005);
    const [de_novo] = await importarBackupGestaoClick(t, { simular: false, etapas: { orcamentos: true } });
    expect(de_novo.ignorados).toHaveLength(2);
  });
});
