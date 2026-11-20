import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { pfxDeTeste } from "./helpers/certificado-teste";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;
process.env.CHAVE_SEGREDOS ??= "chave-de-teste-com-mais-de-16";

const { prisma } = await import("@/lib/db");
const loja = await import("@/lib/empresa/loja");
const empresas = await import("@/lib/empresa/empresas");
const est = await import("@/lib/estoque/estoque");
const vendas = await import("@/lib/vendas/vendas");
const { garantirPadroes } = await import("@/lib/financeiro/padroes");
const { certificadoDaEmpresa, lerCertificado } = await import("@/lib/fiscal/certificado");
const { cifrar } = await import("@/lib/seguranca/segredos");
const fiscal = await import("@/lib/fiscal/emissao");
type Transporte = import("@/lib/fiscal/sefaz").Transporte;

const autoriza: Transporte = async (_u, _acao, corpo) => {
  const chave = corpo.match(/Id="NFe(\d{44})"/)![1];
  return `<E><retEnviNFe versao="4.00"><cStat>104</cStat><xMotivo>Lote processado</xMotivo><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>T</verAplic><chNFe>${chave}</chNFe><dhRecbto>2027-01-04T10:00:01-03:00</dhRecbto><nProt>1</nProt><digVal>a=</digVal><cStat>100</cStat><xMotivo>Autorizado</xMotivo></infProt></protNFe></retEnviNFe></E>`;
};

const dados = (cnpj: string, nome: string) => ({
  razaoSocial: `${nome} LTDA`, nomeFantasia: nome, cnpj, inscricaoEstadual: "111111111111", logradouro: "Rua A", numero: "1",
  bairro: "Centro", cidade: "São Carlos", codigoMunicipio: "3548906", uf: "SP", cep: "13560000", cscId: "000001", cscToken: "CSCTESTE",
});

let a: string, b: string, prod: string, dinheiro: string;

