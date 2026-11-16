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
  await prisma.$executeRawUnsafe(`TRUNCATE "Lancamento","OsHistorico","OsItemServico","OsItemProduto","OrdemServico","Reserva","MovimentoEstoque","Saldo","Produto","GrupoProduto","Local","Deposito","Pessoa","Servico","Sequencia","FormaPagamento","CategoriaFinanceira","ContaBancaria" CASCADE`);
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
  z.file("vendas/vendas_1.xlsx", await planilha([["Nº do pedido", "Cliente"], ["8694", "Consumidor"]]));
  return Buffer.from(await z.generateAsync({ type: "nodebuffer" }));
}

describe("backup do Gestão Click", () => {
  it("lê o zip juntando as partes", async () => {
    const t = await gc.lerBackupGestaoClick(await backup());
    expect(t.produtos).toHaveLength(3);
    expect(t.ordens_servicos_situacoes).toHaveLength(6);
  });

  it("simulação não grava", async () => {
    const res = await gc.importarBackupGestaoClick(await gc.lerBackupGestaoClick(await backup()), { simular: true });
    expect(res.find((r) => r.tipo === "os")!.criados).toBe(3);
    expect(await prisma.produto.count()).toBe(0);
    expect(await prisma.ordemServico.count()).toBe(0);
  });

  it("importa cadastros, estoque, OS abertas com reserva e contas em aberto, sem duplicar ao repetir", async () => {
    const t = await gc.lerBackupGestaoClick(await backup());
    const res = await gc.importarBackupGestaoClick(t, { simular: false });
    const por = (tipo: string) => res.find((r) => r.tipo === tipo)!;

    // pessoas: PJ usa razão social e guarda o nome como fantasia; endereço comercial preferido ao de entrega; mesma empresa vira fornecedor
    const folk = await prisma.pessoa.findUniqueOrThrow({ where: { documento: "11222333000181" } });
    expect(folk).toMatchObject({ nome: "FOLK COMERCIO LTDA", fantasia: "FOLK STORE", logradouro: "Rua Nestor de Campos", cliente: true, fornecedor: true, tipoPessoa: "JURIDICA" });

    const bat = await prisma.produto.findUniqueOrThrow({ where: { codigo: "BAT7" } });
    expect(Number(bat.precoVenda)).toBeCloseTo(144.9);
    expect(bat.ncm).toBe("85072010");
    expect((await prisma.produto.findUniqueOrThrow({ where: { codigo: "FONTE" } })).ativo).toBe(false);
    expect((await prisma.produto.findUniqueOrThrow({ where: { codigo: "CABO" } })).unidade).toBe("MT");

    // OS: 7001 aberta, 7002 em andamento, 7003 concretizada (fica de fora), 7004 concluída-faturar (cliente criado)
    expect(por("os").criados).toBe(3);
    const o1 = await prisma.ordemServico.findUniqueOrThrow({ where: { numero: 7001 }, include: { cliente: true, servicos: true, equipamentos: true } });
    expect(o1).toMatchObject({ situacao: "ABERTA" });
    expect(o1.equipamentos[0]).toMatchObject({ equipamento: "NOBREAK", marca: "SMS" });
    expect(o1.cliente.nome).toBe("LAZARO");
    expect(Number(o1.total)).toBeCloseTo(369.8);
    expect((await prisma.ordemServico.findUniqueOrThrow({ where: { numero: 7002 } })).situacao).toBe("EM_ANDAMENTO");
    expect(await prisma.ordemServico.findUnique({ where: { numero: 7003 } })).toBeNull();
    const o4 = await prisma.ordemServico.findUniqueOrThrow({ where: { numero: 7004 }, include: { cliente: true } });
    expect(o4.situacao).toBe("CONCLUIDA");
    expect(o4.cliente.nome).toBe("CLIENTE AVULSO");
    expect(por("os").avisos.join(" ")).toMatch(/PRODUTO APAGADO/);

    // OS "CONCLUIDA - FATURAR" já baixou as peças no Gestão Click: o saldo continua o do backup (0), sem baixar de novo
    const cabo = await prisma.produto.findUniqueOrThrow({ where: { codigo: "CABO" } });
    expect((await prisma.$transaction((tx) => est.resumoProduto(tx, cabo.id))).fisico).toBe(0);
    expect(await prisma.movimentoEstoque.count({ where: { produtoId: cabo.id, origemTipo: "OS", tipo: "SAIDA" } })).toBe(1);

    // estoque 3: 2 reservadas na 7001, 1 na 7002 e 1 em falta
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

    // repetir não duplica nada nem mexe no estoque já movimentado
    const res2 = await gc.importarBackupGestaoClick(t, { simular: false });
    expect(res2.find((x) => x.tipo === "os")!.criados).toBe(0);
    expect(await prisma.ordemServico.count()).toBe(3);
    expect(await prisma.lancamento.count()).toBe(2);
    expect(await prisma.pessoa.count()).toBe(3);
    expect((await prisma.$transaction((tx) => est.resumoProduto(tx, bat.id))).fisico).toBe(3);
  });
});
