import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { LOJA_ATUAL } from "@/lib/empresa/loja";
import ExcelJS from "exceljs";
import JSZip from "jszip";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const est = await import("@/lib/estoque/estoque");
const gc = await import("@/lib/migracao/gestaoclick");
const { garantirPadroes: garantirPadroesFin } = await import("@/lib/financeiro/padroes");
const { ligarContasPelaDescricao, descricaoComNumero } = await import("@/lib/financeiro/origem");

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Compra","AjusteEstoque","Lancamento","OsHistorico","OsItemServico","OsItemProduto","OrdemServico","Reserva","MovimentoEstoque","Saldo","Produto","GrupoProduto","Local","Deposito","Pessoa","Servico","Sequencia","FormaPagamento","CategoriaFinanceira","ContaBancaria","TransacaoBancaria" CASCADE`);
});

async function planilha(linhas: (string | null)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Worksheet");
  linhas.forEach((l) => ws.addRow(l));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Zip no mesmo layout do backup do Gestão Click (pastas por módulo, tabelas partidas em _1/_2). */
async function backup() {
  const z = new JSZip();
  z.file("log.txt", "Backup concluído");
  z.file("clientes/clientes.xlsx", await planilha([
    ["Codigo", "Tipo de pessoa", "Nome", "CPF", "RG", "Data de nascimento", "Razão social", "Nome social", "CNPJ", "Inscrição estadual", "Inscrição municipal", "Ativo", "Telefone", "Celular", "E-mail", "Cadastrado em"],
    ["1", "PF", "LAZARO", null, null, null, null, null, null, null, null, "Sim", null, null, null, "19/05/2025 14:43:25"],
    ["2", "PJ", "FOLK STORE", null, null, null, "FOLK COMERCIO LTDA", null, "11.222.333/0001-81", "123456789", null, "Sim", "(16) 3333-0000", null, "folk@ex.com", "19/05/2025 14:43:25"],
  ]));
  z.file("clientes/clientes_enderecos.xlsx", await planilha([
    ["Código", "Tipo", "CEP", "Logradouro", "Número", "Complemento", "Bairro", "Cidade", "UF"],
    ["2", "Entrega", "13560-000", "Rua de entrega", "1", null, "Centro", "São Carlos", "SP"],
    ["2", "Comercial", "13562-101", "Rua Nestor de Campos", "345", null, "Planalto Paraíso", "São Carlos", "SP"],
  ]));
  z.file("fornecedores/fornecedores.xlsx", await planilha([
    ["Código", "Tipo de fornecedor", "Ativo", "Nome", "CPF", "CNPJ", "E-mail", "Telefone", "Celular"],
    ["1", "PJ", "Sim", "FOLK COMERCIO LTDA", null, "11.222.333/0001-81", null, null, null],
  ]));
  const cabProd = ["Codigo", "Codigo de barra", "Loja", "Grupo", "Produto", "Descrição", "Peso", "Largura", "Altura", "Comprimento", "Valor de custo", "Unidade de entrada", "Unidade de saida", "Peso liquido", "Peso bruto", "Comissão", "Observações", "Ativo", "Estoque minimo", "Estoque maximo", "Estoque atual", "Código NCM", "Descrição NCM", "Código CEST", "Descrição CEST", "Valor Varejo"];
  z.file("produtos/produtos.xlsx", await planilha([cabProd,
    ["BAT7", "7890000000001", "MXTECH", "ENERGIA", "ELE - BATERIA 12V 7AH", null, null, null, null, null, "80,00", "UN", "Unidade", null, null, "0,00", null, "Sim", "1,00", "0,00", "3,00", "85072010", "Acumuladores", null, null, "144.9"],
    ["CABO", null, "MXTECH", null, "CABO UTP CAT5E", null, null, null, null, null, "1,20", "MT", "Metro", null, null, "0,00", null, "Sim", "0,00", "0,00", "-10,00", "85444900", "Cabos", null, null, "2.5"],
  ]));
  z.file("produtos/produtos_2.xlsx", await planilha([cabProd,
    ["FONTE", null, "MXTECH", null, "FONTE ATX 500W", null, null, null, null, null, "100,00", "PC", "PC", null, null, "0,00", null, "Não", "0,00", "0,00", "0,00", null, null, null, null, "199"],
    // custo por caixa de 305 m, estoque e venda por metro
    ["CX305", null, "MXTECH", null, "INF - CABO DE REDE UTP CAT6 305M AZUL", null, null, null, null, null, "690,00", "CX1", "MT", null, null, "0,00", null, "Sim", "0,00", "0,00", "1.459,00", "85444900", "Cabos", null, null, "3.9"],
    // custo por caixa sem quantidade no nome: entra sem custo
    ["CONX", null, "MXTECH", null, "CONECTOR RJ45 CAT5E", null, null, null, null, null, "12,52", "CX1", "Unidade", null, null, "0,00", null, "Sim", "0,00", "0,00", "343,00", "85366990", "Conectores", null, null, "2.5"],
  ]));
  z.file("servicos/servicos.xlsx", await planilha([
    ["Servico", "Código interno", "Valor unitário", "Comissão", "Observações", "Cadastrado por", "Cadastrado em", "Modificado em"],
    ["VISITA TÉCNICA", "2000000000001", "80,00", null, null, null, null, null],
  ]));
  const cabOs = ["Nº da OS", "Cliente", "Data", "Prazo de entrega", "Valor total", "Valor frete", "Desconto valor", "Total do pedido", "Vendedor", "Canal de venda", "Centro de custo", "Aos cuidados de", "Validade da proposta", "Introdução", "Observações", "Observações interna", "Cadastrado por", "Cadastrado em", "Modificado em", "Loja"];
  const os = (n: string, cli: string) => [n, cli, "02/11/2026", "09/11/2026", "0,00", "0,00", null, "0,00", null, null, null, null, null, null, null, "interna", null, "02/11/2026 10:00:00", null, "MXTECH"];
  z.file("ordens_servicos/ordens_servicos.xlsx", await planilha([cabOs, os("7001", "LAZARO"), os("7002", "FOLK STORE"), os("7003", "LAZARO"), os("7004", "CLIENTE AVULSO")]));
  z.file("ordens_servicos/ordens_servicos_equipamentos.xlsx", await planilha([
    ["Nº da OS", "Equipamento", "Marca", "Modelo", "Série", "Condições", "Defeitos", "Acessórios", "Solução", "Laudo técnico", "Termos de garantia", "Loja"],
    ["7001", "NOBREAK", "SMS", "NET 600", "X1", "riscado", "não liga", null, null, null, null, "MXTECH"],
  ]));
  z.file("ordens_servicos/ordens_servicos_produtos_1.xlsx", await planilha([
    ["Nº da OS", "Produto", "Quantidade", "Tipo", "Valor unitário", "Desconto", "Valor total", "Loja"],
    ["7001", "ELE - BATERIA 12V 7AH", "2", "Varejo", "144,90", null, "289,80", "MXTECH"],
    ["7002", "ELE - BATERIA 12V 7AH", "2", "Varejo", "144,90", null, "289,80", "MXTECH"],
    ["7002", "PRODUTO APAGADO", "1", "Varejo", "10,00", null, "10,00", "MXTECH"],
    ["7003", "ELE - BATERIA 12V 7AH", "1", "Varejo", "144,90", null, "144,90", "MXTECH"],
    ["7004", "CABO UTP CAT5E", "3", "Varejo", "2,50", null, "7,50", "MXTECH"],
  ]));
  z.file("ordens_servicos/ordens_servicos_servicos.xlsx", await planilha([
    ["Nº da OS", "Serviço", "Quantidade", "Valor unitário", "Desconto", "Valor total", "Loja"],
    ["7001", "VISITA TÉCNICA", "1", "80,00", null, "80,00", "MXTECH"],
  ]));
  const cabSit = ["Nº da OS", "Data", "Observação", "Situação", "Funcionário", "Loja"];
  z.file("ordens_servicos/ordens_servicos_situacoes_1.xlsx", await planilha([cabSit,
    ["7001", "02/11/2026 10:00:00", null, "Em aberto", null, "MXTECH"],
    ["7002", "02/11/2026 10:00:00", null, "Em aberto", null, "MXTECH"],
    ["7003", "02/11/2026 10:00:00", null, "Em aberto", null, "MXTECH"],
  ]));
  z.file("ordens_servicos/ordens_servicos_situacoes_2.xlsx", await planilha([cabSit,
    ["7002", "03/11/2026 09:00:00", null, "Em andamento", null, "MXTECH"],
    ["7003", "04/11/2026 09:00:00", null, "Concretizada", null, "MXTECH"],
    ["7004", "02/11/2026 10:00:00", null, "CONCLUIDA - FATURAR", null, "MXTECH"],
  ]));
  const cabCr = ["Descrição do recebimento", "Situação", "Plano de contas", "Entidade", "Entidade Nome", "Valor", "Desconto", "Juros", "Taxa do banco", "Taxa da operadora", "Valor total", "Data do vencimento", "Data de competência", "Data de confirmação", "Forma de pagamento", "Conta bancária", "Centro de custo", "Observações", "Cadastrado por", "Cadastrado em", "Modificado em", "Loja"];
  const cr = (d: string, sit: string, plano: string, ent: string, v: string, venc: string, forma: string) => [d, sit, plano, "Cliente", ent, v, "0", "0", "0", "0", v, venc, venc, null, forma, "INTER", null, null, null, "01/11/2026 10:00:00", null, "MXTECH"];
  z.file("contas_receber/contas_receber_1.xlsx", await planilha([cabCr,
    cr("Venda de nº 8001", "Confirmado", "Vendas no balcão", "LAZARO", "49.9", "01/11/2026", "PIX"),
    cr("Ordem de serviço de nº 6500", "Atrasado", "Prestações de serviços", "FOLK STORE", "1234.5", "10/10/2026", "Boleto Bancário"),
    cr("Venda de nº 8002", "Não Pago", "Vendas de produtos", "LAZARO", "100", "30/11/2026", "CREDITO VISA/MASTER 1X"),
    cr("Venda de nº 8003", "Atrasado", "Vendas de produtos", "LAZARO", "0", "30/11/2026", "PIX"),
  ]));
  z.file("compras/compras.xlsx", await planilha([
    ["Nº da compra", "Número da NF-e", "Chave NF-e", "Fornecedor", "Total dos produtos", "Valor frete", "Desconto valor", "Total da compra", "Data de emissão", "Pagar frete", "Transportadora", "Observações", "Cadastrado por", "Cadastrado em", "Modificado em", "Loja"],
    ["990", "123", "NFe35261011222333000181550010000001231000000010", "FOLK COMERCIO E DISTRIBUICAO LTDA", "160,00", "10,00", "0,00", "170,00", "01/10/2026", "Sim", null, "NF de teste", null, "01/10/2026 09:00:00", null, "MXTECH"],
    ["991", null, "NFe35261099888777000166550010000004561000000020", "NOVO FORNECEDOR LTDA", "12,00", "0,00", "0,00", "12,00", "05/10/2026", "Sim", null, null, null, "05/10/2026 09:00:00", null, "MXTECH"],
  ]));
  z.file("compras/compras_produtos.xlsx", await planilha([
    ["Código", "Produto", "Quantidade", "Unidade", "Custo unitário", "Custo total"],
    ["990", "ELE - BATERIA 12V 7AH", "2", "UN", "80,00", "160,00"],
    ["991", "CABO UTP CAT5E", "10", "MT", "1,20", "12,00"],
  ]));
  z.file("compras/compras_pagamentos.xlsx", await planilha([
    ["Código", "Vencimento", "Valor da parcela", "Forma de pagamento", "Observação"],
    ["990", "01/11/2026", "85,00", "Boleto Bancário", null], ["990", "01/12/2026", "85,00", "Boleto Bancário", null],
    ["991", "05/11/2026", "12,00", "PIX", null],
  ]));
  z.file("compras/compras_historicos.xlsx", await planilha([
    ["Código", "Data", "Observação", "Situação", "Funcionário"],
    ["990", "01/10/2026 09:00:00", "Compra cadastrada", "Em aberto", "MATHEUS"], ["990", "02/10/2026 09:00:00", null, "Confirmada", "MATHEUS"],
    ["991", "05/10/2026 09:00:00", "Compra cadastrada", "Em aberto", "MATHEUS"],
  ]));
  z.file("estoque/ajustes_estoques.xlsx", await planilha([
    ["Código", "Movimentação", "Valor frete", "Observações", "Cadastrado por", "Cadastrado em", "Loja"],
    ["1", "Entrada", "0,00", "AJUSTE DE ESTOQUE INICIAL", "MATHEUS", "02/06/2025 13:17:38", "MXTECH"],
  ]));
  z.file("estoque/ajustes_estoques_produtos.xlsx", await planilha([["Código", "Produto", "Variações", "Quantidade"], ["1", "ELE - BATERIA 12V 7AH", null, "3,00"]]));
  z.file("vendas/vendas_1.xlsx", await planilha([["Nº do pedido", "Cliente"], ["8694", "Consumidor"]]));
  return Buffer.from(await z.generateAsync({ type: "nodebuffer" }));
}

describe("backup do Gestão Click", () => {
  it("lê o zip juntando as partes", async () => {
    const t = await gc.lerBackupGestaoClick(await backup());
    expect(t.produtos).toHaveLength(5);
    expect(t.ordens_servicos_situacoes).toHaveLength(6);
  });

  it("simulação não grava", async () => {
    const res = await gc.importarBackupGestaoClick(await gc.lerBackupGestaoClick(await backup()), { simular: true });
    expect(res.find((r) => r.tipo === "os")!.criados).toBe(4);
    expect(await prisma.produto.count()).toBe(0);
    expect(await prisma.ordemServico.count()).toBe(0);
  });

  it("importa cadastros, estoque, todas as OS (abertas com reserva) e contas em aberto, sem duplicar ao repetir", async () => {
    const t = await gc.lerBackupGestaoClick(await backup());
    const res = await gc.importarBackupGestaoClick(t, { simular: false });
    const por = (tipo: string) => res.find((r) => r.tipo === tipo)!;

    // pessoas: PJ usa razão social e guarda o nome como fantasia; endereço comercial preferido ao de entrega; mesma empresa vira fornecedor
    const folk = await prisma.pessoa.findUniqueOrThrow({ where: { documento: "11222333000181" } });
    expect(folk).toMatchObject({ nome: "FOLK COMERCIO LTDA", fantasia: "FOLK STORE", logradouro: "Rua Nestor de Campos", cliente: true, fornecedor: true, tipoPessoa: "JURIDICA" });
    // tipos de endereço e unidades dos produtos entram nos cadastros
    expect((await prisma.tipoEndereco.findMany()).map((x) => x.nome)).toEqual(expect.arrayContaining(["Comercial", "Entrega"]));
    expect((await prisma.unidade.findMany()).map((u) => u.sigla)).toEqual(expect.arrayContaining(["UN", "MT"]));

    const cabo305 = await prisma.produto.findUniqueOrThrow({ where: { codigo: "CX305" } });
    expect(cabo305.unidade).toBe("MT");
    expect(Number(cabo305.custo)).toBeCloseTo(690 / 305, 4);
    const conx = await prisma.produto.findUniqueOrThrow({ where: { codigo: "CONX" } });
    expect(conx.unidade).toBe("UN");
    expect(Number(conx.custo)).toBe(0);
    expect(por("produtos").avisos.join(" ")).toMatch(/CONX/);

    const bat = await prisma.produto.findUniqueOrThrow({ where: { codigo: "BAT7" } });
    expect(Number(bat.precoVenda)).toBeCloseTo(144.9);
    expect(bat.ncm).toBe("85072010");
    expect((await prisma.produto.findUniqueOrThrow({ where: { codigo: "FONTE" } })).ativo).toBe(false);
    expect((await prisma.produto.findUniqueOrThrow({ where: { codigo: "CABO" } })).unidade).toBe("MT");

    // OS: 7001 aberta, 7002 em andamento, 7003 concretizada, 7004 concluída-faturar (cliente criado)
    expect(por("os").criados).toBe(4);
    const o1 = await prisma.ordemServico.findFirstOrThrow({ where: { numero: 7001 }, include: { cliente: true, servicos: true, equipamentos: true } });
    expect(o1).toMatchObject({ situacao: "ABERTA" });
    expect(o1.equipamentos[0]).toMatchObject({ equipamento: "NOBREAK", marca: "SMS" });
    expect(o1.cliente.nome).toBe("LAZARO");
    expect(Number(o1.total)).toBeCloseTo(369.8);
    expect((await prisma.ordemServico.findFirstOrThrow({ where: { numero: 7002 } })).situacao).toBe("EM_ANDAMENTO");
    const o3 = await prisma.ordemServico.findFirstOrThrow({ where: { numero: 7003 } });
    expect(o3).toMatchObject({ situacao: "FATURADA", situacaoId: "so_concretizada" });
    expect(o3.saida?.toISOString()).toBe("2026-11-04T12:00:00.000Z");
    expect(await prisma.osHistorico.count({ where: { osId: o3.id } })).toBe(3);
    const o4 = await prisma.ordemServico.findFirstOrThrow({ where: { numero: 7004 }, include: { cliente: true } });
    expect(o4).toMatchObject({ situacao: "CONCLUIDA", situacaoId: "so_faturar" });
    expect(o4.cliente.nome).toBe("CLIENTE AVULSO");
    expect(por("os").avisos.join(" ")).toMatch(/PRODUTO APAGADO/);

    // OS concluídas já baixaram as peças no Gestão Click: o saldo continua o do backup, sem movimento aqui
    const cabo = await prisma.produto.findUniqueOrThrow({ where: { codigo: "CABO" } });
    expect((await prisma.$transaction((tx) => est.resumoProduto(tx, cabo.id))).fisico).toBe(0);
    expect(await prisma.movimentoEstoque.count({ where: { origemTipo: "OS" } })).toBe(0);

    // estoque 3: 2 reservadas na 7001, 1 na 7002 e 1 em falta (a 7003 concretizada não reserva)
    const r = await prisma.$transaction((tx) => est.resumoProduto(tx, bat.id));
    expect(r.fisico).toBe(3);
    const reservas = await prisma.reserva.findMany({ where: { produtoId: bat.id } });
    expect(reservas.reduce((s, x) => s + Number(x.quantidade), 0)).toBe(4);
    expect(reservas.filter((x) => x.localId === null).reduce((s, x) => s + Number(x.quantidade), 0)).toBe(1);

    // numeração continua
    expect((await prisma.sequencia.findUniqueOrThrow({ where: { chave: "OS" } })).valor).toBe(7004);
    expect((await prisma.sequencia.findUniqueOrThrow({ where: { chave: "VENDA" } })).valor).toBe(8694);

    // contas: só as em aberto com valor
    const lanc = await prisma.lancamento.findMany({ include: { categoria: true, formaPagamento: true, pessoa: true }, orderBy: { vencimento: "asc" } });
    expect(lanc).toHaveLength(2);
    expect(lanc[0]).toMatchObject({ descricao: "Ordem de serviço de nº 6500" });
    expect(Number(lanc[0].valor)).toBeCloseTo(1234.5);
    expect(lanc[0].categoria.nome).toBe("Prestação de serviços");
    expect(lanc[0].formaPagamento?.nome).toBe("Boleto");
    expect(lanc[0].pessoa?.id).toBe(folk.id);
    expect(lanc[1].formaPagamento?.nome).toBe("Cartão de crédito");

    expect(await prisma.contaBancaria.findUnique({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "INTER" } } })).not.toBeNull();

    // compras: a confirmada entra recebida e com as contas "já lançadas lá"; fornecedor achado pelo CNPJ da chave da NF-e
    const c990 = await prisma.compra.findFirstOrThrow({ where: { numero: 990 }, include: { parcelas: true, historico: true, itens: true } });
    expect(c990).toMatchObject({ fornecedorId: folk.id, situacaoId: "sc_confirmada", recebida: true, financeiroNoLegado: true, numeroNfe: "123", chaveNfe: "35261011222333000181550010000001231000000010" });
    expect(Number(c990.total)).toBeCloseTo(170);
    expect(c990.parcelas).toHaveLength(2);
    expect(c990.historico).toHaveLength(3);
    const c991 = await prisma.compra.findFirstOrThrow({ where: { numero: 991 }, include: { fornecedor: true } });
    expect(c991).toMatchObject({ situacaoId: "sc_aberto", recebida: false, financeiroNoLegado: false });
    expect(c991.fornecedor).toMatchObject({ nome: "NOVO FORNECEDOR LTDA", documento: "99888777000166", fornecedor: true });
    expect(await prisma.movimentoEstoque.count({ where: { origemTipo: { in: ["COMPRA", "AJUSTE"] } } })).toBe(0);
    expect((await prisma.sequencia.findUniqueOrThrow({ where: { chave: "COMPRA" } })).valor).toBe(991);
    const aj = await prisma.ajusteEstoque.findFirstOrThrow({ where: { numero: 1 }, include: { itens: true } });
    expect(aj).toMatchObject({ tipo: "ENTRADA", criadoPorNome: "MATHEUS" });
    expect(Number(aj.itens[0].quantidade)).toBe(3);

    // repetir não duplica nada nem mexe no estoque já movimentado
    const res2 = await gc.importarBackupGestaoClick(t, { simular: false });
    expect(res2.find((x) => x.tipo === "os")!.criados).toBe(0);
    expect(await prisma.ordemServico.count()).toBe(4);
    expect(await prisma.lancamento.count()).toBe(2);
    expect(await prisma.pessoa.count()).toBe(4) // + o fornecedor criado pela compra 991;
    expect((await prisma.$transaction((tx) => est.resumoProduto(tx, bat.id))).fisico).toBe(3);
    expect(await prisma.compra.count()).toBe(2);
    expect(await prisma.ajusteEstoque.count()).toBe(1);

    // a compra em aberto, ao ser confirmada no MXERP, dá entrada e gera a conta a pagar (a confirmada no GC não)
    const { alterarSituacaoCompra } = await import("@/lib/compras/compras");
    const usu = await prisma.usuario.upsert({ where: { email: "gc@local.test" }, update: {}, create: { nome: "Teste", email: "gc@local.test", papel: "GERENTE" } });
    const eu = { id: usu.id, nome: usu.nome };
    await alterarSituacaoCompra(c991.id, "sc_confirmada", eu);
    expect((await prisma.$transaction((tx) => est.resumoProduto(tx, cabo.id))).fisico).toBe(10);
    expect(await prisma.lancamento.count({ where: { origemTipo: "COMPRA", origemId: c991.id } })).toBe(1);
    await alterarSituacaoCompra(c990.id, "sc_aberto", eu);
    await alterarSituacaoCompra(c990.id, "sc_confirmada", eu);
    expect(await prisma.lancamento.count({ where: { origemTipo: "COMPRA", origemId: c990.id } })).toBe(0);
  });
});

