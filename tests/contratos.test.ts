import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { LOJA_ATUAL } from "@/lib/empresa/loja";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const { garantirPadroes } = await import("@/lib/financeiro/padroes");
const { ClienteInter, ESCOPOS_PADRAO } = await import("@/lib/financeiro/inter");
const { salvarConfigEmail } = await import("@/lib/email/email");
const { salvarConfigWhatsapp } = await import("@/lib/whatsapp/mxchat");
process.env.CHAVE_SEGREDOS ??= "chave-de-teste-dos-contratos-123";
const ct = await import("@/lib/contratos/contratos");
const tp = await import("@/lib/contratos/tipos");
const { diaSP, somarDias } = await import("@/lib/datas");
type Mensagem = Parameters<import("@/lib/email/email").Transporte>[0];

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
const hoje = diaSP();

/** Banco Inter de mentira (só o que a emissão de boletos usa). */
function interFalso() {
  const cobrancas = new Map<string, Record<string, unknown>>();
  let n = 0;
  const fake = async (metodo: string, url: string, _h: Record<string, string>, corpo: string | null) => {
    const u = new globalThis.URL(url);
    if (u.pathname === "/oauth/v2/token") return { status: 200, corpo: JSON.stringify({ access_token: "tok", expires_in: 3600 }) };
    const p = u.pathname.replace("/cobranca/v3/cobrancas", "");
    if (metodo === "POST" && p === "") {
      const c = JSON.parse(corpo!);
      const cs = `cs-${++n}`;
      cobrancas.set(cs, {
        cobranca: { codigoSolicitacao: cs, seuNumero: c.seuNumero, situacao: "A_RECEBER", valorNominal: c.valorNominal, dataVencimento: c.dataVencimento, dataSituacao: iso(hoje) },
        boleto: { nossoNumero: `0000${n}`, linhaDigitavel: `07790.00116 ${n}`, codigoBarras: `0779${n}` },
        pix: { txid: `TX${n}`, pixCopiaECola: `00020101PIX${n}` },
      });
      return { status: 200, corpo: JSON.stringify({ codigoSolicitacao: cs }) };
    }
    if (metodo === "GET" && p === "") return { status: 200, corpo: JSON.stringify({ totalPaginas: 1, ultimaPagina: true, cobrancas: [] }) };
    const [, cs, acao] = p.split("/");
    const c = cobrancas.get(cs);
    if (!c) return { status: 404, corpo: "{}" };
    if (metodo === "GET" && !acao) return { status: 200, corpo: JSON.stringify(c) };
    if (metodo === "GET" && acao === "pdf") return { status: 200, corpo: JSON.stringify({ pdf: Buffer.from("%PDF-1.4 boleto").toString("base64") }) };
    return { status: 400, corpo: "{}" };
  };
  const cliente = () => new ClienteInter({ clientId: "id", clientSecret: "s", cert: "", key: "", conta: null, base: "https://inter.teste", contaErp: "INTER MXTECH", escopos: ESCOPOS_PADRAO }, fake);
  return { cobrancas, cliente };
}

function caixaDeSaida() {
  const enviados: Mensagem[] = [];
  return { enviados, transporte: async (m: Mensagem) => { enviados.push(m); } };
}

let cli = "", serv = "", serv2 = "", boleto = "";
const u = { id: "", nome: "Luiz" };

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Contrato","ContratoCobranca","Boleto","Lancamento","Venda","NotaFiscal","Servico","Pessoa","FormaPagamento","CategoriaFinanceira","ContaBancaria","IntegracaoInter","Empresa" CASCADE`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Sequencia" WHERE chave IN ('BOLETO','CONTRATO','VENDA')`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Configuracao" WHERE chave IN ('email','contratos','whatsapp')`);
  await prisma.$executeRawUnsafe(`TRUNCATE "MensagemWhatsapp"`);
  await prisma.$transaction((tx) => garantirPadroes(tx));
  boleto = (await prisma.formaPagamento.findUniqueOrThrow({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "Boleto" } } })).id;
  cli = (await prisma.pessoa.create({ data: {
    nome: "JT ECOBIO LTDA", documento: "12345678000195", tipoPessoa: "JURIDICA", logradouro: "Rua das Flores", numero: "10", bairro: "Centro",
    cidade: "São Paulo", uf: "SP", cep: "01001-000", email: "financeiro@jtecobio.com", celular: "(11) 98765-4321",
  } })).id;
  serv = (await prisma.servico.create({ data: { codigo: "MANUT", nome: "Manutenção de TI mensal", preco: 800 } })).id;
  serv2 = (await prisma.servico.create({ data: { codigo: "BKP", nome: "Backup em nuvem", preco: 100 } })).id;
  await salvarConfigEmail({ host: "smtp.teste", porta: 587, seguro: false, usuario: "", remetente: "cobranca@mxtech.inf.br", nomeRemetente: "MXTECH", copiaPara: "" });
});

