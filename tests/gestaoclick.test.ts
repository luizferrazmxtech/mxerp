import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import ExcelJS from "exceljs";
import JSZip from "jszip";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const est = await import("@/lib/estoque/estoque");
const gc = await import("@/lib/migracao/gestaoclick");

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
    const o1 = await prisma.ordemServico.findUniqueOrThrow({ where: { numero: 7001 }, include: { cliente: true, servicos: true, equipamentos: true } });
    expect(o1).toMatchObject({ situacao: "ABERTA" });
    expect(o1.equipamentos[0]).toMatchObject({ equipamento: "NOBREAK", marca: "SMS" });
    expect(o1.cliente.nome).toBe("LAZARO");
    expect(Number(o1.total)).toBeCloseTo(369.8);
    expect((await prisma.ordemServico.findUniqueOrThrow({ where: { numero: 7002 } })).situacao).toBe("EM_ANDAMENTO");
    const o3 = await prisma.ordemServico.findUniqueOrThrow({ where: { numero: 7003 } });
    expect(o3).toMatchObject({ situacao: "FATURADA", situacaoId: "so_concretizada" });
    expect(o3.saida?.toISOString()).toBe("2026-11-04T12:00:00.000Z");
    expect(await prisma.osHistorico.count({ where: { osId: o3.id } })).toBe(3);
    const o4 = await prisma.ordemServico.findUniqueOrThrow({ where: { numero: 7004 }, include: { cliente: true } });
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

    expect(await prisma.contaBancaria.findUnique({ where: { nome: "INTER" } })).not.toBeNull();

    // compras: a confirmada entra recebida e com as contas "já lançadas lá"; fornecedor achado pelo CNPJ da chave da NF-e
    const c990 = await prisma.compra.findUniqueOrThrow({ where: { numero: 990 }, include: { parcelas: true, historico: true, itens: true } });
    expect(c990).toMatchObject({ fornecedorId: folk.id, situacaoId: "sc_confirmada", recebida: true, financeiroNoLegado: true, numeroNfe: "123", chaveNfe: "35261011222333000181550010000001231000000010" });
    expect(Number(c990.total)).toBeCloseTo(170);
    expect(c990.parcelas).toHaveLength(2);
    expect(c990.historico).toHaveLength(3);
    const c991 = await prisma.compra.findUniqueOrThrow({ where: { numero: 991 }, include: { fornecedor: true } });
    expect(c991).toMatchObject({ situacaoId: "sc_aberto", recebida: false, financeiroNoLegado: false });
    expect(c991.fornecedor).toMatchObject({ nome: "NOVO FORNECEDOR LTDA", documento: "99888777000166", fornecedor: true });
    expect(await prisma.movimentoEstoque.count({ where: { origemTipo: { in: ["COMPRA", "AJUSTE"] } } })).toBe(0);
    expect((await prisma.sequencia.findUniqueOrThrow({ where: { chave: "COMPRA" } })).valor).toBe(991);
    const aj = await prisma.ajusteEstoque.findUniqueOrThrow({ where: { numero: 1 }, include: { itens: true } });
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
    const o1 = await prisma.ordemServico.findUniqueOrThrow({ where: { numero: 7001 } });
    expect(await prisma.reserva.count({ where: { origemId: o1.id, status: "ATIVA" } })).toBe(1);
    // a 7002 foi mexida no MXERP depois da importação: o MXERP manda
    const o2 = await prisma.ordemServico.findUniqueOrThrow({ where: { numero: 7002 } });
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
    const o1b = await prisma.ordemServico.findUniqueOrThrow({ where: { numero: 7001 }, include: { historico: true } });
    expect(o1b).toMatchObject({ situacao: "FATURADA", situacaoId: "so_concretizada" });
    expect(o1b.saida?.toISOString()).toBe("2027-01-01T13:00:00.000Z");
    expect(o1b.historico.some((h) => h.situacao === "Concretizada")).toBe(true);
    // a peça sai da reserva sem baixa (o saldo do backup já desconta), e a falta da 7002 continua dela
    expect(await prisma.reserva.count({ where: { origemId: o1.id, status: "ATIVA" } })).toBe(0);
    expect(await prisma.movimentoEstoque.count({ where: { origemTipo: "OS" } })).toBe(0);
    expect((await prisma.$transaction((tx) => est.resumoProduto(tx, bat.id))).fisico).toBe(3);
    expect((await prisma.ordemServico.findUniqueOrThrow({ where: { numero: 7002 } })).situacao).toBe("EM_ANDAMENTO");

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
    const inter = await prisma.contaBancaria.upsert({ where: { nome: "INTER" }, create: { nome: "INTER" }, update: {} });
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
    expect(notas[2]).toMatchObject({ empresaId: emp.id, destinatarioNome: "FOLK COMERCIO LTDA", chave: "35251112965283000195550010000069011208477675" });
    expect((await prisma.sequencia.findUniqueOrThrow({ where: { chave: "NF-12965283000195-55-1-P" } })).valor).toBe(6901);
    expect((await prisma.sequencia.findUniqueOrThrow({ where: { chave: "DPS-12965283000195-900-P" } })).valor).toBe(109);

    // de novo: nada duplica
    const res2 = await gc.importarBackupGestaoClick(t, { simular: false, etapas: { receber: true, pagas: true, notas: true } });
    expect(res2.find((r) => r.tipo === "notas")!.criados).toBe(0);
    expect(await prisma.lancamento.count({ where: { descricao: "Venda de nº 7000" } })).toBe(1);
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
