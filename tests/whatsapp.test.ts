import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;
process.env.CHAVE_SEGREDOS ??= "chave-de-teste-do-whatsapp-123";

const { prisma } = await import("@/lib/db");
const zap = await import("@/lib/whatsapp/mxchat");
const wos = await import("@/lib/whatsapp/os");
const ord = await import("@/lib/os/ordens");
const { gerarParcelas } = await import("@/lib/orcamentos/orcamentos");
const { equipamentoVazio } = await import("@/lib/os/tipos");
type Envio = import("@/lib/whatsapp/mxchat").EnvioMxchat;
type Dados = import("@/lib/os/tipos").DadosOs;

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

let cli = "", serv = "";
let u = { id: "", nome: "Caue", papel: "OPERADOR" as const };
const BASE = "https://erp.mxtech.teste";
const caixa = () => { const enviados: Envio[] = []; return { enviados, transporte: async (e: Envio) => { enviados.push(e); } }; };
const ligar = (m: Partial<Parameters<typeof zap.salvarConfigWhatsapp>[0]> = {}) =>
  zap.salvarConfigWhatsapp({ ativo: true, url: "", token: "segredo-do-mxchat", salvarNoTicket: true, convidarAreaCliente: true, ...m });

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "MensagemWhatsapp","OrdemServico","Lancamento","Reserva","Servico","Pessoa","Sequencia" CASCADE`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Configuracao" WHERE chave = 'whatsapp'`);
  await prisma.modeloMensagem.deleteMany({ where: { tipo: "OS" } });
  await prisma.situacaoOsConfig.updateMany({ data: { enviarMensagem: false, modeloMensagemId: null, bloqueados: [] } });
  serv = (await prisma.servico.create({ data: { codigo: "MO", nome: "Mão de obra", preco: 150 } })).id;
  cli = (await prisma.pessoa.create({ data: { nome: "Maria Souza", cliente: true, documento: "52998224725", celular: "(11) 98765-4321" } })).id;
  const usuario = await prisma.usuario.upsert({ where: { email: "zap@local.test" }, update: {}, create: { nome: "Caue", email: "zap@local.test", papel: "OPERADOR" } });
  u = { id: usuario.id, nome: usuario.nome, papel: "OPERADOR" };
});

const dados = (m: Partial<Dados> = {}): Dados => ({
  tipo: "SERVICO", numero: "", clienteId: cli, clienteNome: "", data: "2026-11-16", validade: "", vendedorId: "", prazoEntrega: "", aosCuidados: "",
  canal: "Presencial", centroCusto: "", introducao: "", situacaoId: "so_aberto", produtos: [],
  servicos: [{ servicoId: serv, nome: "Mão de obra", codigo: "MO", detalhes: "", quantidade: "1", valorUnit: "150,00", desconto: "0", descontoPct: false }],
  transportadoraId: "", transportadoraNome: "", frete: "0", mostrarEntrega: false, enderecoEntregaId: "", desconto: "", descontoPct: false, exibirTotal: true,
  gerarCondicoes: false, condicao: "AVISTA", formaPagamentoId: "", vencimento: "", intervaloDias: "30", numParcelas: "1", primeiraParcela: "2026-12-01",
  parcelas: gerarParcelas(150, 1, "2026-12-01", 30, ""), observacoes: "", observacaoInterna: "", camposExtras: {},
  entrada: "2026-11-16T09:30", saida: "", prioridade: "ALTA", tecnicoIds: [], outros: "0",
  equipamentos: [{ ...equipamentoVazio(), equipamento: "Notebook", marca: "Dell" }],
  ...m,
});