const linha = (servicoId: string, valor: string, quantidade = "1") => ({ servicoId, nome: "", codigo: "", detalhes: "", quantidade, valorUnit: valor, desconto: "", descontoPct: false });
const dados = (m: Partial<import("@/lib/contratos/tipos").DadosContrato> = {}): import("@/lib/contratos/tipos").DadosContrato => {
  const venc = somarDias(hoje, 10);
  return {
    numero: "", clienteId: cli, clienteNome: "", vendedorId: "", situacao: "ATIVO", canal: "Presencial", centroCusto: "",
    dataInicio: iso(hoje), periodicidade: "MENSAL", diaVencimento: String(venc.getUTCDate()), proximoVencimento: iso(venc),
    termino: "SEM", dataFim: "", totalCobrancas: "",
    servicos: [linha(serv, "800,00"), linha(serv2, "100,00")], desconto: "", descontoPct: false,
    formaPagamentoId: boleto, diasAntecedencia: "10", enviarBoleto: true, lembrete: true, diasLembrete: "3", emitirNota: false,
    emailCobranca: "", observacoes: "Manutenção preventiva e suporte remoto", observacaoInterna: "",
    canalEmail: true, canalWhatsapp: false, whatsappCobranca: "", ...m,
  };
};

describe("datas dos contratos", () => {
  it("mantém o dia escolhido, usa o fim do mês nos meses curtos e soma a periodicidade", () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    expect(iso(tp.vencimentoSeguinte(d("2027-01-31"), "MENSAL", 31))).toBe("2027-02-28");
    expect(iso(tp.vencimentoSeguinte(d("2027-02-28"), "MENSAL", 31))).toBe("2027-03-31");
    expect(iso(tp.vencimentoSeguinte(d("2026-11-10"), "TRIMESTRAL", 10))).toBe("2027-02-10");
    expect(iso(tp.vencimentoSeguinte(d("2026-12-10"), "SEMESTRAL", 10))).toBe("2027-06-10");
    expect(iso(tp.vencimentoSeguinte(d("2026-12-10"), "ANUAL", 10))).toBe("2027-12-10");
    expect(iso(tp.primeiroVencimento(d("2026-11-19"), 10))).toBe("2026-12-10");
    expect(iso(tp.primeiroVencimento(d("2026-11-19"), 25))).toBe("2026-11-25");
    expect(tp.referencia(d("2026-12-10"), "MENSAL")).toBe("12/2026");
    expect(tp.referencia(d("2026-12-10"), "TRIMESTRAL")).toBe("12/2026 a 02/2027");
  });
});