describe("só o que está em aberto", () => {
  it("sem o histórico, deixa de fora as OS concretizadas e as vendas concluídas", async () => {
    const t = await gc.lerBackupGestaoClick(await backup());
    const res = await gc.importarBackupGestaoClick(t, { simular: false, etapas: { cadastros: true, estoque: true, os: true, vendas: true, historico: false } });
    expect((await prisma.ordemServico.findMany({ orderBy: { numero: "asc" } })).map((o) => o.numero)).toEqual([7001, 7002, 7004]);
    expect(res.find((r) => r.tipo === "os")!.avisos.join(" ")).toMatch(/1 OS já concluídas ou canceladas/);
  });
});

describe("backup novo por cima de uma importação anterior", () => {
  it("passa a OS para a situação atual do Gestão Click e baixa a conta paga lá depois", async () => {
    const t = await gc.lerBackupGestaoClick(await backup());
    await gc.importarBackupGestaoClick(t, { simular: false });
    const bat = await prisma.produto.findUniqueOrThrow({ where: { codigo: "BAT7" } });
    const o1 = await prisma.ordemServico.findFirstOrThrow({ where: { numero: 7001 } });
    expect(await prisma.reserva.count({ where: { origemId: o1.id, status: "ATIVA" } })).toBe(1);
    // a 7002 foi mexida no MXERP depois da importação: o MXERP manda
    const o2 = await prisma.ordemServico.findFirstOrThrow({ where: { numero: 7002 } });
    await prisma.ordemServico.update({ where: { id: o2.id }, data: { updatedAt: new Date("2027-01-02T12:00:00Z") } });

    // backup novo: 7001 concretizada e 7002 cancelada no GC; a conta da OS 6500 recebida em 20/11
    const novo = structuredClone(t);
    novo.ordens_servicos_situacoes.push(
      { "n da os": "7001", data: "01/01/2027 10:00:00", observacao: "", situacao: "Concretizada", funcionario: "MATHEUS", loja: "MXTECH" },
      { "n da os": "7002", data: "01/01/2027 10:00:00", observacao: "", situacao: "Cancelada", funcionario: "MATHEUS", loja: "MXTECH" },
    );
    const cr = novo.contas_receber.find((l) => l["descricao do recebimento"] === "Ordem de serviço de nº 6500")!;
    Object.assign(cr, { situacao: "Confirmado", "data de confirmacao": "20/11/2026", juros: "10", "valor total": "1244.5" });

    const sim = await gc.importarBackupGestaoClick(novo, { simular: true });
    expect(sim.find((r) => r.tipo === "os")!.avisos.join(" ")).toMatch(/1 OS já trazidas antes mudaram de situação/);
    expect(sim.find((r) => r.tipo === "receber")!.avisos.join(" ")).toMatch(/1 contas trazidas antes foram recebidas/);
    expect((await prisma.lancamento.findFirstOrThrow({ where: { descricao: "Ordem de serviço de nº 6500" } })).pagoEm).toBeNull();

    const res = await gc.importarBackupGestaoClick(novo, { simular: false });
    expect(res.find((r) => r.tipo === "os")!.avisos.join(" ")).toMatch(/alteradas no MXERP.*7002/);
    const o1b = await prisma.ordemServico.findFirstOrThrow({ where: { numero: 7001 }, include: { historico: true } });
    expect(o1b).toMatchObject({ situacao: "FATURADA", situacaoId: "so_concretizada" });
    expect(o1b.saida?.toISOString()).toBe("2027-01-01T13:00:00.000Z");
    expect(o1b.historico.some((h) => h.situacao === "Concretizada")).toBe(true);
    // a peça sai da reserva sem baixa (o saldo do backup já desconta), e a falta da 7002 continua dela
    expect(await prisma.reserva.count({ where: { origemId: o1.id, status: "ATIVA" } })).toBe(0);
    expect(await prisma.movimentoEstoque.count({ where: { origemTipo: "OS" } })).toBe(0);
    expect((await prisma.$transaction((tx) => est.resumoProduto(tx, bat.id))).fisico).toBe(3);
    expect((await prisma.ordemServico.findFirstOrThrow({ where: { numero: 7002 } })).situacao).toBe("EM_ANDAMENTO");

    const l = await prisma.lancamento.findFirstOrThrow({ where: { descricao: "Ordem de serviço de nº 6500" }, include: { contaBancaria: true } });
    expect(l.pagoEm?.toISOString().slice(0, 10)).toBe("2026-11-20");
    expect(Number(l.valorPago)).toBeCloseTo(1244.5);
    expect(l.contaBancaria?.nome).toBe("INTER");

    // de novo: nada muda
    const res3 = await gc.importarBackupGestaoClick(novo, { simular: false });
    expect(res3.find((r) => r.tipo === "os")!.avisos.join(" ")).not.toMatch(/mudaram de situação/);
    expect(res3.find((r) => r.tipo === "receber")!.avisos.join(" ")).not.toMatch(/trazidas antes/);
  });
});

