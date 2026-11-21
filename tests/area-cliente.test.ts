import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const s = await import("@/lib/portal/sessao");
const d = await import("@/lib/portal/dados");

let ana: string, beto: string, prod: string, cat: string;

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "SessaoCliente","Boleto","Lancamento","NotaFiscal","VendaItem","Venda","OrdemServico","Orcamento","Produto","Pessoa","Sequencia" CASCADE`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Anexo" WHERE entidade = 'OS_FOTO'`);
  ana = (await prisma.pessoa.create({ data: { nome: "Ana Lima", documento: "52998224725", email: "ana@cliente.test", tipoPessoa: "FISICA" } })).id;
  beto = (await prisma.pessoa.create({ data: { nome: "Beto Peças LTDA", documento: "11222333000181", email: "beto@cliente.test" } })).id;
  prod = (await prisma.produto.create({ data: { codigo: "CAM", nome: "Câmera IP", precoVenda: 300, custo: 150 } })).id;
  cat = (await prisma.categoriaFinanceira.findFirst({ where: { tipo: "RECEBER" } }))?.id
    ?? (await prisma.categoriaFinanceira.create({ data: { nome: "Vendas", tipo: "RECEBER", grupoDre: "RECEITA_BRUTA" } })).id;
});

describe("acesso à Área do Cliente", () => {
  it("convite → cliente cria a senha → entra com CPF (com ou sem máscara) ou e-mail", async () => {
    expect(await s.autenticarCliente("529.982.247-25", "qualquer-coisa", "1.1.1.1")).toBeNull(); // ainda sem acesso

    const token = await s.gerarConvite(ana);
    const conv = await s.clienteDoConvite(token);
    expect(conv).toMatchObject({ id: ana, temSenha: false });
    expect((await prisma.pessoa.findUniqueOrThrow({ where: { id: ana } })).portalConviteHash).not.toBe(token); // só o hash no banco

    await expect(s.definirSenhaPorConvite(token, "curta")).rejects.toThrow(/8 caracteres/);
    await s.definirSenhaPorConvite(token, "senha-da-ana");
    expect(await s.clienteDoConvite(token)).toBeNull(); // o link vale uma vez só
    await expect(s.definirSenhaPorConvite(token, "outra-senha-1")).rejects.toThrow(/expirou ou já foi usado/);

    expect((await s.autenticarCliente("529.982.247-25", "senha-da-ana", "2.2.2.2"))?.id).toBe(ana);
    expect((await s.autenticarCliente("52998224725", "senha-da-ana", "2.2.2.2"))?.id).toBe(ana);
    expect((await s.autenticarCliente("ANA@cliente.test", "senha-da-ana", "2.2.2.2"))?.id).toBe(ana);
    expect(await s.autenticarCliente("52998224725", "senha-errada", "2.2.2.2")).toBeNull();
  });

  it("link vencido não vale; link novo invalida o anterior", async () => {
    const t1 = await s.gerarConvite(ana);
    const t2 = await s.gerarConvite(ana);
    expect(await s.clienteDoConvite(t1)).toBeNull();
    expect(await s.clienteDoConvite(t2)).not.toBeNull();
    await prisma.pessoa.update({ where: { id: ana }, data: { portalConviteExpira: new Date(Date.now() - 1000) } });
    expect(await s.clienteDoConvite(t2)).toBeNull();
  });

  it("5 senhas erradas bloqueiam por 15 minutos", async () => {
    await s.definirSenhaPorConvite(await s.gerarConvite(beto), "senha-do-beto");
    for (let i = 0; i < 5; i++) expect(await s.autenticarCliente("11.222.333/0001-81", "errada", "9.9.9.9")).toBeNull();
    await expect(s.autenticarCliente("11222333000181", "senha-do-beto", "9.9.9.9")).rejects.toThrow(/Muitas tentativas/);
  });

  it("sessão própria: desabilitar no cadastro derruba o cliente na hora; trocar senha pelo link derruba as sessões", async () => {
    await s.definirSenhaPorConvite(await s.gerarConvite(ana), "senha-da-ana");
    const t = await s.criarSessaoCliente(ana);
    expect((await s.clienteDoToken(t))?.id).toBe(ana);
    expect((await prisma.pessoa.findUniqueOrThrow({ where: { id: ana } })).portalUltimoAcesso).not.toBeNull();

    await s.definirSenhaPorConvite(await s.gerarConvite(ana), "nova-senha-ana");
    expect(await s.clienteDoToken(t)).toBeNull();

    const t2 = await s.criarSessaoCliente(ana);
    await s.desabilitarPortal(ana);
    expect(await s.clienteDoToken(t2)).toBeNull();
    expect(await s.autenticarCliente("52998224725", "nova-senha-ana", "3.3.3.3")).toBeNull();
    expect((await prisma.pessoa.findUniqueOrThrow({ where: { id: ana } })).portalSenhaHash).toBeNull();
  });

  it("e-mail repetido em dois cadastros exige o CPF/CNPJ", async () => {
    await prisma.pessoa.update({ where: { id: beto }, data: { email: "ana@cliente.test" } });
    await s.definirSenhaPorConvite(await s.gerarConvite(ana), "senha-da-ana");
    await s.gerarConvite(beto);
    await expect(s.autenticarCliente("ana@cliente.test", "senha-da-ana", "4.4.4.4")).rejects.toThrow(/CPF ou CNPJ/);
    expect(await s.pedirTrocaSenha("ana@cliente.test")).toBeNull();
    expect((await s.pedirTrocaSenha("529.982.247-25"))?.email).toBe("ana@cliente.test");
  });
});

