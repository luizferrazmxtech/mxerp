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