describe("importar tudo: histórico das contas e notas do Gestão Click", () => {
  it("contas pagas entram baixadas (menos as já lançadas pelo extrato), notas para consulta e a numeração continua", async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "NotaFiscal", "Empresa", "TransacaoBancaria" CASCADE`);
    const emp = await prisma.empresa.create({ data: { razaoSocial: "MXTECH LTDA", nomeFantasia: "MXTECH", cnpj: "12965283000195" } });
    await prisma.sequencia.create({ data: { chave: "NF-12965283000195-55-1-P", valor: 6000 } });
    const t = await gc.lerBackupGestaoClick(await backup());
    const cab = Object.keys(t.contas_receber[0]);
    const linha = (o: Record<string, string>) => Object.fromEntries(cab.map((k) => [k, o[k] ?? t.contas_receber[0][k]]));
    t.contas_receber.push(linha({ "descricao do recebimento": "Venda de nº 7000", situacao: "Confirmado", valor: "300", "valor total": "300", "data do vencimento": "05/10/2026", "data de confirmacao": "06/10/2026" }));
    // a venda 8001 (confirmada, 49,90 em 01/11) já entrou no MXERP pela conciliação do extrato
    await gc.importarBackupGestaoClick(t, { simular: false, etapas: { cadastros: true } });
    const inter = await prisma.contaBancaria.upsert({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "INTER" } }, create: { nome: "INTER" }, update: {} });
    const cat = await prisma.categoriaFinanceira.create({ data: { nome: "Receita do extrato", tipo: "RECEBER", grupoDre: "RECEITA_BRUTA" } });
    const tr = await prisma.transacaoBancaria.create({ data: { contaBancariaId: inter.id, data: new Date("2026-11-01T00:00:00Z"), valor: 49.9, descricao: "PIX LAZARO", chave: "x1", situacao: "CONCILIADA" } });
    await prisma.lancamento.create({ data: { tipo: "RECEBER", descricao: "Pix", categoriaId: cat.id, valor: 49.9, valorPago: 49.9, vencimento: tr.data, competencia: tr.data, pagoEm: tr.data, contaBancariaId: inter.id, transacaoId: tr.id, idLegado: `extrato:${tr.id}` } });

    t.notas_fiscais = [
      { loja: "MXTECH", numero: "6901", situacao: "Aprovada", serie: "1", chave: "35251112965283000195550010000069011208477675", protocolo: "135", ambiente: "Produção", "data de emissao": "19/11/2026", "hora de emissao": "10:00:00", "valor total": "1.234,50", "nome do destinatario": "FOLK COMERCIO LTDA", "natureza de operacao": "Venda de mercadoria" },
      { loja: "MXTECH", numero: "6900", situacao: "Cancelada", serie: "1", chave: "35251112965283000195550010000069001208477675", protocolo: "", ambiente: "Produção", "data de emissao": "18/11/2026", "hora de emissao": "", "valor total": "10,00", "nome do destinatario": "LAZARO" },
    ];
    t.notas_fiscais_servicos = [{ numero: "1111", rps: "109", serie: "900", ambiente: "Produção", "data de emissao": "02/06/2025", "hora de emissao": "12:18:00", "razao social": "LAZARO", "valor do servico": "80,00", loja: "MXTECH" }];
    const res = await gc.importarBackupGestaoClick(t, { simular: false, etapas: { receber: true, pagas: true, notas: true } });
    const rec = res.find((r) => r.tipo === "receber")!;
    expect(rec.avisos.join(" ")).toMatch(/1 contas já recebidas no Gestão Click .* entraram baixadas/);
    expect(rec.avisos.join(" ")).toMatch(/1 contas já recebidas no Gestão Click ficaram de fora porque o mesmo valor/);
    const hist = await prisma.lancamento.findFirstOrThrow({ where: { descricao: "Venda de nº 7000" }, include: { contaBancaria: true } });
    expect(hist.pagoEm?.toISOString().slice(0, 10)).toBe("2026-10-06");
    expect(Number(hist.valorPago)).toBe(300);
    expect(hist.contaBancaria?.nome).toBe("INTER");

    const notas = await prisma.notaFiscal.findMany({ orderBy: { numero: "asc" } });
    expect(notas.map((n) => [n.modelo, n.numero, n.status])).toEqual([["NFSE", 109, "AUTORIZADA"], ["NFE", 6900, "CANCELADA"], ["NFE", 6901, "AUTORIZADA"]]);
    expect(notas[0].numeroNfse).toBe(1111); // a DPS/RPS 109 controla a numeração; a tela mostra a nota 1111
    expect(notas[2]).toMatchObject({ empresaId: emp.id, destinatarioNome: "FOLK COMERCIO LTDA", chave: "35251112965283000195550010000069011208477675" });
    expect((await prisma.sequencia.findUniqueOrThrow({ where: { chave: "NF-12965283000195-55-1-P" } })).valor).toBe(6901);
    expect((await prisma.sequencia.findUniqueOrThrow({ where: { chave: "DPS-12965283000195-900-P" } })).valor).toBe(109);

    // de novo: nada duplica
    const res2 = await gc.importarBackupGestaoClick(t, { simular: false, etapas: { receber: true, pagas: true, notas: true } });
    expect(res2.find((r) => r.tipo === "notas")!.criados).toBe(0);
    expect(await prisma.lancamento.count({ where: { descricao: "Venda de nº 7000" } })).toBe(1);
  });
});

describe("origem das notas do Gestão Click", () => {
  it("liga a nota à venda do mesmo cliente e valor, emitida perto da data", async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "NotaFiscal", "Empresa", "Venda" CASCADE`);
    await prisma.empresa.create({ data: { razaoSocial: "MXTECH LTDA", nomeFantasia: "MXTECH", cnpj: "12965283000195" } });
    const cli = await prisma.pessoa.create({ data: { nome: "T-CLIENTE NOTA", documento: "11144477735", cliente: true } });
    const venda = await prisma.venda.create({ data: { numero: 990777, clienteId: cli.id, data: new Date("2026-10-05T13:00:00Z"), total: 250, totalProdutos: 250 } });
    const t = await gc.lerBackupGestaoClick(await backup());
    t.notas_fiscais = [
      { loja: "MXTECH", numero: "6950", situacao: "Aprovada", serie: "1", chave: "", ambiente: "Produção", "data de emissao": "06/10/2026", "hora de emissao": "10:00:00", "valor total": "250,00", "nome do destinatario": "T-CLIENTE NOTA", "cpf do destinatario": "111.444.777-35" },
      { loja: "MXTECH", numero: "6951", situacao: "Aprovada", serie: "1", chave: "", ambiente: "Produção", "data de emissao": "06/10/2026", "hora de emissao": "11:00:00", "valor total": "999,00", "nome do destinatario": "T-CLIENTE NOTA", "cpf do destinatario": "111.444.777-35" },
    ];
    const res = await gc.importarBackupGestaoClick(t, { simular: false, etapas: { notas: true } });
    expect(res.find((r) => r.tipo === "notas")!.avisos.join(" ")).toMatch(/1 notas ficaram ligadas/);
    expect(await prisma.notaFiscal.findFirstOrThrow({ where: { numero: 6950 } })).toMatchObject({ origemTipo: "VENDA", origemId: venda.id });
    expect((await prisma.notaFiscal.findFirstOrThrow({ where: { numero: 6951 } })).origemId).toBeNull();
    await prisma.pessoa.delete({ where: { id: cli.id } }).catch(() => null);
  });
});

