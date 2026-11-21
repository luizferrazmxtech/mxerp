import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { gerarFaturas } from "@/lib/faturas";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

beforeAll(() => { execSync("npx prisma migrate deploy", { stdio: "ignore", env: { ...process.env } }); });
beforeEach(async () => { await prisma.$executeRawUnsafe('TRUNCATE "Fatura", "Tarefa", "Cliente", "Plano", "Configuracao" CASCADE'); vi.resetModules(); });

describe("sistema da casa (MXTECH)", () => {
  it("é criado pelo ambiente, sem plano, e nunca gera mensalidade", async () => {
    vi.stubEnv("CLIENTE_ZERO_SLUG", "mxerp");
    vi.stubEnv("CLIENTE_ZERO_DOMINIO", "localhost:3000");
    const { garantirClienteZero, urlSistema } = await import("@/lib/clienteZero");
    await garantirClienteZero();
    const c = await prisma.cliente.findUniqueOrThrow({ where: { slug: "mxerp" } });
    expect(c).toMatchObject({ interno: true, planoId: null, situacao: "ATIVO", dominio: "localhost:3000" });
    expect(urlSistema(c.dominio)).toBe("http://localhost:3000");
    expect(urlSistema("erp.mxtech.inf.br")).toBe("https://erp.mxtech.inf.br");

    // um cliente de revenda ao lado continua sendo cobrado
    const p = await prisma.plano.create({ data: { nome: "Básico", valorMensal: 199 } });
    await prisma.cliente.create({ data: { slug: "jtecobio", nome: "JT", documento: "1", email: "a@b.c", dominio: "jt.x", planoId: p.id, situacao: "ATIVO", inicioCobranca: d("2026-11-01"), licencaToken: "t".repeat(40) } });
    await prisma.cliente.update({ where: { id: c.id }, data: { inicioCobranca: d("2026-01-01") } });
    expect(await gerarFaturas(d("2026-11-05"))).toBe(1);
    expect(await prisma.fatura.count({ where: { clienteId: c.id } })).toBe(0);
    vi.unstubAllEnvs();
  });

  it("lista os backups do PC (sem motivo no nome) e os da VPS", async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "bk-"));
    fs.mkdirSync(path.join(pasta, "mxerp"));
    for (const n of ["mxerp-20261120-1230.dump", "mxerp-20261120-1152-manual.dump", "outro-20261120-1152.dump", "lixo.txt"]) fs.writeFileSync(path.join(pasta, "mxerp", n), "x");
    vi.stubEnv("PASTA_BACKUPS", pasta);
    const { listarBackups, caminhoBackup } = await import("@/lib/backups");
    const l = await listarBackups("mxerp");
    expect(l.map((b) => [b.nome, b.motivo])).toEqual([["mxerp-20261120-1230.dump", "agendado"], ["mxerp-20261120-1152-manual.dump", "manual"]]);
    expect(caminhoBackup("mxerp", "mxerp-20261120-1230.dump")).toBe(path.join(pasta, "mxerp", "mxerp-20261120-1230.dump"));
    expect(caminhoBackup("mxerp", "../mxerp-20261120-1230.dump")).toBeNull();
    vi.unstubAllEnvs();
  });
});