beforeAll(() => execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" }));

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "NotaEvento","NotaFiscal","Empresa","Lancamento","VendaPagamento","VendaItem","Venda","Reserva","MovimentoEstoque","Saldo","Produto","Local","Deposito","Sequencia","FormaPagamento","CategoriaFinanceira","ContaBancaria" CASCADE`);
  loja.limparCacheLojas();
  await prisma.$transaction((tx) => garantirPadroes(tx));
  dinheiro = (await prisma.formaPagamento.findUniqueOrThrow({ where: { nome: "Dinheiro" } })).id;
  prod = (await prisma.produto.create({ data: { codigo: "CB", nome: "Cabo", precoVenda: 10, ncm: "85444200", controlaEstoque: false } })).id;
});

async function duasLojas() {
  a = (await prisma.empresa.create({ data: dados("12345678000195", "LOJA A") })).id;
  b = (await prisma.empresa.create({ data: dados("98765432000110", "LOJA B") })).id;
  loja.limparCacheLojas();
}

describe("separação por loja", () => {
  it("grava a loja nos registros novos e filtra as listagens; consulta por id não é filtrada", async () => {
    await duasLojas();
    const va = await loja.naLoja(a, () => vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1 }], pagamentos: [{ formaPagamentoId: dinheiro, valor: 10 }] }));
    const vb = await loja.naLoja(b, () => vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 2 }], pagamentos: [{ formaPagamentoId: dinheiro, valor: 20 }] }));
    expect((await prisma.venda.findUniqueOrThrow({ where: { id: va.id } })).empresaId).toBe(a);
    expect((await prisma.venda.findUniqueOrThrow({ where: { id: vb.id } })).empresaId).toBe(b);
    // o financeiro da venda vai para a mesma loja
    expect((await prisma.lancamento.findMany({ where: { origemId: vb.id } })).every((l) => l.empresaId === b)).toBe(true);

    expect((await loja.naLoja(a, () => prisma.venda.findMany())).map((v) => v.id)).toEqual([va.id]);
    expect(await loja.naLoja(b, () => prisma.venda.count())).toBe(1);
    expect(await loja.naLoja(a, () => prisma.lancamento.count({ where: { tipo: "RECEBER" } }))).toBe(1);
    // link direto para a venda da outra loja continua abrindo
    expect(await loja.naLoja(a, () => prisma.venda.findFirst({ where: { id: vb.id } }))).not.toBeNull();
    // registro antigo sem loja aparece em todas; sem loja no contexto, tudo aparece
    await prisma.venda.update({ where: { id: vb.id }, data: { empresaId: null } });
    expect(await loja.naLoja(a, () => prisma.venda.count())).toBe(2);
    expect(await loja.todasAsLojas(() => prisma.venda.count())).toBe(2);
  });

  it("a primeira empresa fica com o que já existia; cada loja ganha seu depósito", async () => {
    const dep = await prisma.deposito.create({ data: { nome: "Loja", locais: { create: { codigo: "IMPLANTACAO" } } } });
    await duasLojas();
    expect(await empresas.atribuirSemLoja(a)).toBeGreaterThan(0);
    expect((await prisma.deposito.findUniqueOrThrow({ where: { id: dep.id } })).empresaId).toBe(a);
    await empresas.criarDepositoDaLoja(a); // já tem: não cria outro
    const novo = await empresas.criarDepositoDaLoja(b);
    expect(novo).toMatchObject({ nome: "LOJA B", empresaId: b });
    expect(await prisma.local.count({ where: { depositoId: novo!.id } })).toBe(1);
  });

  it("cada loja vende do próprio estoque", async () => {
    await duasLojas();
    const da = await empresas.criarDepositoDaLoja(a), db = await empresas.criarDepositoDaLoja(b);
    const la = (await prisma.local.findFirstOrThrow({ where: { depositoId: da!.id } })).id;
    const lb = (await prisma.local.findFirstOrThrow({ where: { depositoId: db!.id } })).id;
    await prisma.$transaction(async (tx) => {
      await est.entrada(tx, { produtoId: prod, localId: la, quantidade: 5, origemTipo: "IMPLANTACAO" });
      await est.entrada(tx, { produtoId: prod, localId: lb, quantidade: 2, origemTipo: "IMPLANTACAO" });
    });
    const naA = await loja.naLoja(a, () => prisma.$transaction((tx) => est.disponivelPorLocal(tx, prod)));
    expect(naA.map((x) => [x.localId, x.disponivel])).toEqual([[la, 5]]);
    const naB = await loja.naLoja(b, () => prisma.$transaction((tx) => est.disponivelPorLocal(tx, prod)));
    expect(naB.map((x) => [x.localId, x.disponivel])).toEqual([[lb, 2]]);
  });
});

describe("notas por CNPJ", () => {
  it("cada empresa emite com o próprio CNPJ, certificado e numeração; a última emitida continua a sequência", async () => {
    await duasLojas();
    const ca = pfxDeTeste("12345678000195"), cb = pfxDeTeste("98765432000110");
    await prisma.empresa.update({ where: { id: a }, data: { certificadoPfx: cifrar(ca.pfx.toString("base64")), certificadoSenha: cifrar(ca.senha) } });
    await prisma.empresa.update({ where: { id: b }, data: { certificadoPfx: cifrar(cb.pfx.toString("base64")), certificadoSenha: cifrar(cb.senha) } });
    // a loja B vinha do sistema anterior com a NFC-e 41
    await empresas.definirUltimoNumero(await prisma.empresa.findUniqueOrThrow({ where: { id: b } }), "NFCE", 41);

    const venda = (l: string) => loja.naLoja(l, () => vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1 }], pagamentos: [{ formaPagamentoId: dinheiro, valor: 10 }] }));
    const va = await venda(a), vb = await venda(b);
    // sem cert nas dependências: usa o certificado guardado de cada empresa
    const na = await fiscal.emitirNotaVenda(va.id, 65, { transporte: autoriza });
    const nb = await fiscal.emitirNotaVenda(vb.id, 65, { transporte: autoriza });
    expect([na.numero, na.empresaId, na.chave!.slice(6, 20)]).toEqual([1, a, "12345678000195"]);
    expect([nb.numero, nb.empresaId, nb.chave!.slice(6, 20)]).toEqual([42, b, "98765432000110"]);
    expect(nb.xml).toContain("<CNPJ>98765432000110</CNPJ>");
    expect(await empresas.ultimoNumero(await prisma.empresa.findUniqueOrThrow({ where: { id: b } }), "NFCE")).toBe(42);
    // não volta para trás de uma nota já emitida
    await expect(empresas.definirUltimoNumero(await prisma.empresa.findUniqueOrThrow({ where: { id: b } }), "NFCE", 10)).rejects.toThrow(/42 já foi emitida/);
  });

  it("recusa certificado de outro CNPJ e NF-e de empresa sem inscrição estadual", async () => {
    await duasLojas();
    const outro = pfxDeTeste("11111111000111");
    expect(() => certificadoDaEmpresa({ ...dados("12345678000195", "X"), id: a, updatedAt: new Date(),
      certificadoPfx: null, certificadoSenha: null })).toThrow(/Envie o certificado|CNPJ/);
    const { conferirCnpjCertificado } = await import("@/lib/fiscal/certificado");
    expect(() => conferirCnpjCertificado(lerCertificado(outro.pfx, outro.senha), "12345678000195")).toThrow(/não da empresa/);
    // filial (mesma raiz) aceita o certificado da matriz
    expect(() => conferirCnpjCertificado(lerCertificado(pfxDeTeste("12345678000195").pfx, "teste"), "12345678000276")).not.toThrow();

    await prisma.empresa.update({ where: { id: b }, data: { inscricaoEstadual: "ISENTO" } });
    const vb = await loja.naLoja(b, () => vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1 }], pagamentos: [{ formaPagamentoId: dinheiro, valor: 10 }] }));
    await expect(fiscal.emitirNotaVenda(vb.id, 65, { cert: lerCertificado(outro.pfx, outro.senha), transporte: autoriza })).rejects.toThrow(/inscrição estadual/);
  });
});

describe("filtro", () => {
  it("reconhece consulta por registro específico", () => {
    expect(loja.consultaPorReferencia({ id: "x" })).toBe(true);
    expect(loja.consultaPorReferencia({ AND: [{ origemId: "x" }] })).toBe(true);
    expect(loja.consultaPorReferencia({ situacao: "ABERTA", clienteId: "c" })).toBe(false);
    expect(loja.escolherLoja([{ id: "a" }, { id: "b" }], "b")).toBe("b");
    expect(loja.escolherLoja([{ id: "a" }], "zzz")).toBe("a");
    expect(loja.lojasPermitidas([{ id: "a", ativa: true }, { id: "b", ativa: true }, { id: "c", ativa: false }], ["b", "c"]).map((e) => e.id)).toEqual(["b"]);
  });
});
