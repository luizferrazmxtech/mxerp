import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const tr = await import("@/lib/os/trabalho");
type U = import("@/lib/os/tecnico").UsuarioTecnico;

let osId = "";
let ger: U, ana: U, beto: U;

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

const usuario = async (nome: string, papel: U["papel"]): Promise<U> => {
  const x = await prisma.usuario.upsert({ where: { email: `${nome}@trabalho.test` }, update: { papel }, create: { nome, email: `${nome}@trabalho.test`, papel, tecnico: papel === "TECNICO" } });
  return { id: x.id, nome: x.nome, papel };
};

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "OsTrabalho","OsHistorico","OrdemServico","Equipe","Pessoa" CASCADE`);
  ger = await usuario("gerente", "GERENTE");
  ana = await usuario("ana", "TECNICO");
  beto = await usuario("beto", "TECNICO");
  const cli = await prisma.pessoa.create({ data: { nome: "Cliente", cliente: true } });
  osId = (await prisma.ordemServico.create({ data: { numero: 9001, clienteId: cli.id, tecnicoIds: [ana.id] } })).id;
});

const t0 = new Date("2026-11-21T12:00:00Z");
const mais = (min: number) => new Date(t0.getTime() + min * 60000);

describe("tempo de mão de obra da OS", () => {
  it("soma os trechos entre iniciar, pausar, retomar e finalizar", async () => {
    expect((await tr.resumoTrabalho(osId)).estado).toBe("NAO_INICIADO");
    expect((await tr.iniciarTrabalho(ana, osId, t0)).primeiro).toBe(true);
    await expect(tr.iniciarTrabalho(ana, osId, mais(1))).rejects.toThrow(/já está em andamento/);
    await tr.pararTrabalho(ana, osId, { motivo: "Almoço / intervalo" }, mais(90));
    expect(await tr.resumoTrabalho(osId)).toMatchObject({ estado: "PAUSADO", fechadoMs: 90 * 60000, abertoDesde: null });
    await expect(tr.pararTrabalho(ana, osId, { motivo: "x" }, mais(91))).rejects.toThrow(/não está em andamento/);
    expect((await tr.iniciarTrabalho(ana, osId, mais(150))).primeiro).toBe(false);
    const r = await tr.pararTrabalho(ana, osId, { finalizar: true }, mais(185));
    expect(r).toMatchObject({ estado: "FINALIZADO", fechadoMs: 125 * 60000 });
    expect(tr.duracao(r.fechadoMs)).toBe("2h 05min");
    const h = await prisma.osHistorico.findMany({ where: { osId }, orderBy: { createdAt: "asc" } });
    expect(h.map((x) => x.descricao)).toEqual(["Trabalho iniciado", "Trabalho pausado (Almoço / intervalo) · trecho 09:00–10:30 (1h 30min) · total 1h 30min", "Trabalho retomado", "Trabalho finalizado: 2h 05min de mão de obra · trecho 11:30–12:05 (35min)"]);
    // retomar depois de finalizado reabre
    await tr.iniciarTrabalho(ana, osId, mais(200));
    expect((await tr.resumoTrabalho(osId)).estado).toBe("TRABALHANDO");
  });

  it("finalizar direto de pausado fecha o tempo; sem iniciar, não finaliza", async () => {
    await expect(tr.pararTrabalho(ana, osId, { finalizar: true })).rejects.toThrow(/Inicie o trabalho/);
    await tr.iniciarTrabalho(ana, osId, t0);
    await tr.pararTrabalho(ana, osId, { motivo: "Buscar material" }, mais(30));
    expect(await tr.pararTrabalho(ana, osId, { finalizar: true }, mais(60))).toMatchObject({ estado: "FINALIZADO", fechadoMs: 30 * 60000 });
  });

  it("trecho de segundos não aparece como 0min", () => {
    expect(tr.duracao(20000)).toBe("menos de 1min");
    expect(tr.duracao(0)).toBe("0min");
    expect(tr.duracao(45000)).toBe("1min");
  });

  it("OS sem técnico: quem inicia o trabalho vira o técnico", async () => {
    await prisma.ordemServico.update({ where: { id: osId }, data: { tecnicoIds: [], tecnicoId: null } });
    await tr.iniciarTrabalho(ger, osId, t0);
    expect(await prisma.ordemServico.findUnique({ where: { id: osId }, select: { tecnicoId: true, tecnicoIds: true } })).toEqual({ tecnicoId: ger.id, tecnicoIds: [ger.id] });
    expect((await prisma.osHistorico.findMany({ where: { osId } })).map((h) => h.descricao)).toContain("Técnico definido: gerente (iniciou o trabalho)");
    // com técnico definido, não troca
    await tr.pararTrabalho(ger, osId, { motivo: "x" }, mais(5));
    await tr.iniciarTrabalho(ana, osId, mais(10)).catch(() => null);
    expect((await prisma.ordemServico.findUnique({ where: { id: osId } }))!.tecnicoIds).toEqual([ger.id]);
  });

  it("só técnico da OS (ou gerência) mexe no tempo", async () => {
    await expect(tr.iniciarTrabalho(beto, osId)).rejects.toThrow(/não é técnico/);
    await tr.iniciarTrabalho(ger, osId);
    expect((await tr.resumoTrabalho(osId)).trechos[0].iniciadoPor).toBe("gerente");
  });
});

describe("correção do tempo pelo administrador", () => {
  it("altera, inclui e exclui trechos, valida e grava o antes → depois no histórico", async () => {
    const adm = await usuario("admin", "ADMIN");
    await tr.iniciarTrabalho(ana, osId, t0);
    await tr.pararTrabalho(ana, osId, { motivo: "Almoço / intervalo" }, mais(1));
    await tr.iniciarTrabalho(ana, osId, mais(10));
    await tr.pararTrabalho(ana, osId, { finalizar: true }, mais(11));
    const [a, b] = (await tr.resumoTrabalho(osId)).trechos;
    const agora = mais(1000);

    await expect(tr.corrigirTrabalho(adm, osId, [{ id: a.id, inicio: mais(0), fim: mais(30) }, { id: b.id, inicio: mais(20), fim: mais(40) }], "", agora)).rejects.toThrow(/se sobrepõem/);
    await expect(tr.corrigirTrabalho(adm, osId, [{ id: a.id, inicio: mais(30), fim: mais(30) }], "", agora)).rejects.toThrow(/fim tem que ser depois/);
    await expect(tr.corrigirTrabalho(adm, osId, [{ inicio: mais(30), fim: null }], "", agora)).rejects.toThrow(/Informe o fim/);
    await expect(tr.corrigirTrabalho(adm, osId, [{ inicio: mais(30), fim: mais(2000) }], "", agora)).rejects.toThrow(/futuro/);

    const r = await tr.corrigirTrabalho(adm, osId, [
      { id: a.id, inicio: t0, fim: mais(120), motivo: "Almoço / intervalo" }, // 1min → 2h
      { inicio: mais(180), fim: mais(210) }, // novo, 30min; o b é excluído
    ], "técnico esqueceu de pausar", agora);
    expect(r).toMatchObject({ estado: "FINALIZADO", fechadoMs: 150 * 60000 });
    expect(r.trechos.map((t) => t.iniciadoPor)).toEqual(["ana", "admin"]);
    const h = await prisma.osHistorico.findFirst({ where: { osId }, orderBy: { createdAt: "desc" } });
    expect(h?.usuarioNome).toBe("admin");
    const aud = await prisma.registroAuditoria.findMany({ where: { entidade: "OsTrabalho", entidadeId: { in: [a.id, b.id] } } });
    expect(aud.map((x) => x.acao).sort()).toEqual(expect.arrayContaining(["ALTERAR", "EXCLUIR"]));
    expect(aud.find((x) => x.acao === "ALTERAR")?.campos).toHaveProperty("fim");
    expect(h?.descricao).toBe("Mão de obra corrigida: excluído 21/11/2026 09:10–09:11 (1min); 21/11/2026 09:00–09:01 (1min) → 21/11/2026 09:00–11:00 (2h 00min); incluído 21/11/2026 12:00–12:30 (30min) · total 2min → 2h 30min · técnico esqueceu de pausar");
    await expect(tr.corrigirTrabalho(adm, osId, r.trechos.map((t) => ({ id: t.id, inicio: new Date(t.inicio), fim: t.fim ? new Date(t.fim) : null, motivo: t.motivo })), "", agora)).rejects.toThrow(/Nada foi alterado/);

    // excluir tudo volta a "não iniciado"
    expect((await tr.corrigirTrabalho(adm, osId, [], "", agora)).estado).toBe("NAO_INICIADO");
  });

  it("corrigir o trecho em andamento pode fechá-lo", async () => {
    const adm = await usuario("admin", "ADMIN");
    await tr.iniciarTrabalho(ana, osId, t0);
    const [a] = (await tr.resumoTrabalho(osId)).trechos;
    const r = await tr.corrigirTrabalho(adm, osId, [{ id: a.id, inicio: t0, fim: mais(45) }], "", mais(60));
    expect(r).toMatchObject({ estado: "PAUSADO", fechadoMs: 45 * 60000 });
  });
});