describe("ligar notas do Gestão Click às OS", () => {
  it("usa entrada e saída da OS, liga duas notas a duas OS iguais e não repete documento já ligado", async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "NotaFiscal", "Empresa", "Venda", "OrdemServico" CASCADE`);
    await prisma.empresa.create({ data: { razaoSocial: "MXTECH LTDA", nomeFantasia: "MXTECH", cnpj: "12965283000195" } });
    const cli = await prisma.pessoa.create({ data: { nome: "T-POSTO BANDEIRA", documento: "50488238000186", cliente: true } });
    const d = (s: string) => new Date(`${s}T12:00:00Z`);
    // nota emitida 20 dias antes de a OS ser fechada (mas depois da entrada): antes ficava sem ligar
    const longa = await prisma.ordemServico.create({ data: { numero: 990801, clienteId: cli.id, entrada: d("2025-11-01"), saida: d("2025-11-28"), total: 808, totalServicos: 808 } });
    // duas OS do mesmo cliente, mesmo valor, mesmo dia: antes era "empate" e nenhuma ganhava nota
    const a = await prisma.ordemServico.create({ data: { numero: 990802, clienteId: cli.id, entrada: d("2026-03-10"), saida: d("2026-03-10"), total: 220, totalServicos: 220 } });
    const b = await prisma.ordemServico.create({ data: { numero: 990803, clienteId: cli.id, entrada: d("2026-03-10"), saida: d("2026-03-10"), total: 220, totalServicos: 220 } });
    // OS que já tem a NFS-e dela: não recebe outra
    const jaTem = await prisma.ordemServico.create({ data: { numero: 990804, clienteId: cli.id, entrada: d("2026-08-13"), saida: d("2026-08-13"), total: 60, totalServicos: 60 } });
    await prisma.notaFiscal.create({ data: { modelo: "NFSE", serie: 1, numero: 86, ambiente: "PRODUCAO", status: "AUTORIZADA", valorTotal: 60, origemTipo: "OS", origemId: jaTem.id } });
    const nota = (numero: number, valor: number, dia: string) => prisma.notaFiscal.create({ data: {
      modelo: "NFSE", serie: 900, numero, ambiente: "PRODUCAO", status: "AUTORIZADA", valorTotal: valor, emitidaEm: d(dia), destinatarioNome: "T-POSTO BANDEIRA", idLegado: `nota:NFSE:900:${numero}:PRODUCAO`,
    } });
    const n1 = await nota(501, 808, "2025-11-08");
    const n2 = await nota(502, 220, "2026-03-10");
    const n3 = await nota(503, 220, "2026-03-11");
    const n4 = await nota(504, 60, "2026-08-14");

    expect(await gc.ligarNotasDoGestaoClick(true)).toEqual({ semOrigem: 4, ligadas: 3 });
    expect((await prisma.notaFiscal.findUniqueOrThrow({ where: { id: n1.id } })).origemId).toBeNull(); // simulação não grava
    expect(await gc.ligarNotasDoGestaoClick(false)).toEqual({ semOrigem: 4, ligadas: 3 });
    const origem = async (id: string) => (await prisma.notaFiscal.findUniqueOrThrow({ where: { id } })).origemId;
    expect(await origem(n1.id)).toBe(longa.id);
    expect(new Set([await origem(n2.id), await origem(n3.id)])).toEqual(new Set([a.id, b.id]));
    expect(await origem(n4.id)).toBeNull();
    // de novo: nada muda
    expect(await gc.ligarNotasDoGestaoClick(false)).toEqual({ semOrigem: 1, ligadas: 0 });
    await prisma.$executeRawUnsafe(`TRUNCATE "NotaFiscal", "OrdemServico" CASCADE`);
    await prisma.pessoa.delete({ where: { id: cli.id } }).catch(() => null);
  });
});

describe("vínculo exato das contas e notas do Gestão Click", () => {
  it("grava a venda da descrição nas contas, numera as parcelas e liga a nota citada pela venda", async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "NotaFiscal", "Empresa", "Venda", "Lancamento" CASCADE`);
    await prisma.empresa.create({ data: { razaoSocial: "MXTECH LTDA", nomeFantasia: "MXTECH", cnpj: "12965283000195" } });
    await prisma.$transaction((tx) => garantirPadroesFin(tx));
    const cat = await prisma.categoriaFinanceira.findFirstOrThrow({ where: { nome: "Venda de produtos" } });
    const cli = await prisma.pessoa.create({ data: { nome: "T-POSTO 7066", documento: "50488238000186", cliente: true } });
    // venda com valor que nenhum palpite acharia (nota de outro valor), mas o GC cita a nota na venda
    const venda = await prisma.venda.create({ data: { numero: 7066, idLegado: "venda:7066", clienteId: cli.id, data: new Date("2026-01-29T12:00:00Z"), total: 4323.9, totalProdutos: 4323.9 } });
    const parc = (v: number, venc: string, n: number) => prisma.lancamento.create({ data: {
      tipo: "RECEBER", descricao: "Venda de nº 7066", valor: v, vencimento: new Date(`${venc}T00:00:00Z`), competencia: new Date(`${venc}T00:00:00Z`), categoriaId: cat.id,
      pessoaId: cli.id, origemTipo: "IMPLANTACAO", idLegado: `receber:t7066-${n}`,
    } });
    const ps = [await parc(1080.96, "2026-11-14", 4), await parc(1080.98, "2026-08-14", 1), await parc(1080.98, "2026-10-14", 3), await parc(1080.98, "2026-09-14", 2)];

    expect(await ligarContasPelaDescricao(true)).toEqual({ soltas: 4, ligadas: 4, numeradas: 4 });
    expect(await prisma.lancamento.count({ where: { origemId: venda.id } })).toBe(0); // simulação
    expect(await ligarContasPelaDescricao(false)).toEqual({ soltas: 4, ligadas: 4, numeradas: 4 });
    const contas = await prisma.lancamento.findMany({ where: { origemId: venda.id }, orderBy: { vencimento: "asc" } });
    expect(contas.map((c) => [c.origemTipo, c.parcela, c.totalParcelas])).toEqual([["VENDA", 1, 4], ["VENDA", 2, 4], ["VENDA", 3, 4], ["VENDA", 4, 4]]);
    expect(contas[3].id).toBe(ps[0].id);
    expect(await ligarContasPelaDescricao(false)).toEqual({ soltas: 0, ligadas: 0, numeradas: 0 });

    const t = await gc.lerBackupGestaoClick(await backup());
    t.vendas = [{ "n do pedido": "7066", cliente: "T-POSTO 7066", "nf e": "#6756" }];
    t.notas_fiscais = [{ loja: "MXTECH", numero: "6756", situacao: "Aprovada", serie: "1", chave: "", ambiente: "Produção", "data de emissao": "30/01/2026", "hora de emissao": "10:00:00", "valor total": "4.000,00", "nome do destinatario": "OUTRO NOME" }];
    await gc.importarBackupGestaoClick(t, { simular: false, etapas: { notas: true } });
    expect(await prisma.notaFiscal.findFirstOrThrow({ where: { numero: 6756 } })).toMatchObject({ origemTipo: "VENDA", origemId: venda.id });
    await prisma.$executeRawUnsafe(`TRUNCATE "NotaFiscal", "Venda", "Lancamento" CASCADE`);
    await prisma.pessoa.delete({ where: { id: cli.id } }).catch(() => null);
  });

  it("liga a NF-e pelas duplicatas iguais às parcelas, mesmo emitida meses depois, e corrige palpite antigo", async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "NotaFiscal", "Empresa", "Venda" CASCADE`);
    await prisma.empresa.create({ data: { razaoSocial: "MXTECH LTDA", nomeFantasia: "MXTECH", cnpj: "12965283000195" } });
    const cli = await prisma.pessoa.create({ data: { nome: "T-DUP POSTO", documento: "50488238000186", cliente: true } });
    const dia = new Date("2026-01-29T12:00:00Z");
    const certa = await prisma.venda.create({ data: { numero: 8001, idLegado: "venda:8001", clienteId: cli.id, data: dia, total: 300, totalProdutos: 300, situacao: "CONCLUIDA" } });
    // cancelada com as mesmas parcelas: não conta
    await prisma.venda.create({ data: { numero: 8002, idLegado: "venda:8002", clienteId: cli.id, data: dia, total: 300, totalProdutos: 300, situacao: "CANCELADA" } });
    // venda do mesmo valor e data, que o palpite antigo escolheu
    const errada = await prisma.venda.create({ data: { numero: 8003, idLegado: "venda:8003", clienteId: cli.id, data: new Date("2026-07-28T12:00:00Z"), total: 300, totalProdutos: 300, situacao: "CONCLUIDA" } });
    const t = await gc.lerBackupGestaoClick(await backup());
    t.vendas = [];
    t.vendas_pagamentos = ["8001", "8002"].flatMap((n) => [
      { "n do pedido": n, vencimento: "28/02/2026", "valor da parcela": "150,00" }, { "n do pedido": n, vencimento: "28/03/2026", "valor da parcela": "150,00" },
    ]);
    t.notas_fiscais = [{ loja: "MXTECH", numero: "6901", situacao: "Aprovada", serie: "1", chave: "", ambiente: "Produção", "data de emissao": "30/07/2026", "hora de emissao": "10:00:00", "valor total": "300,00", "nome do destinatario": "T-DUP POSTO" }];
    t.notas_fiscais_pagamentos = [{ "nota fiscal n": "6901", "data de vencimento": "28/03/2026", valor: "150,00" }, { "nota fiscal n": "6901", "data de vencimento": "28/02/2026", valor: "150,00" }];
    await prisma.notaFiscal.create({ data: { modelo: "NFE", serie: 1, numero: 6901, ambiente: "PRODUCAO", status: "AUTORIZADA", emitidaEm: new Date("2026-07-30T13:00:00Z"), valorTotal: 300, origemTipo: "VENDA", origemId: errada.id, idLegado: "nota:NFE:1:6901:PRODUCAO" } });
    const res = await gc.importarBackupGestaoClick(t, { simular: false, etapas: { notas: true } });
    expect(await prisma.notaFiscal.findFirstOrThrow({ where: { numero: 6901 } })).toMatchObject({ origemTipo: "VENDA", origemId: certa.id });
    expect(res.find((r) => r.tipo === "notas")!.avisos.join(" ")).toMatch(/1 trocaram de documento/);
    await prisma.$executeRawUnsafe(`TRUNCATE "NotaFiscal", "Venda" CASCADE`);
    await prisma.pessoa.delete({ where: { id: cli.id } }).catch(() => null);
  });

  it("venda de contrato: conta \"Venda de serviços nº N\" e NFS-e que cita a venda, data no dia certo", async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "NotaFiscal", "Venda", "Lancamento" CASCADE`);
    // sem apagar a empresa: as situações de venda são dela
    if (!(await prisma.empresa.findFirst({ where: { cnpj: "12965283000195" } }))) await prisma.empresa.create({ data: { razaoSocial: "MXTECH LTDA", nomeFantasia: "MXTECH", cnpj: "12965283000195" } });
    await prisma.$transaction((tx) => garantirPadroesFin(tx));
    const cat = await prisma.categoriaFinanceira.findFirstOrThrow({ where: { nome: "Venda de produtos" } });
    (await import("@/lib/empresa/loja")).limparCacheLojas();
    if (!(await prisma.situacaoVendaConfig.count())) await prisma.situacaoVendaConfig.create({ data: { nome: "Concretizada", estoque: "LANCAR", padrao: true } });
    const cli = await prisma.pessoa.create({ data: { nome: "T-ESSENCE DENTAL", documento: "04008318000170", cliente: true } });
    const t = await gc.lerBackupGestaoClick(await backup());
    t.clientes = []; t.vendas_produtos = []; t.vendas_pagamentos = []; t.vendas_historicos = [];
    t.vendas = [{ "n do pedido": "13", cliente: "T-ESSENCE DENTAL", data: "25/11/2026", "total do pedido": "2.000,00" }];
    t.vendas_servicos = [{ "n do pedido": "13", servico: "MANUTENCAO MENSAL", quantidade: "1", "valor unitario": "2.000,00", "valor total": "2.000,00" }];
    await gc.importarBackupGestaoClick(t, { simular: false, etapas: { vendas: true } });
    const venda = await prisma.venda.findFirstOrThrow({ where: { idLegado: "venda:13" } });
    // 25/11 em São Paulo (antes ficava à meia-noite UTC = 24/11 21h)
    expect(venda.data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })).toBe("25/11/2026");

    await prisma.lancamento.create({ data: {
      tipo: "RECEBER", descricao: "Venda de serviços nº 13 - assinatura nº 14", valor: 2000, vencimento: new Date("2026-11-25T00:00:00Z"), competencia: new Date("2026-11-15T00:00:00Z"),
      categoriaId: cat.id, pessoaId: cli.id, origemTipo: "IMPLANTACAO", idLegado: "receber:t-ess-13",
    } });
    expect(await ligarContasPelaDescricao(false)).toMatchObject({ ligadas: 1 });
    expect(await prisma.lancamento.findFirstOrThrow({ where: { idLegado: "receber:t-ess-13" } })).toMatchObject({ origemTipo: "VENDA", origemId: venda.id });

    // NFS-e de outro valor (não casa no palpite), mas a descrição cita a venda do contrato
    t.vendas = [];
    t.notas_fiscais_servicos = [{ loja: "MXTECH", numero: "428", rps: "599", serie: "1", ambiente: "Produção", "data de emissao": "30/11/2026", "hora de emissao": "10:47:00",
      "razao social": "T-ESSENCE DENTAL", cnpj: "04.008.318/0001-70", "descricao do servico": "Venda de serviços nº 13 - assinatura nº 14 (1 parcela)", "valor do servico": "1.999,00" }];
    await gc.importarBackupGestaoClick(t, { simular: false, etapas: { notas: true } });
    expect(await prisma.notaFiscal.findFirstOrThrow({ where: { modelo: "NFSE", numero: 599 } })).toMatchObject({ origemTipo: "VENDA", origemId: venda.id, numeroNfse: 428 });
    await prisma.$executeRawUnsafe(`TRUNCATE "NotaFiscal", "Venda", "Lancamento" CASCADE`);
    await prisma.pessoa.delete({ where: { id: cli.id } }).catch(() => null);
  });

  it("lê a coluna de nota em vários formatos", () => {
    expect(gc.notasDaLinha({ "nf e": "#6756", "n da nfs e": "98", valor: "10", nota: "" })).toEqual([{ grupo: "PROD", numero: 6756 }, { grupo: "SERV", numero: 98 }]);
    expect(gc.notasDaLinha({ "nota fiscal": "6756, 6757" }).map((n) => n.numero)).toEqual([6756, 6757]);
  });
});