describe("cada cliente só vê o que é dele", () => {
  async function cenario() {
    const osAna = await prisma.ordemServico.create({
      data: {
        numero: 101, clienteId: ana, situacao: "EM_ANDAMENTO", total: 300, totalProdutos: 300, observacaoInterna: "cliente chato",
        equipamentos: { create: [{ equipamento: "DVR", marca: "Intelbras", defeitos: "Não grava" }] },
        produtos: { create: [{ produtoId: prod, quantidade: 1, valorUnit: 300, subtotal: 300 }] },
        historico: { create: [{ descricao: "Situação: Em andamento", situacao: "Em andamento" }, { descricao: "Comentário interno" }] },
      },
    });
    const osBeto = await prisma.ordemServico.create({ data: { numero: 102, clienteId: beto, total: 50 } });
    const vAna = await prisma.venda.create({ data: { numero: 201, clienteId: ana, situacao: "CONCLUIDA", total: 600, itens: { create: [{ produtoId: prod, quantidade: 2, valorUnit: 300, subtotal: 600 }] } } });
    await prisma.venda.create({ data: { numero: 202, clienteId: ana, situacao: "ORCAMENTO", total: 10 } }); // orçamento não aparece em compras
    const vBeto = await prisma.venda.create({ data: { numero: 203, clienteId: beto, situacao: "CONCLUIDA", total: 99 } });
    const nfAna = await prisma.notaFiscal.create({ data: { modelo: "NFE", serie: 1, numero: 10, ambiente: "PRODUCAO", status: "AUTORIZADA", origemTipo: "VENDA", origemId: vAna.id, valorTotal: 600, xml: "<nfeProc/>", chave: "3".repeat(44) } });
    const nfRej = await prisma.notaFiscal.create({ data: { modelo: "NFE", serie: 1, numero: 11, ambiente: "PRODUCAO", status: "REJEITADA", origemTipo: "VENDA", origemId: vAna.id, valorTotal: 600, xml: "<NFe/>" } });
    const nfBeto = await prisma.notaFiscal.create({ data: { modelo: "NFSE", serie: 1, numero: 12, ambiente: "PRODUCAO", status: "AUTORIZADA", origemTipo: "OS", origemId: osBeto.id, valorTotal: 50, xml: "<x/>", chave: "4".repeat(50) } });
    const venc = new Date(Date.UTC(2020, 0, 10));
    const lAna = await prisma.lancamento.create({ data: { tipo: "RECEBER", descricao: "Venda 201", pessoaId: ana, categoriaId: cat, valor: 600, vencimento: venc, competencia: venc, origemTipo: "VENDA", origemId: vAna.id } });
    await prisma.boleto.create({ data: { lancamentoId: lAna.id, token: "tok-boleto-ana-1234567890", seuNumero: "201", situacao: "A_RECEBER", valor: 600, vencimento: venc, pixCopiaECola: "000201PIX", linhaDigitavel: "0339..." } });
    await prisma.lancamento.create({ data: { tipo: "RECEBER", descricao: "Venda 203", pessoaId: beto, categoriaId: cat, valor: 99, vencimento: venc, competencia: venc } });
    await prisma.lancamento.create({ data: { tipo: "PAGAR", descricao: "Compra da Ana (fornecedora)", pessoaId: ana, categoriaId: cat, valor: 5, vencimento: venc, competencia: venc } });
    const foto = await prisma.anexo.create({ data: { entidade: "OS_FOTO", entidadeId: osAna.id, nome: "dvr.jpg", tipo: "image/jpeg", tamanho: 3, dados: Buffer.from([1, 2, 3]) } });
    const svg = await prisma.anexo.create({ data: { entidade: "OS_FOTO", entidadeId: osAna.id, nome: "x.svg", tipo: "image/svg+xml", tamanho: 3, dados: Buffer.from("<svg/>") } });
    const interno = await prisma.anexo.create({ data: { entidade: "OS", entidadeId: osAna.id, nome: "contrato.pdf", tipo: "application/pdf", tamanho: 3, dados: Buffer.from([1]) } });
    return { osAna, osBeto, vAna, vBeto, nfAna, nfRej, nfBeto, foto, svg, interno };
  }

  it("OS, compras, notas, parcelas e fotos do próprio cliente", async () => {
    const c = await cenario();
    expect((await d.listarOs(ana)).map((o) => o.numero)).toEqual([101]);
    expect((await d.listarVendas(ana)).map((v) => v.numero)).toEqual([201]);
    expect((await d.notasDe(ana)).map((n) => n.numero)).toEqual([10]); // só autorizadas/canceladas
    const contas = await d.contasDe(ana);
    expect(contas.map((x) => x.descricao)).toEqual(["Venda 201"]); // nada a pagar da empresa para o cliente
    expect(contas[0]).toMatchObject({ vencida: true, boleto: { link: "/cobranca/boleto/tok-boleto-ana-1234567890", pix: "000201PIX" } });

    const os = await d.verOs(ana, c.osAna.id);
    expect(os?.fotos.map((f) => f.nome)).toEqual(["dvr.jpg"]); // nem SVG nem anexo interno
    expect(os?.linhaDoTempo.map((h) => h.situacao)).toEqual(["Em andamento"]);
    expect(JSON.stringify(os)).not.toContain("cliente chato");
    expect(await d.fotoDaOs(ana, c.foto.id)).not.toBeNull();
    expect(await d.fotoDaOs(ana, c.svg.id)).toBeNull();
    expect(await d.fotoDaOs(ana, c.interno.id)).toBeNull();
    expect((await d.verVenda(ana, c.vAna.id))?.notas.map((n) => n.numero)).toEqual([10]);
  });

  it("documento de outro cliente não abre (mesmo sabendo o id)", async () => {
    const c = await cenario();
    expect(await d.verOs(ana, c.osBeto.id)).toBeNull();
    expect(await d.verVenda(ana, c.vBeto.id)).toBeNull();
    expect(await d.notaDoCliente(ana, c.nfBeto.id)).toBeNull();
    expect(await d.notaDoCliente(ana, c.nfRej.id)).toBeNull();
    expect((await d.notaDoCliente(ana, c.nfAna.id))?.id).toBe(c.nfAna.id);
    expect(await d.fotoDaOs(beto, c.foto.id)).toBeNull();
    expect((await d.notasDe(beto)).map((n) => n.danfse)).toEqual([`https://adn.nfse.gov.br/danfse/${"4".repeat(50)}`]);
  });

  it("OS que esconde o total não mostra valores ao cliente", async () => {
    const o = await prisma.ordemServico.create({ data: { numero: 300, clienteId: ana, total: 999, exibirTotal: false, produtos: { create: [{ produtoId: prod, quantidade: 1, valorUnit: 999, subtotal: 999 }] } } });
    const v = await d.verOs(ana, o.id);
    expect(v?.totais).toBeNull();
    expect(v?.produtos[0]).toMatchObject({ valorUnit: null, subtotal: null });
    expect((await d.listarOs(ana))[0].total).toBeNull();
  });
});