describe("MXChat", () => {
  it("põe o número no formato do WhatsApp", () => {
    expect(zap.numeroWhatsapp("(11) 98765-4321")).toBe("5511987654321");
    expect(zap.numeroWhatsapp("+55 21 3333-4444")).toBe("552133334444");
    expect(zap.numeroWhatsapp("011 98765-4321")).toBe("5511987654321");
    expect(zap.numeroWhatsapp("5511987654321")).toBe("5511987654321");
    expect(zap.numeroWhatsapp("98765-4321")).toBeNull();
    expect(zap.numeroWhatsapp("")).toBeNull();
    expect(zap.numeroDaPessoa({ celular: null, telefone: "(19) 3232-1010" })).toBe("551932321010");
    expect(zap.foneBonito("5511987654321")).toBe("(11) 98765-4321");
  });

  it("guarda o token cifrado, só manda com o envio ligado e registra enviadas e erros", async () => {
    const cx = caixa();
    await expect(zap.enviarWhatsapp({ numero: "11987654321", texto: "oi", entidade: "TESTE" }, { transporte: cx.transporte })).rejects.toThrow(/não está ligado/);
    await expect(zap.salvarConfigWhatsapp({ ativo: true, url: "", salvarNoTicket: true, convidarAreaCliente: true })).rejects.toThrow(/Informe o token/);
    await ligar();
    const salvo = JSON.stringify((await prisma.configuracao.findUniqueOrThrow({ where: { chave: "whatsapp" } })).valor);
    expect(salvo).not.toContain("segredo-do-mxchat");
    expect(await zap.configWhatsappTela()).toMatchObject({ ativo: true, temToken: true, url: zap.URL_MXCHAT });
    // salvar sem token mantém o que estava
    await ligar({ token: "" });
    await zap.enviarWhatsapp({ numero: "(11) 98765-4321", texto: " Olá! ", entidade: "TESTE", usuarioNome: "Luiz" }, { transporte: cx.transporte });
    expect(cx.enviados[0]).toMatchObject({ numero: "5511987654321", texto: "Olá!", token: "segredo-do-mxchat", url: zap.URL_MXCHAT, salvarNoTicket: true });

    await expect(zap.enviarWhatsapp({ numero: "123", texto: "x", entidade: "TESTE" }, { transporte: cx.transporte })).rejects.toThrow(/Número de WhatsApp inválido/);
    await expect(zap.enviarWhatsapp({ numero: "11987654321", texto: "x", entidade: "TESTE" }, { transporte: async () => { throw new Error("O MXChat respondeu 401"); } })).rejects.toThrow(/401/);
    // sem transporte nos testes nunca manda de verdade
    await expect(zap.enviarWhatsapp({ numero: "11987654321", texto: "x", entidade: "TESTE" })).rejects.toThrow(/transporte falso/);
    const hist = await prisma.mensagemWhatsapp.findMany({ orderBy: { createdAt: "asc" } });
    expect(hist.map((m) => m.situacao)).toEqual(["ENVIADA", "ERRO", "ERRO"]);
    expect(hist[0]).toMatchObject({ usuarioNome: "Luiz", entidade: "TESTE" });
    expect(hist[2].erro).toMatch(/401/);
  });
});