describe("segunda empresa (outro Gestão Click)", () => {
  it("entra na loja dela sem misturar números, estoque nem cadastros com a primeira", async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "NotaFiscal", "Empresa" CASCADE`);
    const a = await prisma.empresa.create({ data: { razaoSocial: "MXTECH LTDA", nomeFantasia: "MXTECH", cnpj: "12965283000195" } });
    const b = await prisma.empresa.create({ data: { razaoSocial: "SEGUNDA LTDA", nomeFantasia: "SEGUNDA", cnpj: "11222333000181" } });
    (await import("@/lib/empresa/loja")).limparCacheLojas();
    const t = await gc.lerBackupGestaoClick(await backup());
    const tudo = { cadastros: true, estoque: true, os: true, vendas: true, receber: true, pagar: true };
    await gc.importarBackupGestaoClick(t, { simular: false, etapas: tudo });
    // como na tela de empresas: a segunda nasce com a estrutura da principal
    const { espelharEstrutura } = await import("@/lib/empresa/estrutura");
    await espelharEstrutura(b.id);
    const pessoas = await prisma.pessoa.count(), produtos = await prisma.produto.count();
    const bat = await prisma.produto.findUniqueOrThrow({ where: { codigo: "BAT7" } });
    await prisma.produto.update({ where: { id: bat.id }, data: { nome: "BATERIA 7AH (nome daqui)" } });

    // o backup da outra empresa tem os mesmos números e o mesmo cliente com código 1
    const res = await gc.importarBackupGestaoClick(t, { simular: false, etapas: tudo, destino: { empresaId: b.id } });
    expect(await prisma.pessoa.count()).toBe(pessoas);
    expect(await prisma.produto.count()).toBe(produtos);
    expect((await prisma.produto.findUniqueOrThrow({ where: { id: bat.id } })).nome).toBe("BATERIA 7AH (nome daqui)");

    const osA = await prisma.ordemServico.findMany({ where: { empresaId: a.id }, orderBy: { numero: "asc" } });
    const osB = await prisma.ordemServico.findMany({ where: { empresaId: b.id }, orderBy: { numero: "asc" }, include: { historico: true } });
    expect(osA.map((o) => o.numero)).toEqual([7001, 7002, 7003, 7004]);
    expect(osB).toHaveLength(4);
    // cada empresa tem a sua numeração: a segunda mantém os números do Gestão Click dela
    expect(osB.map((o) => o.numero)).toEqual([7001, 7002, 7003, 7004]);
    expect(osB[0].historico.some((h) => /Nº 7001 no Gestão Click de SEGUNDA/.test(h.descricao))).toBe(true);
    expect(res.find((r) => r.tipo === "os")!.avisos.join(" ")).not.toMatch(/tinham o mesmo número/);
    expect((await prisma.sequencia.findUnique({ where: { chave: `OS#emp:${b.id}` } }))?.valor).toBe(7004);
    const { naLoja } = await import("@/lib/empresa/loja");
    const seq = await import("@/lib/sequencia");
    // a próxima de cada empresa segue a sua sequência; a busca pelo número fica na empresa da tela
    expect(await naLoja(b.id, () => prisma.$transaction((tx) => seq.proximoDoc(tx, "OS")))).toBe(7005);
    expect(await naLoja(a.id, () => prisma.$transaction((tx) => seq.proximoDoc(tx, "OS")))).toBeGreaterThan(7004);
    expect(await naLoja(b.id, () => seq.numeroEmUso(prisma.ordemServico, 7001))).toBe(true);
    expect(await naLoja(b.id, () => seq.numeroEmUso(prisma.ordemServico, 7001, a.id))).toBe(true);
    expect((await naLoja(b.id, () => prisma.ordemServico.findMany({ where: { numero: 7001 } }))).map((o) => o.empresaId)).toEqual([b.id]);

    // estoque: cada loja no seu depósito; o da primeira não muda
    const saldos = await prisma.saldo.findMany({ where: { produtoId: bat.id }, include: { local: { include: { deposito: true } } } });
    expect(saldos.map((x) => [x.local.deposito.empresaId, Number(x.quantidade)]).sort()).toEqual([[a.id, 3], [b.id, 3]].sort());

    // contas da outra empresa entram nela, no plano de contas e no banco dela
    const contasB = await prisma.lancamento.findMany({ where: { empresaId: b.id }, include: { categoria: true, contaBancaria: true } });
    expect(contasB).toHaveLength(2);
    expect(contasB.every((l) => l.categoria.empresaId === b.id && (!l.contaBancaria || l.contaBancaria.empresaId === b.id))).toBe(true);
    expect((await prisma.ordemServico.findFirstOrThrow({ where: { empresaId: b.id }, include: { situacaoCfg: true } })).situacaoCfg?.empresaId).toBe(b.id);

    // de novo: nada duplica
    await gc.importarBackupGestaoClick(t, { simular: false, etapas: tudo, destino: { empresaId: b.id } });
    expect(await prisma.ordemServico.count()).toBe(8);
    expect(await prisma.lancamento.count()).toBe(4);
    expect((await prisma.saldo.findMany({ where: { produtoId: bat.id } })).reduce((s, x) => s + Number(x.quantidade), 0)).toBe(6);
  });
});

