import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const { naLoja, limparCacheLojas } = await import("@/lib/empresa/loja");
const { espelharEstrutura } = await import("@/lib/empresa/estrutura");
const est = await import("@/lib/estoque/estoque");
const ord = await import("@/lib/os/ordens");
const { gerarParcelas } = await import("@/lib/orcamentos/orcamentos");
const { equipamentoVazio } = await import("@/lib/os/tipos");
const { divisaoOs, servicosPorParcela } = await import("@/lib/os/faturamento");
const { itensVendidos } = await import("@/lib/relatorios/relatorios");
type Dados = import("@/lib/os/tipos").DadosOs;

let prod = "", serv = "", cli = "", mx = "", vfx = "";
let u = { id: "", nome: "Caue", papel: "OPERADOR" as const };

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

async function limpar() {
  await prisma.$executeRawUnsafe(`TRUNCATE "Empresa","Orcamento","Anotacao","Lancamento","NotaFiscal","OrdemServico","Reserva","MovimentoEstoque","Saldo","Produto","Servico","Local","Deposito","Pessoa","Sequencia" CASCADE`);
  for (const t of ["CategoriaFinanceira", "FormaPagamento", "ContaBancaria", "CentroCusto", "SituacaoOsConfig", "SituacaoVendaConfig", "SituacaoCompraConfig", "SituacaoOrcamento", "CanalVenda", "ModeloMensagem", "CampoExtra"])
    await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "empresaId" <> ''`);
  await prisma.$executeRawUnsafe(`DELETE FROM "FormaPagamento" WHERE nome LIKE 'T-%'`);
  limparCacheLojas();
}
afterAll(limpar);

beforeEach(async () => {
  await limpar();
  await prisma.situacaoOsConfig.updateMany({ data: { bloqueados: [] } });
  mx = (await prisma.empresa.create({ data: { razaoSocial: "MXTECH LTDA", nomeFantasia: "MXTECH", cnpj: "12965283000195", createdAt: new Date("2026-01-01") } })).id;
  vfx = (await prisma.empresa.create({ data: { razaoSocial: "VFX INFO SERVICE LTDA", nomeFantasia: "VFX", cnpj: "36130603000155" } })).id;
  limparCacheLojas();
  await prisma.formaPagamento.create({ data: { nome: "T-Boleto", tPag: "15" } });
  await espelharEstrutura(vfx);
  const dep = await prisma.deposito.create({ data: { nome: "Loja", empresaId: mx } });
  const loc = (await prisma.local.create({ data: { depositoId: dep.id, codigo: "A-01" } })).id;
  prod = (await prisma.produto.create({ data: { codigo: "FON", nome: "Fonte ATX", precoVenda: 200, custo: 120, localPadraoId: loc } })).id;
  serv = (await prisma.servico.create({ data: { codigo: "MO", nome: "Mão de obra", preco: 150 } })).id;
  cli = (await prisma.pessoa.create({ data: { nome: "Escritório Central", cliente: true } })).id;
  const usuario = await prisma.usuario.upsert({ where: { email: "os-vfx@local.test" }, update: {}, create: { nome: "Caue", email: "os-vfx@local.test", papel: "OPERADOR" } });
  u = { id: usuario.id, nome: usuario.nome, papel: "OPERADOR" };
  await prisma.$transaction((tx) => est.entrada(tx, { produtoId: prod, localId: loc, quantidade: 5, origemTipo: "IMPLANTACAO" }));
});

const forma = (empresaId: string) => prisma.formaPagamento.findFirstOrThrow({ where: { nome: "T-Boleto", empresaId: empresaId === mx ? "" : empresaId } });

const dados = (m: Partial<Dados> = {}): Dados => ({
  tipo: "SERVICO", numero: "", clienteId: cli, clienteNome: "", data: "2026-11-24", validade: "", vendedorId: "", prazoEntrega: "", aosCuidados: "",
  canal: "Presencial", centroCusto: "Assistência", introducao: "", situacaoId: "so_aberto",
  produtos: [{ produtoId: prod, nome: "Fonte", codigo: "FON", unidade: "UN", detalhes: "", quantidade: "1", tipoValorId: "", valorUnit: "200,00", desconto: "0", descontoPct: false }],
  servicos: [{ servicoId: serv, nome: "Mão de obra", codigo: "MO", detalhes: "", quantidade: "1", valorUnit: "150,00", desconto: "0", descontoPct: false }],
  transportadoraId: "", transportadoraNome: "", frete: "10", mostrarEntrega: false, enderecoEntregaId: "",
  desconto: "35", descontoPct: false, exibirTotal: true,
  gerarCondicoes: true, condicao: "PARCELADO", formaPagamentoId: "", vencimento: "", intervaloDias: "30", numParcelas: "2", primeiraParcela: "2026-12-01",
  parcelas: gerarParcelas(325, 2, "2026-12-01", 30, ""),
  observacoes: "", observacaoInterna: "", camposExtras: {},
  entrada: "2026-11-24T09:30", saida: "", prioridade: "", tecnicoIds: [], outros: "0",
  equipamentos: [{ ...equipamentoVazio(), equipamento: "Computador" }],
  ...m,
});

describe("serviços da OS faturados por outra empresa", () => {
  it("divide o desconto na proporção e as parcelas fecham os centavos", () => {
    // 200 de peças + 150 de serviços − 35 de desconto (20 nas peças, 15 nos serviços) + 10 de frete = 325
    expect(divisaoOs({ totalProdutos: 200, totalServicos: 150, desconto: 35, total: 325 })).toEqual({ servicos: 135, pecas: 190, total: 325 });
    expect(servicosPorParcela([{ valor: 100 }, { valor: 100 }, { valor: 100 }], 100, 300)).toEqual([33.33, 33.33, 33.34]);
  });

  it("peças na MXTECH e serviços na VFX, cada uma com a sua estrutura; troca de volta junta tudo", async () => {
    const formaMx = await forma(mx), formaVfx = await forma(vfx);
    const o = await naLoja(mx, () => ord.salvarOrdem(dados({ empresaServicosId: vfx, parcelas: gerarParcelas(325, 2, "2026-12-01", 30, formaMx.id) }), u));
    expect(o.empresaId).toBe(mx);
    expect(o.empresaServicosId).toBe(vfx);
    await naLoja(mx, () => ord.alterarSituacaoOrdem(o.id, "so_concretizada", u));

    const contas = await prisma.lancamento.findMany({ where: { origemTipo: "OS", origemId: o.id, tipo: "RECEBER" }, include: { categoria: true, centroCusto: true }, orderBy: [{ empresaId: "asc" }, { parcela: "asc" }] });
    const daVfx = contas.filter((c) => c.empresaId === vfx), daMx = contas.filter((c) => c.empresaId === mx);
    expect(daMx.map((c) => Number(c.valor))).toEqual([95, 95]);
    expect(daVfx.map((c) => Number(c.valor))).toEqual([67.5, 67.5]);
    expect(daVfx.every((c) => c.categoria.nome === "Prestação de serviços" && c.categoria.empresaId === vfx)).toBe(true);
    expect(daVfx.every((c) => c.formaPagamentoId === formaVfx.id && c.centroCusto?.empresaId === vfx)).toBe(true);
    expect(daMx.every((c) => c.categoria.nome === "Venda de produtos" && c.formaPagamentoId === formaMx.id)).toBe(true);
    expect(daVfx[0].descricao).toBe("Serviços da OS nº " + o.numero + " (1/2)");

    // a VFX não lista a OS da MXTECH, só a conta a receber dos serviços
    await naLoja(vfx, async () => {
      expect(await prisma.ordemServico.count()).toBe(0);
      expect((await prisma.lancamento.findMany({ where: { tipo: "RECEBER" } })).map((l) => l.id).sort()).toEqual(daVfx.map((l) => l.id).sort());
    });
    await naLoja(mx, async () => expect(await prisma.lancamento.count({ where: { tipo: "RECEBER" } })).toBe(2));

    // impressão: as parcelas das duas empresas, com situação, e a nota autorizada com quem emitiu
    await prisma.notaFiscal.create({ data: { empresaId: mx, modelo: "NFE", serie: 1, numero: 6906, ambiente: "HOMOLOGACAO", origemTipo: "OS", origemId: o.id, valorTotal: 190, status: "AUTORIZADA", chave: "3".repeat(44) } });
    (globalThis as { React?: unknown }).React = await import("react"); // o vitest compila o JSX no modo clássico
    const { renderToStaticMarkup } = await import("react-dom/server");
    const DocumentoOs = (await import("@/components/os/DocumentoOs")).default;
    const html = renderToStaticMarkup(await DocumentoOs({ token: o.token }));
    expect(html).toContain("Serviços · VFX INFO SERVICE LTDA");
    expect(html).toContain("Em aberto");
    expect(html).toContain("NF-e nº 6906");
    expect(html).toContain("MXTECH LTDA (CNPJ 12.965.283/0001-95)");
    await prisma.notaFiscal.deleteMany({});

    // relatório de lucro: peças na MXTECH, serviços na VFX
    const p = { de: new Date("2026-11-01T00:00:00Z"), ate: new Date("2026-11-30T00:00:00Z") };
    const tipos = async (loja: string) => (await naLoja(loja, () => itensVendidos(p))).map((i) => i.tipo);
    expect(await tipos(mx)).toEqual(["PRODUTO"]);
    expect(await tipos(vfx)).toEqual(["SERVICO"]);

    // não pode trocar a empresa com a NFS-e já emitida pela VFX
    await prisma.notaFiscal.create({ data: { empresaId: vfx, modelo: "NFSE", serie: 1, numero: 1, ambiente: "HOMOLOGACAO", origemTipo: "OS", origemId: o.id, valorTotal: 135, status: "AUTORIZADA" } });
    await prisma.situacaoOsConfig.update({ where: { id: "so_concretizada" }, data: { permiteEdicao: true } });
    await expect(naLoja(mx, () => ord.salvarOrdem(dados({ situacaoId: "so_concretizada", empresaServicosId: "", parcelas: gerarParcelas(325, 2, "2026-12-01", 30, formaMx.id) }), u, o.id))).rejects.toThrow(/NFS-e/);
    await prisma.notaFiscal.deleteMany({});

    // volta tudo para a MXTECH: as contas da VFX somem e a MXTECH fica com o total
    await naLoja(mx, () => ord.salvarOrdem(dados({ situacaoId: "so_concretizada", empresaServicosId: "", parcelas: gerarParcelas(325, 2, "2026-12-01", 30, formaMx.id) }), u, o.id));
    const depois = await prisma.lancamento.findMany({ where: { origemTipo: "OS", origemId: o.id, tipo: "RECEBER" } });
    expect(depois.map((l) => [l.empresaId, Number(l.valor)])).toEqual([[mx, 162.5], [mx, 162.5]]);

    // cancelar a OS apaga as contas das duas empresas
    await naLoja(mx, () => ord.salvarOrdem(dados({ situacaoId: "so_concretizada", empresaServicosId: vfx, parcelas: gerarParcelas(325, 2, "2026-12-01", 30, formaMx.id) }), u, o.id));
    expect(await prisma.lancamento.count({ where: { origemTipo: "OS", origemId: o.id, empresaId: vfx } })).toBe(2);
    await naLoja(mx, () => ord.alterarSituacaoOrdem(o.id, "so_cancelada", u));
    expect(await prisma.lancamento.count({ where: { origemTipo: "OS", origemId: o.id } })).toBe(0);
  });

  it("escolher a própria empresa da OS não divide nada", async () => {
    const o = await naLoja(mx, () => ord.salvarOrdem(dados({ empresaServicosId: mx, condicao: "AVISTA", parcelas: [] }), u));
    expect(o.empresaServicosId).toBeNull();
  });
});
