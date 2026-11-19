import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const ch = await import("@/lib/chamados/chamados");

let ana: { id: string; nome: string }, beto: { id: string; nome: string }, cliente: string;
const T0 = new Date("2026-11-19T12:00:00Z");
const h = (n: number) => new Date(T0.getTime() + n * 3600_000);

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "ChamadoInteracao","Chamado" CASCADE`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Sequencia" WHERE chave = 'CHAMADO'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Usuario" WHERE email LIKE '%@chamado.test'`);
  ana = await prisma.usuario.create({ data: { nome: "Ana", email: "ana@chamado.test" }, select: { id: true, nome: true } });
  beto = await prisma.usuario.create({ data: { nome: "Beto", email: "beto@chamado.test" }, select: { id: true, nome: true } });
  cliente = (await prisma.pessoa.upsert({ where: { id: "cli-chamado" }, create: { id: "cli-chamado", nome: "Padaria Pão Quente" }, update: {} })).id;
});

describe("chamados", () => {
  it("abre numerado com prazo pela prioridade e exige assunto e cliente/contato", async () => {
    const c1 = await ch.abrirChamado({ clienteId: cliente, assunto: "Impressora fiscal não liga", prioridade: "URGENTE", canal: "WHATSAPP" }, ana, T0);
    const c2 = await ch.abrirChamado({ contato: "João", assunto: "Dúvida no boleto" }, ana, T0);
    expect([c1.numero, c2.numero]).toEqual([1, 2]);
    expect(c1.prazo).toEqual(h(4));
    expect(c2.prazo).toEqual(h(72));
    expect(c1.status).toBe("ABERTO");
    await expect(ch.abrirChamado({ clienteId: cliente, assunto: " " }, ana, T0)).rejects.toThrow(/assunto/);
    await expect(ch.abrirChamado({ assunto: "x" }, ana, T0)).rejects.toThrow(/cliente/);
  });

  it("responder marca 1ª resposta e assume; resolver exige solução; histórico registra tudo", async () => {
    const c = await ch.abrirChamado({ clienteId: cliente, assunto: "Sistema lento" }, ana, T0);
    await ch.comentarChamado(c.id, "Nota interna: ver servidor", beto, { interno: true }, h(1));
    let atual = await prisma.chamado.findUniqueOrThrow({ where: { id: c.id } });
    expect([atual.status, atual.primeiraRespostaEm, atual.responsavelId]).toEqual(["ABERTO", null, beto.id]);
    await ch.comentarChamado(c.id, "Vamos acessar remoto às 14h", beto, {}, h(2));
    atual = await prisma.chamado.findUniqueOrThrow({ where: { id: c.id } });
    expect([atual.status, atual.primeiraRespostaEm]).toEqual(["EM_ATENDIMENTO", h(2)]);

    await ch.atualizarChamado(c.id, { responsavelId: ana.id, prioridade: "ALTA" }, beto, h(3));
    await expect(ch.atualizarChamado(c.id, { status: "RESOLVIDO" }, ana, h(5))).rejects.toThrow(/solução/);
    await ch.atualizarChamado(c.id, { status: "RESOLVIDO", solucao: "Limpeza do disco" }, ana, h(5));
    atual = await prisma.chamado.findUniqueOrThrow({ where: { id: c.id } });
    expect([atual.status, atual.resolvidoEm]).toEqual(["RESOLVIDO", h(5)]);
    // reabrir limpa a data de solução
    await ch.atualizarChamado(c.id, { status: "EM_ATENDIMENTO" }, ana, h(6));
    expect((await prisma.chamado.findUniqueOrThrow({ where: { id: c.id } })).resolvidoEm).toBeNull();

    const hist = (await prisma.chamadoInteracao.findMany({ where: { chamadoId: c.id }, orderBy: { createdAt: "asc" } })).map((i) => i.texto);
    expect(hist).toEqual(expect.arrayContaining([
      "Prioridade: Normal → Alta", "Responsável: Beto → Ana", "Em atendimento → Resolvido: Limpeza do disco", "Resolvido → Em atendimento",
    ]));
  });

  it("filtros, atrasados e resumo com tempos médios", async () => {
    const agora = new Date();
    const a = await ch.abrirChamado({ clienteId: cliente, assunto: "Rede caiu", prioridade: "URGENTE" }, ana, new Date(agora.getTime() - 10 * 3600_000)); // prazo já passou
    const b = await ch.abrirChamado({ contato: "Maria", assunto: "Trocar senha do Wi-Fi" }, ana, agora);
    await ch.atualizarChamado(b.id, { responsavelId: beto.id }, ana);
    await ch.comentarChamado(b.id, "feito", beto);
    await ch.atualizarChamado(b.id, { status: "RESOLVIDO", solucao: "Senha trocada" }, beto);

    const ids = async (f: Parameters<typeof ch.filtroChamados>[0], u?: string) => (await prisma.chamado.findMany({ where: ch.filtroChamados(f, u) })).map((x) => x.id);
    expect(await ids({})).toEqual([a.id]);
    expect(await ids({ status: "atrasados" })).toEqual([a.id]);
    expect(await ids({ status: "RESOLVIDO", responsavelId: "meus" }, beto.id)).toEqual([b.id]);
    expect(await ids({ status: "todos", q: "padaria" })).toEqual([a.id]);
    expect(await ids({ status: "todos", q: "#2" })).toEqual([b.id]);

    const r = await ch.resumoChamados(beto.id);
    expect(r).toMatchObject({ abertos: 1, semResponsavel: 1, atrasados: 1, urgentes: 1, meus: 0, resolvidos30: 1, noPrazo: 1 });
    expect(ch.horasTexto(50)).toBe("2 d 2 h");
  });
});