describe("extrato de uma conta que já entrou baixada", () => {
  it("amarra a linha à conta sem baixar de novo", async () => {
    const { importarExtrato } = await import("@/lib/financeiro/extrato");
    const inter = await prisma.contaBancaria.create({ data: { nome: "INTER" } });
    const outra = await prisma.contaBancaria.create({ data: { nome: "PAGSEGURO" } });
    const cat = await prisma.categoriaFinanceira.create({ data: { nome: "Outras despesas", tipo: "PAGAR", grupoDre: "DESPESA_OPERACIONAL" } });
    const base = { tipo: "PAGAR" as const, categoriaId: cat.id, valor: 150, valorPago: 150, vencimento: new Date("2025-07-10T00:00:00Z"), competencia: new Date("2025-07-10T00:00:00Z") };
    const paga = await prisma.lancamento.create({ data: { ...base, descricao: "Energia", pagoEm: new Date("2025-07-11T00:00:00Z"), contaBancariaId: inter.id } });
    await prisma.lancamento.create({ data: { ...base, descricao: "Outro banco", pagoEm: new Date("2025-07-11T00:00:00Z"), contaBancariaId: outra.id } });
    const r = await importarExtrato(inter.id, [
      { data: new Date("2025-07-12T00:00:00Z"), valor: -150, descricao: "PAGAMENTO CPFL", chave: "a1" },
      { data: new Date("2025-07-12T00:00:00Z"), valor: -99, descricao: "OUTRA", chave: "a2" },
    ]);
    expect(r.jaBaixadas).toBe(1);
    const l = await prisma.lancamento.findUniqueOrThrow({ where: { id: paga.id }, include: { transacao: true } });
    expect(l.transacao?.situacao).toBe("CONCILIADA");
    expect(l.pagoEm?.toISOString().slice(0, 10)).toBe("2025-07-11");
    expect(await prisma.transacaoBancaria.count({ where: { situacao: "PENDENTE" } })).toBe(1);
  });
});

