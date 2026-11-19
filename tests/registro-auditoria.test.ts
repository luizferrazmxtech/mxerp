import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const { comUsuario, semAuditoria, registrarAuditoria, diferencas } = await import("@/lib/auditoria/registro");

const luiz = { usuarioId: "u1", usuarioNome: "Luiz", ip: "10.0.0.5" };
const ultimos = (entidade: string) => prisma.registroAuditoria.findMany({ where: { entidade }, orderBy: { createdAt: "asc" } });

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "RegistroAuditoria","ContaBancaria","Lancamento" CASCADE`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Usuario" WHERE email LIKE '%@audit.test'`);
});

describe("registro de auditoria", () => {
  it("grava criação, alteração com antes/depois e exclusão, com usuário e IP", async () => {
    const c = await comUsuario(luiz, () => prisma.contaBancaria.create({ data: { nome: "Itaú", saldoInicial: 100 } }));
    await comUsuario(luiz, () => prisma.contaBancaria.update({ where: { id: c.id }, data: { saldoInicial: 250, banco: "341" } }));
    await comUsuario(luiz, () => prisma.contaBancaria.update({ where: { id: c.id }, data: { saldoInicial: 250 } })); // nada mudou: não grava
    await comUsuario(luiz, () => prisma.contaBancaria.delete({ where: { id: c.id } }));
    const r = await ultimos("ContaBancaria");
    expect(r.map((x) => x.acao)).toEqual(["CRIAR", "ALTERAR", "EXCLUIR"]);
    expect(r.every((x) => x.entidadeId === c.id && x.usuarioNome === "Luiz" && x.ip === "10.0.0.5")).toBe(true);
    expect(r[0].descricao).toBe("Cadastrou conta bancária Itaú");
    expect(r[1].campos).toEqual({ saldoInicial: ["100", "250"], banco: [null, "341"] });
    expect(r[2].descricao).toBe("Excluiu conta bancária Itaú");
  });

  it("alteração dentro de transação também registra a diferença", async () => {
    const c = await prisma.contaBancaria.create({ data: { nome: "Inter" } });
    await comUsuario(luiz, () => prisma.$transaction((tx) => tx.contaBancaria.update({ where: { id: c.id }, data: { nome: "Inter PJ" } })));
    const alt = (await ultimos("ContaBancaria")).find((x) => x.acao === "ALTERAR")!;
    expect(alt.campos).toEqual({ nome: ["Inter", "Inter PJ"] });
    expect(alt.descricao).toBe("Alterou conta bancária Inter PJ: nome");
  });

  it("senha aparece mascarada e a situação é descrita de/para", async () => {
    const u = await comUsuario(luiz, () => prisma.usuario.create({ data: { nome: "Ana", email: "ana@audit.test", senhaHash: "hash-secreto" } }));
    await comUsuario(luiz, () => prisma.usuario.update({ where: { id: u.id }, data: { senhaHash: "outro-hash" } }));
    const alt = (await ultimos("Usuario")).find((x) => x.acao === "ALTERAR")!;
    expect(alt.campos).toEqual({ senhaHash: ["***", "*** (alterado)"] });
    expect(JSON.stringify(await ultimos("Usuario"))).not.toContain("hash-secreto");
    // descrição de mudança de situação
    expect(diferencas({ situacao: "ABERTA" }, { situacao: "CONCLUIDA" })).toEqual({ situacao: ["ABERTA", "CONCLUIDA"] });
  });

  it("semAuditoria não grava; updateMany grava resumo; registro manual funciona", async () => {
    await semAuditoria(() => prisma.contaBancaria.create({ data: { nome: "Migrada" } }));
    expect(await prisma.registroAuditoria.count()).toBe(0);
    await comUsuario(luiz, () => prisma.contaBancaria.updateMany({ where: { nome: "Migrada" }, data: { ativa: false } }));
    const [m] = await ultimos("ContaBancaria");
    expect(m.descricao).toBe("Alterou 1 conta bancária(s)");
    await registrarAuditoria({ id: "u1", nome: "Luiz" }, { entidade: "Login", acao: "ENTRAR", descricao: "Entrou no sistema" });
    expect((await ultimos("Login"))[0]).toMatchObject({ usuarioNome: "Luiz", acao: "ENTRAR" });
    // entidades fora da lista não geram registro
    await prisma.sessao.deleteMany({ where: { id: "nada" } });
    expect(await prisma.registroAuditoria.count()).toBe(2);
  });
});
