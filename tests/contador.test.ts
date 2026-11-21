import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import JSZip from "jszip";
import { pfxDeTeste } from "./helpers/certificado-teste";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const ct = await import("@/lib/contador/contador");
const { salvarConfigEmail } = await import("@/lib/email/email");
const { lerCertificado } = await import("@/lib/fiscal/certificado");
type Mensagem = Parameters<import("@/lib/email/email").Transporte>[0];
type TransporteSefaz = import("@/lib/fiscal/sefaz").Transporte;

beforeAll(() => execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" }));

let emp = "";
const CH = (n: number) => `352610123456780001955500100000${String(n).padStart(4, "0")}1000000${n}`.slice(0, 44);
const caixa = () => { const enviados: Mensagem[] = []; return { enviados, transporte: async (m: Mensagem) => { enviados.push(m); } }; };

beforeEach(async () => {
  process.env.CHAVE_SEGREDOS ??= "chave-de-teste-do-contador-123";
  await prisma.$executeRawUnsafe(`TRUNCATE "EnvioContador","NotaFiscal","NotaRecebida","InutilizacaoNumeracao","Compra","Pessoa","Empresa","Sequencia" CASCADE`);
  await prisma.configuracao.deleteMany({ where: { chave: { in: ["contador", "email"] } } });
  emp = (await prisma.empresa.create({ data: { razaoSocial: "MXTECH TESTE LTDA", nomeFantasia: "MXTECH", cnpj: "12345678000195", uf: "SP", inscricaoEstadual: "111111111111", logradouro: "Rua A", numero: "1", bairro: "Centro", cidade: "São Carlos", codigoMunicipio: "3548906", cep: "13560000" } })).id;
  await salvarConfigEmail({ host: "smtp.teste", porta: 587, seguro: false, usuario: "", remetente: "erp@mxtech.teste", nomeRemetente: "MXTECH", copiaPara: "" });
  const out = new Date("2026-10-15T15:00:00Z");
  const a = await prisma.notaFiscal.create({ data: { empresaId: emp, modelo: "NFE", serie: 1, numero: 10, chave: CH(10), status: "AUTORIZADA", ambiente: "PRODUCAO", valorTotal: 1000, xml: "<nfeProc>10</nfeProc>", emitidaEm: out } });
  const b = await prisma.notaFiscal.create({ data: { empresaId: emp, modelo: "NFCE", serie: 1, numero: 11, chave: CH(11), status: "CANCELADA", ambiente: "PRODUCAO", valorTotal: 50, xml: "<nfeProc>11</nfeProc>", emitidaEm: out } });
  await prisma.notaEvento.create({ data: { notaId: b.id, tipo: "110111", xml: "<procEventoNFe>canc</procEventoNFe>" } });
  await prisma.notaEvento.create({ data: { notaId: a.id, tipo: "110110", sequencia: 1, xml: "<procEventoNFe>cce</procEventoNFe>" } });
  // homologação e outro mês não entram
  await prisma.notaFiscal.create({ data: { empresaId: emp, modelo: "NFE", serie: 1, numero: 12, chave: CH(12), status: "AUTORIZADA", ambiente: "HOMOLOGACAO", valorTotal: 1, xml: "<x/>", emitidaEm: out } });
  await prisma.notaFiscal.create({ data: { empresaId: emp, modelo: "NFE", serie: 1, numero: 13, chave: CH(13), status: "AUTORIZADA", ambiente: "PRODUCAO", valorTotal: 1, xml: "<x/>", emitidaEm: new Date("2026-11-01T03:01:00Z") } });
  await prisma.inutilizacaoNumeracao.create({ data: { empresaId: emp, modelo: "NFE", serie: 1, ambiente: "PRODUCAO", numeroInicial: 5, numeroFinal: 6, justificativa: "pulou a numeração", status: "HOMOLOGADA", xml: "<procInut/>", createdAt: out } });
  await prisma.notaRecebida.create({ data: { empresaId: emp, chave: CH(20), emitenteDocumento: "98765432000110", emitenteNome: "Fornecedor", emissao: out, valor: 300, xml: "<nfeProc>entrada</nfeProc>" } });
  await prisma.notaRecebida.create({ data: { empresaId: emp, chave: CH(21), emitenteDocumento: "98765432000110", emitenteNome: "Fornecedor", emissao: out, valor: 99 } });
});

const ligar = (m: Partial<import("@/lib/contador/contador").ConfigContador> = {}) => ct.salvarConfigContador({
  ativo: true, escritorio: "Contabilidade Silva", emails: "fiscal@silva.teste; dp@silva.teste", diaEnvio: 5, incluirRecebidas: true, mensagem: "", cienciaAutomatica: false, confirmarCompra: false, ...m,
});

describe("contador", () => {
  it("o pacote do mês tem os XMLs de produção, eventos, inutilizações, entradas e o resumo", async () => {
    const p = await ct.montarPacote(emp, "2026-10");
    const z = await JSZip.loadAsync(p.zip);
    const nomes = Object.keys(z.files).filter((n) => !z.files[n].dir).sort();
    const r = "12345678000195_2026-10";
    expect(nomes).toEqual([
      `${r}/Entradas (notas recebidas)/${CH(20)}.xml`, `${r}/Inutilizacoes/NF-e-serie1-5-6.xml`, `${r}/LEIA-ME.txt`,
      `${r}/NF-e/autorizadas/${CH(10)}-carta-correcao-1.xml`, `${r}/NF-e/autorizadas/${CH(10)}.xml`,
      `${r}/NFC-e/canceladas/${CH(11)}-cancelamento-1.xml`, `${r}/NFC-e/canceladas/${CH(11)}.xml`, `${r}/resumo.csv`,
    ].sort());
    expect(p.arquivos).toBe(6);
    expect(p.total).toBe(1000);
    expect(p.resumo).toBe("1 NF-e autorizadas, 1 NFC-e canceladas, 1 Inutilizações, 1 NF-e recebidas");
    const csv = await z.file(`${r}/resumo.csv`)!.async("string");
    expect(csv).toContain(`NF-e;1;10;${CH(10)}`);
    expect(csv).toContain("1000,00");
    expect(await z.file(`${r}/LEIA-ME.txt`)!.async("string")).toMatch(/1 nota\(s\) recebida\(s\) no mês ainda sem XML/);
    await expect(ct.montarPacote(emp, "2026-13")).rejects.toThrow(/Competência inválida/);
  });

  it("envia por e-mail com o .zip anexo e o link; o automático manda uma vez só, a partir do dia", async () => {
    await expect(ligar({ emails: "nao-e-email" })).rejects.toThrow(/E-mail inválido/);
    await ligar();
    const cx = caixa();
    expect(await ct.processarContador({ agora: new Date("2026-11-04T15:00:00Z"), transporte: cx.transporte, baseUrl: "https://erp.teste" })).toEqual({ aguardando: "envio no dia 5" });
    const r = await ct.processarContador({ agora: new Date("2026-11-05T15:00:00Z"), transporte: cx.transporte, baseUrl: "https://erp.teste/" });
    expect(r).toEqual({ competencia: "2026-10", empresas: { "12345678000195": "enviado" } });
    expect(cx.enviados).toHaveLength(1);
    const m = cx.enviados[0];
    expect(m.para).toBe("fiscal@silva.teste, dp@silva.teste");
    expect(m.assunto).toBe("Arquivos fiscais outubro de 2026 - MXTECH");
    expect(m.anexos?.[0].nome).toBe("12345678000195_2026-10.zip");
    const env = await prisma.envioContador.findFirstOrThrow();
    expect(m.texto).toContain(`https://erp.teste/api/contador/arquivo/${env.token}`);
    expect(m.texto).toContain("1 NF-e autorizadas");
    expect(env).toMatchObject({ situacao: "ENVIADO", arquivos: 6, automatico: true, competencia: "2026-10" });
    // de novo no mesmo mês: não manda
    expect((await ct.processarContador({ agora: new Date("2026-11-06T15:00:00Z"), transporte: cx.transporte })).empresas).toEqual({ "12345678000195": "já enviado" });
    expect(cx.enviados).toHaveLength(1);
    // o link baixa o mesmo pacote
    expect((await ct.pacoteDoLink(env.token))?.nome).toBe("12345678000195_2026-10.zip");
    expect(await ct.pacoteDoLink("nao-existe")).toBeNull();
  });

  it("erro no e-mail fica no histórico e espera 6 horas para tentar de novo", async () => {
    await ligar();
    const falha = async () => { throw new Error("SMTP fora do ar"); };
    const r = await ct.processarContador({ agora: new Date("2026-11-05T15:00:00Z"), transporte: falha });
    expect(r.empresas!["12345678000195"]).toMatch(/SMTP fora do ar/);
    expect((await prisma.envioContador.findFirstOrThrow()).situacao).toBe("ERRO");
    expect((await ct.processarContador({ agora: new Date(Date.now() + 3600000), transporte: falha })).empresas).toBeDefined();
  });

  it("manifestação automática: ciência nas notas novas e confirmação das que viraram compra", async () => {
    const { pfx, senha } = pfxDeTeste();
    const cert = lerCertificado(pfx, senha);
    await ligar({ ativo: false, cienciaAutomatica: true, confirmarCompra: true });
    await prisma.notaRecebida.updateMany({ data: { emissao: new Date() } });
    const forn = await prisma.pessoa.create({ data: { nome: "Fornecedor", fornecedor: true } });
    await prisma.compra.create({ data: { numero: 1, chaveNfe: CH(20), fornecedorId: forn.id } });
    const eventos: string[] = [];
    const t: TransporteSefaz = async (url, _acao, corpo) => {
      if (url.includes("RecepcaoEvento")) { eventos.push(corpo.match(/<tpEvento>(\d+)</)![1] + ":" + corpo.match(/<chNFe>(\d+)</)![1]); return `<E><retEnvEvento><cStat>128</cStat><retEvento><infEvento><cStat>135</cStat><xMotivo>Evento registrado</xMotivo><nProt>1</nProt></infEvento></retEvento></retEnvEvento></E>`; }
      return `<E><retDistDFeInt><cStat>137</cStat><xMotivo>Nenhum documento</xMotivo></retDistDFeInt></E>`;
    };
    const r = await ct.manifestacaoAutomatica({ cert, transporte: t });
    expect(r).toMatchObject({ confirmacoes: 1, ciencias: 1, erros: [] });
    expect(eventos.sort()).toEqual([`210200:${CH(20)}`, `210210:${CH(21)}`].sort());
    const notas = await prisma.notaRecebida.findMany({ orderBy: { chave: "asc" } });
    expect(notas.map((n) => n.manifestacao)).toEqual(["CONFIRMADA", "CIENCIA"]);
    // nada novo: não manifesta de novo
    expect(await ct.manifestacaoAutomatica({ cert, transporte: t })).toMatchObject({ confirmacoes: 0, ciencias: 0 });
  });
});