describe("unidade e custo do Gestão Click", () => {
  it("converte a unidade e o custo de caixa para metro", async () => {
    const { siglaUnidade, custoPorSaida } = await import("@/lib/migracao/gestaoclick");
    expect(siglaUnidade("Unidade")).toBe("UN");
    expect(siglaUnidade("CX1")).toBe("CX");
    expect(siglaUnidade("Metro Quadrado")).toBe("M2");
    const linha = (produto: string, custo: string, ent: string, sai: string, venda: string) =>
      ({ codigo: "X", produto, "valor de custo": custo, "unidade de entrada": ent, "unidade de saida": sai, "valor varejo": venda });
    expect(custoPorSaida(linha("CABO CAT6 LSZH 100M AZ", "425,34", "CX1", "MT", "4.5")).custo).toBeCloseTo(4.2534, 4);
    expect(custoPorSaida(linha("CABO ALTA ISOLACAO 7MM 50M", "73,00", "CX1", "MT", "2.19")).custo).toBeCloseTo(1.46, 4);
    expect(custoPorSaida(linha("SENSOR PIR", "90,00", "UN1", "Unidade", "169")).custo).toBe(90); // mesma unidade
    expect(custoPorSaida(linha("CABO 5MM BRANCO", "47,00", "CX1", "MT", "1.99"))).toMatchObject({ custo: 0, semCusto: true });
  });
});

