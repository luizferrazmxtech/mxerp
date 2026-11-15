import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const ext = await import("@/lib/financeiro/extrato");
const { garantirPadroes } = await import("@/lib/financeiro/padroes");

let conta: string, catPagar: string, catReceber: string, tarifa: string;

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Lancamento","TransacaoBancaria","Pessoa","FormaPagamento","CategoriaFinanceira","ContaBancaria" CASCADE`);
  await prisma.$transaction((tx) => garantirPadroes(tx));
  conta = (await prisma.contaBancaria.create({ data: { nome: "INTER MXTECH" } })).id;
  catPagar = (await prisma.categoriaFinanceira.findFirstOrThrow({ where: { nome: "Compra de mercadorias (estoque)" } })).id;
  catReceber = (await prisma.categoriaFinanceira.findFirstOrThrow({ where: { nome: "Prestação de serviços", tipo: "RECEBER" } })).id;
  tarifa = (await prisma.categoriaFinanceira.findFirstOrThrow({ where: { nome: "Tarifas bancárias e taxas de cartão" } })).id;
});

const dia = (s: string) => new Date(`${s}T00:00:00Z`);
async function lanc(tipo: "PAGAR" | "RECEBER", valor: number, venc: string, descricao: string, pessoa?: string) {
  const p = pessoa ? await prisma.pessoa.create({ data: { nome: pessoa } }) : null;
  return prisma.lancamento.create({ data: { tipo, descricao, valor, vencimento: dia(venc), competencia: dia(venc), categoriaId: tipo === "PAGAR" ? catPagar : catReceber, pessoaId: p?.id } });
}

const OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261105000000[-3:BRT]<TRNAMT>-781.74<FITID>A1<MEMO>PAGAMENTO BOLETO PASSALACQUA TECH
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261106<TRNAMT>590.00<FITID>A2<MEMO>PIX RECEBIDO - FOLK COMERCIO LTDA
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261107<TRNAMT>-100.00<FITID>A3<MEMO>PIX ENVIADO JOAO
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261107<TRNAMT>-9.90<FITID>A4<MEMO>TARIFA PACOTE
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("extrato", () => {
  it("lê OFX em SGML sem tags de fechamento", () => {
    const ts = ext.lerOfx(OFX);
    expect(ts).toHaveLength(4);
    expect(ts[0]).toMatchObject({ valor: -781.74, chave: "ofx:A1" });
    expect(ts[0].data.toISOString().slice(0, 10)).toBe("2026-11-05");
  });

  it("lê CSV do banco com linhas de título, sinal e crédito/débito", async () => {
    const csv = "Extrato Conta Corrente\nConta ;12345-6\nPeríodo ;01/11/2026 a 10/11/2026\n\nData Lançamento;Histórico;Descrição;Valor;Saldo\n05/11/2026;Pagamento efetuado;PASSALACQUA;-781,74;1.000,00\n06/11/2026;Pix recebido;FOLK;590,00;1.590,00\n06/11/2026;Pix recebido;FOLK;590,00;2.180,00\n";
    const ts = await ext.lerExtrato("extrato.csv", Buffer.from(csv, "latin1"));
    expect(ts.map((t) => t.valor)).toEqual([-781.74, 590, 590]);
    expect(new Set(ts.map((t) => t.chave)).size).toBe(3); // linhas iguais no mesmo dia não se confundem
    const cd = await ext.lerExtrato("b.csv", Buffer.from("Data;Descrição;Crédito;Débito\n01/11/2026;Tarifa;;12,50\n02/11/2026;Depósito;100,00;\n"));
    expect(cd.map((t) => t.valor)).toEqual([-12.5, 100]);
  });

  it("baixa automaticamente o que casa sem dúvida e sugere o resto; reimportar não duplica", async () => {
    const compra = await lanc("PAGAR", 781.74, "2026-11-01", "Compra de nº 5", "PASSALACQUA TECH LTDA");
    const os = await lanc("RECEBER", 590, "2026-11-06", "OS 7001", "FOLK COMERCIO LTDA");
    // dois pagamentos de 100 parecidos: ambíguo, fica como sugestão
    await lanc("PAGAR", 100, "2026-11-05", "Frete");
    await lanc("PAGAR", 100, "2026-11-08", "Material");
    // valor igual mas vencimento longe demais: não casa
    await lanc("RECEBER", 590, "2026-06-01", "Antiga");

    const r = await ext.importarExtrato(conta, ext.lerOfx(OFX));
    expect(r).toMatchObject({ lidas: 4, novas: 4, baixadas: 2 });
    const c = await prisma.lancamento.findUniqueOrThrow({ where: { id: compra.id } });
    expect(c.pagoEm?.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(c.contaBancariaId).toBe(conta);
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id: os.id } })).pagoEm).not.toBeNull();

    const sug = await ext.sugestoes(conta);
    expect(sug).toHaveLength(1);
    expect(sug[0].confianca).toBe("media");

    const r2 = await ext.importarExtrato(conta, ext.lerOfx(OFX));
    expect(r2).toMatchObject({ novas: 0, repetidas: 4 });
    expect(await prisma.transacaoBancaria.count()).toBe(4);
  });

  it("concilia com diferença (juros), lança tarifa avulsa e desfaz", async () => {
    await ext.importarExtrato(conta, ext.lerOfx(OFX), { baixarAutomatico: false });
    const t = (chave: string) => prisma.transacaoBancaria.findFirstOrThrow({ where: { chave } });
    const boleto = await lanc("PAGAR", 770, "2026-11-01", "Compra de nº 5");
    const t1 = await t("ofx:A1");
    await prisma.$transaction((tx) => ext.conciliarTx(tx, t1.id, [boleto.id]));
    const b = await prisma.lancamento.findUniqueOrThrow({ where: { id: boleto.id } });
    expect(Number(b.juros)).toBeCloseTo(11.74);
    expect(Number(b.valorPago)).toBeCloseTo(781.74);

    const t4 = await t("ofx:A4");
    await expect(prisma.$transaction((tx) => ext.lancarAvulsoTx(tx, t4.id, catReceber))).rejects.toThrow(/não serve/);
    await prisma.$transaction((tx) => ext.lancarAvulsoTx(tx, t4.id, tarifa));
    expect(await prisma.lancamento.count({ where: { categoriaId: tarifa, pagoEm: { not: null } } })).toBe(1);

    await prisma.$transaction((tx) => ext.desfazerTx(tx, t4.id));
    await prisma.$transaction((tx) => ext.desfazerTx(tx, t1.id));
    expect(await prisma.lancamento.count({ where: { categoriaId: tarifa } })).toBe(0);
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id: boleto.id } })).pagoEm).toBeNull();
    expect((await t("ofx:A1")).situacao).toBe("PENDENTE");
  });
});