describe("status da OS por WhatsApp", () => {
  it("monta a mensagem com as tags e o link da OS na Área do Cliente; com 'convidar' manda o link para criar a senha", async () => {
    await ligar();
    const o = await ord.salvarOrdem(dados(), u);
    const m = await wos.mensagemOs(o.id, { base: BASE });
    expect(m.numero).toBe("5511987654321");
    expect(m.temSenha).toBe(false);
    expect(m.texto).toContain("Olá, Maria Souza!");
    expect(m.texto).toContain(`nº ${o.numero} está agora: *Em aberto*`);
    expect(m.texto).toContain(`${BASE}/area-cliente/os/${o.id}`);

    const cx = caixa();
    await wos.enviarWhatsappOsTela(o.id, { numero: "(11) 98765-4321", texto: m.texto, convidar: true, usuarioNome: "Caue" }, { transporte: cx.transporte, base: BASE });
    expect(cx.enviados[0].texto).toMatch(new RegExp(`${BASE}/area-cliente/senha/[\\w-]{20,}`));
    expect(cx.enviados[0].texto).not.toContain("/area-cliente/os/");
    expect((await prisma.pessoa.findUniqueOrThrow({ where: { id: cli } })).areaCliente).toBe(true);
    expect(await prisma.osHistorico.findFirst({ where: { osId: o.id, descricao: { contains: "WhatsApp" } } })).not.toBeNull();
    expect(await prisma.mensagemWhatsapp.findFirstOrThrow()).toMatchObject({ entidade: "OS", entidadeId: o.id, pessoaId: cli, automatica: false, usuarioNome: "Caue" });
  });

  it("avisa sozinho quando a OS entra numa situação com 'Enviar mensagem', com o texto do modelo; não repete nem avisa nas outras", async () => {
    await ligar({ convidarAreaCliente: false });
    const modelo = await prisma.modeloMensagem.create({ data: { tipo: "OS", assunto: "Pronta", email: "e-mail", whatsapp: "Oi [nome_cliente], sua OS [numero] ([equipamento]) ficou *[situacao]*. Total [valor_total]. [link_area_cliente]" } });
    await prisma.situacaoOsConfig.update({ where: { id: "so_andamento" }, data: { enviarMensagem: true, modeloMensagemId: modelo.id } });
    const o = await ord.salvarOrdem(dados(), u);
    const cx = caixa(); const deps = { transporte: cx.transporte, base: BASE };

    expect(await wos.avisoAutomaticoOs(o.id, null, u, deps)).toBe(""); // "Em aberto" não avisa
    await ord.alterarSituacaoOrdem(o.id, "so_andamento", u);
    expect(await wos.avisoAutomaticoOs(o.id, "so_aberto", u, deps)).toMatch(/avisado por WhatsApp/);
    expect(cx.enviados).toHaveLength(1);
    expect(cx.enviados[0].texto.replace(/\u00a0/g, " ")).toBe(`Oi Maria Souza, sua OS ${o.numero} (Notebook Dell) ficou *Em andamento*. Total R$ 150,00. ${BASE}/area-cliente/os/${o.id}`);
    expect(await prisma.mensagemWhatsapp.findFirstOrThrow()).toMatchObject({ automatica: true, situacao: "ENVIADA" });
    // mesma situação (salvou a OS sem trocar): não manda de novo
    expect(await wos.avisoAutomaticoOs(o.id, "so_andamento", u, deps)).toBe("");
    // WhatsApp desligado: não manda e não reclama
    await ligar({ ativo: false });
    await ord.alterarSituacaoOrdem(o.id, "so_aberto", u); await ord.alterarSituacaoOrdem(o.id, "so_andamento", u);
    expect(await wos.avisoAutomaticoOs(o.id, "so_aberto", u, deps)).toBe("");
    expect(cx.enviados).toHaveLength(1);
  });

  it("cliente sem celular: a troca de situação segue e o erro fica no histórico de envios", async () => {
    await ligar();
    await prisma.situacaoOsConfig.update({ where: { id: "so_andamento" }, data: { enviarMensagem: true } });
    await prisma.pessoa.update({ where: { id: cli }, data: { celular: null, telefone: null } });
    const o = await ord.salvarOrdem(dados(), u);
    await ord.alterarSituacaoOrdem(o.id, "so_andamento", u);
    const cx = caixa();
    expect(await wos.avisoAutomaticoOs(o.id, "so_aberto", u, { transporte: cx.transporte, base: BASE })).toMatch(/não tem celular/);
    expect(cx.enviados).toHaveLength(0);
    expect(await prisma.mensagemWhatsapp.findFirstOrThrow()).toMatchObject({ situacao: "ERRO", entidadeId: o.id });
    expect((await prisma.ordemServico.findUniqueOrThrow({ where: { id: o.id } })).situacaoId).toBe("so_andamento");
  });
});