describe("serviços recorrentes do Gestão Click", () => {
  it("entram como contratos ativos (os atrasados em aberto), com os serviços, sem duplicar e sem pegar o número de outro", async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "Contrato" CASCADE`);
    const t = await gc.lerBackupGestaoClick(await backup());
    const ct = (n: string, cli: string, prox = "2099-12-10") => ({
      "n do contrato": n, cliente: cli, "proximo vencimento": prox, "gerar servico": "Sim", "gerar fatura": "10 dias antes do vencimento", "canal de venda": "Presencial",
      "repetir esta venda": "A cada 1 mês", "quantidade de vezes": "Para sempre", "enviar por e mail": "Enviar lembrete de pagamento e boleto",
      vendedor: "", "forma de pagamento": "Boleto Bancário (SEGUNDA)", "valor total": "770", observacoes: "", "cadastrado por": "", "cadastrado em": "05/06/2025 15:51:12", loja: "MXTECH",
    });
    t.servicos_recorrentes = [ct("1", "FOLK STORE"), ct("2", "LAZARO"), ct("4", "LAZARO", "2020-01-15")];
    t.servicos_recorrentes_servicos = [{ codigo: "1", servico: "VISITA TÉCNICA", quantidade: "1,00", "valor unit": "770,00", "valor total": "770,00" }];
    const cli = await prisma.pessoa.create({ data: { nome: "JÁ EXISTE" } });
    await prisma.contrato.create({ data: { numero: 2, clienteId: cli.id, dataInicio: new Date(), periodicidade: "MENSAL", diaVencimento: 5, proximoVencimento: new Date(), total: "10.00", totalServicos: "10.00" } });
    const etapas = { cadastros: true, contratos: true };
    const sim = await gc.importarBackupGestaoClick(t, { simular: true, etapas });
    expect(sim.find((r) => r.tipo === "contratos")!.criados).toBe(3);
    expect(await prisma.contrato.count()).toBe(1);

    const res = await gc.importarBackupGestaoClick(t, { simular: false, etapas });
    const r = res.find((x) => x.tipo === "contratos")!;
    expect(r.avisos.join(" ")).toMatch(/2 → 3/);
    expect(r.avisos.join(" ")).toMatch(/2 ativos e 1 em aberto.*30\/11\/2099/);
    expect(r.avisos.join(" ")).toMatch(/Confira no Gestão Click.*4 \(15\/01\/2020\)/);
    expect((await prisma.contrato.findUniqueOrThrow({ where: { idLegado: "contrato:4" } })).situacao).toBe("EM_ABERTO");
    const c1 = await prisma.contrato.findUniqueOrThrow({ where: { idLegado: "contrato:1" }, include: { servicos: true, cliente: true } });
    expect(c1).toMatchObject({ numero: 1, situacao: "ATIVO", periodicidade: "MENSAL", diaVencimento: 10, diasAntecedencia: 10, enviarBoleto: true, termino: "SEM" });
    expect(c1.cliente.documento).toMatch(/11222333000181/);
    expect(c1.servicos).toHaveLength(1);
    expect(Number(c1.total)).toBe(770);
    expect((await prisma.contrato.findUniqueOrThrow({ where: { idLegado: "contrato:2" } })).numero).toBe(3);
    expect((await prisma.sequencia.findUniqueOrThrow({ where: { chave: "CONTRATO" } })).valor).toBe(4);

    await gc.importarBackupGestaoClick(t, { simular: false, etapas });
    expect(await prisma.contrato.count()).toBe(4);
  });
});

describe("forma de pagamento e documento das contas do Gestão Click", () => {
  it("traz formas sem equivalente (Mercado Livre, transferência) e liga a conta à OS/compra; reimportar completa as já trazidas", async () => {
    const t = await gc.lerBackupGestaoClick(await backup());
    const cab = Object.keys(t.contas_receber[0]);
    const linha = (o: Record<string, string>) => Object.fromEntries(cab.map((k) => [k, o[k] ?? t.contas_receber[0][k]]));
    t.contas_receber.push(linha({ "descricao do recebimento": "Ordem de serviço de nº 7001", situacao: "Não Pago", valor: "250", "valor total": "250", "data do vencimento": "30/12/2026", "forma de pagamento": "MERCADO LIVRE - MXTECH" }));
    t.contas_receber.push(linha({ "descricao do recebimento": "Venda de nº 99999", situacao: "Não Pago", valor: "10", "valor total": "10", "data do vencimento": "30/12/2026", "forma de pagamento": "A Combinar" }));
    t.contas_pagar = [linha({ "descricao do recebimento": "Compra de nº 990", situacao: "Não Pago", "plano de contas": "Compras de mercadorias", "entidade nome": "FOLK COMERCIO E DISTRIBUICAO LTDA", valor: "85", "valor total": "85", "data do vencimento": "30/12/2026", "forma de pagamento": "Transferência Bancária" })];
    await gc.importarBackupGestaoClick(t, { simular: false });

    const os = await prisma.ordemServico.findFirstOrThrow({ where: { numero: 7001 } });
    const lo = await prisma.lancamento.findFirstOrThrow({ where: { descricao: "Ordem de serviço de nº 7001" }, include: { formaPagamento: true } });
    expect(lo).toMatchObject({ origemTipo: "OS", origemId: os.id });
    expect(lo.formaPagamento?.nome).toBe("Mercado Livre");
    const compra = await prisma.compra.findFirstOrThrow({ where: { numero: 990 } });
    const lc = await prisma.lancamento.findFirstOrThrow({ where: { descricao: { startsWith: "Compra de nº 990" } }, include: { formaPagamento: true } });
    expect(lc).toMatchObject({ tipo: "PAGAR", origemTipo: "COMPRA", origemId: compra.id });
    expect(lc.formaPagamento).toMatchObject({ nome: "Transferência bancária", tPag: "18" });
    // venda que não veio do backup: fica sem documento, mas com a forma de lá
    const lv = await prisma.lancamento.findFirstOrThrow({ where: { descricao: "Venda de nº 99999" }, include: { formaPagamento: true } });
    expect(lv).toMatchObject({ origemTipo: "IMPLANTACAO", origemId: null });
    expect(lv.formaPagamento?.nome).toBe("A Combinar");
    expect((await prisma.lancamento.findFirstOrThrow({ where: { descricao: "Venda de nº 8002" }, include: { formaPagamento: true } })).formaPagamento?.nome).toBe("Cartão de crédito");

    // como em produção: contas trazidas antes desta correção, sem forma e sem documento
    await prisma.lancamento.updateMany({ where: { id: { in: [lo.id, lc.id] } }, data: { formaPagamentoId: null, origemTipo: "IMPLANTACAO", origemId: null } });
    // só completar: a conta excluída no MXERP não volta
    await prisma.lancamento.delete({ where: { id: lv.id } });
    // a lista do financeiro já acha o documento pelo número da descrição, antes de completar
    const { origemPelaDescricao } = await import("@/lib/financeiro/origem");
    const soltas = await prisma.lancamento.findMany({ where: { id: { in: [lo.id, lc.id] } } });
    const achadas = await origemPelaDescricao(soltas);
    expect(achadas.get(lo.id)).toEqual({ origemTipo: "OS", origemId: os.id });
    expect(achadas.get(lc.id)).toEqual({ origemTipo: "COMPRA", origemId: compra.id });
    expect((await origemPelaDescricao([{ id: "x", descricao: "Venda de nº 99999", origemTipo: "IMPLANTACAO", origemId: null }])).size).toBe(0);
    const sim = await gc.importarBackupGestaoClick(t, { simular: true, etapas: { completarContas: true } });
    expect(sim.find((r) => r.tipo === "receber")!.avisos.join(" ")).toMatch(/1 contas trazidas antes vão ganhar a forma/);
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id: lo.id } })).origemId).toBeNull();
    const res = await gc.importarBackupGestaoClick(t, { simular: false, etapas: { completarContas: true } });
    expect(res.find((r) => r.tipo === "pagar")!.avisos.join(" ")).toMatch(/1 contas trazidas antes ganharam/);
    expect(await prisma.lancamento.findUniqueOrThrow({ where: { id: lo.id } })).toMatchObject({ origemTipo: "OS", origemId: os.id, formaPagamentoId: lo.formaPagamentoId });
    expect(await prisma.lancamento.findUniqueOrThrow({ where: { id: lc.id } })).toMatchObject({ origemTipo: "COMPRA", origemId: compra.id, formaPagamentoId: lc.formaPagamentoId });
    expect(await prisma.lancamento.count()).toBe(4);
    // com a etapa de contas marcada, a reimportação também completa
    await prisma.lancamento.update({ where: { id: lo.id }, data: { formaPagamentoId: null } });
    await gc.importarBackupGestaoClick(t, { simular: false, etapas: { receber: true } });
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id: lo.id } })).formaPagamentoId).toBe(lo.formaPagamentoId);
  });
});

describe("documento citado na descrição da conta", () => {
  it("reconhece venda, OS e compra", () => {
    expect(gc.documentoDaConta("Venda de nº 8558")).toEqual({ tipo: "VENDA", numero: 8558 });
    expect(gc.documentoDaConta("Ordem de serviço de nº 6946")).toEqual({ tipo: "OS", numero: 6946 });
    expect(gc.documentoDaConta("Compra de nº 947 (JABU ELETRICA)")).toEqual({ tipo: "COMPRA", numero: 947 });
    expect(gc.documentoDaConta("Venda de serviços nº 7279 - assinatura nº 14")).toEqual({ tipo: "VENDA", numero: 7279 });
    expect(gc.documentoDaConta("Venda de serviços nº 13 - assinatura nº 14 (1 parcela)")).toEqual({ tipo: "VENDA", numero: 13 });
    expect(gc.documentoDaConta("Nota fiscal de serviço nº 499")).toBeNull();
    // venda renumerada na migração: a conta cita o número do MXERP (o do boleto) e guarda o do Gestão Click
    expect(descricaoComNumero("Venda de serviços nº 7285 - assinatura nº 40", 9203)).toBe("Venda de serviços nº 9203 - assinatura nº 40 (nº 7285 no Gestão Click)");
    expect(descricaoComNumero("Venda de nº 6746", 8729)).toBe("Venda de nº 8729 (nº 6746 no Gestão Click)");
    expect(descricaoComNumero("Venda de nº 6746", 6746)).toBe("Venda de nº 6746");
    expect(gc.documentoDaConta("Aluguel")).toBeNull();
    expect(gc.formaPara("MERCADO LIVRE - MXTECH")).toBe("Mercado Livre");
    expect(gc.formaPara("Dinheiro Parcelado")).toBe("Crediário / a prazo");
    expect(gc.formaPara("")).toBeNull();
  });
});