describe("Banco Inter", async () => {
  const { ClienteInter, sincronizarInter } = await import("@/lib/financeiro/inter");
  const cfg = { clientId: "id", clientSecret: "seg", certFile: "", keyFile: "", conta: "123", base: "https://inter.teste", contaErp: "INTER MXTECH" };

  it("autentica, pagina o extrato completo e concilia", async () => {
    const chamadas: string[] = [];
    const fake = async (metodo: "GET" | "POST", url: string, headers: Record<string, string>, corpo: string | null) => {
      chamadas.push(`${metodo} ${url.replace(/\?.*/, "")}`);
      if (url.endsWith("/oauth/v2/token")) {
        expect(corpo).toContain("grant_type=client_credentials");
        expect(corpo).toContain("scope=extrato.read");
        return { status: 200, corpo: JSON.stringify({ access_token: "tok", expires_in: 3600 }) };
      }
      expect(headers.Authorization).toBe("Bearer tok");
      expect(headers["x-conta-corrente"]).toBe("123");
      const pagina = Number(new globalThis.URL(url).searchParams.get("pagina"));
      const transacoes = pagina === 0
        ? [{ idTransacao: "T1", dataTransacao: "2026-11-05", tipoOperacao: "D", tipoTransacao: "PAGAMENTO", valor: "781.74", titulo: "Pagamento", descricao: "BOLETO PASSALACQUA", detalhes: {} }]
        : [{ idTransacao: "T2", dataTransacao: "2026-11-06", tipoOperacao: "C", tipoTransacao: "PIX", valor: "590.00", titulo: "Pix recebido", descricao: "", detalhes: { nomePagador: "FOLK COMERCIO LTDA" } }];
      return { status: 200, corpo: JSON.stringify({ totalPaginas: 2, ultimaPagina: pagina === 1, transacoes }) };
    };
    const compra = await lanc("PAGAR", 781.74, "2026-11-04", "Compra de nº 5", "PASSALACQUA TECH LTDA");
    const os = await lanc("RECEBER", 590, "2026-11-06", "OS 7001", "FOLK COMERCIO LTDA");
    const r = await sincronizarInter({ cliente: new ClienteInter(cfg, fake), dias: 10 });
    expect(r).toMatchObject({ conta: "INTER MXTECH", novas: 2, baixadas: 2 });
    expect(chamadas.filter((c) => c.includes("token"))).toHaveLength(1); // token reaproveitado
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id: compra.id } })).pagoEm).not.toBeNull();
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id: os.id } })).pagoEm).not.toBeNull();
    expect((await prisma.transacaoBancaria.findFirstOrThrow({ where: { chave: "inter:T2" } })).descricao).toContain("FOLK");
  });

  it("cai no extrato simples quando o completo não está liberado", async () => {
    const fake = async (_m: "GET" | "POST", url: string) => {
      if (url.endsWith("/oauth/v2/token")) return { status: 200, corpo: JSON.stringify({ access_token: "tok" }) };
      if (url.includes("/completo")) return { status: 403, corpo: "{}" };
      return { status: 200, corpo: JSON.stringify({ transacoes: [
        { dataEntrada: "2026-11-07", tipoOperacao: "D", tipoTransacao: "TARIFA", valor: "9.90", titulo: "Tarifa", descricao: "Pacote" },
        { dataEntrada: "2026-11-07", tipoOperacao: "D", tipoTransacao: "TARIFA", valor: "9.90", titulo: "Tarifa", descricao: "Pacote" },
      ] }) };
    };
    const ts = await new ClienteInter(cfg, fake).extrato(new Date("2026-11-01"), new Date("2026-11-10"));
    expect(ts.map((t) => t.valor)).toEqual([-9.9, -9.9]);
    expect(new Set(ts.map((t) => t.chave)).size).toBe(2);
  });

  it("erro de autenticação vira mensagem clara", async () => {
    const fake = async () => ({ status: 401, corpo: '{"title":"invalid_client"}' });
    await expect(new ClienteInter(cfg, fake).extrato(new Date(), new Date())).rejects.toThrow(/recusou a autenticação/);
  });
});
