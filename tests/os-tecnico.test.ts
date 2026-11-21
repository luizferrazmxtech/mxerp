import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const est = await import("@/lib/estoque/estoque");
const ord = await import("@/lib/os/ordens");
const tec = await import("@/lib/os/tecnico");
const { equipamentoVazio } = await import("@/lib/os/tipos");
type Dados = import("@/lib/os/tipos").DadosOs;
type U = import("@/lib/os/tecnico").UsuarioTecnico;

let prod = "", prod2 = "", serv = "", cli = "", loc = "";
let escritorio: U, ana: U, beto: U, caio: U;

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

const usuario = async (nome: string, papel: U["papel"]): Promise<U> => {
  const x = await prisma.usuario.upsert({ where: { email: `${nome}@tecnico.test` }, update: { papel }, create: { nome, email: `${nome}@tecnico.test`, papel, tecnico: papel === "TECNICO" } });
  return { id: x.id, nome: x.nome, papel };
};

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Orcamento","Anotacao","Anexo","Lancamento","OrdemServico","Equipe","Reserva","MovimentoEstoque","Saldo","Produto","Servico","Local","Deposito","Pessoa","Sequencia" CASCADE`);
  await prisma.situacaoOsConfig.updateMany({ data: { bloqueados: [] } });
  await prisma.situacaoOsConfig.update({ where: { id: "so_aberto" }, data: { permiteEdicao: true } });
  const dep = await prisma.deposito.create({ data: { nome: "Loja" } });
  loc = (await prisma.local.create({ data: { depositoId: dep.id, codigo: "A-01" } })).id;
  prod = (await prisma.produto.create({ data: { codigo: "CAM", nome: "Câmera IP", precoVenda: 300, custo: 180, localPadraoId: loc } })).id;
  prod2 = (await prisma.produto.create({ data: { codigo: "CAB", nome: "Cabo de rede", precoVenda: 2.5, custo: 1, localPadraoId: loc } })).id;
  serv = (await prisma.servico.create({ data: { codigo: "INST", nome: "Instalação", preco: 100 } })).id;
  cli = (await prisma.pessoa.create({ data: { nome: "Condomínio Azul", cliente: true } })).id;
  escritorio = await usuario("escritorio", "OPERADOR");
  ana = await usuario("ana", "TECNICO");
  beto = await usuario("beto", "TECNICO");
  caio = await usuario("caio", "TECNICO");
  await prisma.$transaction(async (tx) => {
    await est.entrada(tx, { produtoId: prod, localId: loc, quantidade: 5, origemTipo: "IMPLANTACAO" });
    await est.entrada(tx, { produtoId: prod2, localId: loc, quantidade: 100, origemTipo: "IMPLANTACAO" });
  });
});

const estoque = (p = prod) => prisma.$transaction((tx) => est.resumoProduto(tx, p));

const dados = (m: Partial<Dados> = {}): Dados => ({
  tipo: "SERVICO", numero: "", clienteId: cli, clienteNome: "", data: "2026-11-21", validade: "", vendedorId: "", prazoEntrega: "", aosCuidados: "",
  canal: "Presencial", centroCusto: "", introducao: "", situacaoId: "so_aberto",
  produtos: [{ produtoId: prod, nome: "Câmera", codigo: "CAM", unidade: "UN", detalhes: "", quantidade: "1", tipoValorId: "", valorUnit: "300,00", desconto: "0", descontoPct: false }],
  servicos: [],
  transportadoraId: "", transportadoraNome: "", frete: "0", mostrarEntrega: false, enderecoEntregaId: "",
  desconto: "", descontoPct: false, exibirTotal: true,
  gerarCondicoes: true, condicao: "AVISTA", formaPagamentoId: "", vencimento: "", intervaloDias: "30", numParcelas: "1", primeiraParcela: "",
  parcelas: [], observacoes: "", observacaoInterna: "", camposExtras: {},
  entrada: "2026-11-21T09:00", saida: "", prioridade: "", tecnicoIds: [ana.id], outros: "0",
  equipamentos: [{ ...equipamentoVazio(), equipamento: "CFTV" }],
  ...m,
});

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