describe("contratos", () => {
  it("no dia certo gera a venda de serviços, lança o financeiro, registra o boleto e manda por e-mail com o PDF", async () => {
    const inter = interFalso(); const cx = caixaDeSaida();
    const c = await ct.salvarContrato(dados(), u);
    expect(c.numero).toBe(1);
    expect(Number(c.total)).toBe(900);
    const deps = { cliente: inter.cliente(), transporte: cx.transporte };

    // um dia antes do prazo (vencimento − 10 dias): nada
    expect(await ct.processarContratos({ ...deps, hoje: somarDias(hoje, -1) })).toMatchObject({ abertas: 0, vendas: 0, erros: [] });

    const r = await ct.processarContratos({ ...deps, hoje });
    expect(r).toMatchObject({ abertas: 1, vendas: 1, boletosEnviados: 1, lembretes: 0, erros: [] });
    const cob = await prisma.contratoCobranca.findFirstOrThrow({ where: { contratoId: c.id } });
    expect(cob).toMatchObject({ numero: 1, situacao: "GERADA", vencimento: somarDias(hoje, 10) });
    const v = await prisma.venda.findUniqueOrThrow({ where: { id: cob.vendaId! }, include: { servicos: true } });
    expect(v).toMatchObject({ tipo: "SERVICO", situacao: "CONCLUIDA", clienteId: cli });
    expect(Number(v.total)).toBe(900);
    expect(v.servicos).toHaveLength(2);
    expect(v.observacoes).toContain("Contrato nº 1");
    const l = await prisma.lancamento.findFirstOrThrow({ where: { origemTipo: "VENDA", origemId: v.id }, include: { boletos: true, categoria: true } });
    expect(iso(l.vencimento)).toBe(iso(somarDias(hoje, 10)));
    expect(l.categoria.nome).toBe("Prestação de serviços");
    expect(l.boletos[0]).toMatchObject({ situacao: "A_RECEBER", linhaDigitavel: "07790.00116 1" });

    expect(cx.enviados).toHaveLength(1);
    expect(cx.enviados[0]).toMatchObject({ para: "financeiro@jtecobio.com", de: '"MXTECH" <cobranca@mxtech.inf.br>' });
    expect(cx.enviados[0].texto).toContain("07790.00116 1");
    expect(cx.enviados[0].texto).toContain("900,00");
    expect(cx.enviados[0].anexos?.[0].nome).toMatch(/^boleto-.*\.pdf$/);

    // o próximo vencimento andou um mês; rodar de novo não duplica nada
    const depois = await prisma.contrato.findUniqueOrThrow({ where: { id: c.id } });
    expect(iso(depois.proximoVencimento)).toBe(iso(tp.vencimentoSeguinte(somarDias(hoje, 10), "MENSAL", somarDias(hoje, 10).getUTCDate())));
    expect(await ct.processarContratos({ ...deps, hoje })).toMatchObject({ abertas: 0, vendas: 0, boletosEnviados: 0 });
    expect(await prisma.venda.count()).toBe(1);
    expect(inter.cobrancas.size).toBe(1);
    expect(cx.enviados).toHaveLength(1);
  });

  it("WhatsApp (MXChat): cobrança com o boleto em PDF e lembrete pelo WhatsApp, sem e-mail, no celular do cliente", async () => {
    const inter = interFalso(); const cx = caixaDeSaida();
    const zap: import("@/lib/whatsapp/mxchat").EnvioMxchat[] = [];
    await salvarConfigWhatsapp({ ativo: true, url: "https://mxchat.teste/backend/api/messages/send", token: "tok-123", salvarNoTicket: true, convidarAreaCliente: false });
    const deps = { cliente: inter.cliente(), transporte: cx.transporte, transporteWhatsapp: async (e: import("@/lib/whatsapp/mxchat").EnvioMxchat) => { zap.push(e); } };
    await expect(ct.salvarContrato(dados({ canalEmail: false, canalWhatsapp: false }), u)).rejects.toThrow(/Escolha por onde/);
    await expect(ct.salvarContrato(dados({ canalWhatsapp: true, whatsappCobranca: "123" }), u)).rejects.toThrow(/WhatsApp de cobrança inválido/);
    const c = await ct.salvarContrato(dados({ canalEmail: false, canalWhatsapp: true }), u);

    expect(await ct.processarContratos({ ...deps, hoje })).toMatchObject({ vendas: 1, boletosEnviados: 1, erros: [] });
    expect(cx.enviados).toHaveLength(0);
    expect(zap).toHaveLength(1);
    expect(zap[0]).toMatchObject({ numero: "5511987654321", token: "tok-123", url: "https://mxchat.teste/backend/api/messages/send" });
    expect(zap[0].texto).toContain("*R$ 900,00*");
    expect(zap[0].texto).toContain("07790.00116 1");
    expect(zap[0].arquivo?.nome).toMatch(/^boleto-.*\.pdf$/);
    const cob = await prisma.contratoCobranca.findFirstOrThrow({ where: { contratoId: c.id } });
    expect(cob.boletoWhatsEm).not.toBeNull();
    expect(cob.boletoEnviadoEm).toBeNull();
    expect(await prisma.mensagemWhatsapp.findFirstOrThrow()).toMatchObject({ entidade: "CONTRATO", entidadeId: c.id, situacao: "ENVIADA", automatica: true, arquivoNome: zap[0].arquivo?.nome });

    // rodar de novo não repete; o lembrete sai 3 dias antes, sem anexo
    await ct.processarContratos({ ...deps, hoje: somarDias(hoje, 1) });
    expect(zap).toHaveLength(1);
    expect(await ct.processarContratos({ ...deps, hoje: somarDias(hoje, 7) })).toMatchObject({ lembretes: 1, erros: [] });
    expect(zap).toHaveLength(2);
    expect(zap[1].texto).toContain("lembrar");
    expect(zap[1].arquivo).toBeUndefined();

    // ligar o e-mail depois: a cobrança e o lembrete que faltam por e-mail saem, sem repetir o WhatsApp
    await prisma.contrato.update({ where: { id: c.id }, data: { canalEmail: true } });
    await ct.processarContratos({ ...deps, hoje: somarDias(hoje, 7) });
    expect(zap).toHaveLength(2);
    expect(cx.enviados.map((m) => m.assunto.includes("Lembrete") ? "L" : "C")).toEqual(["C", "L"]);
  });

  it("WhatsApp: MXChat fora do ar deixa o erro na cobrança e no histórico, e o e-mail sai mesmo assim", async () => {
    const inter = interFalso(); const cx = caixaDeSaida();
    await salvarConfigWhatsapp({ ativo: true, url: "https://mxchat.teste/backend/api/messages/send", token: "tok", salvarNoTicket: false, convidarAreaCliente: false });
    let falhar = true; const zap: string[] = [];
    const deps = { cliente: inter.cliente(), transporte: cx.transporte, transporteWhatsapp: async (e: import("@/lib/whatsapp/mxchat").EnvioMxchat) => { if (falhar) throw new Error("MXChat respondeu 500"); zap.push(e.numero); } };
    await ct.salvarContrato(dados({ canalWhatsapp: true, whatsappCobranca: "(21) 99999-0000", lembrete: false }), u);
    const r = await ct.processarContratos({ ...deps, hoje });
    expect(r.erros[0]).toMatch(/WhatsApp: MXChat respondeu 500/);
    expect(cx.enviados).toHaveLength(1);
    const cob = await prisma.contratoCobranca.findFirstOrThrow();
    expect(cob).toMatchObject({ boletoWhatsEm: null, envioErro: expect.stringMatching(/WhatsApp/) });
    expect(cob.boletoEnviadoEm).not.toBeNull();
    expect(await prisma.mensagemWhatsapp.findFirstOrThrow()).toMatchObject({ situacao: "ERRO", numero: "5521999990000" });
    falhar = false;
    expect(await ct.processarContratos({ ...deps, hoje })).toMatchObject({ boletosEnviados: 1, erros: [] });
    expect(zap).toEqual(["5521999990000"]);
    expect(cx.enviados).toHaveLength(1);
    expect((await prisma.contratoCobranca.findFirstOrThrow()).envioErro).toBeNull();
  });

  it("manda o lembrete N dias antes do vencimento, só uma vez e só se não foi pago", async () => {
    const inter = interFalso(); const cx = caixaDeSaida();
    const deps = { cliente: inter.cliente(), transporte: cx.transporte };
    await ct.salvarContrato(dados(), u);
    await ct.salvarContrato(dados({ clienteId: cli }), u);
    await ct.processarContratos({ ...deps, hoje });
    expect(cx.enviados).toHaveLength(2);

    // um dos dois é pago antes do lembrete
    const [pago] = await prisma.lancamento.findMany({ orderBy: { createdAt: "asc" } });
    await prisma.lancamento.update({ where: { id: pago.id }, data: { pagoEm: hoje, valorPago: pago.valor } });

    expect(await ct.processarContratos({ ...deps, hoje: somarDias(hoje, 6) })).toMatchObject({ lembretes: 0 }); // 4 dias antes
    const r = await ct.processarContratos({ ...deps, hoje: somarDias(hoje, 7) }); // 3 dias antes
    expect(r).toMatchObject({ lembretes: 1, erros: [] });
    expect(cx.enviados[2].assunto).toContain("Lembrete");
    expect(await ct.processarContratos({ ...deps, hoje: somarDias(hoje, 8) })).toMatchObject({ lembretes: 0 });
  });

  it("trimestral com número de cobranças: gera antes do prazo pelo botão e finaliza na última", async () => {
    const inter = interFalso(); const cx = caixaDeSaida();
    const deps = { cliente: inter.cliente(), transporte: cx.transporte, hoje };
    const c = await ct.salvarContrato(dados({ periodicidade: "TRIMESTRAL", termino: "VEZES", totalCobrancas: "2", diasAntecedencia: "5", lembrete: false, proximoVencimento: iso(somarDias(hoje, 20)) }), u);
    expect((await ct.processarContratos(deps)).abertas).toBe(0);
    await ct.gerarCobrancaAgora(c.id, u, deps);
    await ct.gerarCobrancaAgora(c.id, u, deps);
    const fim = await prisma.contrato.findUniqueOrThrow({ where: { id: c.id }, include: { cobrancas: { orderBy: { numero: "asc" } } } });
    expect(fim.situacao).toBe("FINALIZADO");
    expect(fim.cobrancas.map((x) => x.referencia)).toHaveLength(2);
    expect(iso(fim.cobrancas[1].vencimento)).toBe(iso(tp.vencimentoSeguinte(somarDias(hoje, 20), "TRIMESTRAL", somarDias(hoje, 10).getUTCDate())));
    await expect(ct.gerarCobrancaAgora(c.id, u, deps)).rejects.toThrow(/Só contratos ativos/);
  });

  it("NFS-e automática: o erro fica anotado na cobrança sem travar a venda nem o e-mail", async () => {
    const inter = interFalso(); const cx = caixaDeSaida();
    await ct.salvarContrato(dados({ emitirNota: true }), u);
    const r = await ct.processarContratos({ cliente: inter.cliente(), transporte: cx.transporte, hoje });
    expect(r).toMatchObject({ vendas: 1, notas: 1, boletosEnviados: 1 });
    const cob = await prisma.contratoCobranca.findFirstOrThrow();
    expect(cob.notaMsg).toMatch(/NFS-e não emitida: Cadastre os dados da empresa/);
    // não tenta de novo sozinha (cada tentativa gasta um número de DPS)
    await ct.processarContratos({ cliente: inter.cliente(), transporte: cx.transporte, hoje });
    expect((await prisma.contratoCobranca.findFirstOrThrow()).notaTentadaEm).toEqual(cob.notaTentadaEm);
  });

  it("cliente sem e-mail: avisa uma vez e manda quando o e-mail de cobrança é preenchido", async () => {
    const inter = interFalso(); const cx = caixaDeSaida();
    const deps = { cliente: inter.cliente(), transporte: cx.transporte, hoje };
    await prisma.pessoa.update({ where: { id: cli }, data: { email: null } });
    const c = await ct.salvarContrato(dados(), u);
    const r1 = await ct.processarContratos(deps);
    expect(r1.erros[0]).toMatch(/não tem e-mail/);
    expect((await ct.processarContratos(deps)).erros).toEqual([]);
    expect((await prisma.contratoCobranca.findFirstOrThrow()).envioErro).toMatch(/não tem e-mail/);
    const d = dados({ emailCobranca: "contas@jtecobio.com", proximoVencimento: "" });
    await ct.salvarContrato({ ...d, numero: "1", diaVencimento: String(c.diaVencimento), proximoVencimento: iso((await prisma.contrato.findUniqueOrThrow({ where: { id: c.id } })).proximoVencimento) }, u, c.id);
    expect((await ct.processarContratos(deps)).boletosEnviados).toBe(1);
    expect(cx.enviados[0].para).toBe("contas@jtecobio.com");
  });

  it("valida o cadastro", async () => {
    await expect(ct.salvarContrato(dados({ servicos: [] }), u)).rejects.toThrow(/ao menos um serviço/);
    await expect(ct.salvarContrato(dados({ diaVencimento: "32" }), u)).rejects.toThrow(/1 a 31/);
    await expect(ct.salvarContrato(dados({ diasLembrete: "10" }), u)).rejects.toThrow(/mais perto do vencimento/);
    await expect(ct.salvarContrato(dados({ termino: "VEZES", totalCobrancas: "" }), u)).rejects.toThrow(/quantas cobranças/);
    await expect(ct.salvarContrato(dados({ emailCobranca: "nada" }), u)).rejects.toThrow(/E-mail de cobrança inválido/);
  });
});