describe("tela do técnico", () => {
  it("o técnico vê as OS em que é técnico ou da equipe; quem não é não mexe", async () => {
    const equipe = await prisma.equipe.create({ data: { nome: "Instalação", membros: [beto.id, caio.id] } });
    const daAna = await ord.salvarOrdem(dados(), escritorio);
    const daEquipe = await ord.salvarOrdem(dados({ tecnicoIds: [], equipeId: equipe.id }), escritorio);
    const ids = async (u: U) => (await tec.osDoTecnico(u)).map((o) => o.id).sort();
    expect(await ids(ana)).toEqual([daAna.id]);
    expect(await ids(beto)).toEqual([daEquipe.id]);
    expect(await ids(caio)).toEqual([daEquipe.id]);
    // gerência vê todas (ou filtra por técnico)
    expect((await ids({ ...escritorio, papel: "GERENTE" })).length).toBe(2);
    expect(await ids({ ...escritorio, papel: "GERENTE" }).then(() => tec.osDoTecnico({ ...escritorio, papel: "GERENTE" }, { tecnicoId: beto.id })).then((l) => l.map((o) => o.id))).toEqual([daEquipe.id]);

    await expect(tec.lancarItemTecnico(beto, daAna.id, { tipo: "produto", id: prod, quantidade: 1 })).rejects.toThrow(/não é técnico/);
    // qualquer membro da equipe lança na OS da equipe
    await tec.lancarItemTecnico(caio, daEquipe.id, { tipo: "servico", id: serv, quantidade: 1 });
    await tec.lancarItemTecnico(beto, daEquipe.id, { tipo: "produto", id: prod2, quantidade: 20 });
    expect(await prisma.osItemServico.count({ where: { osId: daEquipe.id } })).toBe(1);
  });

  it("lançar produto reserva no estoque, diz de onde pegar e atualiza total e parcela", async () => {
    const o = await ord.salvarOrdem(dados(), escritorio);
    expect(await estoque()).toMatchObject({ fisico: 5, reservado: 1 });
    const r = await tec.lancarItemTecnico(ana, o.id, { tipo: "produto", id: prod, quantidade: 2, detalhes: "portaria", instalado: true });
    expect(r.alocacoes).toEqual([{ localId: loc, quantidade: 2 }]);
    expect(await estoque()).toMatchObject({ fisico: 5, reservado: 3 });
    await tec.lancarItemTecnico(ana, o.id, { tipo: "servico", id: serv, quantidade: 1 });
    const os = await prisma.ordemServico.findUniqueOrThrow({ where: { id: o.id }, include: { parcelas: true } });
    expect(Number(os.totalProdutos)).toBe(900);
    expect(Number(os.totalServicos)).toBe(100);
    expect(Number(os.total)).toBe(1000);
    expect(os.parcelas.map((p) => Number(p.valor))).toEqual([1000]);
    const item = await prisma.osItemProduto.findUniqueOrThrow({ where: { id: r.itemId } });
    expect(item).toMatchObject({ instalado: true, criadoPorId: ana.id, instaladoPorId: ana.id, detalhes: "portaria" });
    expect(await prisma.osHistorico.count({ where: { osId: o.id, usuarioId: ana.id } })).toBe(2);

    // falta de estoque: reserva o que tem e o resto fica EM FALTA
    const falta = await tec.lancarItemTecnico(ana, o.id, { tipo: "produto", id: prod, quantidade: 4 });
    expect(falta.alocacoes).toEqual([{ localId: loc, quantidade: 2 }, { localId: null, quantidade: 2 }]);
  });

  it("parcelado redistribui o novo total; desconto em % acompanha", async () => {
    const o = await ord.salvarOrdem(dados({ condicao: "PARCELADO", desconto: "10", descontoPct: true, parcelas: [
      { vencimento: "2026-12-01", valor: "135,00", formaPagamentoId: "", observacao: "" },
      { vencimento: "2027-01-01", valor: "135,00", formaPagamentoId: "", observacao: "" },
    ] }), escritorio);
    expect(Number(o.total)).toBe(270);
    await tec.lancarItemTecnico(ana, o.id, { tipo: "servico", id: serv, quantidade: 1 });
    const os = await prisma.ordemServico.findUniqueOrThrow({ where: { id: o.id }, include: { parcelas: { orderBy: { numero: "asc" } } } });
    expect(Number(os.desconto)).toBe(40);
    expect(Number(os.total)).toBe(360);
    expect(os.parcelas.map((p) => Number(p.valor))).toEqual([180, 180]);
  });

  it("técnico só tira o que ele lançou e ainda não instalou; a reserva volta", async () => {
    const o = await ord.salvarOrdem(dados(), escritorio);
    const doEscritorio = (await prisma.osItemProduto.findFirstOrThrow({ where: { osId: o.id } })).id;
    await expect(tec.removerItemTecnico(ana, o.id, "produto", doEscritorio)).rejects.toThrow(/você mesmo lançou/);
    const { itemId } = await tec.lancarItemTecnico(ana, o.id, { tipo: "produto", id: prod, quantidade: 2 });
    await tec.marcarInstalado(ana, o.id, "produto", itemId, true);
    await expect(tec.removerItemTecnico(ana, o.id, "produto", itemId)).rejects.toThrow(/instalado/);
    await tec.marcarInstalado(ana, o.id, "produto", itemId, false);
    expect(await estoque()).toMatchObject({ reservado: 3 });
    await tec.removerItemTecnico(ana, o.id, "produto", itemId);
    expect(await estoque()).toMatchObject({ reservado: 1 });
    expect(Number((await prisma.ordemServico.findUniqueOrThrow({ where: { id: o.id } })).total)).toBe(300);
    // gerência tira qualquer item
    await tec.removerItemTecnico({ ...escritorio, papel: "GERENTE" }, o.id, "produto", doEscritorio);
    expect(await estoque()).toMatchObject({ reservado: 0 });
  });

  it("OS concluída não aceita itens novos, mas ainda deixa marcar instalado e anexar foto", async () => {
    const o = await ord.salvarOrdem(dados(), escritorio);
    await ord.alterarSituacaoOrdem(o.id, "so_faturar", escritorio);
    await expect(tec.lancarItemTecnico(ana, o.id, { tipo: "produto", id: prod, quantidade: 1 })).rejects.toThrow(/concluída/);
    const item = await prisma.osItemProduto.findFirstOrThrow({ where: { osId: o.id } });
    await tec.marcarInstalado(ana, o.id, "produto", item.id, true);
    await tec.anexarFoto(ana, o.id, { nome: "x.jpg", tipo: "image/jpeg", dados: jpeg() }, item.id);
    expect(await prisma.anexo.count({ where: { entidade: "OS_FOTO", entidadeId: o.id, referencia: item.id } })).toBe(1);
  });

  it("fotos: só imagem, até 5 MB; só quem tirou (ou a gerência) apaga", async () => {
    const o = await ord.salvarOrdem(dados({ tecnicoIds: [ana.id, beto.id] }), escritorio);
    await expect(tec.anexarFoto(ana, o.id, { nome: "a.pdf", tipo: "application/pdf", dados: jpeg() })).rejects.toThrow(/foto/);
    await expect(tec.anexarFoto(ana, o.id, { nome: "g.jpg", tipo: "image/jpeg", dados: new Uint8Array(tec.FOTO_MAX + 1) })).rejects.toThrow(/5 MB/);
    await expect(tec.anexarFoto(caio, o.id, { nome: "c.jpg", tipo: "image/jpeg", dados: jpeg() })).rejects.toThrow(/não é técnico/);
    const f = await tec.anexarFoto(ana, o.id, { nome: "geral.jpg", tipo: "image/jpeg", dados: jpeg() });
    const a = await prisma.anexo.findUniqueOrThrow({ where: { id: f.id } });
    expect(a).toMatchObject({ entidade: "OS_FOTO", entidadeId: o.id, referencia: null, usuarioId: ana.id });
    expect(a.nome).toMatch(new RegExp(`^OS${o.numero}-`));
    await expect(tec.excluirFoto(beto, o.id, f.id)).rejects.toThrow(/quem tirou/);
    await tec.excluirFoto(ana, o.id, f.id);
    expect(await prisma.anexo.count({ where: { entidade: "OS_FOTO" } })).toBe(0);
  });

  it("editar a OS no escritório não perde o instalado nem a ligação das fotos", async () => {
    const o = await ord.salvarOrdem(dados(), escritorio);
    const item = await prisma.osItemProduto.findFirstOrThrow({ where: { osId: o.id } });
    const { itemId: servId } = await tec.lancarItemTecnico(ana, o.id, { tipo: "servico", id: serv, quantidade: 1, instalado: true });
    await tec.marcarInstalado(ana, o.id, "produto", item.id, true);
    await tec.anexarFoto(ana, o.id, { nome: "c.jpg", tipo: "image/jpeg", dados: jpeg() }, item.id);
    await tec.anexarFoto(ana, o.id, { nome: "s.jpg", tipo: "image/jpeg", dados: jpeg() }, servId);

    // o escritório muda a quantidade (refaz as linhas) e acrescenta outro produto
    await ord.salvarOrdem(dados({
      produtos: [
        { id: item.id, produtoId: prod, nome: "Câmera", codigo: "CAM", unidade: "UN", detalhes: "", quantidade: "2", tipoValorId: "", valorUnit: "300,00", desconto: "0", descontoPct: false },
        { produtoId: prod2, nome: "Cabo", codigo: "CAB", unidade: "MT", detalhes: "", quantidade: "10", tipoValorId: "", valorUnit: "2,50", desconto: "0", descontoPct: false },
      ],
      servicos: [{ id: servId, servicoId: serv, nome: "Instalação", codigo: "INST", detalhes: "", quantidade: "1", valorUnit: "100,00", desconto: "0", descontoPct: false }],
    }), escritorio, o.id);
    const prods = await prisma.osItemProduto.findMany({ where: { osId: o.id }, orderBy: { ordem: "asc" } });
    expect(prods.map((p) => p.instalado)).toEqual([true, false]);
    const servs = await prisma.osItemServico.findMany({ where: { osId: o.id } });
    expect(servs).toHaveLength(1);
    expect(servs[0]).toMatchObject({ instalado: true, criadoPorId: ana.id });
    const fotos = await prisma.anexo.findMany({ where: { entidade: "OS_FOTO", entidadeId: o.id }, orderBy: { nome: "asc" } });
    expect(new Set(fotos.map((f) => f.referencia))).toEqual(new Set([prods[0].id, servs[0].id]));
    expect(await estoque()).toMatchObject({ reservado: 2 });

    // excluir a OS apaga as fotos também
    await ord.excluirOrdem(o.id);
    expect(await prisma.anexo.count({ where: { entidade: "OS_FOTO" } })).toBe(0);
  });
});
